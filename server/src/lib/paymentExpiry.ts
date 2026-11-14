import { prisma } from '../db.js'
import { getIO, emitToKitchen } from '../socket.js'
import { reopenAfterFailedCharge } from './tableBilling.js'
import { stopSplit } from './splitQueue.js'

// A cobrança no Mercado Pago expira em 15 min (PT15M). Damos 1 min de folga para o webhook chegar.
export const PAYMENT_TIMEOUT_MS = 16 * 60 * 1000

/**
 * Pagamentos que ficaram PENDING além do limite NÃO foram aprovados: marca como EXPIRED e
 * devolve comanda/sessões para OPEN, para que o cliente possa pedir o fechamento de novo.
 * Nunca fecha mesa nem marca nada como pago.
 */
export async function expireStalePayments(scope: { businessId?: string; tableId?: string } = {}) {
  const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MS)
  const stale = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
      ...(scope.tableId ? { tab: { tableId: scope.tableId } } : {}),
    },
    include: { tab: { include: { table: true } } },
  })

  let expired = 0
  for (const payment of stale) {
    const tableId = payment.tab.tableId

    // updateMany condicional: se o webhook aprovou no meio tempo, não toca em nada
    const flipped = await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    })
    if (flipped.count === 0) continue

    stopSplit(tableId)
    const { sessionIds } = await reopenAfterFailedCharge(tableId, payment.businessId)

    expired++
    const tableNumber = payment.tab.table.number
    emitToKitchen(payment.businessId, 'payment_expired', { tableNumber, tableId })
    for (const sid of sessionIds) getIO().to(`session:${sid}`).emit('payment_expired', { tableNumber })
  }
  return expired
}
