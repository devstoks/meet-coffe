import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, Loader2 } from 'lucide-react'
import { saveMenuView, SessionInvalidError, type MenuView } from '../lib/api'
import { saveCustomerName, saveMenuViewLocal } from '../lib/identity'
import { cn } from '../lib/cn'

type Props = {
  businessName: string
  tableNumber: string | null
  deviceId: string
  /** Pede o nome antes (primeira vez neste celular). */
  needName: boolean
  initialName: string
  onComplete: (r: { name: string; view: MenuView }) => void
}

/** Ilustração do FEED: celular com foto grande, categorias no topo, nome/preço e botão de adicionar. */
function FeedIllustration() {
  return (
    <svg viewBox="0 0 120 104" fill="none" aria-hidden className="w-full h-full">
      <rect x="33" y="3" width="54" height="98" rx="11" stroke="currentColor" strokeWidth="2.2" />
      <rect x="38" y="9" width="44" height="86" rx="7" fill="currentColor" fillOpacity=".12" />
      <rect x="41" y="13" width="15" height="5" rx="2.5" fill="currentColor" fillOpacity=".6" />
      <rect x="59" y="13" width="15" height="5" rx="2.5" fill="currentColor" fillOpacity=".25" />
      <circle cx="60" cy="44" r="15" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="44" r="8" fill="currentColor" fillOpacity=".35" />
      <path d="M55 22c-2 -3 2 -4 0 -7M61 22c-2 -3 2 -4 0 -7M67 22c-2 -3 2 -4 0 -7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".55" />
      <rect x="42" y="68" width="27" height="4.5" rx="2.25" fill="currentColor" />
      <rect x="42" y="76" width="18" height="3" rx="1.5" fill="currentColor" fillOpacity=".5" />
      <circle cx="74" cy="82" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M74 79.2v5.6M71.2 82h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="92" cy="40" r="1.8" fill="currentColor" fillOpacity=".7" />
      <circle cx="92" cy="48" r="1.8" fill="currentColor" fillOpacity=".35" />
      <circle cx="92" cy="56" r="1.8" fill="currentColor" fillOpacity=".35" />
    </svg>
  )
}

/** Ilustração da LISTA: folha com linhas — foto pequena, nome, descrição e preço. */
function ListIllustration() {
  return (
    <svg viewBox="0 0 120 104" fill="none" aria-hidden className="w-full h-full">
      <rect x="14" y="3" width="92" height="98" rx="12" stroke="currentColor" strokeWidth="2.2" />
      <rect x="22" y="12" width="34" height="5" rx="2.5" fill="currentColor" fillOpacity=".6" />
      {[26, 50, 74].map((y, i) => (
        <g key={y}>
          <rect x="22" y={y} width="20" height="20" rx="5" fill="currentColor" fillOpacity=".3" />
          <rect x="48" y={y + 3} width={i === 1 ? 24 : 30} height="4" rx="2" fill="currentColor" />
          <rect x="48" y={y + 10} width="22" height="3" rx="1.5" fill="currentColor" fillOpacity=".45" />
          <rect x="82" y={y + 6} width="16" height="7" rx="3.5" fill="currentColor" fillOpacity=".7" />
          {i < 2 && <path d={`M22 ${y + 23}H98`} stroke="currentColor" strokeOpacity=".16" strokeWidth="1.2" />}
        </g>
      ))}
    </svg>
  )
}

const OPTIONS: { id: MenuView; title: string; text: string; Art: () => ReactNode }[] = [
  {
    id: 'feed', title: 'Feed', Art: FeedIllustration,
    text: 'Explore nosso cardápio visual com fotos, vídeos e detalhes de cada produto, como se estivesse conhecendo pessoalmente o que vai consumir.',
  },
  {
    id: 'list', title: 'Lista', Art: ListIllustration,
    text: 'Prefere praticidade? Visualize todos os produtos em uma lista organizada, com informações e preços de maneira rápida e objetiva.',
  },
]

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.28, ease: 'easeOut' as const } }

/**
 * Entrada na mesa: (1) nome, se ainda não temos; (2) "Como deseja visualizar nosso cardápio?" — Feed ou Lista.
 * É obrigatória e acontece uma vez por comanda; depois disso Feed e Lista são experiências separadas.
 */
