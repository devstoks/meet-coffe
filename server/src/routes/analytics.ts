import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const analyticsRouter = Router()

// ==========================================
// GET /admin/dashboard — resumo para a tela inicial
// ==========================================
analyticsRouter.get('/admin/dashboard', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayPaidOrders = await prisma.order.findMany({
    where: { businessId, status: 'PAID', createdAt: { gte: today } },
    select: { totalAmount: true },
  })
  const todayRevenue = todayPaidOrders.reduce((s, o) => s + Number(o.totalAmount), 0)

  // Pedidos do dia (qualquer estado, exceto cancelados) — antes só contava PAID
  const todayOrdersCount = await prisma.order.count({
    where: { businessId, status: { not: 'CANCELLED' }, createdAt: { gte: today } },
  })

  // SENT = aguardando ação da equipe; PREPARING = em andamento
  const [newOrders, preparingOrders] = await Promise.all([
    prisma.order.count({ where: { businessId, status: 'SENT' } }),
    prisma.order.count({ where: { businessId, status: { in: ['PREPARING', 'READY'] } } }),
  ])
  const pendingOrders = newOrders + preparingOrders

  const tables = await prisma.cafeTable.findMany({
    where: { businessId },
    include: {
      sessions: {
        where: { status: { in: ['OPEN', 'CLOSURE_REQUESTED', 'PAYMENT_PENDING'] } },
        include: { tabs: true },
        take: 1,
      },
    },
    orderBy: { number: 'asc' },
  })

  const tablesData = tables.map((t) => {
    const session = t.sessions[0]
    const tab = session?.tabs[0]
    return {
      number: t.number,
      status: t.status,
      occupied: !!session,
      bill: tab ? Number(tab.totalAmount) : 0,
    }
  })

  const occupiedTables = tablesData.filter((t) => t.occupied).length

  const recentOrders = await prisma.order.findMany({
    where: { businessId, status: { in: ['SENT', 'PREPARING', 'READY', 'DELIVERED', 'PAID'] } },
    include: { table: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  return res.json({
    stats: {
      todayRevenue: Number(todayRevenue.toFixed(2)),
      todayOrders: todayOrdersCount,
      occupiedTables,
      totalTables: tables.length,
      pendingOrders,
      newOrders,
      preparingOrders,
    },
    tables: tablesData,
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      tableNumber: o.table.number,
      customerName: o.customerName,
      totalAmount: Number(o.totalAmount),
      status: o.status,
      createdAt: o.createdAt,
    })),
  })
})

// ==========================================
// GET /admin/analytics/revenue
// ==========================================
analyticsRouter.get('/admin/analytics/revenue', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const period = String(req.query.period || 'day')

  const orders = await prisma.order.findMany({
    where: { businessId, status: 'PAID' },
    select: { totalAmount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const buckets = new Map<string, number>()
  for (const o of orders) {
    const d = new Date(o.createdAt)
    let key: string
    if (period === 'day') key = d.toISOString().slice(0, 10)
    else if (period === 'month') key = d.toISOString().slice(0, 7)
    else key = d.toISOString().slice(0, 4)
    buckets.set(key, (buckets.get(key) ?? 0) + Number(o.totalAmount))
  }

  const data = Array.from(buckets.entries())
    .map(([label, total]) => ({ label, total: Number(total.toFixed(2)) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const grandTotal = data.reduce((sum, d) => sum + d.total, 0)

  return res.json({
    period,
    data,
    grandTotal: Number(grandTotal.toFixed(2)),
    count: orders.length,
  })
})

// ==========================================
// GET /admin/analytics/products
// ==========================================
analyticsRouter.get('/admin/analytics/products', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const items = await prisma.orderItem.findMany({
    where: { order: { businessId, status: 'PAID' } },
    select: { productId: true, productNameSnapshot: true, quantity: true, subtotal: true },
  })

  const map = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of items) {
    if (!map.has(it.productId)) {
      map.set(it.productId, { name: it.productNameSnapshot, qty: 0, revenue: 0 })
    }
    const e = map.get(it.productId)!
    e.qty += it.quantity
    e.revenue += Number(it.subtotal)
  }

  const list = Array.from(map.entries())
    .map(([productId, d]) => ({
      productId,
      name: d.name,
      quantity: d.qty,
      revenue: Number(d.revenue.toFixed(2)),
    }))
    .sort((a, b) => b.quantity - a.quantity)

  return res.json({
    top: list.slice(0, 10),
    bottom: list.slice(-10).reverse(),
    all: list,
  })
})

// ==========================================
// GET /admin/analytics/hours
// ==========================================
analyticsRouter.get('/admin/analytics/hours', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const orders = await prisma.order.findMany({
    where: { businessId, status: { notIn: ['CANCELLED'] } },
    select: { createdAt: true, totalAmount: true },
  })

  const buckets = new Map<number, { count: number; revenue: number }>()
  for (let h = 0; h < 24; h++) buckets.set(h, { count: 0, revenue: 0 })
  for (const o of orders) {
    const hour = new Date(o.createdAt).getHours()
    const e = buckets.get(hour)!
    e.count += 1
    e.revenue += Number(o.totalAmount)
  }

  const data = Array.from(buckets.entries()).map(([hour, v]) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}h`,
    count: v.count,
    revenue: Number(v.revenue.toFixed(2)),
  }))

  return res.json({ data })
})

// ==========================================
// GET /admin/analytics/ratings
// ==========================================
analyticsRouter.get('/admin/analytics/ratings', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const sessions = await prisma.tableSession.findMany({
    where: { businessId, rating: { not: null } },
    select: { rating: true, ratingComment: true, ratedAt: true, table: { select: { number: true } } },
    orderBy: { ratedAt: 'desc' },
  })

  const ratings = sessions.map((s) => s.rating!).filter((r) => r > 0)
  const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  const distribution = [1, 2, 3, 4, 5].map((stars) => ({
    stars,
    count: ratings.filter((r) => r === stars).length,
  }))

  return res.json({
    avgRating: Number(avg.toFixed(2)),
    totalRatings: ratings.length,
    distribution,
    recent: sessions.slice(0, 20).map((s) => ({
      rating: s.rating,
      comment: s.ratingComment,
      ratedAt: s.ratedAt,
      tableNumber: s.table.number,
    })),
  })
})