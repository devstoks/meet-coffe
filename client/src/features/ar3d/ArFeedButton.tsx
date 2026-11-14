import { useState } from 'react'
import { Box } from 'lucide-react'
import { useArModels } from './useArModels'
import { ModelViewerDialog } from './ModelViewerDialog'

/** Botão "Ver em 3D/AR" do Feed. Não renderiza NADA se a feature estiver desligada ou o produto não tiver modelo. */
export function ArFeedButton({ productId, productName }: { productId: string; productName: string }) {
  const models = useArModels()
  const [open, setOpen] = useState(false)
  const model = models[productId]
  if (!model) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Ver ${productName} em 3D e realidade aumentada`}
        className="relative flex-shrink-0 h-11 px-3.5 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-white inline-flex items-center gap-1.5 text-[12.5px] font-semibold active:scale-95 transition"
      >
        <Box className="w-[17px] h-[17px]" strokeWidth={1.6} /> AR
      </button>
      <ModelViewerDialog open={open} onOpenChange={setOpen} src={`${model.glb}?v=${model.v}`} title={productName} />
    </>
  )
}
