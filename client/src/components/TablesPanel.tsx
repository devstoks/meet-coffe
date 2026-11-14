import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { RefreshCw, X, User, Users, Divide, AlertCircle, CreditCard, Lock, type LucideIcon } from 'lucide-react'
import { formatPrice, type Selection } from '../lib/api'
import { closePersonCash } from '../lib/admin'
import { describeSaved } from '../lib/optionsView'
import { METHOD_LABEL, SCOPE_LABEL } from '../lib/payment'
import { cn } from '../lib/cn'

const TOTAL_SLOTS = 16

type OrderItem = {
  id: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
  observations: string | null
  selections?: Selection[]
  imagePath: string | null
}

type Order = {
  id: string
  status: string
  items: OrderItem[]
}

type Customer = {
  deviceId?: string | null
  customerName: string
  subtotal: number
  totalWithFee: number
  paid?: number
  due?: number
  orders: Order[]
}

type TableData = {
  id: string
  number: string
  occupied: boolean
  sessionId: string | null
  status?: string
  chargeSent?: boolean
  closureRequests?: { id: string; scope: 'INDIVIDUAL' | 'TABLE'; deviceId: string | null; paymentMethod: 'DEBIT' | 'CREDIT' | 'PIX' | 'CASH'; amount: number; customerName: string | null }[]
  paid?: number
  splitActive?: boolean
  splitQueue?: { deviceId: string | null; customerName: string; totalWithFee: number; paid: number; due: number; state: 'paid' | 'paying' | 'waiting' }[]
  customers: Customer[]
  subtotal: number
  serviceFee: number
  totalWithFee: number
}

type StatusInfo = { title: string; hint: string; tone: 'idle' | 'ask' | 'wait' }
/** Situação da mesa em linguagem simples (cabeçalho do modal). */
function statusOf(t: TableData): StatusInfo {
  if (t.chargeSent) return { title: 'Aguardando o cliente pagar na maquininha', hint: 'A cobrança já foi enviada.', tone: 'wait' }
  if (t.splitActive) return { title: 'Cobrando pessoa por pessoa', hint: 'Cada um paga a sua parte na maquininha.', tone: 'wait' }
  if (t.status === 'CLOSURE_REQUESTED') return { title: 'O cliente pediu a conta', hint: 'Escolha em “Como cobrar?” e envie para a maquininha.', tone: 'ask' }
  if (t.status === 'OPEN') return { title: 'Mesa aberta · cliente ainda pedindo', hint: 'Quando ele pedir a conta, o aviso aparece aqui.', tone: 'idle' }
  return { title: 'Pagamento em andamento', hint: '', tone: 'wait' }
}

const STATUS_LABEL: Record<string, string> = {
  SENT: 'Aguardando',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
}

const FALLBACK = 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=200&q=80'

