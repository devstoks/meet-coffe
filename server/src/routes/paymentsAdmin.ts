import { Router } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { SERVICE_FEE_PERCENT } from '../lib/config.js'
import { getIO, emitToKitchen } from '../socket.js'
import { decrypt } from '../lib/crypto.js'
import { expireStalePayments } from '../lib/paymentExpiry.js'
import { getTableBilling, getCustomerDues } from '../lib/tableBilling.js'
import { createPointCharge, advanceSplit, getSplitQueue } from '../lib/charges.js'
import { processWebhookAsync } from './webhook.js'
import { reopenAfterFailedCharge } from '../lib/tableBilling.js'
import { startSplit, stopSplit, isSplitActive } from '../lib/splitQueue.js'
import { forceCloseTable } from '../lib/closure.js'
import { readSelections } from '../lib/options.js'

export const paymentsAdminRouter = Router()

paymentsAdminRouter.get('/admin/payments', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId

  // Cobranças que passaram do limite sem aprovação voltam a ficar abertas
  await expireStalePayments({ businessId }).catch((e) => console.error('expireStalePayments', e))

  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, images: true },
  })
  const productImageMap = new Map(products.map(p => [p.id, p.images[0] ?? null]))

  const allTables = await prisma.cafeTable.findMany({
    where: { businessId },
    orderBy: { number: 'asc' },
  })

  const activeSessions = await prisma.tableSession.findMany({
    where: {
      businessId,
      status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] },
    },
    include: {
      tabs: {
        include: {
          orders: {
            where: { status: { not: 'CANCELLED' } },
            include: { items: true },
          },
        },
      },
    },
  })

  const pendingCharges = await prisma.payment.findMany({
    where: { businessId, status: 'PENDING' },
    select: { tab: { select: { tableId: true } } },
  })
  const chargeSentTables = new Set(pendingCharges.map((p) => p.tab.tableId))

  const awaitingClosures = await prisma.closureRequest.findMany({
    where: { businessId, status: 'AWAITING_PAYMENT', sessionId: { in: activeSessions.map((x) => x.id) } },
    select: { id: true, tableId: true, scope: true, deviceId: true, paymentMethod: true, amount: true, customerName: true },
  })
  const closuresByTable = new Map<string, { id: string; scope: string; deviceId: string | null; paymentMethod: string; amount: number; customerName: string | null }[]>()
  for (const c of awaitingClosures) {
    const arr = closuresByTable.get(c.tableId) ?? []
    arr.push({ id: c.id, scope: c.scope, deviceId: c.deviceId, paymentMethod: c.paymentMethod, amount: Number(c.amount), customerName: c.customerName })
    closuresByTable.set(c.tableId, arr)
  }

  const approvedPayments = await prisma.payment.findMany({
    where: { businessId, status: 'APPROVED', tab: { sessionId: { in: activeSessions.map((x) => x.id) } } },
    select: { amount: true, deviceId: true, tab: { select: { tableId: true } } },
  })
  const paymentsBySession = new Map<string, { amount: unknown; deviceId: string | null }[]>()
  for (const ap of approvedPayments) {
    const arr = paymentsBySession.get(ap.tab.tableId) ?? []
    arr.push({ amount: ap.amount, deviceId: ap.deviceId })
    paymentsBySession.set(ap.tab.tableId, arr)
  }

  const sessionMap = new Map()
  
  for (const session of activeSessions) {
    const orders = session.tabs.flatMap(tab => tab.orders)
    
    const byDevice = new Map<string, { 
      customerName: string; 
      subtotal: number; 
      orders: any[] 
    }>()

    for (const o of orders) {
      const key = o.deviceId || `anon-${o.id}`
      if (!byDevice.has(key)) {
        byDevice.set(key, { customerName: o.customerName || 'Cliente', subtotal: 0, orders: [] })
      }
      const entry = byDevice.get(key)!
      entry.subtotal += Number(o.totalAmount)
      
      const formattedItems = o.items.map(it => ({
        id: it.id,
        name: it.productNameSnapshot,
        quantity: it.quantity,
        unitPrice: Number(it.unitPriceSnapshot),
        subtotal: Number(it.subtotal),
        observations: it.observations,
        selections: readSelections(it.selections),
        imagePath: productImageMap.get(it.productId) || null
      }))

      entry.orders.push({
        id: o.id,
        status: o.status,
        items: formattedItems
      })
    }

    const paidByDevice = new Map<string, number>()
    for (const pay of paymentsBySession.get(session.tableId) ?? []) {
      if (pay.deviceId) paidByDevice.set(pay.deviceId, (paidByDevice.get(pay.deviceId) ?? 0) + Number(pay.amount))
    }
    const customers = Array.from(byDevice.entries()).map(([key, c]) => {
      const totalWithFee = Number((c.subtotal * (1 + SERVICE_FEE_PERCENT / 100)).toFixed(2))
      const paid = Number((paidByDevice.get(key) ?? 0).toFixed(2))
      return {
        deviceId: key.startsWith('anon-') ? null : key,
        customerName: c.customerName,
        subtotal: Number(c.subtotal.toFixed(2)),
        totalWithFee,
        paid,
        due: Math.max(0, Number((totalWithFee - paid).toFixed(2))),
        orders: c.orders
      }
    })

    const totalSubtotal = customers.reduce((sum, c) => sum + c.subtotal, 0)
    
    sessionMap.set(session.tableId, {
      sessionId: session.id,
      status: session.status,
      chargeSent: chargeSentTables.has(session.tableId),
      closureRequests: closuresByTable.get(session.tableId) ?? [],
      customers,
      subtotal: Number(totalSubtotal.toFixed(2)),
      serviceFee: Number((totalSubtotal * (SERVICE_FEE_PERCENT / 100)).toFixed(2)),
      totalWithFee: Number((totalSubtotal * (1 + SERVICE_FEE_PERCENT / 100)).toFixed(2)),
      paid: Number((paymentsBySession.get(session.tableId) ?? []).reduce((n, x) => n + Number(x.amount), 0).toFixed(2)),
    })
  }

  const splitQueues = new Map<string, Awaited<ReturnType<typeof getSplitQueue>>>()
  for (const t of allTables) {
    if (sessionMap.has(t.id) && isSplitActive(t.id)) splitQueues.set(t.id, await getSplitQueue(t.id, businessId))
  }

  const tables = allTables.map(table => {
    const sessionData = sessionMap.get(table.id)
    if (sessionData) {
      return {
        id: table.id,
        number: table.number,
        occupied: true,
        ...sessionData,
        splitActive: splitQueues.has(table.id),
        splitQueue: splitQueues.get(table.id) ?? [],
      }
    }
    return {
      id: table.id,
      number: table.number,
      occupied: false,
      sessionId: null,
      customers: [],
      subtotal: 0,
      serviceFee: 0,
      totalWithFee: 0,
    }
  })

  res.json({ tables })
})

