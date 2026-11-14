import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Banknote, Check, ChevronLeft, CreditCard, Loader2, QrCode, User, Users, Wallet } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatPrice, requestClosure, type ClosureState, type PaymentMethod } from '../lib/api'
import { METHOD_LABEL } from '../lib/payment'

type Props = {
  /** O cliente tocou em "ENCERRAR COMANDA" e está escolhendo como pagar. */
  open: boolean
  onClose: () => void
  /** Estado do encerramento deste celular, vindo do servidor (é ele que decide a tela de espera). */
  closure: ClosureState | null
  deviceId: string
  customerName: string
  tableNumber: string | null
  myTotal: number
  tableDue: number
  /** "Mesa toda" só existe quando há mais alguém com comanda em aberto além de quem está pagando. */
  canCloseTable: boolean
  onSubmitted: () => void | Promise<void>
}

const METHODS: { id: PaymentMethod; Icon: typeof CreditCard }[] = [
  { id: 'DEBIT', Icon: Wallet },
  { id: 'CREDIT', Icon: CreditCard },
  { id: 'PIX', Icon: QrCode },
  { id: 'CASH', Icon: Banknote },
]

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const },
}

function ScopeCard({ Icon, title, desc, amount, onClick, disabled = false }: { Icon: typeof User; title: string; desc: string; amount: number; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        'w-full text-left rounded-[26px] border p-5 flex items-center gap-4 transition-colors',
        disabled
          ? 'bg-[#1f1a14]/[0.05] border-[#1f1a14]/[0.07] text-[#1f1a14]/35 cursor-not-allowed grayscale'
          : 'bg-white border-[#1f1a14]/10 shadow-[0_10px_30px_-12px_rgba(31,26,20,0.28)]',
      )}
    >
      <span className="w-12 h-12 rounded-2xl bg-[#F5F1E8] grid place-items-center flex-shrink-0"><Icon className="w-6 h-6" strokeWidth={1.6} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[18px] font-bold tracking-tight">{title}</span>
        <span className="block mt-0.5 text-[12.5px] leading-snug text-[#1f1a14]/60">{desc}</span>
      </span>
      <span className="text-right flex-shrink-0">
        <span className="block text-[10px] uppercase tracking-wider text-[#1f1a14]/45">Valor</span>
        <span className="block text-[17px] font-bold tabular-nums">{formatPrice(amount)}</span>
      </span>
    </motion.button>
  )
}

function Waiting({ closure, tableNumber }: { closure: ClosureState; tableNumber: string | null }) {
  const isTable = closure.scope === 'TABLE'
  const cash = closure.paymentMethod === 'CASH'
  const headline = closure.chargeSent ? 'Cobrança enviada à maquininha' : 'Aguardando pagamento'
  const detail = closure.chargeSent
    ? 'Faça o pagamento no terminal. Assim que for aprovado, esta tela avança sozinha.'
    : cash
      ? 'Já avisamos o atendente. Ele vai até você para receber em dinheiro.'
      : 'Já avisamos o atendente. Em instantes ele envia o valor para a maquininha.'
  return (
    <motion.div key="waiting" {...fade} className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="relative w-20 h-20 mb-6">
        <span className="absolute inset-0 rounded-full border-[3px] border-[#1f1a14]/10" />
        <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#1f1a14] animate-spin" />
        <span className="absolute inset-0 grid place-items-center text-[#1f1a14]">{isTable ? <Users className="w-7 h-7" strokeWidth={1.5} /> : <User className="w-7 h-7" strokeWidth={1.5} />}</span>
      </div>
      <h2 className="text-[24px] leading-tight font-bold tracking-tight">{headline}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#1f1a14]/65 max-w-[300px]">{detail}</p>

      <div className="mt-7 w-full max-w-[340px] rounded-[26px] bg-[#F5F1E8] px-5 py-4 text-left">
        <div className="flex justify-between text-[13px]"><span className="text-[#1f1a14]/60">{isTable ? 'Total da mesa' : 'Seu valor'}</span><strong className="text-[19px] tabular-nums leading-none">{formatPrice(closure.amount)}</strong></div>
        <div className="mt-2.5 flex justify-between text-[13px]"><span className="text-[#1f1a14]/60">Forma de pagamento</span><span className="font-semibold">{METHOD_LABEL[closure.paymentMethod]}</span></div>
        <div className="mt-2.5 flex justify-between items-center text-[13px]">
          <span className="text-[#1f1a14]/60">Status</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff2d6] text-[#8a5a00] px-2.5 py-1 text-[12px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-[#d98e00] animate-pulse" />Aguardando pagamento</span>
        </div>
        {tableNumber && <div className="mt-2.5 flex justify-between text-[13px]"><span className="text-[#1f1a14]/60">Mesa</span><span className="font-semibold">{tableNumber}</span></div>}
      </div>
      <p className="mt-4 text-[12px] text-[#1f1a14]/50 max-w-[300px]">
        {isTable ? 'A mesa foi encerrada: ninguém pode fazer novos pedidos.' : 'Sua comanda foi encerrada. A mesa continua aberta para as outras pessoas.'}
      </p>
    </motion.div>
  )
}

