import { randomUUID } from 'crypto'
import { prisma } from '../db.js'
import { getIO, emitToKitchen } from '../socket.js'
import { decrypt } from './crypto.js'
import { getTableBilling, getCustomerDues } from './tableBilling.js'
import { isSplitActive, stopSplit } from './splitQueue.js'

export type ChargeOpts = { amount?: number | null; deviceId?: string | null; customerName?: string | null }
export type ChargeResult =
  | { ok: true; amount: number; isFull: boolean; customerName: string | null; deviceId: string | null }
  | { ok: false; status: number; error: string }

/** Cria UMA cobrança na maquininha (Point) para a mesa: o valor que falta, ou um valor escolhido (divisão de conta). */
export async function createPointCharge(businessId: string, tableId: string, opts: ChargeOpts = {}): Promise<ChargeResult> {
  const activeSessions = await prisma.tableSession.findMany({
    where: { tableId, businessId, status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } },
    include: { table: true },
  })
  if (activeSessions.length === 0) return { ok: false as const, status: 404, error: 'Sessão ativa não encontrada.' }
  const session = activeSessions[0]
  const activeSessionIds = activeSessions.map((x) => x.id)

  // Já existe uma cobrança em andamento nesta mesa
  const already = await prisma.payment.findFirst({ where: { businessId, status: 'PENDING', tab: { tableId } } })
  if (already) return { ok: false as const, status: 400, error: 'A cobrança desta mesa já foi enviada para a maquininha.' }

  const billing = await getTableBilling(tableId, businessId)
  const tabs = billing.tabs
  if (tabs.length === 0) return { ok: false as const, status: 400, error: 'Comanda não encontrada.' }

  // Pedidos ainda em preparo NÃO travam a cobrança: a cozinha já os vê na tela Pedidos e a equipe decide quando cobrar.

  const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId } })
  const terminal = await prisma.businessTerminal.findFirst({ where: { businessId, active: true } })
  if (!account || !terminal) return { ok: false as const, status: 400, error: 'Integração MP não configurada.' }

  if (billing.total <= 0) return { ok: false as const, status: 400, error: 'Não há valor a cobrar.' }
  if (billing.remaining <= 0.009) return { ok: false as const, status: 400, error: 'Esta mesa já está paga.' }

  // Valor da cobrança: o que falta pagar, ou um valor escolhido pelo atendente (divisão de conta)
  const requested = opts.amount === undefined || opts.amount === null ? null : Number(opts.amount)
  if (requested !== null && !Number.isFinite(requested)) return { ok: false as const, status: 400, error: 'Valor inválido.' }
  const totalWithFee = requested === null ? billing.remaining : Math.round(requested * 100) / 100
  const MIN_CHARGE = 1
  if (totalWithFee < MIN_CHARGE - 0.0001) return { ok: false as const, status: 400, error: 'O valor mínimo da cobrança é R$ 1,00.' }
  if (totalWithFee > billing.remaining + 0.005) return { ok: false as const, status: 400, error: `O valor passa do que falta pagar (R$ ${billing.remaining.toFixed(2).replace('.', ',')}).` }
  const leftover = Math.round((billing.remaining - totalWithFee) * 100) / 100
  if (leftover > 0.009 && leftover < MIN_CHARGE) {
    return { ok: false as const, status: 400, error: 'O restante da mesa ficaria menor que R$ 1,00. Cobre o valor total que falta ou um valor que deixe pelo menos R$ 1,00.' }
  }
  const isFull = leftover <= 0.009
  const customerName = typeof opts.customerName === 'string' ? opts.customerName.slice(0, 80) : null
  const deviceId = typeof opts.deviceId === 'string' ? opts.deviceId.slice(0, 120) : null

  const extRef = `TAB_${tableId}_PAY_${Date.now()}`
  const idempotencyKey = randomUUID()

  const mpRes = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      type: 'point',
      external_reference: extRef,
      expiration_time: 'PT15M',
      transactions: { payments: [{ amount: totalWithFee.toFixed(2) }] },
      config: { point: { terminal_id: terminal.terminalId, print_on_terminal: 'no_ticket' } },
      description: `Fechamento Mesa ${session.table.number}`,
    }),
  })

  const orderData = await mpRes.json()
  if (!mpRes.ok) {
    console.error('Erro ao criar order MP (HTTP ' + mpRes.status + '):', JSON.stringify(orderData, null, 2))
    const code = orderData?.errors?.[0]?.code
    const msg = code === 'already_queued_order_on_terminal'
      ? 'A maquininha já tem uma cobrança na fila. Conclua ou cancele essa cobrança antes.'
      : 'Falha ao criar cobrança no Mercado Pago.'
    return { ok: false as const, status: 500, error: msg }
  }

  await prisma.$transaction([
    // Cobrança do valor total que falta: a mesa passa a "aguardando pagamento". Cobrança parcial não trava a mesa.
    ...(isFull ? [
      prisma.tab.updateMany({ where: { id: { in: tabs.map((t) => t.id) } }, data: { status: 'CLOSURE_REQUESTED' } }),
      prisma.tableSession.updateMany({ where: { id: { in: activeSessionIds } }, data: { status: 'CLOSURE_REQUESTED' } }),
    ] : []),
    prisma.payment.create({
      data: {
        businessId, tabId: tabs[0].id, scope: isFull ? 'FULL' : 'PARTIAL', status: 'PENDING',
        deviceId, customerName,
        amount: totalWithFee, mpOrderId: orderData.id, externalReference: extRef,
        terminalId: terminal.terminalId, idempotencyKey,
      },
    }),
  ])

  // Avisa a equipe e os clientes (o cliente passa de "conta pedida" para "pague na maquininha")
  for (const sid of activeSessionIds) {
    getIO().to(`session:${sid}`).emit('charge_sent', { tableNumber: session.table.number, amount: totalWithFee, customerName, deviceId })
  }
  return { ok: true as const, amount: totalWithFee, isFull, customerName, deviceId }
}

