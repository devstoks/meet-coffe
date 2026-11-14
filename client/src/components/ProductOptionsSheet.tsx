import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronLeft, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatCents, missingSelection, priceBreakdown, type Product, type SelectionInput } from '../lib/api'
import { OptionsPicker, OptionsSummary } from './OptionsPicker'

type Props = {
  product: Product | null
  onClose: () => void
  onConfirm: (product: Product, selections: SelectionInput[]) => void
}

/** Grupo obrigatório com uma única opção já vem escolhido (não há o que decidir). */
export function defaultSelections(product: Product | null | undefined): SelectionInput[] {
  const out: SelectionInput[] = []
  for (const g of product?.optionGroups ?? []) {
    if (g.min >= 1 && g.options.length === 1 && g.options[0].variants.length === 0) out.push({ groupId: g.id, optionId: g.options[0].id, variantId: null })
  }
  return out
}

/**
 * Personalização de combos/kits no Feed: escolha visual (cards com imagem) → resumo → adicionar.
 * Mesmo motor de regras da Lista (OptionsPicker), no estilo escuro do Feed.
 */
export function ProductOptionsSheet({ product, onClose, onConfirm }: Props) {
  const [selections, setSelections] = useState<SelectionInput[]>([])
  const [step, setStep] = useState<'choose' | 'review'>('choose')

  useEffect(() => { setSelections(defaultSelections(product)); setStep('choose') }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => product?.optionGroups ?? [], [product])
  const missing = product ? missingSelection(groups, selections) : null
  const { totalCents } = product ? priceBreakdown(product, selections) : { totalCents: 0 }
  const cover = product?.images?.[0] ?? null

  function confirm() {
    if (!product || missing) return
    onConfirm(product, selections)
  }

  return (
    <Dialog.Root open={!!product} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[57] bg-black/60 backdrop-blur-md" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[58] inset-x-0 bottom-0 mx-auto w-full max-w-[480px] h-[92dvh] flex flex-col rounded-t-[30px] bg-[#1c120a]/96 backdrop-blur-xl border border-white/15 text-white outline-none"
        >
          <div className="flex items-center gap-3 px-5 pt-5 pb-3">
            {cover && <img src={cover} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 bg-black/30" />}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[20px] leading-tight font-bold tracking-tight break-words">{product?.name}</Dialog.Title>
              <p className="mt-0.5 text-[12.5px] text-white/60">{step === 'choose' ? 'Monte do seu jeito.' : 'Confira antes de adicionar.'}</p>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Fechar" className="flex-shrink-0 w-11 h-11 rounded-full border border-white/25 grid place-items-center text-white/85 active:scale-95 transition"><X className="w-[18px] h-[18px]" strokeWidth={1.8} /></button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {step === 'choose'
              ? <OptionsPicker groups={groups} value={selections} onChange={setSelections} tone="dark" />
              : product && <OptionsSummary product={product} selections={selections} tone="dark" />}
          </div>

          <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-white/10 bg-black/20">
            <AnimatePresence>
              {step === 'choose' && missing && (
                <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 text-center text-[12.5px] text-[#ffd9a0]">
                  Falta escolher: {missing}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-3">
              {step === 'review' && (
                <button onClick={() => setStep('choose')} aria-label="Voltar e editar as escolhas" className="flex-shrink-0 h-12 px-4 rounded-full border border-white/35 text-[13.5px] font-medium flex items-center gap-1 active:scale-95 transition">
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.8} /> Editar
                </button>
              )}
              {step === 'choose' && (
                <div className="flex-shrink-0 leading-tight">
                  <div className="text-[10.5px] uppercase tracking-wider text-white/50">Total</div>
                  <div className="text-[19px] font-bold tabular-nums">{formatCents(totalCents)}</div>
                </div>
              )}
              {step === 'choose' ? (
                <button
                  onClick={() => setStep('review')}
                  disabled={!!missing}
                  className={cn('flex-1 h-12 rounded-full text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition', missing ? 'bg-white/20 text-white/55 cursor-not-allowed' : 'bg-[#F5F1E8] text-[#1f1a14]')}
                >
                  Revisar escolhas
                </button>
              ) : (
                <button onClick={confirm} className="flex-1 h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                  <Check className="w-4 h-4" strokeWidth={2.2} /> Adicionar à comanda
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
