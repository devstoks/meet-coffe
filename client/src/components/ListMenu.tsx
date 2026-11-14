import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ShoppingBag, SlidersHorizontal } from 'lucide-react'
import { formatPrice, type Product } from '../lib/api'
import { cn } from '../lib/cn'

type Props = {
  businessName: string
  tableNumber: string | null
  customerName: string
  products: Product[]
  /** Ordem das seções (as categorias do negócio, sem "Todos"). */
  categories: string[]
  imageOf: (p: Product) => string
  draftCount: number
  /** Total do que está na lista de novos pedidos, em reais. */
  draftTotal: number
  /** Toque no item: abre a visualização + personalização dentro da própria Lista. */
  onOpenProduct: (p: Product) => void
  /** Botão "+": item simples entra direto; item com opções abre a personalização. */
  onQuickAdd: (p: Product) => void
  onOpenComanda: () => void
}

/**
 * Cardápio em LISTA — experiência própria (não é um atalho para o Feed):
 * seções por categoria, foto ao lado, nome, descrição e preço; toque abre o produto aqui mesmo.
 */
export function ListMenu(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const chipsRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string>(p.categories[0] ?? '')
  const lockUntil = useRef(0)

  const sections = useMemo(
    () => p.categories.map((name) => ({ name, items: p.products.filter((x) => x.category === name) })).filter((s) => s.items.length > 0),
    [p.categories, p.products],
  )

  useEffect(() => { if (!sections.some((s) => s.name === active)) setActive(sections[0]?.name ?? '') }, [sections]) // eslint-disable-line react-hooks/exhaustive-deps

  function syncActive() {
    if (Date.now() < lockUntil.current) return // durante o rolar suave de um toque no chip, não briga com ele
    const box = scrollRef.current
    if (!box) return
    const line = box.getBoundingClientRect().top + 24
    let current = sections[0]?.name ?? ''
    for (const s of sections) {
      const el = sectionRefs.current[s.name]
      if (el && el.getBoundingClientRect().top <= line) current = s.name
    }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4 && sections.length) current = sections[sections.length - 1].name
    setActive(current)
  }

  // O chip da seção atual sempre fica visível na barra de categorias
  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(active)}"]`)
    const bar = chipsRef.current
    if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' })
  }, [active])

  function goTo(name: string) {
    const el = sectionRefs.current[name]
    const box = scrollRef.current
    if (!el || !box) return
    setActive(name)
    lockUntil.current = Date.now() + 700
    box.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-[#F5F1E8] text-[#1f1a14]" data-testid="list-menu">
      <header className="flex-shrink-0 bg-white border-b border-[#1f1a14]/8 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="px-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[19px] leading-tight font-bold tracking-tight truncate">{p.businessName}</div>
            {(p.tableNumber || p.customerName) && (
              <div className="mt-0.5 text-[11.5px] text-[#1f1a14]/55 truncate">
                {p.tableNumber ? `Mesa ${p.tableNumber}` : ''}{p.tableNumber && p.customerName ? ' · ' : ''}{p.customerName}
              </div>
            )}
          </div>
          <button
            onClick={p.onOpenComanda}
            aria-label={p.draftCount > 0 ? `Abrir comanda (${p.draftCount} itens)` : 'Abrir comanda'}
            className="relative flex-shrink-0 h-11 pl-3.5 pr-4 rounded-full border border-[#1f1a14]/15 bg-white text-[13px] font-semibold flex items-center gap-2 active:scale-95 transition"
          >
            <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.6} /> Comanda
            {p.draftCount > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#1f1a14] text-white text-[11px] font-bold grid place-items-center">{p.draftCount}</span>}
          </button>
        </div>
        <nav ref={chipsRef} aria-label="Categorias" className="mt-3 pb-3 px-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => (
            <button
              key={s.name}
              data-cat={s.name}
              onClick={() => goTo(s.name)}
              aria-pressed={active === s.name}
              className={cn(
                'flex-shrink-0 h-10 px-4 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors',
                active === s.name ? 'bg-[#1f1a14] border-[#1f1a14] text-white' : 'bg-white border-[#1f1a14]/18 text-[#1f1a14]',
              )}
            >{s.name}</button>
          ))}
        </nav>
      </header>

      <div
        ref={scrollRef}
        onScroll={syncActive}
        className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: 'pan-y', paddingBottom: 'calc(env(safe-area-inset-bottom) + 108px)' }}
      >
        {sections.map((s) => (
          <section key={s.name} ref={(el) => { sectionRefs.current[s.name] = el }} className="mb-6">
            <h2 className="px-1 pb-2.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[#1f1a14]/50">{s.name}</h2>
            <ul className="flex flex-col gap-2.5">
              {s.items.map((it) => {
                const custom = (it.optionGroups?.length ?? 0) > 0
                return (
                  <li key={it.id} className="rounded-[24px] bg-white border border-[#1f1a14]/8 shadow-[0_10px_26px_-18px_rgba(31,26,20,0.45)] flex items-center overflow-hidden">
                    <button
                      onClick={() => p.onOpenProduct(it)}
                      className="flex-1 min-w-0 min-h-[104px] p-2.5 flex items-center gap-3.5 text-left active:bg-[#1f1a14]/[0.04] transition-colors"
                    >
                      <img src={p.imageOf(it)} alt="" loading="lazy" draggable={false} className="w-[84px] h-[84px] rounded-[18px] object-cover flex-shrink-0 bg-[#1f1a14]/8" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15.5px] font-semibold leading-tight line-clamp-2 break-words">{it.name}</span>
                        {it.description && <span className="block mt-1 text-[12.5px] leading-snug text-[#1f1a14]/60 line-clamp-2">{it.description}</span>}
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-bold tabular-nums whitespace-nowrap">{formatPrice(it.price)}</span>
                          {custom && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#1f1a14]/7 px-2 py-0.5 text-[10.5px] font-semibold text-[#1f1a14]/70">
                              <SlidersHorizontal className="w-3 h-3" strokeWidth={2} /> Personalize
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => p.onQuickAdd(it)}
                      aria-label={custom ? `Personalizar e adicionar ${it.name}` : `Adicionar ${it.name} à comanda`}
                      className="flex-shrink-0 mr-3 w-11 h-11 rounded-full bg-[#1f1a14] text-white grid place-items-center active:scale-90 transition"
                    >
                      <Plus className="w-5 h-5" strokeWidth={2.2} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {sections.length === 0 && <p className="py-16 text-center text-sm text-[#1f1a14]/55">Nenhum produto disponível no momento.</p>}
      </div>

      <AnimatePresence>
        {p.draftCount > 0 && (
          <motion.button
            key="bar"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            onClick={p.onOpenComanda}
            className="absolute left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-20 h-14 rounded-full bg-[#1f1a14] text-white px-5 flex items-center justify-between shadow-[0_18px_36px_-14px_rgba(31,26,20,0.7)] active:scale-[0.98] transition"
          >
            <span className="flex items-center gap-2.5 text-[14.5px] font-semibold">
              <span className="min-w-[24px] h-6 px-1.5 rounded-full bg-white text-[#1f1a14] text-[12px] font-bold grid place-items-center">{p.draftCount}</span>
              Ver comanda
            </span>
            <span className="text-[15px] font-bold tabular-nums">{formatPrice(p.draftTotal)}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
