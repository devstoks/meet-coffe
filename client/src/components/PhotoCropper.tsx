import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Check, SkipForward } from 'lucide-react'
import { cn } from '../lib/cn'

// Todas as fotos do cardápio são salvas em 9:16 (formato de celular).
const OUT_W = 1080
const OUT_H = 1920
const PREVIEW_W = 270
const PREVIEW_H = 480

type Mode = 'fill' | 'fit'

/** Enquadramento escolhido; guardado junto com a foto original para poder reajustar depois. */
export type CropSettings = { mode: Mode; zoom: number; off: { x: number; y: number } }
export type CroppedPhoto = { original: File; file: File; settings: CropSettings }

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // respeita a orientação EXIF (fotos de celular)
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Não foi possível ler esta imagem.'))
        img.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function sizeOf(img: ImageBitmap | HTMLImageElement) {
  return 'naturalWidth' in img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height }
}

/** Desenha a imagem no quadro W×H. Usado igual no preview e na exportação final (k = escala). */
function render(
  canvas: HTMLCanvasElement,
  img: ImageBitmap | HTMLImageElement,
  W: number,
  H: number,
  mode: Mode,
  zoom: number,
  off: { x: number; y: number },
  k: number,
) {
  const ctx = canvas.getContext('2d')!
  const { w: iw, h: ih } = sizeOf(img)
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#1c1c18'
  ctx.fillRect(0, 0, W, H)

  if (mode === 'fit') {
    // Imagem inteira no centro + fundo desfocado da própria foto
    const cover = Math.max(W / iw, H / ih)
    if ('filter' in ctx) {
      ctx.save()
      ctx.filter = `blur(${24 * k}px) brightness(0.7)`
      const bw = iw * cover * 1.15
      const bh = ih * cover * 1.15
      ctx.drawImage(img, (W - bw) / 2, (H - bh) / 2, bw, bh)
      ctx.restore()
    }
    const s = Math.min(W / iw, H / ih)
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s)
    return
  }

  const s = Math.max(W / iw, H / ih) * zoom
  const dw = iw * s
  const dh = ih * s
  ctx.drawImage(img, (W - dw) / 2 + off.x * k, (H - dh) / 2 + off.y * k, dw, dh)
}

function clampOffset(
  img: ImageBitmap | HTMLImageElement,
  zoom: number,
  off: { x: number; y: number },
): { x: number; y: number } {
  const { w: iw, h: ih } = sizeOf(img)
  const s = Math.max(PREVIEW_W / iw, PREVIEW_H / ih) * zoom
  const maxX = Math.max(0, (iw * s - PREVIEW_W) / 2)
  const maxY = Math.max(0, (ih * s - PREVIEW_H) / 2)
  return { x: Math.min(maxX, Math.max(-maxX, off.x)), y: Math.min(maxY, Math.max(-maxY, off.y)) }
}

/**
 * Ajusta uma foto por vez para 9:16 (1080×1920 JPEG). Arraste para posicionar, use o zoom, ou
 * escolha "Inteira" para mostrar a foto toda com fundo desfocado.
 */
