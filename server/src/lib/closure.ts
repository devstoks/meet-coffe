import { randomUUID } from 'crypto'
import { prisma } from '../db.js'
import { getIO, emitToKitchen } from '../socket.js'
import { SERVICE_FEE_PERCENT } from './config.js'
import { getTableBilling, getCustomerDues, reopenAfterFailedCharge } from './tableBilling.js'
import { stopSplit } from './splitQueue.js'
import { readSelections, type Selection } from './options.js'

/**
 * Encerramento da comanda.
 *
 * INDIVIDUAL: encerra só a participação de UM celular (a mesa e os outros clientes não são afetados).
 * TABLE: encerra a sessão de consumo da mesa inteira (ninguém mais pede) e a conta é a soma de todos.
 *
 * Escolher a forma de pagamento NÃO é pagar: a solicitação fica AWAITING_PAYMENT até a confirmação real
 * (webhook da maquininha ou a equipe recebendo em dinheiro).
 */
export const PAYMENT_METHODS = ['DEBIT', 'CREDIT', 'PIX', 'CASH'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const isPaymentMethod = (v: unknown): v is PaymentMethod => typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v)

export type ClosureScope = 'INDIVIDUAL' | 'TABLE'
export const ACTIVE_SESSION = ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING']
const KITCHEN_OPEN = ['SENT', 'PREPARING', 'READY']
const round2 = (n: number) => Math.round(n * 100) / 100
const withFee = (n: number) => round2(n * (1 + SERVICE_FEE_PERCENT / 100))

export type ParticipantItem = {
  id: string
  productId: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
  observations: string | null
  selections: Selection[]
  imagePath: string | null
  status: string
}

export type Participant = {
  key: string
  deviceId: string | null
  customerName: string
  subtotal: number
  fee: number
  total: number
  paid: number
  due: number
  inPreparation: number // pedidos que a cozinha ainda não finalizou
  items: ParticipantItem[]
}

/** Consumo da mesa agrupado por pessoa (celular), com itens, personalizações e quanto cada um ainda deve. */
export async function buildParticipants(tableId: string, businessId: string, onlyDeviceId?: string | null): Promise<{ participants: Participant[]; sessionIds: string[] }> {
  const billing = await getTableBilling(tableId, businessId)
  const orders = await prisma.order.findMany({
    where: { sessionId: { in: billing.sessionIds }, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'asc' },
    include: { items: true },
  })
  const products = await prisma.product.findMany({ where: { businessId }, select: { id: true, images: true } })
  const imageOf = new Map(products.map((p) => [p.id, p.images[0] ?? null]))

  const map = new Map<string, Participant>()
  for (const o of orders) {
    const key = o.deviceId || `anon-${o.id}`
    let p = map.get(key)
    if (!p) {
      p = { key, deviceId: o.deviceId ?? null, customerName: o.customerName || 'Cliente', subtotal: 0, fee: 0, total: 0, paid: 0, due: 0, inPreparation: 0, items: [] }
      map.set(key, p)
    }
    if (o.customerName) p.customerName = o.customerName
    p.subtotal += Number(o.totalAmount)
    if (KITCHEN_OPEN.includes(o.status)) p.inPreparation += 1
    for (const it of o.items) {
      p.items.push({
        id: it.id, productId: it.productId, name: it.productNameSnapshot, quantity: it.quantity,
        unitPrice: Number(it.unitPriceSnapshot), subtotal: Number(it.subtotal), observations: it.observations,
        selections: readSelections(it.selections), imagePath: imageOf.get(it.productId) ?? null, status: o.status,
      })
    }
  }
  const out: Participant[] = []
  for (const p of map.values()) {
    if (onlyDeviceId !== undefined && onlyDeviceId !== null && p.deviceId !== onlyDeviceId) continue
    p.subtotal = round2(p.subtotal)
    p.total = withFee(p.subtotal)
    p.fee = round2(p.total - p.subtotal)
    p.paid = round2(billing.approved.filter((a) => p.deviceId && a.deviceId === p.deviceId).reduce((n, a) => n + Number(a.amount), 0))
    p.due = Math.max(0, round2(p.total - p.paid))
    out.push(p)
  }
  return { participants: out, sessionIds: billing.sessionIds }
}

