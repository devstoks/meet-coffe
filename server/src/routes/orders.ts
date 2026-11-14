import { Router } from 'express'
import { createHash } from 'crypto'
import { prisma } from '../db.js'
import { getIO, emitToKitchen } from '../socket.js'
import { expireStalePayments } from '../lib/paymentExpiry.js'
import { SERVICE_FEE_PERCENT } from '../lib/config.js'
import { getTableBilling } from '../lib/tableBilling.js'
import { getSplitQueue } from '../lib/charges.js'
import { isSplitActive } from '../lib/splitQueue.js'
import { readOptionGroups, resolveSelections, readSelections } from '../lib/options.js'
import { createClosureRequest, closureStateFor, countOtherOpenPeople, deviceClosureBlock, isPaymentMethod, type ClosureScope } from '../lib/closure.js'

export const ordersRouter = Router()

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

async function getActiveSession(req: any) {
  const raw = req.cookies?.session_access
  if (!raw) return null
  const access = await prisma.sessionAccess.findFirst({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    include: {
      session: {
        include: {
          table: true,
          business: true,
          tabs: { where: { status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } }, take: 1 },
        },
      },
    },
  })
  if (!access) return null
  if (access.session.status === 'CLOSED') return null
  return access.session
}

ordersRouter.post('/orders', async (req, res) => {
  const session = await getActiveSession(req)
  if (!session) return res.status(401).json({ error: 'Sessão inválida' })

  const { items, idempotencyKey, qrContent, customerName, deviceId } = req.body ?? {}

  // A leitura de QR Code / tag NFC serve só para ENTRAR no cardápio (abre a mesa); pedir não exige nova leitura.

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Lista vazia' })
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return res.status(400).json({ error: 'idempotencyKey obrigatório' })

  const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } })
  if (existing) return res.json({ order: existing })

  const tab = session.tabs[0]
  if (!tab) return res.status(400).json({ error: 'Comanda não encontrada' })
  if (tab.status !== 'OPEN') return res.status(400).json({ error: 'A mesa está fechando. Não aceitamos novos pedidos.', code: 'TABLE_CLOSING' })

  // Quem já encerrou (ou está encerrando) a própria comanda não pede mais nesta sessão
  const tableSessions = await prisma.tableSession.findMany({ where: { tableId: session.tableId, status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } }, select: { id: true } })
  const blocked = await deviceClosureBlock(tableSessions.map((s) => s.id), typeof deviceId === 'string' ? deviceId : null)
  if (blocked) return res.status(400).json({ error: 'A sua comanda já foi encerrada. Para pedir de novo, abra uma nova comanda.', code: 'DEVICE_CLOSED' })

  const productIds = items.map((i: any) => i?.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true, businessId: session.businessId },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  let totalCents = 0
  const orderItemsData: {
    productId: string; productNameSnapshot: string; unitPriceSnapshot: number; quantity: number; subtotal: number
    observations: string | null; selections?: any
  }[] = []
  for (const i of items) {
    const p = productMap.get(i?.productId)
    if (!p) return res.status(400).json({ error: 'Um dos produtos não está mais disponível. Atualize o cardápio.' })
    const qty = Number(i.quantity)
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) return res.status(400).json({ error: 'Quantidade inválida' })

    // Personalização: validada contra a configuração do produto (preço e nomes vêm do banco, não do celular)
    const resolved = resolveSelections(readOptionGroups(p.optionGroups), i.selections)
    if (!resolved.ok) return res.status(400).json({ error: `${p.name}: ${resolved.error}` })

    // Tudo em centavos inteiros: sem erro de arredondamento (ex.: R$ 0,10 + R$ 0,20 = R$ 0,30)
    const unitCents = Math.round(Number(p.price) * 100) + resolved.deltaCents
    const unitPrice = unitCents / 100
    const subtotal = (unitCents * qty) / 100
    totalCents += unitCents * qty
    orderItemsData.push({
      productId: p.id,
      productNameSnapshot: p.name,
      unitPriceSnapshot: unitPrice,
      quantity: qty,
      subtotal,
      observations: typeof i.observations === 'string' && i.observations.trim() ? i.observations.trim().slice(0, 300) : null,
      ...(resolved.selections.length > 0 ? { selections: resolved.selections } : {}),
    })
  }
  const total = totalCents / 100

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          businessId: session.businessId,
          tabId: tab.id,
          sessionId: session.id,
          tableId: session.tableId,
          customerName: typeof customerName === 'string' ? customerName.trim().slice(0, 40) : null,
          deviceId: typeof deviceId === 'string' ? deviceId : null,
          status: 'SENT',
          totalAmount: total,
          idempotencyKey,
          items: { create: orderItemsData },
        },
        include: { items: true },
      })
      await tx.tab.update({ where: { id: tab.id }, data: { totalAmount: { increment: total } } })
      
      // Salva a autorização apenas se for a primeira vez
      if (!session.authorizedAt) {
        await tx.tableSession.update({ where: { id: session.id }, data: { authorizedAt: new Date() } })
      }
      
      return created
    })

    emitToKitchen(session.businessId, 'new_order', {
      orderId: order.id, sessionId: session.id, tableNumber: session.table.number,
      customerName: order.customerName, totalAmount: total, createdAt: order.createdAt,
      items: order.items.map((it) => ({ name: it.productNameSnapshot, quantity: it.quantity, subtotal: Number(it.subtotal), selections: readSelections(it.selections), observations: it.observations })),
    })
    getIO().to(`session:${session.id}`).emit('order_status_changed', { orderId: order.id, status: 'SENT' })

    return res.json({ order })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const dup = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } })
      return res.json({ order: dup })
    }
    return res.status(500).json({ error: 'Falha ao criar pedido' })
  }
})

