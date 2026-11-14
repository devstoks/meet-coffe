import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Menu, LogOut, ShoppingBag, User, CheckCircle2, X, LayoutDashboard, ClipboardList,
  Coffee, BarChart3, Settings, Receipt, CreditCard, Box, XCircle, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import { useArEnabled } from '../features/ar3d/useArModels' // ar3d
import { useAdminAlerts } from '../store/adminAlerts'
import { adminLogout, fetchKitchenOrders } from '../lib/admin'
import { cn } from '../lib/cn'
import { useKitchenSocket } from '../lib/useKitchenSocket'
import { formatPrice } from '../lib/api'
import { METHOD_LABEL } from '../lib/payment'

type NavItem = { path: string; icon: LucideIcon; label: string }

const AR3D_ITEM: NavItem = { path: '/admin/modelos-3d', icon: Box, label: 'Modelos 3D' } // ar3d

const NAV_SECTIONS: { label: string; adminOnly?: boolean; items: NavItem[] }[] = [
  {
    label: 'OPERAÇÃO',
    items: [
      { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Visão geral' },
      { path: '/admin/pedidos', icon: ClipboardList, label: 'Pedidos' },
    ],
  },
  {
    label: 'GESTÃO',
    adminOnly: true,
    items: [
      { path: '/admin/produtos', icon: Coffee, label: 'Cardápio' },
      { path: '/admin/analytics', icon: BarChart3, label: 'Relatórios' },
      { path: '/admin/configuracoes', icon: Settings, label: 'Configurações' },
    ],
  },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const PAGE_META: Record<string, { eyebrow: string; title: (n: string) => string; subtitle: string }> = {
  '/admin/dashboard': {
    eyebrow: 'PAINEL · MEETCOFFE',
    title: (n) => `${greeting()}, ${n || 'Admin'}`,
    subtitle: 'Acompanhe a operação em tempo real',
  },
  '/admin/pedidos': { eyebrow: 'OPERAÇÃO · PEDIDOS E MESAS', title: () => 'Pedidos', subtitle: 'Fila de pedidos e situação do salão' },
  '/admin/produtos': { eyebrow: 'GESTÃO · CARDÁPIO', title: () => 'Cardápio', subtitle: 'Produtos disponíveis' },
  '/admin/analytics': { eyebrow: 'GESTÃO · RELATÓRIOS', title: () => 'Relatórios', subtitle: 'Métricas e faturamento' },
  '/admin/modelos-3d': { eyebrow: 'GESTÃO · 3D E REALIDADE AUMENTADA', title: () => 'Modelos 3D', subtitle: 'Gere pratos em 3D para o cliente ver na mesa' }, // ar3d
  '/admin/configuracoes': { eyebrow: 'GESTÃO · CONFIGURAÇÕES', title: () => 'Configurações', subtitle: 'Integração e preferências' },
}

type Toast = {
  id: number
  title: string
  message: string
  type: 'order' | 'table' | 'closed' | 'bill' | 'paid' | 'cancelled'
  to: string
  ttl: number
}

const TOAST_ICON = { order: ShoppingBag, table: User, closed: CheckCircle2, bill: Receipt, paid: CreditCard, cancelled: XCircle } as const

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const pending = useAdminAlerts((s) => s.pendingOrders)
  const setPending = useAdminAlerts((s) => s.setPendingOrders)

  const isAdmin = user?.role === 'ADMIN'
  const isStaff = !isAdmin
  const ar3dOn = useArEnabled() // ar3d
  const navSections = NAV_SECTIONS.map((sec) => // ar3d: aba só aparece com a feature ligada
    sec.label === 'GESTÃO' && ar3dOn ? { ...sec, items: [...sec.items.slice(0, 2), AR3D_ITEM, ...sec.items.slice(2)] } : sec)
  const go = (to: string) => navigate(isStaff && to === '/admin/pedidos' ? '/admin/dashboard' : to)
  const metaKey = location.pathname.startsWith('/admin/produtos/') ? '/admin/produtos' : location.pathname
  const meta = PAGE_META[metaKey] || PAGE_META['/admin/dashboard']
  const firstName = user?.name?.split(' ')[0] || 'Admin'
  const initials = user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'MC'

  // Tema escuro só enquanto o painel está aberto (o feed do cliente não é afetado)
  useLayoutEffect(() => {
    document.documentElement.classList.add('admin-dark')
    return () => document.documentElement.classList.remove('admin-dark')
  }, [])

  // Contador de pedidos aguardando recebimento (SENT) — aparece no menu lateral
  const refreshPending = useCallback(async () => {
    try {
      const data = await fetchKitchenOrders()
      setPending(data.orders.filter((o) => o.status === 'SENT').length)
    } catch { /* mantém o último valor */ }
  }, [setPending])

  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) MeetCoffe · Painel` : 'MeetCoffe · Painel'
  }, [pending])

  useEffect(() => {
    const id = setInterval(refreshPending, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') refreshPending() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [refreshPending])

  function dismiss(id: number) { setToasts((t) => t.filter((x) => x.id !== id)) }

  const lastToast = useRef({ key: '', at: 0 })

  function push(t: Omit<Toast, 'id'>) {
    // Ignora o mesmo aviso repetido em sequência (evento duplicado)
    const key = `${t.type}|${t.title}|${t.message}`
    const nowTs = Date.now()
    if (lastToast.current.key === key && nowTs - lastToast.current.at < 3000) return
    lastToast.current = { key, at: nowTs }
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    setTimeout(() => dismiss(id), t.ttl)
  }

  function playBeep(times = 1) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      for (let i = 0; i < times; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = i === 0 ? 880 : 1100
        gain.gain.value = 0.1
        osc.start(ctx.currentTime + i * 0.25)
        osc.stop(ctx.currentTime + i * 0.25 + 0.18)
      }
      setTimeout(() => ctx.close(), times * 250 + 300)
    } catch { /* ignore */ }
  }

  useKitchenSocket(
    {
      new_order: (d) => {
        const items = Array.isArray(d.items) ? d.items.slice(0, 3).map((it: any) => `${it.quantity}× ${it.name}`).join(' · ') : ''
        push({
          title: `Novo pedido · Mesa ${d.tableNumber}`,
          message: `${d.customerName || 'Cliente'}${d.totalAmount ? ` · ${formatPrice(Number(d.totalAmount))}` : ''}${items ? `\n${items}` : ''}`,
          type: 'order', to: '/admin/pedidos', ttl: 12000,
        })
        playBeep(2)
        refreshPending()
      },
      order_status_changed: () => { refreshPending() },
      table_opened: (d) => {
        push({ title: 'Mesa ocupada', message: `A mesa ${d.tableNumber} acabou de ser ocupada.`, type: 'table', to: '/admin/pedidos', ttl: 6000 })
        playBeep()
      },
      closure_requested: (d) => {
        // Payload completo do servidor: scope (INDIVIDUAL | TABLE), cliente, forma de pagamento e valores
        const method = METHOD_LABEL[d.paymentMethod as keyof typeof METHOD_LABEL] ?? ''
        const value = formatPrice(Number(d.due ?? d.amount ?? 0))
        push(d.scope === 'TABLE'
          ? { title: `Mesa ${d.tableNumber} quer encerrar a mesa toda`, message: `${method} · ${value}${d.customerName ? ` · pedido por ${d.customerName}` : ''}`, type: 'bill', to: '/admin/pedidos', ttl: 14000 }
          : { title: `Mesa ${d.tableNumber}: ${d.customerName || 'cliente'} quer encerrar a comanda`, message: `${method} · ${value}`, type: 'bill', to: '/admin/pedidos', ttl: 14000 })
        playBeep(2)
      },
      payment_expired: (d) => {
        push(
          d?.reason === 'split_stopped'
            ? { title: `Mesa ${d.tableNumber ?? ''}: fila de cobranças parada`, message: d.message || 'Não foi possível enviar a próxima cobrança.', type: 'cancelled', to: '/admin/pedidos', ttl: 12000 }
            : d?.reason === 'cancelled'
              ? { title: `Mesa ${d.tableNumber}: pagamento cancelado`, message: 'Cancelado na maquininha. Nada foi cobrado; a mesa voltou a ficar disponível para cobrar.', type: 'cancelled', to: '/admin/pedidos', ttl: 12000 }
              : { title: `Mesa ${d?.tableNumber ?? ''}: cobrança expirou`, message: 'Ninguém pagou a tempo. Nada foi cobrado.', type: 'cancelled', to: '/admin/pedidos', ttl: 10000 },
        )
        playBeep(2)
      },
      payment_partial: (d) => {
        push({ title: `Mesa ${d.tableNumber}: pagamento parcial`, message: `${formatPrice(Number(d.amount))} pago${d.customerName ? ` (${d.customerName})` : ''}. Falta ${formatPrice(Number(d.remaining))}.`, type: 'paid', to: '/admin/pedidos', ttl: 9000 })
        playBeep()
      },
      payment_approved: (d) => {
        push({ title: 'Pagamento aprovado', message: d?.tableNumber ? `Mesa ${d.tableNumber} paga.` : 'Pagamento confirmado.', type: 'paid', to: '/admin/pedidos', ttl: 7000 })
        playBeep()
      },
      table_closed: (d) => {
        push({ title: 'Mesa liberada', message: `A mesa ${d.tableNumber} foi encerrada.`, type: 'closed', to: '/admin/pedidos', ttl: 5000 })
        refreshPending()
      },
      tables_reset: () => { refreshPending() },
    },
    refreshPending,
  )

  if (isStaff && location.pathname === '/admin/pedidos') return <Navigate to="/admin/dashboard" replace />

  async function handleLogout() {
    await adminLogout()
    logout()
    navigate('/admin/login', { replace: true })
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div className="flex min-h-screen text-moss">

      {/* NOTIFICAÇÕES */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[999] flex flex-col gap-2.5 items-end pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = TOAST_ICON[t.type]
            const urgent = t.type === 'order' || t.type === 'bill' || t.type === 'cancelled'
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                className="pointer-events-auto w-full sm:w-[360px] rounded-[22px] bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-[#F5F1E8] shadow-[0_12px_40px_rgba(0,0,0,0.45)] overflow-hidden"
              >
                <div className="flex items-start gap-3 p-3.5">
                  <button
                    onClick={() => { go(t.to); dismiss(t.id) }}
                    className="flex-1 min-w-0 flex items-start gap-3 text-left"
                  >
                    <span className={cn('w-10 h-10 rounded-full grid place-items-center flex-shrink-0', urgent ? 'bg-[#E8A317] text-[#2a1a0e]' : 'bg-white/10 text-[#F5F1E8]')}>
                      <Icon className="w-5 h-5" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold leading-tight">{t.title}</span>
                      <span className="block mt-0.5 text-[12px] text-white/70 whitespace-pre-line break-words">{t.message}</span>
                      <span className="block mt-1.5 text-[11px] font-semibold text-[#E8A317]">
                        {t.type === 'order' ? 'Ver pedidos →' : 'Ver mesas →'}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="w-8 h-8 -mr-1 -mt-1 rounded-full grid place-items-center text-white/50 hover:text-white hover:bg-white/10 transition flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <motion.div
                  initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: t.ttl / 1000, ease: 'linear' }}
                  style={{ transformOrigin: 'left' }}
                  className={cn('h-[2px]', urgent ? 'bg-[#E8A317]' : 'bg-white/40')}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* MENU LATERAL (admin) */}
      {isAdmin && <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-[#120b06]/80 backdrop-blur-2xl border-r border-white/10 text-white flex flex-col transition-transform duration-200 lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-6 pt-6 pb-4">
          <div className="text-[22px] leading-none font-medium tracking-tight text-[#F5F1E8]">MeetCoffe</div>
          <div className="text-[9px] uppercase tracking-[2px] text-white/40 mt-2">Cafés especiais & gastronomia</div>
        </div>

        <div className="mx-4 px-3.5 py-3 rounded-2xl bg-white/[0.06] border border-white/10 text-[11px] leading-relaxed">
          <div className="font-semibold text-[13px] text-white">Meetcoffe · Unidade Centro</div>
          <div className="text-white/60 mt-0.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#8fb06b]" /> Operação aberta</div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {navSections.map((section) => {
            if (section.adminOnly && !isAdmin) return null
            return (
              <div key={section.label}>
                <div className="text-[10px] text-white/35 tracking-[2px] px-6 mt-5 mb-2">{section.label}</div>
                <nav className="px-3 flex flex-col gap-1">
                  {section.items.map((item) => {
                    const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                    const Icon = item.icon
                    const badge = item.path === '/admin/pedidos' ? pending : 0
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3.5 h-11 rounded-full text-[13.5px] transition',
                          active ? 'bg-[#F5F1E8] text-[#1f1a14] font-semibold' : 'text-white/75 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.6} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span
                            aria-label={`${badge} pedidos aguardando`}
                            className={cn(
                              'min-w-[22px] h-[22px] px-1.5 rounded-full text-[11.5px] font-bold grid place-items-center tabular-nums',
                              active ? 'bg-[#1f1a14] text-[#F5F1E8]' : 'bg-[#E8A317] text-[#2a1a0e] animate-pulse',
                            )}
                          >{badge > 99 ? '99+' : badge}</span>
                        )}
                      </Link>
                    )
                  })}
                </nav>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#F5F1E8] text-[#1f1a14] grid place-items-center font-bold text-sm flex-shrink-0">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{user?.name || 'Usuário'}</div>
            <div className="text-[10.5px] text-white/45">{isAdmin ? 'Administrador' : 'Funcionário'}</div>
          </div>
          <button onClick={handleLogout} className="w-9 h-9 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition" title="Sair" aria-label="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>}

      {isAdmin && mobileNavOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={() => setMobileNavOpen(false)} />}

      <main className={cn('flex-1 min-w-0 max-w-full', isAdmin ? 'lg:ml-64' : '')}>
        <header className="px-5 lg:px-8 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className={cn(isStaff && 'hidden', 'lg:hidden relative w-11 h-11 rounded-full border border-white/25 bg-white/[0.06] text-white grid place-items-center flex-shrink-0')}
              aria-label="Abrir menu"
            >
              <Menu className="w-[18px] h-[18px]" />
              {pending > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#E8A317] text-[#2a1a0e] text-[11px] font-bold grid place-items-center">{pending}</span>}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/45 tracking-[2px] font-bold">{meta.eyebrow}</div>
              <h1 className="text-[26px] lg:text-[30px] font-bold tracking-tight text-[#F5F1E8] mt-1 leading-tight">{meta.title(firstName)}</h1>
              <div className="text-[12px] text-white/50 mt-1 first-letter:uppercase">{today} · {meta.subtitle}</div>
            </div>
            {isStaff && (
              <button
                onClick={handleLogout}
                aria-label="Sair da conta"
                className="ml-auto h-11 px-4 rounded-full border border-white/35 text-white text-[13px] font-medium inline-flex items-center gap-2 flex-shrink-0 hover:bg-white/10 active:scale-[0.98] transition"
              >
                <LogOut className="w-4 h-4" /> Sair
              </button>
            )}
            {isAdmin && pending > 0 && location.pathname !== '/admin/pedidos' && (
              <Link to="/admin/pedidos" className="hidden sm:flex items-center gap-2 h-10 px-4 rounded-full bg-[#E8A317] text-[#2a1a0e] text-[13px] font-semibold flex-shrink-0 active:scale-95 transition">
                <ClipboardList className="w-4 h-4" strokeWidth={1.8} />
                {pending} {pending === 1 ? 'pedido aguardando' : 'pedidos aguardando'}
              </Link>
            )}
          </div>
        </header>

        <div className="px-5 lg:px-8 pb-10">
          <Outlet />
        </div>
      </main>

    </div>
  )
}