function CropOne({ file, index, total, initial, onConfirm, onSkip }: {
  file: File
  index: number
  total: number
  initial?: CropSettings
  onConfirm: (f: File, settings: CropSettings) => void
  onSkip: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<ImageBitmap | HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'fill')
  const [zoom, setZoom] = useState(initial?.zoom ?? 1)
  const [off, setOff] = useState(initial?.off ?? { x: 0, y: 0 })
  const [working, setWorking] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    let alive = true
    loadBitmap(file).then((i) => { if (alive) setImg(i) }).catch((e) => { if (alive) setLoadError(e.message) })
    return () => { alive = false }
  }, [file])

  useEffect(() => {
    if (img && canvasRef.current) render(canvasRef.current, img, PREVIEW_W, PREVIEW_H, mode, zoom, off, 1)
  }, [img, mode, zoom, off])

  function onPointerDown(e: React.PointerEvent) {
    if (mode !== 'fill') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !img) return
    const next = { x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }
    setOff(clampOffset(img, zoom, next))
  }
  function onPointerUp() { drag.current = null }

  function changeZoom(z: number) {
    setZoom(z)
    if (img) setOff((o) => clampOffset(img, z, o))
  }

  async function confirm() {
    if (!img) return
    setWorking(true)
    try {
      const out = document.createElement('canvas')
      out.width = OUT_W
      out.height = OUT_H
      render(out, img, OUT_W, OUT_H, mode, zoom, off, OUT_W / PREVIEW_W)
      const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
      if (!blob) throw new Error('Falha ao gerar a imagem')
      const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
      onConfirm(new File([blob], `${base}-9x16.jpg`, { type: 'image/jpeg' }), { mode, zoom, off })
    } catch (e: any) {
      setLoadError(e?.message || 'Falha ao processar a imagem')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-[auto_minmax(0,1fr)]">
      {/* Título (topo; no desktop fica à direita) */}
      <div className="md:col-start-2 md:row-start-1">
        <div className="flex items-start justify-between gap-3 mb-1">
          <Dialog.Title className="font-serif text-xl md:text-2xl text-moss">
            Ajustar foto {total > 1 ? `(${index + 1} de ${total})` : ''}
          </Dialog.Title>
          <button onClick={onSkip} aria-label="Fechar" className="w-10 h-10 rounded-full border border-sand text-moss grid place-items-center flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <Dialog.Description className="text-[12px] md:text-[13px] text-coffee/80">
          As fotos do cardápio ficam em formato de celular (9:16). Arraste a foto para posicionar e use o zoom.
        </Dialog.Description>
      </div>

      {/* Foto (esquerda no desktop) */}
      <div className="flex justify-center md:justify-start md:col-start-1 md:row-start-1 md:row-span-2">
        <div
          className={cn('relative rounded-xl overflow-hidden border border-sand bg-black touch-none select-none flex-shrink-0', mode === 'fill' && 'cursor-grab active:cursor-grabbing')}
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} className="block w-full h-full" />
          {!img && !loadError && <div className="absolute inset-0 grid place-items-center text-cream/70 text-xs">Carregando…</div>}
        </div>
      </div>

      {/* Controles e botões (direita no desktop) */}
      <div className="flex flex-col gap-5 md:col-start-2 md:row-start-2 md:justify-between">
        <div className="flex flex-col gap-5">
          {loadError && (
            <div role="alert" className="rounded-lg border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3 py-3 text-[12.5px]">{loadError}</div>
          )}

          <div>
            <div className="text-[10px] font-bold text-olive uppercase mb-2">Enquadramento</div>
            <div className="grid grid-cols-2 gap-2">
              {([['fill', 'Preencher'], ['fit', 'Inteira']] as const).map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); if (m === 'fit') setOff({ x: 0, y: 0 }) }} className={cn(
                  'min-h-11 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition',
                  mode === m ? 'bg-moss text-cream border-moss' : 'bg-warm-white text-moss border-sand',
                )}>{label}</button>
              ))}
            </div>
            <p className="text-[11px] text-olive/80 mt-2 leading-snug">
              {mode === 'fill' ? 'Preenche todo o quadro; o excesso é cortado.' : 'Mostra a foto toda, com fundo desfocado nas sobras.'}
            </p>
          </div>

          {mode === 'fill' && (
            <label className="flex items-center gap-3 text-[11px] text-olive font-bold uppercase">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1 accent-moss h-8" />
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row md:flex-col-reverse lg:flex-row gap-2">
          <button onClick={onSkip} className="min-h-12 px-5 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            <SkipForward className="w-4 h-4" /> {total > 1 ? 'Pular esta' : 'Cancelar'}
          </button>
          <button onClick={confirm} disabled={!img || working || !!loadError} className="flex-1 min-h-12 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> {working ? 'Processando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Passa por uma lista de arquivos, um de cada vez. Ao terminar, entrega as fotos já em 9:16.
 * Fotos puladas são descartadas.
 */
export function PhotoCropper({ files, initialSettings, onDone }: {
  files: File[]
  initialSettings?: CropSettings // usado ao reajustar uma foto já adicionada
  onDone: (processed: CroppedPhoto[]) => void
}) {
  const [index, setIndex] = useState(0)
  const results = useRef<CroppedPhoto[]>([])
  const key = useMemo(() => files.map((f) => `${f.name}:${f.size}`).join('|'), [files])

  useEffect(() => { setIndex(0); results.current = [] }, [key])

  if (files.length === 0) return null

  function next(processed?: CroppedPhoto) {
    if (processed) results.current.push(processed)
    if (index + 1 >= files.length) onDone(results.current)
    else setIndex(index + 1)
  }

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) next() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-[120]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-w-sm md:max-w-3xl max-h-[94vh] overflow-y-auto bg-[#1d130b]/95 backdrop-blur-2xl border border-white/15 rounded-[26px] z-[121] p-5 md:p-8 shadow-2xl">
          <CropOne
            key={`${key}-${index}`}
            file={files[index]}
            index={index}
            total={files.length}
            initial={files.length === 1 ? initialSettings : undefined}
            onConfirm={(f, settings) => next({ original: files[index], file: f, settings })}
            onSkip={() => next()}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