ordersRouter.get('/session', async (req, res) => {
  const session = await getActiveSession(req)
  if (!session) return res.status(401).json({ error: 'Sessão inválida' })

  const activeSessions = await prisma.tableSession.findMany({
    where: { tableId: session.tableId, status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } },
    select: { id: true }
  })
  const activeSessionIds = activeSessions.map(s => s.id)

  const orders = await prisma.order.findMany({
    where: { sessionId: { in: activeSessionIds }, status: { notIn: ['CANCELLED'] } },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  })

  const byDevice = new Map<string, { customerName: string; subtotal: number; orderCount: number }>()
  for (const o of orders) {
    const key = o.deviceId || `anon-${o.id}`
    if (!byDevice.has(key)) {
      byDevice.set(key, { customerName: o.customerName || 'Cliente', subtotal: 0, orderCount: 0 })
    }
    const entry = byDevice.get(key)!
    entry.subtotal += Number(o.totalAmount)
    entry.orderCount += 1
    if (o.customerName) entry.customerName = o.customerName
  }

  const summary = Array.from(byDevice.entries()).map(([deviceId, data]) => ({
    deviceId,
    customerName: data.customerName,
    orderCount: data.orderCount,
    subtotal: Number(data.subtotal.toFixed(2)),
    totalWithFee: Number((data.subtotal * (1 + SERVICE_FEE_PERCENT / 100)).toFixed(2)),
  }))

  const subtotal = orders.reduce((s, o) => s + Number(o.totalAmount), 0)
  const serviceFee = subtotal * (SERVICE_FEE_PERCENT / 100)

  const tab = session.tabs[0]
  // Quanto ainda falta pagar na mesa toda (já descontando quem quitou a própria comanda)
  const billing = await getTableBilling(session.tableId)

  return res.json({
    session: { id: session.id, status: session.status, authorized: !!session.authorizedAt },
    table: { number: session.table.number },
    business: { googleReviewUrl: session.business.googleReviewUrl || null },
    tab: tab ? { id: tab.id, status: tab.status, totalAmount: Number(tab.totalAmount) } : null,
    orders: orders.map((o) => ({
      id: o.id, status: o.status, totalAmount: Number(o.totalAmount), createdAt: o.createdAt,
      customerName: o.customerName, deviceId: o.deviceId,
      items: o.items.map((it) => ({ id: it.id, productId: it.productId, name: it.productNameSnapshot, unitPrice: Number(it.unitPriceSnapshot), quantity: it.quantity, subtotal: Number(it.subtotal), observations: it.observations, selections: readSelections(it.selections) })),
    })),
    // Estado do encerramento DESTE celular: é o que decide a tela de pagamento (e a ida para "obrigado")
    closure: await closureStateFor(activeSessionIds, session.tableId, session.businessId, typeof req.query.deviceId === 'string' && req.query.deviceId ? req.query.deviceId : null),
    // Formato de cardápio escolhido por ESTE celular (FEED/LIST) — a entrada só pergunta quando ainda não há escolha
    menuView: await menuViewFor(session.id, typeof req.query.deviceId === 'string' && req.query.deviceId ? req.query.deviceId : null),
    summary,
    peopleCount: summary.length,
    subtotal: Number(subtotal.toFixed(2)),
    serviceFee: Number(serviceFee.toFixed(2)),
    totalWithFee: Number((subtotal + serviceFee).toFixed(2)),
    othersOpen: await countOtherOpenPeople(session.tableId, session.businessId, activeSessionIds, typeof req.query.deviceId === 'string' && req.query.deviceId ? req.query.deviceId : null),
    tablePaid: billing.paid,
    tableDue: billing.remaining,
    serviceFeePercent: SERVICE_FEE_PERCENT,
  })
})

// Formato de cardápio escolhido na entrada da mesa (registra a preferência de navegação daquele participante)
async function menuViewFor(sessionId: string, deviceId: string | null): Promise<'feed' | 'list' | null> {
  if (!deviceId) return null
  const row = await prisma.menuViewChoice.findUnique({ where: { sessionId_deviceId: { sessionId, deviceId } }, select: { view: true } })
  return row ? (row.view === 'LIST' ? 'list' : 'feed') : null
}

