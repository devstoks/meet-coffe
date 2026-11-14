import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../db.js'
import { decrypt } from '../lib/crypto.js'
import { getIO, emitToKitchen } from '../socket.js'
import { getTableBilling, reopenAfterFailedCharge } from '../lib/tableBilling.js'
import { advanceSplit } from '../lib/charges.js'
import { stopSplit } from '../lib/splitQueue.js'
import { finalizePaidTable, settleIndividualAfterPayment } from '../lib/closure.js'

export const webhookRouter = Router()

webhookRouter.post('/webhooks/mercadopago/orders', async (req, res) => {
  const xSignature = req.headers['x-signature'] as string
  const xRequestId = req.headers['x-request-id'] as string
  const dataIdRaw = (req.query['data.id'] as string) || req.body?.data?.id
  if (!xSignature || !xRequestId || !dataIdRaw) return res.status(400).send('Parâmetros ausentes')

  const parts = xSignature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=').map((s) => s.trim())
    if (key && value) acc[key] = value
    return acc
  }, {} as Record<string, string>)

  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return res.status(400).send('Assinatura inválida')

  const dataIdForHash = dataIdRaw.toLowerCase()
  const manifest = `id:${dataIdForHash};request-id:${xRequestId};ts:${ts};`
  const hmac = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET!).update(manifest).digest('hex')
  const isValid = crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(v1, 'hex'))

  if (!isValid) {
    console.warn('Webhook: Assinatura inválida', { dataId: dataIdRaw })
    return res.status(401).send('Assinatura inválida')
  }

  res.status(200).send('OK')
  processWebhookAsync(dataIdRaw, req.body).catch((err) => console.error('Erro webhook:', err))
})

export async function processWebhookAsync(dataId: string, body: any) {
  if (body.action !== 'order.processed' && body.type !== 'order') return

  const payment = await prisma.payment.findFirst({
    where: { mpOrderId: dataId },
    include: { tab: true },
  })
  if (!payment) return
  if (payment.status === 'APPROVED') return

  const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId: payment.businessId } })
  if (!account) return

  const mpRes = await fetch(`https://api.mercadopago.com/v1/orders/${dataId}`, {
    headers: { Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}` },
  })
  const order = await mpRes.json()
  const mpStatus = order.status
  const amountPaid = Number(order.transactions?.payments?.[0]?.amount)

  // Cancelada na maquininha (ou expirada/falha definitiva): NÃO é pagamento. Libera a mesa e avisa o cliente e a equipe.
  if (mpStatus === 'canceled' || mpStatus === 'expired' || mpStatus === 'failed') {
    const finalStatus = mpStatus === 'canceled' ? 'CANCELLED' : 'EXPIRED'
    const flipped = await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: finalStatus } })
    if (flipped.count === 0) return
    const tabRow = await prisma.tab.findUnique({ where: { id: payment.tabId }, include: { table: true } })
    if (!tabRow) return
    stopSplit(tabRow.tableId)
    const { sessionIds: ids } = await reopenAfterFailedCharge(tabRow.tableId, payment.businessId)
    const reason = mpStatus === 'canceled' ? 'cancelled' : 'expired'
    emitToKitchen(payment.businessId, 'payment_expired', { tableNumber: tabRow.table.number, tableId: tabRow.tableId, reason })
    for (const sid of ids) getIO().to(`session:${sid}`).emit('payment_expired', { tableNumber: tabRow.table.number, reason })
    return
  }

  if (mpStatus !== 'processed' || amountPaid + 0.005 < Number(payment.amount)) return

  // Busca o tableId a partir do tabId do pagamento
  const tab = await prisma.tab.findUnique({ where: { id: payment.tabId }, include: { table: true } })
  if (!tab) return
  const tableId = tab.tableId
  const tableNumber = tab.table.number

  // Pagamento parcial (divisão de conta): só fecha a mesa quando a soma dos pagamentos cobre o total
  const billing = await getTableBilling(tableId, payment.businessId)
  const paidAfter = billing.paid + Number(payment.amount)
  if (paidAfter + 0.02 < billing.total) {
    const flipped = await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'APPROVED', approvedAt: new Date() },
    })
    if (flipped.count === 0) return
    const remaining = Math.max(0, Math.round((billing.total - paidAfter) * 100) / 100)
    const info = { tableNumber, tableId, amount: Number(payment.amount), remaining, customerName: payment.customerName, deviceId: payment.deviceId }
    emitToKitchen(payment.businessId, 'payment_partial', info)
    for (const sid of billing.sessionIds) getIO().to(`session:${sid}`).emit('partial_paid', info)
    // Se esta pessoa quitou o que devia, a solicitação de encerramento INDIVIDUAL dela vira "paga" (só o celular dela muda de tela)
    await settleIndividualAfterPayment(tableId, payment.businessId, payment.deviceId).catch((e) => console.error('settleIndividual', e))
    // Divisão por consumo: manda sozinho a cobrança da próxima pessoa
    await advanceSplit(payment.businessId, tableId).catch((e) => console.error('advanceSplit', e))
    return
  }

  // Mesa quitada: fecha pedidos, comandas e sessões, libera a mesa e avisa todos os celulares (rotina única, compartilhada com o dinheiro)
  await finalizePaidTable({ tableId, businessId: payment.businessId, tableNumber, amount: amountPaid, paymentId: payment.id })
}