const MIN_CHARGE = 1

/** Fila da divisão por consumo: quem já pagou, quem está na maquininha agora e quem aguarda. */
export async function getSplitQueue(tableId: string, businessId: string) {
  const dues = (await getCustomerDues(tableId, businessId)).filter((c) => c.deviceId)
  const pending = await prisma.payment.findFirst({ where: { businessId, status: 'PENDING', tab: { tableId } }, orderBy: { createdAt: 'desc' } })
  return dues.map((c) => ({
    deviceId: c.deviceId,
    customerName: c.customerName,
    totalWithFee: c.totalWithFee,
    paid: c.paid,
    due: c.due,
    state: c.paid > 0 && c.due <= 0.009 ? ('paid' as const) : pending?.deviceId === c.deviceId ? ('paying' as const) : ('waiting' as const),
  }))
}

/** Próxima cobrança da fila: primeira pessoa que ainda deve (a última leva o que sobrar, inclusive arredondamentos e valores abaixo de R$ 1,00). */
export async function advanceSplit(businessId: string, tableId: string): Promise<ChargeResult | null> {
  if (!isSplitActive(tableId)) return null
  const billing = await getTableBilling(tableId, businessId)
  if (billing.remaining <= 0.009) { stopSplit(tableId); return null }

  const dues = (await getCustomerDues(tableId, businessId)).filter((c) => c.deviceId && c.due > 0.009)
  let target: { deviceId: string | null; customerName: string | null; amount: number } | null = null
  for (let i = 0; i < dues.length; i++) {
    const c = dues[i]
    const isLast = i === dues.length - 1
    if (c.due < MIN_CHARGE && !isLast) continue // valor menor que R$ 1,00: entra na última cobrança
    const takeAll = isLast || billing.remaining - c.due < MIN_CHARGE
    target = { deviceId: c.deviceId, customerName: c.customerName, amount: takeAll ? billing.remaining : Math.min(c.due, billing.remaining) }
    break
  }
  if (!target) target = { deviceId: null, customerName: null, amount: billing.remaining }

  const result = await createPointCharge(businessId, tableId, target)
  if (!result.ok) {
    stopSplit(tableId)
    const tab = await prisma.tab.findFirst({ where: { id: billing.tabs[0]?.id }, include: { table: true } })
    emitToKitchen(businessId, 'payment_expired', { tableNumber: tab?.table.number, tableId, reason: 'split_stopped', message: result.error })
  }
  return result
}
