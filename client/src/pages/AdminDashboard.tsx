import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, ClipboardList } from 'lucide-react'
import { useKitchenSocket } from '../lib/useKitchenSocket'
import { fetchKitchenOrders, updateOrderStatus, type KitchenOrder } from '../lib/admin'
import { useAdminAlerts } from '../store/adminAlerts'
import { useAuth } from '../store/auth'
import { AdminOrders } from './AdminOrders'
import { PedidosList } from '../components/PedidosList'
import { ClosureRequestsPanel } from '../components/ClosureRequestsPanel'
import { formatPrice } from '../lib/api'
import { cn } from '../lib/cn'

type DashboardData = {
  stats: {
    todayRevenue: number
    todayOrders: number
    occupiedTables: number
    totalTables: number
    pendingOrders: number
    newOrders: number
    preparingOrders: number
  }
  tables: Array<{ number: string; status: string; occupied: boolean; bill: number }>
  recentOrders: Array<{
    id: string
    tableNumber: string
    customerName: string | null
    totalAmount: number
    status: string
    createdAt: string
  }>
}

const STATUS_LABEL: Record<string, string> = {
  DELIVERED: 'Finalizado',
  PAID: 'Pago',
}

const glassCard = 'rounded-[24px] border border-white/12 bg-white/[0.06] backdrop-blur-xl'

// Funcionário: visão enxuta (3 indicadores no topo + fila de pedidos e mesas). Admin: visão completa.
export function AdminDashboard() {
  const { user } = useAuth()
  return user?.role === 'ADMIN' ? <AdminHome /> : <StaffHome />
}

function StaffHome() {
  const [stats, setStats] = useState<DashboardData['stats'] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
      if (res.ok) setStats((await res.json()).stats)
    } catch { /* mantém o último valor */ }
  }, [])

  const { connected } = useKitchenSocket(
    {
      new_order: load, order_status_changed: load, table_opened: load,
      table_closed: load, payment_approved: load, payment_expired: load, payment_partial: load, tables_reset: load,
    },
    load,
  )

  useEffect(() => {
    load()
    const id = setInterval(load, connected ? 30000 : 10000)
    return () => clearInterval(id)
  }, [load, connected])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pedidos novos" value={stats ? String(stats.newOrders) : '—'} note={stats && stats.newOrders === 0 ? 'Tudo em dia' : 'Para finalizar'} highlight={!!stats && stats.newOrders > 0} />
        <StatCard label="Pedidos ativos" value={stats ? String(stats.newOrders + stats.preparingOrders) : '—'} note="Na fila agora" />
        <StatCard label="Mesas ocupadas" value={stats ? `${stats.occupiedTables}/${stats.totalTables}` : '—'} note={stats ? `${stats.totalTables - stats.occupiedTables} livres` : ''} />
      </div>
      <AdminOrders />
    </div>
  )
}

