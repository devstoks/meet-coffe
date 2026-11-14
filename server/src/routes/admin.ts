import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { getIO, emitToKitchen } from '../socket.js'
import { readSelections } from '../lib/options.js'

export const adminRouter = Router()

// "Finalizado" na tela Pedidos leva direto de SENT/PREPARING/READY para DELIVERED (não há mais etapa separada "Em preparo")
const VALID_TRANSITIONS: Record<string, string[]> = {
  SENT: ['PREPARING', 'DELIVERED', 'CANCELLED'],
  PREPARING: ['READY', 'DELIVERED', 'CANCELLED'],
  READY: ['DELIVERED'],
}

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

adminRouter.post('/admin/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha obrigatórios' })
  }

  const user = await prisma.adminUser.findUnique({ where: { email } })
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const token = jwt.sign(
    { sub: user.id, businessId: user.businessId, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  )

  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8,
  })

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
})

adminRouter.post('/admin/logout', (_req, res) => {
  res.clearCookie('admin_token')
  return res.json({ ok: true })
})

adminRouter.get('/admin/me', requireAdmin, async (req, res) => {
  const user = await prisma.adminUser.findUnique({
    where: { id: req.admin!.sub },
  })
  if (!user) return res.status(401).json({ error: 'Sessão inválida' })

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
})

adminRouter.get('/admin/orders', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId

  // Busca imagens dos produtos
  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, images: true },
  })
  const productImageMap = new Map(products.map(p => [p.id, p.images[0] ?? null]))

  // Busca todos os pedidos ativos
  const orders = await prisma.order.findMany({
    where: {
      businessId,
      status: { in: ['SENT', 'PREPARING', 'READY'] },
    },
    include: { items: true, table: true },
    orderBy: { createdAt: 'asc' },
  })

  // Busca TODOS os pedidos (incluindo entregues) para calcular o total real da mesa
  const allOrders = await prisma.order.findMany({
    where: {
      businessId,
      status: { notIn: ['CANCELLED'] },
      session: { status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } },
    },
    include: { table: true },
  })

  // Calcula stats por mesa
  const statsMap = new Map<string, {
    tableNumber: string
    orderCount: number
    customerCount: number
    subtotal: number
  }>()

  for (const o of allOrders) {
    const key = o.tableId
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        tableNumber: o.table.number,
        orderCount: 0,
        customerCount: 0,
        subtotal: 0,
      })
    }
    const s = statsMap.get(key)!
    s.orderCount += 1
    s.subtotal += Number(o.totalAmount)
  }

  for (const [tableId, s] of statsMap) {
    const devices = new Set(
      allOrders
        .filter((o) => o.tableId === tableId)
        .map((o) => o.deviceId || `anon-${o.id}`)
    )
    s.customerCount = devices.size
  }

  return res.json({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      sessionId: o.sessionId,
      tableId: o.tableId,
      customerName: o.customerName,
      deviceId: o.deviceId,
      table: { number: o.table.number },
      items: o.items.map((it) => ({
        id: it.id,
        name: it.productNameSnapshot,
        quantity: it.quantity,
        unitPrice: Number(it.unitPriceSnapshot),
        subtotal: Number(it.subtotal),
        observations: it.observations,
        selections: readSelections(it.selections),
        imagePath: productImageMap.get(it.productId) || null,
      })),
    })),
    tableStats: Array.from(statsMap.entries()).map(([tableId, s]) => ({
      tableId,
      tableNumber: s.tableNumber,
      orderCount: s.orderCount,
      customerCount: s.customerCount,
      subtotal: Number(s.subtotal.toFixed(2)),
    })),
  })
})

adminRouter.patch('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  if (!id) return res.status(400).json({ error: 'ID obrigatório' })

  const { status } = req.body ?? {}
  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'Status obrigatório' })
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { table: true },
  })
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })
  if (order.businessId !== req.admin!.businessId) {
    return res.status(403).json({ error: 'Sem permissão' })
  }

  const allowed = VALID_TRANSITIONS[order.status] ?? []
  if (!allowed.includes(status)) {
    return res
      .status(400)
      .json({ error: `Transição inválida: ${order.status} → ${status}` })
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status },
    include: { items: true, table: true },
  })

  const payload = {
    orderId: updated.id,
    sessionId: updated.sessionId,
    status: updated.status,
    tableNumber: updated.table.number,
  }

  emitToKitchen(order.businessId, 'order_status_changed', payload)
  getIO().to(`session:${updated.sessionId}`).emit('order_status_changed', payload)

  return res.json({ order: { id: updated.id, status: updated.status } })
})

// RESET DE MESAS (SOMENTE PARA TESTE)
adminRouter.post('/admin/reset-tables', requireAdmin, async (req, res) => {
  const { confirm } = req.body ?? {}
  if (confirm !== 'RESETAR') {
    return res.status(400).json({ error: 'Confirmação inválida.' })
  }

  const businessId = req.admin!.businessId

  try {
    const sessions = await prisma.tableSession.findMany({
      where: { businessId },
      select: { id: true },
    })
    const sessionIds = sessions.map((s) => s.id)

    if (sessionIds.length === 0) {
      await prisma.cafeTable.updateMany({
        where: { businessId },
        data: { status: 'AVAILABLE' },
      })
      emitToKitchen(businessId, 'tables_reset', {})
      return res.json({ ok: true, deleted: { sessions: 0 } })
    }

    const tabs = await prisma.tab.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true },
    })
    const tabIds = tabs.map((t) => t.id)

    const orders = await prisma.order.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true },
    })
    const orderIds = orders.map((o) => o.id)

    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
      prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
      prisma.payment.deleteMany({ where: { tabId: { in: tabIds } } }),
      prisma.tab.deleteMany({ where: { id: { in: tabIds } } }),
      prisma.sessionAccess.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.closureRequest.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.menuViewChoice.deleteMany({ where: { sessionId: { in: sessionIds } } }),
      prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } }),
      prisma.cafeTable.updateMany({
        where: { businessId },
        data: { status: 'AVAILABLE' },
      }),
    ])

    emitToKitchen(businessId, 'tables_reset', {})
    for (const sid of sessionIds) {
      getIO().to(`session:${sid}`).emit('session_closed', { reason: 'reset' })
    }

    return res.json({
      ok: true,
      deleted: { sessions: sessionIds.length, tabs: tabIds.length, orders: orderIds.length },
    })
  } catch (err: any) {
    console.error('Erro ao resetar mesas:', err)
    return res.status(500).json({ error: 'Falha ao resetar mesas' })
  }
})