// ----------------------------------------------------------------------------------------------
// Descrição da solicitação (dashboard e celular)
// ----------------------------------------------------------------------------------------------
type RequestRow = {
  id: string; businessId: string; sessionId: string; tableId: string; scope: string; deviceId: string | null
  customerName: string | null; paymentMethod: string; status: string; amount: unknown; createdAt: Date; resolvedAt: Date | null
}

async function chargeSentFor(tableId: string, businessId: string, scope: string, deviceId: string | null) {
  const pending = await prisma.payment.findFirst({
    where: { businessId, status: 'PENDING', tab: { tableId }, ...(scope === 'INDIVIDUAL' ? { deviceId } : {}) },
    select: { id: true },
  })
  return !!pending
}

/** Dados completos para a equipe conferir e cobrar (calculados na hora, a partir do banco). */
export async function describeClosureRequest(r: RequestRow, tableNumber: string) {
  const { participants } = await buildParticipants(r.tableId, r.businessId, r.scope === 'INDIVIDUAL' ? r.deviceId : undefined)
  const total = round2(participants.reduce((n, p) => n + p.total, 0))
  const due = round2(participants.reduce((n, p) => n + p.due, 0))
  return {
    id: r.id,
    scope: r.scope as ClosureScope,
    status: r.status,
    paymentMethod: r.paymentMethod as PaymentMethod,
    amount: Number(r.amount),
    total,
    due,
    tableId: r.tableId,
    tableNumber,
    sessionId: r.sessionId,
    deviceId: r.deviceId,
    customerName: r.customerName,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    serviceFeePercent: SERVICE_FEE_PERCENT,
    chargeSent: r.status === 'AWAITING_PAYMENT' ? await chargeSentFor(r.tableId, r.businessId, r.scope, r.deviceId) : false,
    inPreparation: participants.reduce((n, p) => n + p.inPreparation, 0),
    participants,
  }
}

