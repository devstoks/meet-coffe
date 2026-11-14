import { prisma } from '../db.js'
import { SERVICE_FEE_PERCENT } from './config.js'

const ACTIVE = ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING']
const WAITING = ['CLOSURE_REQUESTED', 'PAYMENT_PENDING']
const round2 = (n: number) => Math.round(n * 100) / 100

/** Conta da mesa: total com taxa, quanto já foi pago (pagamentos aprovados) e quanto falta. */
export async function getTableBilling(tableId: string, businessId?: string) {
  const sessions = await prisma.tableSession.findMany({
    where: { tableId, ...(businessId ? { businessId } : {}), status: { in: ACTIVE } },
    select: { id: true },
  })
  const sessionIds = sessions.map((s) => s.id)
  const tabs = await prisma.tab.findMany({ where: { sessionId: { in: sessionIds }, status: { in: ACTIVE } } })
  const subtotal = tabs.reduce((sum, t) => sum + Number(t.totalAmount), 0)
  const total = round2(subtotal * (1 + SERVICE_FEE_PERCENT / 100))
  const approved = await prisma.payment.findMany({
    where: { tabId: { in: tabs.map((t) => t.id) }, status: 'APPROVED' },
    select: { amount: true, deviceId: true },
  })
  const paid = round2(approved.reduce((sum, p) => sum + Number(p.amount), 0))
  return { sessionIds, tabs, subtotal: round2(subtotal), total, paid, remaining: Math.max(0, round2(total - paid)), approved }
}

/**
 * Depois de uma cobrança que NÃO foi paga (cancelada, expirada, falha): devolve comanda e sessões
 * para OPEN. Se já houve pagamento parcial na mesa, a mesa continua "conta pedida" (CLOSURE_REQUESTED).
 */
export async function reopenAfterFailedCharge(tableId: string, businessId?: string) {
  const scope = { tableId, ...(businessId ? { businessId } : {}) }
  // Todos os celulares ativos da mesa recebem o aviso (quem pediu encerramento individual também acompanha a cobrança)
  const allActive = await prisma.tableSession.findMany({ where: { ...scope, status: { in: ACTIVE } }, select: { id: true } })
  const allIds = allActive.map((s) => s.id)
  const sessions = await prisma.tableSession.findMany({ where: { ...scope, status: { in: WAITING } }, select: { id: true } })
  const ids = sessions.map((s) => s.id)
  if (ids.length === 0) return { sessionIds: allIds, status: 'OPEN' as const }
  const billing = await getTableBilling(tableId, businessId)
  // Se a mesa inteira ainda tem um pedido de encerramento aguardando pagamento, ela continua "conta pedida" (ninguém volta a pedir)
  const awaitingTable = await prisma.closureRequest.count({ where: { sessionId: { in: ids }, scope: 'TABLE', status: 'AWAITING_PAYMENT' } })
  const status = billing.paid > 0.009 || awaitingTable > 0 ? 'CLOSURE_REQUESTED' : 'OPEN'
  await prisma.$transaction([
    prisma.tab.updateMany({ where: { sessionId: { in: ids }, status: { in: WAITING } }, data: { status } }),
    prisma.tableSession.updateMany({ where: { id: { in: ids } }, data: { status } }),
  ])
  return { sessionIds: allIds, status }
}


export type CustomerDue = {
  deviceId: string | null
  customerName: string
  subtotal: number
  totalWithFee: number
  paid: number
  due: number
}

/** Quanto cada pessoa (celular) deve na mesa, na ordem em que fez o primeiro pedido. */
export async function getCustomerDues(tableId: string, businessId?: string): Promise<CustomerDue[]> {
  const billing = await getTableBilling(tableId, businessId)
  const orders = await prisma.order.findMany({
    where: { sessionId: { in: billing.sessionIds }, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, deviceId: true, customerName: true, totalAmount: true },
  })
  const map = new Map<string, { deviceId: string | null; customerName: string; subtotal: number }>()
  for (const o of orders) {
    const key = o.deviceId || `anon-${o.id}`
    const entry = map.get(key) ?? { deviceId: o.deviceId ?? null, customerName: o.customerName || 'Cliente', subtotal: 0 }
    entry.subtotal += Number(o.totalAmount)
    map.set(key, entry)
  }
  return Array.from(map.values()).map((c) => {
    const totalWithFee = round2(c.subtotal * (1 + SERVICE_FEE_PERCENT / 100))
    const paid = round2(billing.approved.filter((p) => c.deviceId && p.deviceId === c.deviceId).reduce((n, p) => n + Number(p.amount), 0))
    return { deviceId: c.deviceId, customerName: c.customerName, subtotal: round2(c.subtotal), totalWithFee, paid, due: Math.max(0, round2(totalWithFee - paid)) }
  })
}