export function CloseFlow(p: Props) {
  const [step, setStep] = useState<'scope' | 'method'>('scope')
  const [scope, setScope] = useState<'individual' | 'table'>('individual')
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sempre começa do início quando o fluxo é aberto
  useEffect(() => { if (p.open) { setStep('scope'); setMethod(null); setError(null); setSubmitting(false) } }, [p.open])

  const waiting = !!p.closure && p.closure.status === 'AWAITING_PAYMENT'
  const visible = p.open || waiting
  const amount = scope === 'individual' ? p.myTotal : p.tableDue

  // Se "Mesa toda" deixar de existir no meio do caminho (as outras pessoas encerraram a própria comanda), volta para a escolha.
  useEffect(() => {
    if (!p.canCloseTable && step === 'method' && scope === 'table' && !waiting) {
      setStep('scope'); setScope('individual'); setMethod(null)
      setError('A mesa toda não está mais disponível: as outras pessoas já encerraram a comanda.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.canCloseTable])

  async function submit() {
    if (!method || submitting) return
    setSubmitting(true); setError(null)
    try {
      await requestClosure({ scope, method, deviceId: p.deviceId, customerName: p.customerName || undefined })
      await p.onSubmitted()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível solicitar o encerramento.')
      // Se a mesa/comanda já estava encerrada, o servidor é a fonte da verdade: atualiza e mostra o estado certo.
      if (e?.code === 'TABLE_CLOSING' || e?.code === 'DEVICE_CLOSED') await p.onSubmitted()
      if (e?.code === 'TABLE_ALONE') { await p.onSubmitted(); setStep('scope'); setScope('individual'); setMethod(null) }
    } finally { setSubmitting(false) }
  }

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="close-flow"
          data-no-swipe
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] bg-white text-[#1f1a14] overflow-y-auto"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="mx-auto max-w-[480px] min-h-full flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <AnimatePresence mode="wait" initial={false}>
              {waiting && p.closure ? (
                <Waiting key="waiting" closure={p.closure} tableNumber={p.tableNumber} />
              ) : step === 'scope' ? (
                <motion.div key="scope" {...fade} transition={{ ...fade.transition, delay: 0.18 }} className="flex-1 flex flex-col">
                  <button onClick={p.onClose} className="self-start -ml-1 h-10 pl-1 pr-3 rounded-full text-[13.5px] font-medium text-[#1f1a14]/70 flex items-center gap-1 active:scale-95 transition">
                    <ChevronLeft className="w-5 h-5" strokeWidth={1.7} /> Voltar
                  </button>
                  <div className="mt-6">
                    <h1 className="text-[28px] leading-[1.1] font-bold tracking-tight">Como deseja realizar o pagamento?</h1>
                    <p className="mt-2 text-[13px] text-[#1f1a14]/55">{[p.tableNumber ? `Mesa ${p.tableNumber}` : null, p.customerName || null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="mt-8 flex flex-col gap-3.5">
                    <ScopeCard Icon={User} title="Individual" desc="Pago só o meu consumo. A mesa continua aberta para os outros." amount={p.myTotal} onClick={() => { setScope('individual'); setStep('method') }} />
                    <ScopeCard
                      Icon={Users}
                      title="Mesa toda"
                      desc={p.canCloseTable ? 'Pago a conta de todos. Ninguém poderá fazer novos pedidos.' : 'Indisponível: não há outras pessoas com comanda em aberto.'}
                      amount={p.tableDue}
                      disabled={!p.canCloseTable}
                      onClick={() => { setScope('table'); setStep('method') }}
                    />
                  </div>
                  {error && <p role="alert" className="mt-4 text-center text-[13px] text-[#b3261e]">{error}</p>}
                </motion.div>
              ) : (
                <motion.div key="method" {...fade} className="flex-1 flex flex-col">
                  <button onClick={() => { setStep('scope'); setError(null) }} className="self-start -ml-1 h-10 pl-1 pr-3 rounded-full text-[13.5px] font-medium text-[#1f1a14]/70 flex items-center gap-1 active:scale-95 transition">
                    <ChevronLeft className="w-5 h-5" strokeWidth={1.7} /> Voltar
                  </button>
                  <div className="mt-6">
                    <h1 className="text-[28px] leading-[1.1] font-bold tracking-tight">Forma de pagamento</h1>
                    <p className="mt-2 text-[13px] text-[#1f1a14]/55">{scope === 'individual' ? 'Individual' : 'Mesa toda'} · <strong className="text-[#1f1a14] tabular-nums">{formatPrice(amount)}</strong></p>
                  </div>

                  <div role="radiogroup" aria-label="Forma de pagamento" className="mt-8 grid grid-cols-2 gap-4">
                    {METHODS.map(({ id, Icon }, i) => {
                      const active = method === id
                      return (
                        <motion.button
                          key={id}
                          role="radio"
                          aria-checked={active}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: active ? 1.03 : 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 22, delay: active ? 0 : 0.05 * i }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => { setMethod(id); setError(null) }}
                          className={cn(
                            'relative aspect-square rounded-[30px] flex flex-col items-center justify-center gap-3 border transition-colors',
                            active
                              ? 'bg-[#1f1a14] text-white border-[#1f1a14] shadow-[0_18px_36px_-14px_rgba(31,26,20,0.65)]'
                              : 'bg-white text-[#1f1a14] border-[#1f1a14]/10 shadow-[0_10px_28px_-14px_rgba(31,26,20,0.35)]',
                          )}
                        >
                          <Icon className="w-9 h-9" strokeWidth={1.4} />
                          <span className="text-[15px] font-semibold">{METHOD_LABEL[id]}</span>
                          <AnimatePresence>
                            {active && (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white text-[#1f1a14] grid place-items-center">
                                <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      )
                    })}
                  </div>

                  <div className="mt-auto pt-8">
                    {error && <p role="alert" className="mb-3 text-center text-[13px] text-[#b3261e]">{error}</p>}
                    <button
                      onClick={submit}
                      disabled={!method || submitting}
                      className="w-full h-14 rounded-full bg-[#1f1a14] text-white text-[14.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : method ? `Encerrar com ${METHOD_LABEL[method]}` : 'Escolha uma forma de pagamento'}
                    </button>
                    <p className="mt-3 text-center text-[11.5px] text-[#1f1a14]/45">O pagamento só é confirmado depois que o atendente receber.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