/** Barra lateral de mesas (com modal de comanda, cobrança e encerramento). Usada na página de Pedidos. */
export function TablesPanel() {
  const location = useLocation()
  const openedFromState = useRef(false)
  const [tables, setTables] = useState<TableData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertTableNumber, setAlertTableNumber] = useState('')

  // Estados de ação
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [personConfirm, setPersonConfirm] = useState<string | null>(null)
  const [chargeNotice, setChargeNotice] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadPayments()
    const interval = setInterval(loadPayments, 8000)
    return () => clearInterval(interval)
  }, [])

  async function loadPayments() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/payments', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setTables(data.tables)
        
        // Atualiza o modal se a mesa selecionada mudou de estado (updater funcional: sem estado "velho")
        setSelectedTable((prev) => {
          if (!prev) return prev
          const updated = data.tables.find((t: TableData) => t.id === prev.id)
          return updated && updated.occupied ? updated : null
        })
      }
    } catch { /* silent */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Vindo da Visão geral: abre direto a mesa clicada
  useEffect(() => {
    const want = (location.state as any)?.openTable as string | undefined
    if (!want || openedFromState.current || tables.length === 0) return
    openedFromState.current = true
    const t = tables.find((x) => x.number === want && x.occupied)
    if (t) setSelectedTable(t)
  }, [tables, location.state])

  function handleTableClick(table: TableData) {
    if (!table.occupied) {
      setAlertTableNumber(table.number)
      setAlertOpen(true)
      setTimeout(() => setAlertOpen(false), 2500)
    } else {
      setSelectedTable(table)
    }
  }

  async function handleSendToTerminal(opts?: { amount?: number; deviceId?: string | null; customerName?: string }) {
    if (!selectedTable || processing) return
    setProcessing(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/tables/${selectedTable.id}/request-payment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar cobrança')

      setToast(opts?.amount ? `Cobrança de ${formatPrice(opts.amount)} enviada para a maquininha!` : `Cobrança enviada para a maquininha!`)
      setTimeout(() => setToast(null), 3000)
      await loadPayments()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleChargeAction(action: 'refresh' | 'cancel') {
    if (!selectedTable || processing) return
    setProcessing(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/tables/${selectedTable.id}/charge/${action}`, { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar a cobrança')
      setChargeNotice({ tone: data.result === 'CANCELLED' || data.result === 'EXPIRED' ? 'bad' : data.result === 'APPROVED' ? 'ok' : 'info', text: data.message })
      await loadPayments()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleSplit(action: 'start' | 'stop') {
    if (!selectedTable || processing) return
    setProcessing(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/tables/${selectedTable.id}/split/${action}`, { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha na divisão da conta')
      setToast(action === 'start' ? 'Divisão iniciada: primeira cobrança enviada para a maquininha.' : 'Fila de cobranças parada.')
      setTimeout(() => setToast(null), 3500)
      await loadPayments()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Dinheiro: a equipe recebeu desta pessoa e encerra só a comanda dela (a mesa fecha se era a última)
  async function handleClosePerson(deviceId: string) {
    if (!selectedTable || processing) return
    const table = selectedTable
    setProcessing(true)
    setActionError(null)
    try {
      const r = await closePersonCash(table.id, deviceId)
      setPersonConfirm(null)
      setToast(r.tableClosed ? `Mesa ${table.number} encerrada e liberada` : 'Comanda encerrada. A mesa continua aberta para os outros.')
      setTimeout(() => setToast(null), 3000)
      await loadPayments()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleForceClose() {
    if (!selectedTable || processing) return
    const closing = selectedTable
    setProcessing(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/tables/${closing.id}/close`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Falha ao encerrar comanda')
      }

      // Libera a mesa na tela imediatamente (sem esperar o próximo polling) e depois confirma com o servidor
      setTables((prev) => prev.map((t) => t.id === closing.id
        ? { ...t, occupied: false, sessionId: null, status: undefined, customers: [], subtotal: 0, serviceFee: 0, totalWithFee: 0 }
        : t))
      setConfirmCloseOpen(false)
      setSelectedTable(null)
      setToast(`Mesa ${closing.number} encerrada e liberada`)
      setTimeout(() => setToast(null), 3000)
      await loadPayments()
    } catch (err: any) {
      setConfirmCloseOpen(false)
      setActionError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <div className="text-white/60 text-sm">Carregando mesas…</div>

  const occupiedCount = tables.filter((t) => t.occupied).length

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">

      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-[#F5F1E8]">Mesas</h2>
          <div className="text-[11.5px] text-white/50">{occupiedCount} de {Math.max(TOTAL_SLOTS, tables.length)} ocupadas</div>
        </div>
        <button
          onClick={loadPayments}
          disabled={refreshing}
          className="w-10 h-10 rounded-full border border-white/25 bg-white/[0.06] text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-40 flex-shrink-0"
          aria-label="Atualizar mesas"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex lg:grid lg:grid-cols-2 gap-2.5 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-190px)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tables.map((table) => {
          const awaiting = table.status === 'CLOSURE_REQUESTED' || table.status === 'PAYMENT_PENDING'
          const newOrders = table.customers.reduce((n, c) => n + c.orders.filter((o) => o.status === 'SENT').length, 0)
          return (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={cn(
                'relative flex-shrink-0 min-w-[108px] lg:min-w-0 rounded-[20px] py-3.5 px-3 flex flex-col items-center justify-center transition border backdrop-blur-xl active:scale-[0.98]',
                table.occupied
                  ? awaiting
                    ? 'bg-[#E8A317]/15 border-[#E8A317]/60 hover:bg-[#E8A317]/22'
                    : 'bg-white/[0.08] border-white/25 hover:bg-white/[0.13]'
                  : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]',
              )}
            >
              {newOrders > 0 && (
                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-[#E8A317] text-[#2a1a0e] text-[11px] font-bold grid place-items-center" aria-label={`${newOrders} pedidos novos`}>{newOrders}</span>
              )}
              <span className="text-[26px] leading-none font-bold tracking-tight text-[#F5F1E8]">{table.number}</span>
              <span className={cn('text-[9.5px] font-bold uppercase tracking-widest mt-1.5 text-center', awaiting ? 'text-[#E8A317]' : 'text-white/50')}>
                {table.occupied ? (awaiting ? 'Pagando' : 'Ocupada') : 'Livre'}
              </span>
              {table.occupied && (
                <span className="text-[13px] font-bold text-[#F5F1E8] mt-1.5 tabular-nums">{formatPrice(table.totalWithFee)}</span>
              )}
            </button>
          )
        })}
        {/* vagas ainda não cadastradas, para sempre mostrar 16 slots */}
        {Array.from({ length: Math.max(0, TOTAL_SLOTS - tables.length) }, (_, i) => {
          const used = new Set(tables.map((t) => parseInt(t.number, 10)))
          const free: number[] = []
          for (let n = 1; free.length < TOTAL_SLOTS - tables.length && n <= TOTAL_SLOTS; n++) if (!used.has(n)) free.push(n)
          const n = free[i]
          if (n === undefined) return null
          return (
            <div key={`slot-${n}`} aria-label={`Vaga da mesa ${String(n).padStart(2, '0')} não cadastrada`} className="flex-shrink-0 min-w-[108px] lg:min-w-0 rounded-[20px] py-3.5 px-3 flex flex-col items-center justify-center border border-dashed border-white/10 bg-white/[0.015]">
              <span className="text-[26px] leading-none font-bold tracking-tight text-white/20">{String(n).padStart(2, '0')}</span>
              <span className="text-[9.5px] font-bold uppercase tracking-widest mt-1.5 text-white/25">Vaga</span>
            </div>
          )
        })}
      </div>

      {/* MODAL CENTRAL: DETALHES DA MESA */}
      <Dialog.Root open={!!selectedTable} onOpenChange={(o) => { if (!o) { setSelectedTable(null); setActionError(null); setChargeNotice(null) } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-2 sm:inset-3 z-[101] flex flex-col rounded-[28px] bg-[#1d130b]/95 backdrop-blur-2xl border border-white/15 text-[#F5F1E8] outline-none overflow-hidden"
          >
            {selectedTable && (() => {
              const st = statusOf(selectedTable)
              const remaining = remainingOf(selectedTable)
              const paid = selectedTable.paid ?? 0
              return (
              <>
                {/* CABEÇALHO: qual mesa, em que situação está e quanto é a conta */}
                <div className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/10">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Dialog.Title className="text-[30px] leading-none font-bold tracking-tight">Mesa {selectedTable.number}</Dialog.Title>
                      <span className={cn('rounded-full px-3.5 py-1.5 text-[14px] font-semibold', st.tone === 'ask' ? 'bg-[#E8A317] text-[#2a1a0e]' : st.tone === 'wait' ? 'bg-[#E8A317]/20 border border-[#E8A317]/60 text-[#F2C45A]' : 'bg-white/10 border border-white/20 text-white/85')}>{st.title}</span>
                    </div>
                    <p className="text-[15px] text-white/75 mt-2 max-w-3xl">
                      {selectedTable.customers.length} {selectedTable.customers.length === 1 ? 'pessoa' : 'pessoas'} na mesa. {st.hint}
                    </p>
                  </div>
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-[12.5px] uppercase tracking-[2px] text-white/65 font-bold">{paid > 0 ? 'Falta pagar' : 'Total da conta'}</div>
                      <div className="text-[30px] leading-none font-bold tracking-tight tabular-nums mt-1">{formatPrice(paid > 0 ? remaining : selectedTable.totalWithFee)}</div>
                    </div>
                    <Dialog.Close asChild>
                      <button aria-label="Fechar" className="w-11 h-11 rounded-full border border-white/25 text-white grid place-items-center hover:bg-white/10 transition">
                        <X className="w-5 h-5" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                {/* CORPO: 3 colunas em tela grande — 1) pedidos  2) valores  3) como cobrar */}
                <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.85fr_1fr] xl:grid-rows-[minmax(0,1fr)] [scrollbar-width:thin]">
                  {/* 1. O QUE CADA PESSOA PEDIU */}
                  <div className="lg:overflow-y-auto p-5 sm:p-6 flex flex-col gap-4 [scrollbar-width:thin]">
                    <SectionTitle n={1} hint="Os pedidos, separados por pessoa.">O que cada pessoa pediu</SectionTitle>
                    {selectedTable.customers.map((customer, idx) => (
                      <div key={idx} className="rounded-[22px] border border-white/12 bg-white/[0.05] overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-full border border-white/30 grid place-items-center flex-shrink-0"><User className="w-4 h-4" strokeWidth={1.5} /></span>
                            <span className="text-[16px] font-semibold truncate">{customer.customerName}</span>
                          </div>
                          <span className="text-[16px] font-bold tabular-nums">{formatPrice(customer.totalWithFee)}</span>
                        </div>
                        {(() => {
                          const req = selectedTable.closureRequests?.find((r) => r.scope === 'TABLE' || (r.deviceId && r.deviceId === customer.deviceId))
                          if (!req) return null
                          return (
                            <div className="px-4 py-2 border-b border-white/10 bg-[#E8A317]/10 text-[12.5px] text-[#F2C45A] font-semibold">
                              Encerramento pedido · {SCOPE_LABEL[req.scope]} · {METHOD_LABEL[req.paymentMethod]} · aguardando pagamento
                            </div>
                          )
                        })()}

                        <div className="p-4 flex flex-col gap-4">
                          {customer.orders.map((order) => (
                            <div key={order.id} className="flex flex-col gap-2.5">
                              <div className="flex justify-between items-center">
                                <span className="text-[12.5px] uppercase tracking-widest text-white/65 font-bold">Pedido #{order.id.slice(-4).toUpperCase()}</span>
                                <span className="text-[12.5px] bg-white/12 text-white/80 px-2.5 py-0.5 rounded-full font-bold">{STATUS_LABEL[order.status] || order.status}</span>
                              </div>
                              {order.items.map((item) => (
                                <div key={item.id} className="flex gap-3 items-center">
                                  <img src={item.imagePath || FALLBACK} alt={item.name} className="w-12 h-12 rounded-xl object-cover bg-black/30 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[15px] font-medium leading-tight">{item.name}</div>
                                    <div className="text-[13.5px] text-white/72 mt-0.5">{item.quantity}× {formatPrice(item.unitPrice)}</div>
                                    {describeSaved(item.selections).map((o) => <div key={o} className="text-[13px] text-white/82 mt-0.5 break-words">{o}</div>)}
                                    {item.observations && <div className="text-[13px] text-[#ffb3a8] italic mt-0.5">obs: {item.observations}</div>}
                                  </div>
                                  <div className="text-[15px] font-semibold tabular-nums">{formatPrice(item.subtotal)}</div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        <div className="px-4 py-2.5 border-t border-white/10 text-[13px] text-white/72 flex justify-between">
                          <span>Consumo {formatPrice(customer.subtotal)}</span>
                          <span>Taxa {formatPrice(customer.totalWithFee - customer.subtotal)}</span>
                        </div>
                        {customer.deviceId && (customer.due ?? customer.totalWithFee) > 0.009 && (
                          <div className="px-4 py-3 border-t border-white/10">
                            {personConfirm === customer.deviceId ? (
                              <div className="flex gap-2">
                                <button onClick={() => handleClosePerson(customer.deviceId!)} disabled={processing} className={cn(btnSecondary, 'flex-1')}>Confirmar: recebi {formatPrice(customer.due ?? customer.totalWithFee)}</button>
                                <button onClick={() => setPersonConfirm(null)} className={cn(btnSecondary, 'px-4')}>Voltar</button>
                              </div>
                            ) : (
                              <button onClick={() => setPersonConfirm(customer.deviceId!)} disabled={processing} className={cn(btnSecondary, 'w-full')}>
                                Recebi em dinheiro · encerrar a comanda de {customer.customerName}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="lg:border-l border-t lg:border-t-0 border-white/10 bg-black/15 flex flex-col xl:contents">
                    {/* 2. VALORES */}
                    <div className="xl:overflow-y-auto xl:border-l border-white/10 bg-black/15 p-5 sm:p-6 flex flex-col gap-4 [scrollbar-width:thin] lg:overflow-visible">
                      <SectionTitle n={2} hint="Quanto cada pessoa deve e o total da mesa.">Valor da conta</SectionTitle>
                      <div className={cn(card, 'px-4 py-4')}>
                        <ul className="flex flex-col gap-2.5 pb-4 mb-4 border-b border-white/10">
                          {selectedTable.customers.map((c, i) => {
                            const paidAll = (c.paid ?? 0) > 0 && (c.due ?? 0) <= 0.009
                            return (
                              <li key={i} className="flex justify-between gap-3 text-[16px]">
                                <span className="truncate text-white/90">{c.customerName}</span>
                                <span className="font-semibold tabular-nums">{paidAll ? <span className="text-[#9be3a8]">já pagou ✓</span> : formatPrice((c.paid ?? 0) > 0 ? (c.due ?? c.totalWithFee) : c.totalWithFee)}</span>
                              </li>
                            )
                          })}
                        </ul>
                        <div className="flex justify-between text-[15px] text-white/82"><span>Consumo (soma dos pedidos)</span><span className="tabular-nums">{formatPrice(selectedTable.subtotal)}</span></div>
                        <div className="flex justify-between text-[15px] text-white/82 mt-2"><span>Taxa de serviço (10%)</span><span className="tabular-nums">+ {formatPrice(selectedTable.serviceFee)}</span></div>
                        <div className="mt-4 pt-4 border-t border-white/15 flex items-baseline justify-between">
                          <span className="text-[17px] font-semibold">Total da mesa</span>
                          <span className="text-[30px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(selectedTable.totalWithFee)}</span>
                        </div>
                        {paid > 0 && (
                          <>
                            <div className="flex justify-between text-[15px] text-[#9be3a8] mt-3"><span>Já foi pago</span><span className="tabular-nums">− {formatPrice(paid)}</span></div>
                            <div className="flex justify-between text-[18px] font-bold mt-2"><span>Falta pagar</span><span className="tabular-nums">{formatPrice(remaining)}</span></div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 3. COMO COBRAR */}
                    <div className="xl:overflow-y-auto xl:border-l border-white/10 p-5 sm:p-6 flex flex-col gap-4 [scrollbar-width:thin] lg:overflow-visible">
                      <SectionTitle n={3} hint={selectedTable.chargeSent ? 'A cobrança já está na maquininha.' : selectedTable.splitActive ? 'O sistema cobra uma pessoa por vez.' : 'Escolha uma opção. O valor aparece na maquininha e o cliente paga no cartão.'}>
                        {selectedTable.chargeSent ? 'Cobrança na maquininha' : selectedTable.splitActive ? 'Cobrança pessoa por pessoa' : 'Como cobrar?'}
                      </SectionTitle>

                      {actionError && (
                        <div role="alert" className="rounded-[16px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[15px]">{actionError}</div>
                      )}
                      {chargeNotice && (
                        <div role="status" className={cn('rounded-[16px] border px-4 py-3 text-[15px]', chargeNotice.tone === 'bad' ? 'border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0]' : chargeNotice.tone === 'ok' ? 'border-[#9be3a8]/40 bg-[#9be3a8]/10 text-[#c9f3d1]' : 'border-white/20 bg-white/[0.06] text-white/80')}>{chargeNotice.text}</div>
                      )}

                      {selectedTable.chargeSent ? (
                        <div className={cn(card, 'p-4 flex flex-col gap-4')}>
                          <div className="flex items-start gap-3 text-[15.5px] text-white/90">
                            <Lock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <span>Cobrança enviada. O cliente deve pagar na maquininha. Quando o pagamento for aprovado, a mesa fecha sozinha.</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button onClick={() => handleChargeAction('refresh')} disabled={processing} className={btnSecondary}>
                              <RefreshCw className={cn('w-4 h-4', processing && 'animate-spin')} /> Recarregar
                            </button>
                            <button onClick={() => handleChargeAction('cancel')} disabled={processing} className={btnDanger}>
                              Cancelar cobrança
                            </button>
                          </div>
                          <p className="text-[13.5px] leading-relaxed text-white/65">
                            <strong className="text-white/82">Recarregar:</strong> use se o cliente pagou ou cancelou na maquininha e a tela não mudou. <strong className="text-white/82">Cancelar cobrança:</strong> tira o valor da maquininha para você cobrar de outro jeito.
                          </p>
                        </div>
                      ) : selectedTable.splitActive ? (
                        <div className="rounded-[20px] border border-[#E8A317]/50 bg-[#E8A317]/10 p-4">
                          <ul className="flex flex-col gap-2.5">
                            {(selectedTable.splitQueue ?? []).map((q, i) => (
                              <li key={i} className="flex items-center justify-between gap-3 text-[15.5px]">
                                <span className="truncate">{i + 1}. {q.customerName}</span>
                                <span className="flex-shrink-0 tabular-nums">
                                  {q.state === 'paid' ? <span className="text-[#9be3a8]">pagou ✓</span> : q.state === 'paying' ? <span className="text-[#F2C45A] font-semibold">na maquininha · {formatPrice(q.due)}</span> : <span className="text-white/75">aguardando · {formatPrice(q.due)}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[14px] text-white/75 mt-3.5">Quando uma pessoa paga, a cobrança da próxima aparece sozinha na maquininha.</p>
                          <button onClick={() => handleSplit('stop')} disabled={processing} className={cn(btnSecondary, 'w-full mt-3.5')}>Parar a fila</button>
                        </div>
                      ) : (
                        <PaymentOptions
                          table={selectedTable}
                          processing={processing}
                          onCharge={handleSendToTerminal}
                          onStartSplit={() => handleSplit('start')}
                        />
                      )}

                      {/* Disponível em qualquer situação */}
                      <div className="mt-2 pt-4 border-t border-white/10">
                        <button
                          onClick={() => setConfirmCloseOpen(true)}
                          disabled={processing}
                          className={cn(btnSecondary, 'w-full text-white/75')}
                        >
                          Encerrar a mesa sem cobrar na maquininha
                        </button>
                        <p className="text-[13.5px] text-white/65 mt-2 text-center">Use só se o pagamento foi feito fora da maquininha.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
              )
            })()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* CONFIRMAÇÃO DE ENCERRAMENTO FORÇADO */}
      <Dialog.Root open={confirmCloseOpen} onOpenChange={(o) => { if (!processing) setConfirmCloseOpen(o) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-sm rounded-[26px] bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white z-[111] p-6 text-center outline-none"
          >
            <div className="w-12 h-12 rounded-full bg-[#ff9b8f]/15 text-[#ffb3a8] grid place-items-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" strokeWidth={1.6} />
            </div>
            <Dialog.Title className="text-[20px] font-bold tracking-tight mb-2">Forçar encerramento?</Dialog.Title>
            <p className="text-[14px] text-white/82 leading-relaxed mb-5">
              Use apenas se o cliente já pagou por fora ou se o celular dele teve algum problema. A mesa será marcada como paga e liberada, mas <strong className="text-white">nenhuma cobrança será enviada ao Mercado Pago</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleForceClose}
                disabled={processing}
                className="w-full h-11 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[15px] font-semibold disabled:opacity-60 active:scale-[0.98] transition"
              >
                {processing ? 'Encerrando…' : 'Sim, encerrar e liberar a mesa'}
              </button>
              <button
                onClick={() => setConfirmCloseOpen(false)}
                disabled={processing}
                className="w-full h-11 rounded-full border border-white/35 text-white text-[15px] font-medium disabled:opacity-60 active:scale-[0.98] transition"
              >
                Cancelar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* AVISO DE MESA LIVRE */}
      {alertOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white px-6 py-3.5 flex items-center gap-3 animate-in fade-in zoom-in duration-200">
            <AlertCircle className="w-5 h-5 text-white/82" strokeWidth={1.6} />
            <span className="font-medium text-[15px]">Mesa {alertTableNumber} está livre</span>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO */}
      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[120] rounded-full bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white text-[14px] px-5 py-3 animate-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}

    </div>
  )
}

function remainingOf(t: TableData) {
  return Math.max(0, Math.round((t.totalWithFee - (t.paid ?? 0)) * 100) / 100)
}

const card = 'rounded-[20px] border border-white/12 bg-white/[0.05]'
const btnCompact = 'h-9 w-1/2 min-w-[190px] self-start ml-12 px-4 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[13.5px] font-semibold whitespace-nowrap flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition'
const btnSecondary = 'h-11 px-4 rounded-full border border-white/35 text-white text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition'
const btnDanger = 'h-11 px-4 rounded-full border border-[#ff9b8f]/50 text-[#ffb3a8] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-[#ff9b8f]/10 disabled:opacity-50 transition'

function SectionTitle({ n, hint, children }: { n: number; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-bold grid place-items-center flex-shrink-0">{n}</span>
        <h3 className="text-[19px] leading-tight font-bold tracking-tight">{children}</h3>
      </div>
      {hint && <p className="text-[14px] leading-snug text-white/72 mt-1.5 pl-10">{hint}</p>}
    </div>
  )
}

function Option({ icon: Icon, title, desc, children }: { icon: LucideIcon; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className={cn(card, 'p-3.5 flex flex-col gap-3')}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-white/10 grid place-items-center flex-shrink-0"><Icon className="w-4 h-4" strokeWidth={1.7} /></span>
        <div className="min-w-0">
          <div className="text-[15.5px] font-semibold leading-tight">{title}</div>
          <div className="text-[13px] leading-snug text-white/72 mt-0.5">{desc}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Como cobrar: tudo de uma vez, cada um paga o seu (fila) ou dividir igualmente. Uma cobrança por vez na maquininha. */
function PaymentOptions({ table, processing, onCharge, onStartSplit }: {
  table: TableData
  processing: boolean
  onCharge: (opts?: { amount?: number; deviceId?: string | null; customerName?: string }) => void
  onStartSplit: () => void
}) {
  const [parts, setParts] = useState(2)
  const remaining = remainingOf(table)
  const equal = Math.round((remaining / parts) * 100) / 100
  const payers = table.customers.filter((c) => c.deviceId && (c.due ?? c.totalWithFee) > 0.009)
  const canSplit = remaining >= 1

  return (
    <div className="flex flex-col gap-2.5">
      <Option icon={CreditCard} title="Cobrança única" desc="Um único pagamento com o valor da conta inteira.">
        <button onClick={() => onCharge()} disabled={processing} className={btnCompact}>
          {processing ? 'Enviando…' : remaining < table.totalWithFee - 0.009 ? `Cobrar o que falta · ${formatPrice(remaining)}` : `Cobrar ${formatPrice(remaining)}`}
        </button>
      </Option>

      {canSplit && payers.length >= 2 && (
        <Option icon={Users} title="Pagamento individual" desc="Uma cobrança por pessoa, na ordem dos pedidos. Quando uma paga, a próxima aparece sozinha na maquininha.">
          <ul className="rounded-[14px] bg-black/20 border border-white/10 divide-y divide-white/10">
            {payers.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-white/10 text-[12.5px] font-bold grid place-items-center flex-shrink-0">{i + 1}</span>
                  <span className="truncate text-white/85">{c.customerName}</span>
                </span>
                <span className="tabular-nums font-semibold flex-shrink-0">{formatPrice(c.due ?? c.totalWithFee)}</span>
              </li>
            ))}
          </ul>
          <button onClick={onStartSplit} disabled={processing} className={btnCompact}>Começar a cobrar</button>
        </Option>
      )}

      {canSplit && (
        <Option icon={Divide} title="Dividir em partes iguais" desc="Escolha em quantas pessoas dividir. Você cobra uma parte de cada vez.">
          <div className="flex items-center justify-between rounded-[14px] bg-black/20 border border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <button aria-label="Menos pessoas" onClick={() => setParts((n) => Math.max(2, n - 1))} className="w-9 h-9 rounded-full border border-white/30 text-[19px] leading-none hover:bg-white/10 transition">−</button>
              <div className="w-14 text-center">
                <div className="text-[20px] font-bold leading-none tabular-nums">{parts}</div>
                <div className="text-[12px] uppercase tracking-widest text-white/65 mt-1">pessoas</div>
              </div>
              <button aria-label="Mais pessoas" onClick={() => setParts((n) => Math.min(12, n + 1))} className="w-9 h-9 rounded-full border border-white/30 text-[19px] leading-none hover:bg-white/10 transition">+</button>
            </div>
            <div className="text-right">
              <div className="text-[12px] uppercase tracking-widest text-white/65">por pessoa</div>
              <div className="text-[18px] font-bold tabular-nums">{formatPrice(equal)}</div>
            </div>
          </div>
          <button disabled={processing || equal < 1} onClick={() => onCharge({ amount: equal })} className={btnCompact}>
            Cobrar uma parte · {formatPrice(equal)}
          </button>
        </Option>
      )}

    </div>
  )
}