function AdminHome() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [queue, setQueue] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setRefreshing(true)
    try {
      const [res, kitchen] = await Promise.all([
        fetch('/api/admin/dashboard', { credentials: 'include' }),
        fetchKitchenOrders(),
      ])
      if (!res.ok) throw new Error(res.status === 401 ? 'Sessão expirada. Entre novamente.' : `Erro ${res.status} ao carregar o painel`)
      const json = await res.json()
      if (mine !== seq.current) return
      setData(json)
      setQueue(kitchen.orders)
      useAdminAlerts.getState().setPendingOrders(kitchen.orders.filter((o) => o.status === 'SENT').length)
      setError(null)
    } catch (err: any) {
      if (mine !== seq.current) return
      setError(err?.message || 'Falha ao carregar o painel')
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  const { connected } = useKitchenSocket(
    {
      new_order: () => { load() },
      order_status_changed: () => { load() },
      table_opened: () => { load() },
      table_closed: () => { load() },
      payment_approved: () => { load() },
      tables_reset: () => { load() },
    },
    load,
  )

  useEffect(() => {
    load()
    const interval = setInterval(load, connected ? 30000 : 10000)
    return () => clearInterval(interval)
  }, [load, connected])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // "Finalizado": registra a conclusão; o card muda de cor e sai da lista (animação em PedidosList)
  async function finish(orderId: string) {
    setBusyId(orderId)
    setActionError(null)
    try {
      await updateOrderStatus(orderId, 'DELIVERED')
      await load()
    } catch (err: any) {
      setActionError(err?.message || 'Não foi possível finalizar o pedido')
      load()
      throw err
    } finally {
      setBusyId(null)
    }
  }

  const newCount = queue.filter((o) => o.status === 'SENT').length

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/60 text-sm py-10 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados…
      </div>
    )
  }

  if (!data) {
    return (
      <div role="alert" className="rounded-[22px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-5 py-6 text-sm flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Não foi possível carregar o painel.</div>
        <div className="text-[12.5px] opacity-80">{error}</div>
        <button onClick={load} className="h-11 px-5 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[13px] font-semibold">Tentar novamente</button>
      </div>
    )
  }

  const { stats, tables, recentOrders } = data
  const available = stats.totalTables - stats.occupiedTables
  const history = recentOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'PAID').slice(0, 6)

  return (
    <div className="flex flex-col gap-5">
      {(error || actionError) && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {actionError ?? `Dados podem estar desatualizados: ${error}`}</span>
          <button onClick={() => (actionError ? setActionError(null) : load())} className="font-bold underline underline-offset-2 whitespace-nowrap">{actionError ? 'OK' : 'Tentar agora'}</button>
        </div>
      )}

      {/* INDICADORES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pedidos novos" value={stats.newOrders.toString()} note={stats.newOrders === 0 ? 'Tudo em dia' : 'Para finalizar'} highlight={stats.newOrders > 0} onClick={() => navigate('/admin/pedidos')} />
        <StatCard label="Pedidos ativos" value={(stats.newOrders + stats.preparingOrders).toString()} note="Na fila agora" />
        <StatCard label="Faturamento" value={formatPrice(stats.todayRevenue)} note={`${stats.todayOrders} pedidos hoje`} />
        <StatCard label="Mesas ocupadas" value={`${stats.occupiedTables}/${stats.totalTables}`} note={`${available} ${available === 1 ? 'livre' : 'livres'}`} onClick={() => navigate('/admin/pedidos')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5 items-start">
        {/* FILA AO VIVO */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold tracking-tight text-[#F5F1E8]">Fila ao vivo</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/45 flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-[#8fb06b]' : 'bg-[#ff9b8f]')} />
                {connected ? 'Tempo real' : 'Reconectando…'}
              </span>
              <button onClick={load} disabled={refreshing} className="w-10 h-10 rounded-full border border-white/25 bg-white/[0.06] text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-40" aria-label="Atualizar">
                <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>

          <ClosureRequestsPanel />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1 text-[12px] uppercase tracking-[2px] text-white/60 font-bold">
              <ClipboardList className="w-4 h-4" />Pedidos
              <span className={cn('ml-1 px-2.5 py-0.5 rounded-full text-[11px] tracking-normal', newCount > 0 ? 'bg-[#E8A317] text-[#2a1a0e]' : 'bg-white/12 text-white/80')}>{queue.length}</span>
            </div>
            <PedidosList orders={queue} now={now} busyId={busyId} onFinish={finish} compact showTable />
          </div>
        </section>

        {/* SALÃO + HISTÓRICO */}
        <div className="flex flex-col gap-5">
          <section className={cn(glassCard, 'overflow-hidden')}>
            <div className="px-5 py-4 flex items-center justify-between">
              <h2 className="text-[17px] font-bold tracking-tight text-[#F5F1E8]">Mapa de mesas</h2>
              <button onClick={() => navigate('/admin/pedidos')} className="h-9 px-4 rounded-full border border-white/30 text-white text-[12px] font-medium hover:bg-white/10 transition">Ver todas</button>
            </div>
            <div className="px-4 pb-4 grid grid-cols-3 gap-2">
              {tables.map((t) => (
                <button
                  key={t.number}
                  onClick={() => navigate('/admin/pedidos', { state: { openTable: t.number } })}
                  className={cn(
                    'rounded-[18px] py-3 text-center transition border',
                    t.occupied ? 'bg-[#E8A317]/12 border-[#E8A317]/45 hover:bg-[#E8A317]/20' : 'bg-white/[0.04] border-white/12 hover:bg-white/10',
                  )}
                >
                  <div className="text-[20px] font-bold text-[#F5F1E8] leading-none">{t.number}</div>
                  <div className="text-[9.5px] mt-1.5 uppercase tracking-wider text-white/50">{t.occupied ? 'Ocupada' : 'Livre'}</div>
                  {t.occupied && <div className="text-[11.5px] font-semibold text-[#F5F1E8] mt-1 tabular-nums">{formatPrice(t.bill)}</div>}
                </button>
              ))}
            </div>
          </section>

          <section className={cn(glassCard, 'overflow-hidden')}>
            <div className="px-5 py-4 flex items-center justify-between">
              <h2 className="text-[17px] font-bold tracking-tight text-[#F5F1E8]">Últimos entregues</h2>
              <button onClick={() => navigate('/admin/pedidos')} className="h-9 px-4 rounded-full border border-white/30 text-white text-[12px] font-medium hover:bg-white/10 transition">Pedidos</button>
            </div>
            {history.length === 0 ? (
              <div className="px-5 pb-6 text-[13px] text-white/45">Nenhum pedido entregue ainda.</div>
            ) : (
              <ul className="border-t border-white/10">
                {history.map((o) => (
                  <li key={o.id} className="px-5 py-3 border-b border-white/8 last:border-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#F5F1E8] truncate">Mesa {o.tableNumber} · {o.customerName || 'Cliente'}</div>
                      <div className="text-[11px] text-white/45 mt-0.5">
                        #{o.id.slice(0, 6).toUpperCase()} · {new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {STATUS_LABEL[o.status] || o.status}
                      </div>
                    </div>
                    <div className="text-[13.5px] font-bold text-[#F5F1E8] tabular-nums flex-shrink-0">{formatPrice(o.totalAmount)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, note, highlight, onClick }: {
  label: string; value: string; note: string; highlight?: boolean; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'text-left rounded-[22px] border backdrop-blur-xl p-4 sm:p-5 transition',
        highlight ? 'border-[#E8A317]/60 bg-[#E8A317]/12' : 'border-white/12 bg-white/[0.06]',
        onClick && 'hover:bg-white/10 active:scale-[0.99]',
      )}
    >
      <div className="text-[11.5px] text-white/55 font-medium">{label}</div>
      <div className="text-[26px] sm:text-[30px] leading-none font-bold tracking-tight text-[#F5F1E8] mt-3 mb-1.5 break-words tabular-nums">{value}</div>
      <div className={cn('text-[11.5px]', highlight ? 'text-[#E8A317] font-semibold' : 'text-white/45')}>{note}</div>
    </Tag>
  )
}