// ==========================================
// ENVIAR COBRANÇA PARA A MAQUININHA (ADMIN)
// ==========================================
paymentsAdminRouter.post('/admin/tables/:tableId/request-payment', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  const businessId = req.admin!.businessId

  try {
    const body = req.body ?? {}
    const requested = body.amount === undefined || body.amount === null || body.amount === '' ? null : Number(body.amount)
    if (requested !== null && !Number.isFinite(requested)) return res.status(400).json({ error: 'Valor inválido.' })
    // Cobrança manual: interrompe a fila automática da divisão por consumo, se houver
    stopSplit(tableId)
    const result = await createPointCharge(businessId, tableId, { amount: requested, deviceId: body.deviceId, customerName: body.customerName })
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.json({ ok: true })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao processar cobrança.' })
  }
})

// ==========================================
// RECARREGAR / CANCELAR A COBRANÇA DA MESA (caso a maquininha cancele e o aviso não chegue)
// ==========================================
async function pendingChargeOf(tableId: string, businessId: string) {
  return prisma.payment.findFirst({ where: { businessId, status: 'PENDING', tab: { tableId } }, orderBy: { createdAt: 'desc' }, include: { tab: { include: { table: true } } } })
}

paymentsAdminRouter.post('/admin/tables/:tableId/charge/refresh', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  const businessId = req.admin!.businessId
  try {
    const payment = await pendingChargeOf(tableId, businessId)
    if (!payment || !payment.mpOrderId) return res.json({ result: 'NONE', message: 'Nenhuma cobrança pendente nesta mesa.' })
    const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId } })
    if (!account) return res.status(400).json({ error: 'Conta não conectada' })

    // Consulta o estado real no Mercado Pago e aplica a mesma regra do webhook (aprovado / cancelado / expirado)
    const mpRes = await fetch(`https://api.mercadopago.com/v1/orders/${payment.mpOrderId}`, { headers: { Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}` } })
    const order: any = await mpRes.json().catch(() => ({}))
    await processWebhookAsync(payment.mpOrderId, { type: 'order' })

    const after = await prisma.payment.findUnique({ where: { id: payment.id } })
    const mpStatus = mpRes.ok ? order.status : null
    switch (after?.status) {
      case 'APPROVED': return res.json({ result: 'APPROVED', message: 'Pagamento aprovado.' })
      case 'CANCELLED': return res.json({ result: 'CANCELLED', message: `Mesa ${payment.tab.table.number}: pagamento cancelado na maquininha. Nada foi cobrado.` })
      case 'EXPIRED': return res.json({ result: 'EXPIRED', message: `Mesa ${payment.tab.table.number}: a cobrança expirou. Nada foi cobrado.` })
      default:
        return res.json({ result: 'PENDING', mpStatus, message: `Ainda aguardando na maquininha${mpStatus ? ` (status no Mercado Pago: ${mpStatus})` : ''}. Se você cancelou lá e continua assim, use "Cancelar cobrança".` })
    }
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao recarregar a cobrança.' })
  }
})

paymentsAdminRouter.post('/admin/tables/:tableId/charge/cancel', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  const businessId = req.admin!.businessId
  try {
    const payment = await pendingChargeOf(tableId, businessId)
    if (!payment || !payment.mpOrderId) return res.json({ result: 'NONE', message: 'Nenhuma cobrança pendente nesta mesa.' })
    const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId } })
    if (!account) return res.status(400).json({ error: 'Conta não conectada' })

    const r = await fetch(`https://api.mercadopago.com/v1/orders/${payment.mpOrderId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}`, 'X-Idempotency-Key': randomUUID() },
    })
    if (!r.ok) {
      const d: any = await r.json().catch(() => ({}))
      console.error('Erro ao cancelar order MP (HTTP ' + r.status + '):', JSON.stringify(d))
      return res.status(502).json({ error: 'O Mercado Pago não aceitou o cancelamento. Use "Recarregar" para ver o estado atual.' })
    }
    const flipped = await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    if (flipped.count > 0) {
      stopSplit(tableId)
      const { sessionIds } = await reopenAfterFailedCharge(tableId, businessId)
      const number = payment.tab.table.number
      emitToKitchen(businessId, 'payment_expired', { tableNumber: number, tableId, reason: 'cancelled' })
      for (const sid of sessionIds) getIO().to(`session:${sid}`).emit('payment_expired', { tableNumber: number, reason: 'cancelled' })
    }
    return res.json({ result: 'CANCELLED', message: `Mesa ${payment.tab.table.number}: cobrança cancelada. Nada foi cobrado.` })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao cancelar a cobrança.' })
  }
})