export function EntryFlow(p: Props) {
  const [step, setStep] = useState<'name' | 'view'>(p.needName ? 'name' : 'view')
  const [name, setName] = useState(p.initialName)
  const [view, setView] = useState<MenuView | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const trimmed = name.trim()

  function submitName() {
    if (!trimmed) return
    saveCustomerName(trimmed)
    setStep('view')
  }

  async function confirmView() {
    if (!view || submitting) return
    setSubmitting(true)
    // Guarda neste aparelho e registra no servidor (por participante). Se o servidor demorar ou falhar, segue:
    // o cardápio re-registra a escolha sozinho assim que a sessão responder.
    saveMenuViewLocal(p.deviceId, view)
    try {
      await Promise.race([saveMenuView(view, p.deviceId), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))])
    } catch (e) {
      if (e instanceof SessionInvalidError) { /* o cardápio mostra o estado correto da sessão */ }
    }
    p.onComplete({ name: trimmed || p.initialName, view })
  }

  return createPortal(
    <motion.div
      data-no-swipe
      role="dialog"
      aria-modal="true"
      aria-label="Boas-vindas"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
      className="fixed inset-0 z-[110] bg-white text-[#1f1a14] overflow-y-auto"
      style={{ touchAction: 'pan-y' }}
    >
      <div className="mx-auto max-w-[480px] min-h-full flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <div className="flex items-center justify-between h-10">
          {step === 'view' && p.needName ? (
            <button onClick={() => setStep('name')} className="-ml-1 h-10 pl-1 pr-3 rounded-full text-[13.5px] font-medium text-[#1f1a14]/70 flex items-center gap-1 active:scale-95 transition">
              <ChevronLeft className="w-5 h-5" strokeWidth={1.7} /> Nome
            </button>
          ) : <span className="text-[17px] font-bold tracking-tight">{p.businessName}</span>}
          {p.tableNumber && <span className="rounded-full bg-[#F5F1E8] px-3 py-1.5 text-[12px] font-semibold">Mesa {p.tableNumber}</span>}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 'name' ? (
            <motion.form
              key="name" {...fade}
              onSubmit={(e) => { e.preventDefault(); submitName() }}
              className="flex-1 flex flex-col"
            >
              <div className="mt-10">
                <h1 className="text-[28px] leading-[1.1] font-bold tracking-tight">Como podemos te chamar?</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[#1f1a14]/60">Seu nome ajuda a equipe a identificar os seus pedidos na hora de fechar a conta.</p>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoFocus
                autoComplete="given-name"
                maxLength={40}
                className="mt-8 w-full h-14 px-5 rounded-full border border-[#1f1a14]/15 bg-white text-[16px] outline-none focus:border-[#1f1a14] transition shadow-[0_10px_28px_-18px_rgba(31,26,20,0.4)]"
              />
              <div className="mt-auto pt-8">
                <button
                  type="submit"
                  disabled={!trimmed}
                  className="w-full h-14 rounded-full bg-[#1f1a14] text-white text-[14.5px] font-semibold flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition"
                >
                  Continuar
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.div key="view" {...fade} className="flex-1 flex flex-col">
              <div className="mt-8">
                <h1 className="text-[28px] leading-[1.1] font-bold tracking-tight">Como deseja visualizar nosso cardápio?</h1>
                <p className="mt-2 text-[14px] text-[#1f1a14]/60">Escolha o jeito que for mais confortável para você{p.initialName || trimmed ? `, ${(trimmed || p.initialName).split(' ')[0]}` : ''}.</p>
              </div>

              <div role="radiogroup" aria-label="Formato do cardápio" className="mt-7 grid grid-cols-2 gap-4">
                {OPTIONS.map(({ id, title, text, Art }, i) => {
                  const active = view === id
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: active ? 1.03 : 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 22, delay: active ? 0 : 0.06 * i }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setView(id)}
                      className={cn(
                        'relative min-h-[272px] rounded-[30px] px-3.5 pt-5 pb-4 flex flex-col items-center gap-3 text-center border transition-colors',
                        active
                          ? 'bg-[#1f1a14] text-white border-[#1f1a14] shadow-[0_18px_36px_-14px_rgba(31,26,20,0.65)]'
                          : 'bg-white text-[#1f1a14] border-[#1f1a14]/10 shadow-[0_10px_28px_-14px_rgba(31,26,20,0.35)] hover:border-[#1f1a14]/30',
                      )}
                    >
                      <div className="w-[104px] h-[90px] flex-shrink-0"><Art /></div>
                      <span className="text-[19px] font-bold tracking-tight">{title}</span>
                      <span className={cn('text-[12px] leading-snug', active ? 'text-white/75' : 'text-[#1f1a14]/60')}>{text}</span>
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
                <button
                  onClick={confirmView}
                  disabled={!view || submitting}
                  className="w-full h-14 rounded-full bg-[#1f1a14] text-white text-[14.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : view ? `Ver cardápio em ${view === 'feed' ? 'Feed' : 'Lista'}` : 'Escolha uma opção para continuar'}
                </button>
                <p className="mt-3 text-center text-[11.5px] text-[#1f1a14]/45">Você escolhe uma vez por comanda.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body,
  )
}