/** Estado da solicitação que interessa a UM celular (é o que decide a tela dele — nunca o pagamento de outra pessoa). */
export async function closureStateFor(sessionIds: string[], tableId: string, businessId: string, deviceId: string | null) {
  let r: RequestRow | null = null
  if (deviceId) {
    r = await prisma.closureRequest.findFirst({
      where: { sessionId: { in: sessionIds }, scope: 'INDIVIDUAL', deviceId, status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
    })
  }
  if (!r) r = await prisma.closureRequest.findFirst({ where: { sessionId: { in: sessionIds }, scope: 'TABLE', status: 'AWAITING_PAYMENT' }, orderBy: { createdAt: 'desc' } })
  if (!r) return null
  return {
    requestId: r.id,
    scope: r.scope as ClosureScope,
    status: r.status as 'AWAITING_PAYMENT' | 'PAID',
    paymentMethod: r.paymentMethod as PaymentMethod,
    amount: Number(r.amount),
    customerName: r.customerName,
    chargeSent: r.status === 'AWAITING_PAYMENT' ? await chargeSentFor(tableId, businessId, r.scope, r.deviceId) : false,
    createdAt: r.createdAt,
  }
}

/**
 * Quantas OUTRAS pessoas da mesa ainda têm comanda em aberto: devem algo e não pediram (nem concluíram) o pagamento individual.
 * Se for zero, "Mesa toda" não faz sentido (só sobra quem está pedindo) e fica indisponível.
 */
export async function countOtherOpenPeople(tableId: string, businessId: string, sessionIds: string[], deviceId: string | null): Promise<number> {
  const dues = await getCustomerDues(tableId, businessId)
  const individual = await prisma.closureRequest.findMany({
    where: { sessionId: { in: sessionIds }, scope: 'INDIVIDUAL', status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
    select: { deviceId: true },
  })
  const closed = new Set(individual.map((r) => r.deviceId).filter((d): d is string => !!d))
  return dues.filter((d) => d.due > 0.009 && (!deviceId || d.deviceId !== deviceId) && !(d.deviceId && closed.has(d.deviceId))).length
}

/** Esse celular já encerrou (ou está encerrando) a própria comanda? Então não pode mais pedir nesta sessão. */
export async function deviceClosureBlock(sessionIds: string[], deviceId: string | null) {
  if (!deviceId) return null
  return prisma.closureRequest.findFirst({
    where: { sessionId: { in: sessionIds }, scope: 'INDIVIDUAL', deviceId, status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
    select: { id: true, status: true },
  })
}

// ----------------------------------------------------------------------------------------------
// Criar
// ----------------------------------------------------------------------------------------------
type CreateResult =
  | { ok: true; request: RequestRow; duplicate: boolean; sessionIds: string[]; tableNumber: string }
  | { ok: false; status: number; error: string; code?: string }

export async function createClosureRequest(
  session: { id: string; businessId: string; tableId: string; table: { number: string } },
  input: { scope: ClosureScope; method: PaymentMethod; deviceId: string | null; customerName: string | null },
): Promise<CreateResult> {
  const { businessId, tableId } = session
  const out = await prisma.$transaction(async (tx) => {
    // Trava por mesa: dois toques / dois celulares ao mesmo tempo nunca criam solicitações duplicadas
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tableId}))`

    const billing = await getTableBilling(tableId, businessId)
    const ids = billing.sessionIds.length > 0 ? billing.sessionIds : [session.id]

    const tableReq = await tx.closureRequest.findFirst({ where: { sessionId: { in: ids }, scope: 'TABLE', status: 'AWAITING_PAYMENT' } })

    if (input.scope === 'TABLE') {
      if (tableReq) return { ok: true as const, request: tableReq, duplicate: true, sessionIds: ids }
      if (billing.total <= 0) return { ok: false as const, status: 400, error: 'Não há valor a cobrar.' }
      if (billing.remaining <= 0.009) return { ok: false as const, status: 400, error: 'Esta mesa já está paga.' }
      // "Mesa toda" só existe quando há mais alguém com comanda em aberto além de quem está pedindo
      if ((await countOtherOpenPeople(tableId, businessId, ids, input.deviceId)) === 0) {
        return { ok: false as const, status: 409, code: 'TABLE_ALONE', error: 'Não há outras pessoas com comanda em aberto. Use o pagamento individual.' }
      }

      const request = await tx.closureRequest.create({
        data: {
          businessId, sessionId: session.id, tableId, scope: 'TABLE', deviceId: input.deviceId, customerName: input.customerName,
          paymentMethod: input.method, amount: billing.remaining,
        },
      })
      // A mesa entra em "conta pedida": ninguém mais consegue enviar pedido nesta sessão
      await tx.tab.updateMany({ where: { id: { in: billing.tabs.map((t) => t.id) }, status: 'OPEN' }, data: { status: 'CLOSURE_REQUESTED' } })
      await tx.tableSession.updateMany({ where: { id: { in: ids }, status: 'OPEN' }, data: { status: 'CLOSURE_REQUESTED' } })
      return { ok: true as const, request, duplicate: false, sessionIds: ids }
    }

    // INDIVIDUAL
    if (!input.deviceId) return { ok: false as const, status: 400, error: 'Não foi possível identificar o seu celular.' }
    const mine = await tx.closureRequest.findFirst({
      where: { sessionId: { in: ids }, scope: 'INDIVIDUAL', deviceId: input.deviceId, status: { in: ['AWAITING_PAYMENT', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
    })
    if (mine?.status === 'AWAITING_PAYMENT') return { ok: true as const, request: mine, duplicate: true, sessionIds: ids }
    if (mine?.status === 'PAID') return { ok: false as const, status: 409, error: 'A sua comanda já foi paga.' }
    if (tableReq) return { ok: false as const, status: 409, error: 'A mesa inteira já está em encerramento.' }

    const dues = await getCustomerDues(tableId, businessId)
    const me = dues.find((d) => d.deviceId === input.deviceId)
    if (!me) return { ok: false as const, status: 400, error: 'Você ainda não fez nenhum pedido.' }
    if (me.due <= 0.009) return { ok: false as const, status: 400, error: 'Não há valor a pagar na sua comanda.' }

    const request = await tx.closureRequest.create({
      data: {
        businessId, sessionId: session.id, tableId, scope: 'INDIVIDUAL', deviceId: input.deviceId, customerName: me.customerName || input.customerName,
        paymentMethod: input.method, amount: me.due,
      },
    })
    return { ok: true as const, request, duplicate: false, sessionIds: ids }
  })

  if (!out.ok) return out
  const tableNumber = session.table.number
  if (!out.duplicate) await emitClosureRequested(out.request, tableNumber, out.sessionIds)
  return { ok: true, request: out.request, duplicate: out.duplicate, sessionIds: out.sessionIds, tableNumber }
}

// ----------------------------------------------------------------------------------------------
// Eventos em tempo real
// ----------------------------------------------------------------------------------------------
function toSessions(sessionIds: string[], event: string, payload: unknown) {
  for (const sid of sessionIds) getIO().to(`session:${sid}`).emit(event, payload)
}

async function emitClosureRequested(r: RequestRow, tableNumber: string, sessionIds: string[]) {
  const detail = await describeClosureRequest(r, tableNumber)
  emitToKitchen(r.businessId, 'closure_requested', detail)
  toSessions(sessionIds, 'closure_requested', {
    requestId: r.id, scope: r.scope, deviceId: r.deviceId, tableNumber, amount: Number(r.amount), paymentMethod: r.paymentMethod,
  })
}

/** Avisa equipe e celulares que uma solicitação mudou de estado (paga / cancelada). */
async function emitClosureResolved(rows: RequestRow[], status: 'PAID' | 'CANCELLED', sessionIds: string[], tableNumber: string) {
  for (const r of rows) {
    const payload = { requestId: r.id, scope: r.scope, deviceId: r.deviceId, tableNumber, amount: Number(r.amount), status }
    toSessions(sessionIds, status === 'PAID' ? 'closure_paid' : 'closure_cancelled', payload)
    emitToKitchen(r.businessId, 'closure_updated', payload)
  }
}

// ----------------------------------------------------------------------------------------------
// Pagamento confirmado → resolve solicitações
// ----------------------------------------------------------------------------------------------
async function tableNumberOf(tableId: string) {
  return (await prisma.cafeTable.findUnique({ where: { id: tableId }, select: { number: true } }))?.number ?? ''
}

/** Pagamento parcial aprovado: se a pessoa (celular) quitou o que devia, a solicitação INDIVIDUAL dela vira PAID. */
export async function settleIndividualAfterPayment(tableId: string, businessId: string, deviceId: string | null) {
  if (!deviceId) return
  const { participants, sessionIds } = await buildParticipants(tableId, businessId, deviceId)
  const me = participants[0]
  if (me && me.due > 0.009) return
  const rows = await prisma.closureRequest.findMany({ where: { sessionId: { in: sessionIds }, scope: 'INDIVIDUAL', deviceId, status: 'AWAITING_PAYMENT' } })
  if (rows.length === 0) return
  const now = new Date()
  const flipped = await prisma.closureRequest.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'AWAITING_PAYMENT' }, data: { status: 'PAID', resolvedAt: now } })
  if (flipped.count === 0) return
  await emitClosureResolved(rows, 'PAID', sessionIds, await tableNumberOf(tableId))
}

/**
 * A mesa foi totalmente paga (maquininha ou dinheiro): fecha pedidos, comandas e sessões, libera a mesa,
 * resolve TODAS as solicitações abertas e avisa todos os celulares. Mesma regra que o webhook já usava.
 */
export async function finalizePaidTable(opts: { tableId: string; businessId: string; tableNumber: string; amount: number; paymentId?: string }) {
  const { tableId, businessId, tableNumber, amount, paymentId } = opts
  const active = await prisma.tableSession.findMany({ where: { tableId, status: { in: ACTIVE_SESSION } }, select: { id: true } })
  const sessionIds = active.map((s) => s.id)
  const pendingRows = await prisma.closureRequest.findMany({ where: { sessionId: { in: sessionIds }, status: 'AWAITING_PAYMENT' } })
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    if (paymentId) await tx.payment.update({ where: { id: paymentId }, data: { status: 'APPROVED', approvedAt: now } })
    await tx.order.updateMany({ where: { sessionId: { in: sessionIds } }, data: { status: 'PAID' } })
    await tx.tab.updateMany({ where: { sessionId: { in: sessionIds } }, data: { status: 'PAID', closedAt: now } })
    await tx.tableSession.updateMany({ where: { id: { in: sessionIds } }, data: { status: 'CLOSED', closedAt: now } })
    await tx.sessionAccess.updateMany({ where: { sessionId: { in: sessionIds } }, data: { revokedAt: now } })
    await tx.closureRequest.updateMany({ where: { id: { in: pendingRows.map((r) => r.id) } }, data: { status: 'PAID', resolvedAt: now } })
    await tx.cafeTable.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } })
  })

  stopSplit(tableId)
  emitToKitchen(businessId, 'payment_approved', { tableNumber })
  for (const r of pendingRows) emitToKitchen(businessId, 'closure_updated', { requestId: r.id, scope: r.scope, deviceId: r.deviceId, tableNumber, amount: Number(r.amount), status: 'PAID' })
  // Todos os celulares da mesa (inclusive quem pediu encerramento individual) recebem o fim da sessão
  toSessions(sessionIds, 'session_closed', { amount, tableNumber })
  return { sessionIds }
}

/** Encerramento manual da mesa (dinheiro / fallback): mesmo efeito de uma mesa paga, sem cobrança na maquininha. */
export async function forceCloseTable(opts: { tableId: string; businessId: string; tableNumber: string }) {
  const { tableId, businessId, tableNumber } = opts
  const sessions = await prisma.tableSession.findMany({ where: { tableId, businessId, status: { in: ACTIVE_SESSION } }, select: { id: true } })
  const sessionIds = sessions.map((x) => x.id)
  const pendingRows = sessionIds.length > 0 ? await prisma.closureRequest.findMany({ where: { sessionId: { in: sessionIds }, status: 'AWAITING_PAYMENT' } }) : []
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      await tx.order.updateMany({ where: { sessionId: { in: sessionIds }, status: { notIn: ['PAID', 'CANCELLED'] } }, data: { status: 'PAID' } })
      await tx.payment.updateMany({ where: { tab: { sessionId: { in: sessionIds } }, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      await tx.tab.updateMany({ where: { sessionId: { in: sessionIds } }, data: { status: 'PAID', closedAt: now } })
      await tx.tableSession.updateMany({ where: { id: { in: sessionIds } }, data: { status: 'CLOSED', closedAt: now } })
      await tx.sessionAccess.updateMany({ where: { sessionId: { in: sessionIds } }, data: { revokedAt: now } })
      await tx.closureRequest.updateMany({ where: { id: { in: pendingRows.map((r) => r.id) } }, data: { status: 'PAID', resolvedAt: now } })
    }
    // Sempre libera a mesa, mesmo que não houvesse sessão ativa (estado inconsistente)
    await tx.cafeTable.update({ where: { id: tableId }, data: { status: 'AVAILABLE' } })
  })

  stopSplit(tableId)
  toSessions(sessionIds, 'session_closed', { amount: 0, tableNumber })
  for (const r of pendingRows) emitToKitchen(businessId, 'closure_updated', { requestId: r.id, scope: r.scope, deviceId: r.deviceId, tableNumber, amount: Number(r.amount), status: 'PAID' })
  emitToKitchen(businessId, 'table_closed', { tableId, tableNumber })
  return { sessionIds }
}

/**
 * Dinheiro: a equipe recebeu da PESSOA e encerra só a comanda dela. Registra um pagamento (provider CASH) para a conta da mesa
 * continuar batendo; se isso quita a mesa inteira, a mesa fecha como em qualquer outro pagamento.
 */
export async function closePersonCash(businessId: string, tableId: string, deviceId: string): Promise<{ ok: true; tableClosed: boolean; amount: number } | { ok: false; status: number; error: string }> {
  const table = await prisma.cafeTable.findFirst({ where: { id: tableId, businessId } })
  if (!table) return { ok: false, status: 404, error: 'Mesa não encontrada.' }

  const pending = await prisma.payment.findFirst({ where: { businessId, status: 'PENDING', tab: { tableId } } })
  if (pending) return { ok: false, status: 400, error: 'Há uma cobrança aguardando na maquininha. Conclua ou cancele antes de encerrar em dinheiro.' }

  const billing = await getTableBilling(tableId, businessId)
  if (billing.tabs.length === 0) return { ok: false, status: 400, error: 'Comanda não encontrada.' }
  const dues = await getCustomerDues(tableId, businessId)
  const me = dues.find((d) => d.deviceId === deviceId)
  if (!me) return { ok: false, status: 404, error: 'Pessoa não encontrada nesta mesa.' }
  if (me.due <= 0.009) return { ok: false, status: 400, error: 'Esta pessoa não tem valor a pagar.' }

  const extRef = `CASH_${tableId}_${Date.now()}_${randomUUID().slice(0, 6)}`
  const payment = await prisma.payment.create({
    data: {
      businessId, tabId: billing.tabs[0].id, scope: 'PARTIAL', deviceId, customerName: me.customerName, provider: 'CASH', status: 'APPROVED',
      amount: me.due, externalReference: extRef, idempotencyKey: randomUUID(), approvedAt: new Date(),
    },
  })

  const paidAfter = billing.paid + me.due
  if (paidAfter + 0.02 >= billing.total) {
    await finalizePaidTable({ tableId, businessId, tableNumber: table.number, amount: me.due })
    return { ok: true, tableClosed: true, amount: me.due }
  }

  // A pessoa quitou: encerra a comanda dela e avisa os outros (a mesa segue aberta)
  const remaining = Math.max(0, round2(billing.total - paidAfter))
  const info = { tableNumber: table.number, tableId, amount: me.due, remaining, customerName: me.customerName, deviceId }
  emitToKitchen(businessId, 'payment_partial', info)
  for (const sid of billing.sessionIds) getIO().to(`session:${sid}`).emit('partial_paid', info)
  await settleIndividualAfterPayment(tableId, businessId, deviceId)
  // Se a pessoa não tinha solicitação aberta (a equipe encerrou por conta própria), garante que o celular dela saia da comanda
  const hadRequest = await prisma.closureRequest.findFirst({ where: { sessionId: { in: billing.sessionIds }, scope: 'INDIVIDUAL', deviceId, status: 'PAID' }, select: { id: true } })
  if (!hadRequest) {
    const row = await prisma.closureRequest.create({
      data: {
        businessId, sessionId: billing.sessionIds[0], tableId, scope: 'INDIVIDUAL', deviceId, customerName: me.customerName, paymentMethod: 'CASH',
        status: 'PAID', amount: me.due, resolvedAt: new Date(),
      },
    })
    await emitClosureResolved([row], 'PAID', billing.sessionIds, table.number)
  }
  void payment
  return { ok: true, tableClosed: false, amount: me.due }
}

// ----------------------------------------------------------------------------------------------
// Cancelar (equipe)
// ----------------------------------------------------------------------------------------------
export async function cancelClosureRequest(businessId: string, requestId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const r = await prisma.closureRequest.findFirst({ where: { id: requestId, businessId }, include: { table: true } })
  if (!r) return { ok: false, status: 404, error: 'Solicitação não encontrada.' }
  if (r.status !== 'AWAITING_PAYMENT') return { ok: false, status: 409, error: 'Esta solicitação já foi resolvida.' }
  if (await chargeSentFor(r.tableId, businessId, r.scope, r.deviceId)) {
    return { ok: false, status: 409, error: 'Há uma cobrança aguardando na maquininha. Cancele a cobrança antes de cancelar a solicitação.' }
  }

  const flipped = await prisma.closureRequest.updateMany({ where: { id: r.id, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELLED', resolvedAt: new Date() } })
  if (flipped.count === 0) return { ok: false, status: 409, error: 'Esta solicitação já foi resolvida.' }

  let sessionIds: string[]
  if (r.scope === 'TABLE') {
    stopSplit(r.tableId)
    sessionIds = (await reopenAfterFailedCharge(r.tableId, businessId)).sessionIds
    if (sessionIds.length === 0) sessionIds = [r.sessionId]
  } else {
    sessionIds = (await getTableBilling(r.tableId, businessId)).sessionIds
  }
  await emitClosureResolved([r], 'CANCELLED', sessionIds, r.table.number)
  return { ok: true }
}
