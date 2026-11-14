import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, Receipt, Trash2, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatPrice } from '../lib/api'

export type ComandaTab = 'novo' | 'enviados'

export type DraftLine = {
  id: string
  name: string
  description: string | null
  price: number // unitário, já com os adicionais das opções
  image: string
  qty: number
  options: string[] // "Comida: Croissant · Frango"
}

export type ConsumedLine = {
  key: string
  name: string
  description: string | null
  image: string
  quantity: number
  unitPrice: number
  subtotal: number
  status?: string
  observations?: string | null
  options: string[]
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: ComandaTab
  onTabChange: (tab: ComandaTab) => void
  backdropImage: string
  businessName: string
  tableNumber: string | null
  customerName: string

  // Novos pedidos (ainda não enviados)
  draftLines: DraftLine[]
  draftSubtotal: number
  serviceFeePercent: number
  submitting: boolean
  onSetQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onSend: () => void

  // Minha comanda: somente o que ESTE aparelho pediu
  consumed: ConsumedLine[]
  mySubtotal: number
  myFee: number
  myTotal: number
  onCloseTab: () => void
}

const glass = 'bg-white/[0.07] backdrop-blur-xl border border-white/15'

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-shrink-0 h-9 px-4 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors',
        active ? 'bg-[#F5F1E8] border-[#F5F1E8] text-[#1f1a14]' : 'bg-transparent border-white/35 text-white',
      )}
    >{children}</button>
  )
}

function OptionList({ options, className }: { options: string[]; className?: string }) {
  if (options.length === 0) return null
  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {options.map((o) => <li key={o} className="text-[11.5px] leading-snug text-white/70 break-words">{o}</li>)}
    </ul>
  )
}

