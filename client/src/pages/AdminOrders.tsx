import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, AlertTriangle, WifiOff, Wifi } from 'lucide-react'
import { PedidosList } from '../components/PedidosList'
import { ClosureRequestsPanel } from '../components/ClosureRequestsPanel'
import { TablesPanel } from '../components/TablesPanel'
import { useAdminAlerts } from '../store/adminAlerts'
import {
  fetchAdminMe, fetchKitchenOrders, updateOrderStatus,
  type KitchenOrder,
} from '../lib/admin'
import { useKitchenSocket } from '../lib/useKitchenSocket'
import { useAuth } from '../store/auth'
import { cn } from '../lib/cn'

// Fallback de segurança: mesmo com o socket ok, reconsulta de tempos em tempos.
const POLL_CONNECTED_MS = 30_000
const POLL_DISCONNECTED_MS = 8_000

export function AdminOrders() {
  const { setUser } = useAuth()
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const requestSeq = useRef(0)

  // Sempre substitui a lista pelo snapshot do servidor (sem merge) => nunca duplica pedidos.
  // O contador descarta respostas antigas que chegam depois de uma mais nova.
  const refreshOrders = useCallback(async () => {
    const seq = ++requestSeq.current
    setRefreshing(true)
    try {
      const data = await fetchKitchenOrders()
      if (seq !== requestSeq.current) return
      setOrders(data.orders)
      useAdminAlerts.getState().setPendingOrders(data.orders.filter((o) => o.status === 'SENT').length)
      setLoadError(null)
      setLastUpdated(new Date())
    } catch (err: any) {
      if (seq !== requestSeq.current) return
      setLoadError(err?.message || 'Falha ao carregar pedidos')
    } finally {
      if (seq === requestSeq.current) {
        setRefreshing(false)
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchAdminMe().then((data) => setUser(data.user)).catch(() => {})
    refreshOrders()
  }, [setUser, refreshOrders])

  const { connected } = useKitchenSocket(
    {
      new_order: () => { refreshOrders() },
      order_status_changed: () => { refreshOrders() },
      table_closed: () => { refreshOrders() },
      payment_approved: () => { refreshOrders() },
      payment_expired: () => { refreshOrders() },
      payment_partial: () => { refreshOrders() },
      tables_reset: () => { refreshOrders() },
    },
    refreshOrders, // ressincroniza a cada (re)entrada na sala
  )

  // Fallback por polling + reconsulta ao voltar para a aba
  useEffect(() => {
    const id = setInterval(refreshOrders, connected ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refreshOrders() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [connected, refreshOrders])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // "Finalizado": registra a conclusão, o cliente passa a ver "Finalizado" e o card sai da lista (animação em PedidosList)
  async function finish(orderId: string) {
    setBusyId(orderId)
    setActionError(null)
    try {
      await updateOrderStatus(orderId, 'DELIVERED')
      await refreshOrders()
    } catch (err: any) {
      setActionError(err?.message || 'Não foi possível finalizar o pedido')
      refreshOrders()
      throw err
    } finally {
      setBusyId(null)
    }
  }

  const newCount = orders.filter((o) => o.status === 'SENT').length

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-coffee text-sm py-10 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando pedidos…
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
    {/* MESAS: faixa horizontal no celular, barra lateral direita no desktop */}
    <aside className="order-first lg:order-last lg:w-[290px] lg:flex-shrink-0 min-w-0">
      <TablesPanel />
    </aside>

    <div className="flex-1 min-w-0 flex flex-col gap-4">
      {/* BARRA DE STATUS */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-white/80 font-medium">
            {orders.length} {orders.length === 1 ? 'pedido ativo' : 'pedidos ativos'}
            {newCount > 0 && (
              <span className="ml-2 text-[#E8A317] font-bold">· {newCount} {newCount === 1 ? 'novo' : 'novos'}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] mt-0.5 text-white/45">
            {connected ? <Wifi className="w-3 h-3 text-[#8fb06b]" /> : <WifiOff className="w-3 h-3 text-[#ff9b8f]" />}
            {connected ? 'Tempo real ativo' : 'Sem tempo real — atualizando automaticamente'}
            {lastUpdated && ` · ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </div>
        </div>
        <button
          onClick={refreshOrders}
          disabled={refreshing}
          className="w-11 h-11 rounded-full border border-white/25 bg-white/[0.06] text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-40 flex-shrink-0"
          aria-label="Atualizar pedidos"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* ERROS */}
      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Não foi possível carregar os pedidos.</div>
            <div className="opacity-80">{loadError}. Os dados abaixo podem estar desatualizados; tentando de novo automaticamente.</div>
          </div>
          <button onClick={refreshOrders} className="font-bold underline underline-offset-2 whitespace-nowrap">Tentar agora</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold">OK</button>
        </div>
      )}

      {/* ENCERRAMENTOS pedidos pelos clientes (individual ou mesa toda) */}
      <ClosureRequestsPanel />

      {/* PEDIDOS: lista única, do mais antigo para o mais novo */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[12px] uppercase tracking-[2px] text-white/60 font-bold">Pedidos</h2>
          <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full', newCount > 0 ? 'bg-[#E8A317] text-[#2a1a0e]' : 'bg-white/12 text-white/80')}>{orders.length}</span>
        </div>
        <PedidosList orders={orders} now={now} busyId={busyId} onFinish={finish} />
      </section>
    </div>
    </div>
  )
}
