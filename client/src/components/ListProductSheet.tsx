import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, X } from 'lucide-react'
import { formatCents, formatPrice, missingSelection, priceBreakdown, type Product, type SelectionInput } from '../lib/api'
import { cn } from '../lib/cn'
import { OptionsPicker, OptionsSummary } from './OptionsPicker'
import { defaultSelections } from './ProductOptionsSheet'

type Props = {
  product: Product | null
  imageOf: (p: Product) => string
  onClose: () => void
  onConfirm: (product: Product, selections: SelectionInput[]) => void
}

/**
 * Produto dentro da LISTA: fotos/vídeo, descrição, personalização (cards com imagem), resumo ao vivo e
 * "Adicionar à comanda" — tudo na mesma folha, sem sair da lista nem passar pelo Feed.
 */
export function ListProductSheet({ product, imageOf, onClose, onConfirm }: Props) {
  const [selections, setSelections] = useState<SelectionInput[]>([])
  const [slide, setSlide] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelections(defaultSelections(product)); setSlide(0) }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => product?.optionGroups ?? [], [product])
  const media = useMemo(() => {
    if (!product) return []
    const items: { type: 'image' | 'video'; src: string }[] = (product.images?.length ? product.images : [imageOf(product)]).map((src) => ({ type: 'image', src }))
    if (product.videoPath) items.push({ type: 'video', src: product.videoPath })
    return items
  }, [product]) // eslint-disable-line react-hooks/exhaustive-deps

  const missing = product ? missingSelection(groups, selections) : null
  const { totalCents } = product ? priceBreakdown(product, selections) : { totalCents: 0 }

  return (
    <Dialog.Root open={!!product} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[57] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[58] inset-x-0 bottom-0 mx-auto w-full max-w-[480px] h-[92dvh] flex flex-col rounded-t-[30px] bg-[#F5F1E8] text-[#1f1a14] overflow-hidden outline-none shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          <Dialog.Close asChild>
            <button aria-label="Fechar" className="absolute top-3.5 right-3.5 z-20 w-11 h-11 rounded-full bg-white/92 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)] grid place-items-center active:scale-95 transition">
              <X className="w-5 h-5" strokeWidth={1.8} />
            </button>
          </Dialog.Close>

          <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-y' }}>
            <div className="relative bg-[#1f1a14]/8">
              <div
                ref={galleryRef}
                onScroll={(e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))) }}
                className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ touchAction: 'pan-x pan-y' }}
              >
                {media.map((m, i) => (
                  <div key={`${m.type}-${i}`} className="min-w-full snap-center aspect-[16/11] bg-[#1c1c18]">
                    {m.type === 'image'
                      ? <img src={m.src} alt={i === 0 && product ? product.name : ''} draggable={false} className="w-full h-full object-cover" />
                      : <video src={m.src} controls muted playsInline preload="metadata" className="w-full h-full object-contain" />}
                  </div>
                ))}
              </div>
              {media.length > 1 && (
                <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 pointer-events-none" aria-hidden>
                  {media.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/60')} />)}
                </div>
              )}
            </div>

            <div className="px-5 pt-5 pb-6">
              <Dialog.Title className="text-[24px] leading-[1.1] font-bold tracking-tight break-words">{product?.name}</Dialog.Title>
              {product?.description && <p className="mt-2 text-[14px] leading-relaxed text-[#1f1a14]/65">{product.description}</p>}
              <div className="mt-3 text-[20px] font-bold tabular-nums">{product ? formatPrice(product.price) : ''}</div>

              {product && groups.length > 0 && (
                <div className="mt-6 flex flex-col gap-6">
                  <OptionsPicker groups={groups} value={selections} onChange={setSelections} tone="light" />
                  <OptionsSummary product={product} selections={selections} tone="light" />
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-white border-t border-[#1f1a14]/8">
            {missing && <p className="mb-2 text-center text-[12.5px] font-medium text-[#a15c00]">Falta escolher: {missing}</p>}
            <button
              onClick={() => product && !missing && onConfirm(product, selections)}
              disabled={!!missing}
              className="w-full h-14 rounded-full bg-[#1f1a14] text-white text-[14.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition"
            >
              <Check className="w-4 h-4" strokeWidth={2.2} /> Adicionar à comanda · {formatCents(totalCents)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