export function ComandaSheet(p: Props) {
  const feeValue = p.draftSubtotal * (p.serviceFeePercent / 100)
  const draftCount = p.draftLines.reduce((n, l) => n + l.qty, 0)
  const hasDraft = p.draftLines.length > 0
  const hasConsumed = p.consumed.length > 0
  const closeBlockedByDraft = hasDraft

  return (
    <Dialog.Root open={p.open} onOpenChange={p.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 bg-[#0f0e0c] outline-none">
          <div className="relative h-full mx-auto max-w-[480px] overflow-hidden flex flex-col">
            {/* Fundo: foto real do cardápio, desfocada e escurecida em tom café */}
            <div aria-hidden className="absolute inset-0">
              <img src={p.backdropImage} alt="" className="w-full h-full object-cover scale-110 blur-2xl" />
              <div className="absolute inset-0 bg-[#24160c]/80" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
            </div>

            {/* Cabeçalho */}
            <header className="relative z-10 px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
              <Dialog.Close asChild>
                <button
                  aria-label="Fechar"
                  className="absolute right-4 top-[calc(env(safe-area-inset-top)+10px)] w-10 h-10 rounded-full border border-white/30 bg-black/25 backdrop-blur-md text-white grid place-items-center active:scale-90 transition"
                ><X className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
              </Dialog.Close>
              <div className="pr-12 text-[20px] leading-none font-medium tracking-tight text-white">{p.businessName}</div>
              <Dialog.Title className="mt-4 text-[25px] leading-[1.1] font-bold tracking-tight text-white">
                {p.tab === 'novo' ? 'Novos pedidos' : 'Minha comanda'}
              </Dialog.Title>
              <p className="mt-1 text-[13px] text-white/70">
                {p.tab === 'novo'
                  ? 'Confira seus itens antes de enviar.'
                  : [p.tableNumber ? `Mesa ${p.tableNumber}` : null, p.customerName || null].filter(Boolean).join(' · ') || 'Seu consumo'}
              </p>
              <nav className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Seções da sacola">
                <Pill active={p.tab === 'novo'} onClick={() => p.onTabChange('novo')}>
                  Novos pedidos{draftCount > 0 ? ` · ${draftCount}` : ''}
                </Pill>
                <Pill active={p.tab === 'enviados'} onClick={() => p.onTabChange('enviados')}>Minha comanda</Pill>
              </nav>
            </header>

            {/* Conteúdo rolável */}
            <div className="relative z-10 flex-1 overflow-y-auto px-4 pt-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {p.tab === 'novo' && (
                hasDraft ? (
                  <>
                    <ul className="flex flex-col gap-2.5">
                      {p.draftLines.map((l) => (
                        <li key={l.id} className={cn('flex gap-3 p-1.5 rounded-[22px] overflow-hidden', glass)}>
                          <img src={l.image} alt={l.name} className="w-[78px] h-[78px] rounded-[17px] object-cover flex-shrink-0 bg-black/30" loading="lazy" />
                          <div className="flex-1 min-w-0 flex flex-col py-0.5 pr-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[14.5px] leading-tight font-semibold text-white break-words">{l.name}</div>
                              <button onClick={() => p.onRemove(l.id)} aria-label={`Remover ${l.name}`} className="flex-shrink-0 -mt-2.5 -mr-2 w-11 h-11 grid place-items-center text-white/75 active:scale-90 transition">
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                              </button>
                            </div>
                            {l.options.length > 0
                              ? <OptionList options={l.options} className="mt-0.5" />
                              : l.description && <p className="mt-0.5 text-[11.5px] leading-snug text-white/60 line-clamp-1">{l.description}</p>}
                            <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
                              <div className="text-[14px] font-semibold text-white whitespace-nowrap">{formatPrice(l.price)}</div>
                              <div className="inline-flex items-center rounded-full border border-white/30 h-11">
                                <button onClick={() => p.onSetQty(l.id, l.qty - 1)} aria-label="Diminuir" className="w-11 h-11 grid place-items-center text-white active:scale-90"><Minus className="w-3.5 h-3.5" strokeWidth={1.6} /></button>
                                <span className="min-w-4 text-center text-[13px] font-medium text-white tabular-nums">{l.qty}</span>
                                <button onClick={() => p.onSetQty(l.id, l.qty + 1)} aria-label="Aumentar" className="w-11 h-11 grid place-items-center text-white active:scale-90"><Plus className="w-3.5 h-3.5" strokeWidth={1.6} /></button>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className={cn('mt-3.5 rounded-[22px] px-4 py-3', glass)}>
                      <div className="flex justify-between text-[13px] text-white/80"><span>Subtotal</span><span className="tabular-nums">{formatPrice(p.draftSubtotal)}</span></div>
                      {p.serviceFeePercent > 0 && (
                        <div className="mt-1.5 flex justify-between text-[13px] text-white/80"><span>Taxa de serviço ({p.serviceFeePercent}%)</span><span className="tabular-nums">{formatPrice(feeValue)}</span></div>
                      )}
                      <div className="my-2.5 h-px bg-white/20" />
                      <div className="flex items-baseline justify-between text-white">
                        <span className="text-[16px] font-semibold">Total</span>
                        <strong className="text-[23px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(p.draftSubtotal + (p.serviceFeePercent > 0 ? feeValue : 0))}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={cn('rounded-[22px] px-5 py-8 text-center', glass)}>
                    <div className="text-[16px] font-semibold text-white">Nenhum item novo</div>
                    <p className="mt-1 text-[12.5px] text-white/70">Adicione produtos pelo cardápio para montar seu pedido.</p>
                  </div>
                )
              )}

              {p.tab === 'enviados' && (
                <section className={cn('rounded-[22px] overflow-hidden', glass)}>
                  {hasConsumed ? (
                    <ul>
                      {p.consumed.map((c, i) => (
                        <li key={c.key} className={cn('flex gap-3 px-3.5 py-3', i > 0 && 'border-t border-white/10')}>
                          <img src={c.image} alt={c.name} className="w-[54px] h-[54px] rounded-xl object-cover flex-shrink-0 bg-black/30" loading="lazy" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[14px] leading-tight font-semibold text-white break-words">{c.quantity}× {c.name}</div>
                              <div className="text-[13.5px] font-semibold text-white whitespace-nowrap tabular-nums">{formatPrice(c.subtotal)}</div>
                            </div>
                            <OptionList options={c.options} className="mt-0.5" />
                            {c.observations && <p className="mt-0.5 text-[11px] italic text-white/55 break-words">obs: {c.observations}</p>}
                            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-white/45">
                              <span>{c.status}</span>
                              {c.quantity > 1 && <span className="normal-case tracking-normal tabular-nums">{formatPrice(c.unitPrice)} cada</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-5 py-8 text-center text-[13px] text-white/70">Você ainda não fez nenhum pedido.</div>
                  )}

                  {hasConsumed && (
                    <div className="border-t border-white/15 px-4 py-3 flex flex-col gap-1.5 text-[13px] text-white/80">
                      <div className="flex justify-between"><span>Consumido por você</span><span className="tabular-nums">{formatPrice(p.mySubtotal)}</span></div>
                      {p.myFee > 0 && (
                        <div className="flex justify-between"><span>Taxa de serviço ({p.serviceFeePercent}%)</span><span className="tabular-nums">{formatPrice(p.myFee)}</span></div>
                      )}
                      <div className="mt-1.5 pt-2.5 border-t border-white/15 flex items-baseline justify-between text-white">
                        <span className="text-[16px] font-semibold">Total</span>
                        <strong className="text-[23px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(p.myTotal)}</strong>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* Rodapé: enviar o pedido novo OU encerrar a comanda */}
            <footer className="relative z-10 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              {p.tab === 'novo' && hasDraft && (
                <button
                  onClick={p.onSend}
                  disabled={p.submitting}
                  className="w-full h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition"
                >
                  {p.submitting ? 'Enviando…' : 'Enviar pedido'}
                </button>
              )}
              {p.tab === 'enviados' && hasConsumed && (
                <>
                  {closeBlockedByDraft && (
                    <p className="mb-2 text-center text-[12px] text-white/65">Envie ou remova os novos pedidos antes de encerrar.</p>
                  )}
                  <button
                    onClick={p.onCloseTab}
                    disabled={closeBlockedByDraft}
                    className="w-full h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[13.5px] font-bold tracking-[0.12em] flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                  >
                    <Receipt className="w-4 h-4" strokeWidth={1.8} /> ENCERRAR COMANDA
                  </button>
                </>
              )}
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
