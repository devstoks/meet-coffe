import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Banknote, ChevronDown, Receipt, Send, User, Users, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatPrice } from '../lib/api'
import { describeSaved } from '../lib/optionsView'
import { METHOD_LABEL, SCOPE_LABEL } from '../lib/payment'
import {
  cancelClosureRequest, fetchClosureRequests, sendClosureToTerminal, settleClosureCash,
  type ClosureRequestView,
} from '../lib/admin'
import { useKitchenSocket } from '../lib/useKitchenSocket'
import { elapsedLabel } from './OrderTicket'

/**
 * Encerramentos pedidos pelos clientes (individual ou mesa toda), com TUDO o que a equipe precisa para cobrar:
 * quem, mesa, tipo, itens (com personalização e observações), quantidades, valores, forma de pagamento e status.
 * Cartão/PIX: a equipe envia à maquininha e o Mercado Pago confirma pelo webhook. Dinheiro: a equipe encerra aqui.
 */
export function ClosureRequestsPanel() {
  const [requests, setRequests] = useState<ClosureRequestView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const data = await fetchClosureRequests()
      if (mine !== seq.current) return
      setRequests(data.requests)
    } catch { /* mantém a lista atual; o próximo ciclo tenta de novo */ }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { void load(); setNow(Date.now()) }, 15_000)
    return () => clearInterval(id)
  }, [load])

  const refresh = () => { void load() }
  useKitchenSocket(
    {
      closure_requested: refresh, closure_updated: refresh, table_closed: refresh, tables_reset: refresh,
      payment_approved: refresh, payment_partial: refresh, payment_expired: refresh,
    },
    refresh,
  )

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id); setError(null)
    try { await fn(); await load() }
    catch (e: any) { setError(e?.message || 'Não foi possível concluir a ação'); void load() }
    finally { setBusyId(null) }
  }

  if (requests.length === 0 && !error) return null

  return (
    <section className="flex flex-col gap-3" aria-label="Encerramentos">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[12px] uppercase tracking-[2px] text-white/60 font-bold flex items-center gap-2"><Receipt className="w-3.5 h-3.5" /> Encerramentos</h2>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E8A317] text-[#2a1a0e]">{requests.length}</span>
      </div>
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <span>{error}</span><button onClick={() => setError(null)} className="font-bold">OK</button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {requests.map((r) => (
          <motion.div key={r.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}>
            <RequestCard r={r} now={now} busy={busyId === r.id} run={run} />
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  )
}

function RequestCard({ r, now, busy, run }: { r: ClosureRequestView; now: number; busy: boolean; run: (id: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(true)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const isTable = r.scope === 'TABLE'
  const cash = r.paymentMethod === 'CASH'
  const who = isTable ? (r.customerName ? `pedido por ${r.customerName}` : 'todas as pessoas da mesa') : (r.customerName || r.participants[0]?.customerName || 'Cliente')

  return (
    <div className="rounded-[24px] border border-[#E8A317]/50 bg-[#E8A317]/[0.08] backdrop-blur-xl p-4 flex flex-col gap-3.5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-bold text-[#F5F1E8]">Mesa {r.tableNumber}</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/12 text-white/90 text-[11px] font-bold">
              {isTable ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}{SCOPE_LABEL[r.scope]}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[11px] font-bold">{METHOD_LABEL[r.paymentMethod]}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-white/70 break-words">{isTable ? 'Mesa toda' : 'Comanda individual'} · {who}</div>
          <div className="mt-0.5 text-[11px] text-white/45">{elapsedLabel(r.createdAt, now)}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-white/50">A receber</div>
          <div className="text-[22px] leading-tight font-bold text-[#F5F1E8] tabular-nums">{formatPrice(r.due)}</div>
          <span className={cn('inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold', r.chargeSent ? 'bg-[#6aa7ff]/25 text-[#bcd7ff]' : 'bg-[#E8A317] text-[#2a1a0e]')}>
            {r.chargeSent ? 'Cobrança na maquininha' : 'Aguardando pagamento'}
          </span>
        </div>
      </div>

      {r.inPreparation > 0 && (
        <div className="text-[12px] text-[#ffd9a0]">Atenção: {r.inPreparation} {r.inPreparation === 1 ? 'pedido ainda não foi finalizado' : 'pedidos ainda não foram finalizados'} na cozinha.</div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="self-start flex items-center gap-1.5 text-[12px] font-semibold text-white/75">
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} /> {open ? 'Ocultar detalhes' : 'Ver detalhes'}
      </button>

      {open && (
        <div className="flex flex-col gap-3">
          {r.participants.map((p) => (
            <div key={p.key} className="rounded-[18px] bg-black/20 border border-white/10 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[14px] font-semibold text-[#F5F1E8] truncate">{p.customerName}</div>
                <div className="text-[12px] text-white/60 tabular-nums">Total {formatPrice(p.total)}{p.paid > 0 ? ` · pago ${formatPrice(p.paid)}` : ''}</div>
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {p.items.map((it) => {
                  const options = describeSaved(it.selections)
                  return (
                    <li key={it.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] text-[#F5F1E8] break-words">{it.quantity}× {it.name}</div>
                        {options.map((o) => <div key={o} className="text-[11.5px] text-white/65 break-words">{o}</div>)}
                        {it.observations && <div className="text-[11.5px] italic text-[#ffb3a8] break-words">obs: {it.observations}</div>}
                      </div>
                      <div className="text-[12.5px] text-white/70 tabular-nums whitespace-nowrap">{formatPrice(it.subtotal)}</div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-2.5 pt-2 border-t border-white/10 text-[11.5px] text-white/55 flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
                <span>Consumo {formatPrice(p.subtotal)}</span>
                {p.fee > 0 && <span>Serviço ({r.serviceFeePercent}%) {formatPrice(p.fee)}</span>}
                <span className="text-white/80 font-semibold">A receber {formatPrice(p.due)}</span>
              </div>
            </div>
          ))}
          {isTable && r.participants.length > 1 && (
            <div className="flex justify-between text-[13px] text-white/80 px-1"><span>Total da mesa</span><strong className="tabular-nums">{formatPrice(r.total)}</strong></div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {cash ? (
          <button
            disabled={busy}
            onClick={() => run(r.id, () => settleClosureCash(r.id))}
            className="flex-1 min-w-[200px] h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
          >
            <Banknote className="w-4 h-4" strokeWidth={2} /> {busy ? 'Salvando…' : isTable ? 'Recebi em dinheiro · encerrar mesa' : 'Recebi em dinheiro · encerrar comanda'}
          </button>
        ) : (
          <button
            disabled={busy || r.chargeSent}
            onClick={() => run(r.id, () => sendClosureToTerminal(r))}
            className="flex-1 min-w-[200px] h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
          >
            <Send className="w-4 h-4" strokeWidth={2} /> {r.chargeSent ? 'Cobrança enviada à maquininha' : busy ? 'Enviando…' : `Enviar ${formatPrice(r.due)} à maquininha`}
          </button>
        )}
        {confirmCancel ? (
          <div className="flex items-center gap-2">
            <button disabled={busy} onClick={() => run(r.id, () => cancelClosureRequest(r.id)).then(() => setConfirmCancel(false))} className="h-12 px-5 rounded-full border border-[#ff9b8f]/60 text-[#ffc9c0] text-[13px] font-semibold disabled:opacity-50">Confirmar cancelamento</button>
            <button onClick={() => setConfirmCancel(false)} className="h-12 px-4 rounded-full border border-white/30 text-white text-[13px]">Voltar</button>
          </div>
        ) : (
          <button disabled={busy} onClick={() => setConfirmCancel(true)} className="h-12 px-5 rounded-full border border-white/30 text-white text-[13px] font-medium flex items-center gap-1.5 hover:bg-white/10 transition disabled:opacity-50">
            <X className="w-4 h-4" /> Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