// ==========================================
// DIVIDIR POR CONSUMO: fila automática (cada pessoa paga o que consumiu, uma cobrança por vez na maquininha)
// ==========================================
paymentsAdminRouter.post('/admin/tables/:tableId/split/start', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  const businessId = req.admin!.businessId
  try {
    const table = await prisma.cafeTable.findFirst({ where: { id: tableId, businessId } })
    if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' })
    const dues = (await getCustomerDues(tableId, businessId)).filter((c) => c.deviceId && c.due > 0.009)
    if (dues.length < 2) return res.status(400).json({ error: 'A divisão por consumo precisa de pelo menos 2 pessoas com valor a pagar.' })

    startSplit(tableId)
    const result = await advanceSplit(businessId, tableId)
    if (!result || !result.ok) {
      stopSplit(tableId)
      return res.status(result ? result.status : 400).json({ error: result && !result.ok ? result.error : 'Não foi possível iniciar a divisão.' })
    }
    // Mesa em modo "fechando a conta": todos veem a fila no celular
    const billing = await getTableBilling(tableId, businessId)
    await prisma.$transaction([
      prisma.tab.updateMany({ where: { id: { in: billing.tabs.map((t) => t.id) } }, data: { status: 'CLOSURE_REQUESTED' } }),
      prisma.tableSession.updateMany({ where: { id: { in: billing.sessionIds } }, data: { status: 'CLOSURE_REQUESTED' } }),
    ])
    for (const sid of billing.sessionIds) getIO().to(`session:${sid}`).emit('split_started', { tableNumber: table.number })
    return res.json({ ok: true })
  } catch (err: any) {
    console.error(err)
    stopSplit(tableId)
    return res.status(500).json({ error: 'Falha ao iniciar a divisão.' })
  }
})

paymentsAdminRouter.post('/admin/tables/:tableId/split/stop', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  stopSplit(tableId)
  return res.json({ ok: true })
})

// ==========================================
// ENCERRAMENTO FORÇADO MANUAL (FALLBACK)
// ==========================================
paymentsAdminRouter.post('/admin/tables/:tableId/close', requireAdmin, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId
  const businessId = req.admin!.businessId

  try {
    const table = await prisma.cafeTable.findFirst({ where: { id: tableId, businessId } })
    if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' })

    // Fecha TODAS as sessões ativas da mesa (duas pessoas entrando ao mesmo tempo podem ter criado sessões duplicadas)
    const { sessionIds } = await forceCloseTable({ tableId, businessId, tableNumber: table.number })

    return res.json({ ok: true, closedSessions: sessionIds.length })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao encerrar comanda.' })
  }
})
