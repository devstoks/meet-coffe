import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { cancelClosureRequest, closePersonCash, describeClosureRequest, forceCloseTable } from '../lib/closure.js'

export const closureAdminRouter = Router()

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

// Solicitações de encerramento aguardando pagamento (individual ou mesa toda), com o consumo completo para a equipe conferir.
closureAdminRouter.get('/admin/closure-requests', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const rows = await prisma.closureRequest.findMany({
    where: { businessId, status: 'AWAITING_PAYMENT' },
    orderBy: { createdAt: 'asc' },
    include: { table: { select: { number: true } } },
  })
  const requests = []
  for (const r of rows) requests.push(await describeClosureRequest(r, r.table.number))
  return res.json({ requests })
})

// A equipe cancela a solicitação (ex.: cliente desistiu). A mesa volta a aceitar pedidos se era encerramento da mesa toda.
closureAdminRouter.post('/admin/closure-requests/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const result = await cancelClosureRequest(req.admin!.businessId, param(req.params.id))
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao cancelar a solicitação.' })
  }
})

// Dinheiro: a equipe recebeu e encerra. INDIVIDUAL fecha só a comanda daquela pessoa; TABLE fecha a mesa toda.
closureAdminRouter.post('/admin/closure-requests/:id/settle-cash', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  try {
    const r = await prisma.closureRequest.findFirst({ where: { id: param(req.params.id), businessId }, include: { table: true } })
    if (!r) return res.status(404).json({ error: 'Solicitação não encontrada.' })
    if (r.status !== 'AWAITING_PAYMENT') return res.status(409).json({ error: 'Esta solicitação já foi resolvida.' })

    if (r.scope === 'TABLE') {
      const pending = await prisma.payment.findFirst({ where: { businessId, status: 'PENDING', tab: { tableId: r.tableId } } })
      if (pending) return res.status(400).json({ error: 'Há uma cobrança aguardando na maquininha. Conclua ou cancele antes de encerrar em dinheiro.' })
      await forceCloseTable({ tableId: r.tableId, businessId, tableNumber: r.table.number })
      return res.json({ ok: true, tableClosed: true })
    }
    if (!r.deviceId) return res.status(400).json({ error: 'Solicitação sem identificação do cliente.' })
    const result = await closePersonCash(businessId, r.tableId, r.deviceId)
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.json({ ok: true, tableClosed: result.tableClosed })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao encerrar a comanda.' })
  }
})

// Encerrar a comanda de UMA pessoa (recebida em dinheiro) direto pelo painel da mesa, sem precisar de solicitação.
closureAdminRouter.post('/admin/tables/:tableId/close-person', requireAdmin, async (req, res) => {
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : ''
  if (!deviceId) return res.status(400).json({ error: 'Pessoa não identificada.' })
  try {
    const result = await closePersonCash(req.admin!.businessId, param(req.params.tableId), deviceId)
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.json({ ok: true, tableClosed: result.tableClosed })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Falha ao encerrar a comanda.' })
  }
})