ordersRouter.post('/session/menu-view', async (req, res) => {
  const session = await getActiveSession(req)
  if (!session) return res.status(401).json({ error: 'Sessão inválida' })
  const view = req.body?.view === 'list' ? 'LIST' : req.body?.view === 'feed' ? 'FEED' : null
  const deviceId = typeof req.body?.deviceId === 'string' && req.body.deviceId.trim() ? req.body.deviceId.trim().slice(0, 120) : null
  if (!view) return res.status(400).json({ error: 'Escolha entre Feed e Lista.' })
  if (!deviceId) return res.status(400).json({ error: 'Não foi possível identificar o seu celular.' })
  await prisma.menuViewChoice.upsert({
    where: { sessionId_deviceId: { sessionId: session.id, deviceId } },
    create: { businessId: session.businessId, sessionId: session.id, deviceId, view },
    update: { view },
  })
  return res.json({ ok: true, menuView: view === 'LIST' ? 'list' : 'feed' })
})

// Encerramento da comanda. Escolher a forma de pagamento só registra a solicitação (a equipe é avisada);
// o pagamento só é dado como feito quando a maquininha/equipe confirma.
//   scope = 'individual' → encerra só a participação deste celular (a mesa continua aberta para os outros)
//   scope = 'table'      → encerra a sessão de consumo da mesa toda (ninguém mais pede)
ordersRouter.post('/session/close-request', async (req, res) => {
  const session = await getActiveSession(req)
  if (!session) return res.status(401).json({ error: 'Sessão inválida' })

  const body = req.body ?? {}
  const scope: ClosureScope | null = body.scope === 'individual' ? 'INDIVIDUAL' : body.scope === 'table' ? 'TABLE' : null
  if (!scope) return res.status(400).json({ error: 'Escolha entre pagar individualmente ou a mesa toda.' })
  if (!isPaymentMethod(body.method)) return res.status(400).json({ error: 'Escolha a forma de pagamento (débito, crédito, PIX ou dinheiro).' })
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 120) : null
  const customerName = typeof body.customerName === 'string' && body.customerName.trim() ? body.customerName.trim().slice(0, 40) : null

  try {
    const result = await createClosureRequest(session, { scope, method: body.method, deviceId, customerName })
    if (!result.ok) return res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) })
    return res.json({
      ok: true,
      duplicate: result.duplicate,
      closure: { requestId: result.request.id, scope: result.request.scope, status: result.request.status, paymentMethod: result.request.paymentMethod, amount: Number(result.request.amount) },
    })
  } catch (err) {
    console.error('close-request', err)
    return res.status(500).json({ error: 'Falha ao solicitar o encerramento. Tente novamente.' })
  }
})

// ==========================================
// POST /session/rate — avaliação pós-pagamento
// ==========================================
ordersRouter.post('/session/rate', async (req, res) => {
  const { sessionId, rating, comment } = req.body ?? {}

  if (!sessionId || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'sessionId e rating (1-5) obrigatórios' })
  }

  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: { business: true },
  })

  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' })

  await prisma.tableSession.update({
    where: { id: sessionId },
    data: {
      rating,
      ratingComment: typeof comment === 'string' ? comment.trim().slice(0, 500) : null,
      ratedAt: new Date(),
    },
  })

  return res.json({
    ok: true,
    googleReviewUrl: session.business.googleReviewUrl || null,
  })
})

// Estado do pagamento da mesa. O celular só vai para a tela de "obrigado" quando status === 'APPROVED'.
// Se a cobrança passou do limite sem aprovação ela vira EXPIRED e a comanda volta a ficar aberta.
ordersRouter.get('/session/:sessionId/payment-status', async (req, res) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId
  const session = await prisma.tableSession.findUnique({ where: { id: sessionId }, include: { table: true } })
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' })

  await expireStalePayments({ tableId: session.tableId })

  const payment = await prisma.payment.findFirst({
    // Só cobranças criadas depois que esta sessão abriu: pagamento de cliente anterior na mesma mesa não vale
    where: { tab: { tableId: session.tableId }, createdAt: { gte: session.openedAt } },
    orderBy: { createdAt: 'desc' },
  })
  const fresh = await prisma.tableSession.findUnique({ where: { id: sessionId }, select: { status: true } })

  const sessionNow = fresh?.status ?? session.status
  const waiting = sessionNow === 'CLOSURE_REQUESTED' || sessionNow === 'PAYMENT_PENDING'
  const chargeSent = payment?.status === 'PENDING'
  // Enquanto a mesa ainda espera (conta pedida, cobrança na fila ou pagamento parcial), nunca é "aprovado/cancelado" de cobrança antiga
  const effective = sessionNow === 'CLOSED' ? (payment?.status ?? 'NONE') : (waiting || chargeSent ? 'PENDING' : (payment?.status ?? 'NONE'))
  const billing = waiting ? await getTableBilling(session.tableId) : null
  const splitActive = isSplitActive(session.tableId)
  const splitQueue = splitActive ? await getSplitQueue(session.tableId, session.businessId) : []

  return res.json({
    chargeSent,
    splitActive,
    splitQueue,
    tableTotal: billing?.total ?? 0,
    remaining: billing?.remaining ?? 0,
    paid: billing?.paid ?? 0,
    status: effective,
    amount: payment ? Number(payment.amount) : 0,
    tableNumber: session.table.number,
    sessionStatus: fresh?.status ?? session.status,
  })
})
