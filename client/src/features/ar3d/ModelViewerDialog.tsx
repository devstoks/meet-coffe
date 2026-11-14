import { createElement, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Box, X, ScanLine } from 'lucide-react'
import { isWebXrArSupported } from './xrSupport'

type Props = { open: boolean; onOpenChange: (o: boolean) => void; src: string; title: string }

// <model-viewer> é carregado só quando alguém abre o 3D (não pesa no Feed).
// O AR próprio (three.js) também só é carregado quando o 3D é aberto.
const loadAr = () => import('./arSession')
let viewerLib: Promise<unknown> | null = null
const loadViewer = () => (viewerLib ??= import('@google/model-viewer'))

/**
 * Visualizador 3D + Realidade Aumentada.
 * AR usa o motor nativo do aparelho (Android: ARCore/Scene Viewer · iPhone: Quick Look): o prato fica
 * ancorado na superfície detectada, tamanho real (ar-scale fixed), e continua no lugar ao mover a câmera.
 */
export function ModelViewerDialog({ open, onOpenChange, src, title }: Props) {
  const ref = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [, setArOk] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [arMsg, setArMsg] = useState<string | null>(null)
  const [xrOk, setXrOk] = useState(false)

  useEffect(() => {
    if (!open) { setLoaded(false); setFailed(false); setArMsg(null); setArOk(null); return }
    let alive = true
    loadViewer().then(() => alive && setReady(true)).catch(() => alive && setFailed(true))
    isWebXrArSupported().then((ok) => {
      if (!alive) return
      setXrOk(ok)
      if (ok) loadAr().then((m) => m.preloadModel(new URL(src, location.href).href)).catch(() => {}) // baixa o GLB antes do toque
    })
    return () => { alive = false }
  }, [open, src])

  useEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const check = () => setArOk(!!el.canActivateAR)
    const onLoad = () => { setLoaded(true); check() }
    const onErr = () => setFailed(true)
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onErr)
    el.addEventListener('ar-status', check)
    // canActivateAR é decidido de forma assíncrona depois do load: confere por alguns segundos
    const poll = setInterval(check, 500)
    const stop = setTimeout(() => clearInterval(poll), 6000)
    return () => {
      el.removeEventListener('load', onLoad); el.removeEventListener('error', onErr); el.removeEventListener('ar-status', check)
      clearInterval(poll); clearTimeout(stop)
    }
  }, [ready, open])

  async function startAr() {
    setArMsg(null)
    if (!window.isSecureContext) { setArMsg('O AR exige HTTPS. Abra o site pelo endereço https (ex.: o link do túnel), não por http/IP.'); return }
    // 1) AR próprio (Android/Chrome): superfície detectada + âncora fixa
    if (xrOk) {
      try {
        const m = await loadAr()
        await m.startArSession({ src: new URL(src, location.href).href, title })
        return
      } catch (e: any) {
        setArMsg(`Não foi possível abrir o AR (${e?.message ?? 'erro'}). Verifique a permissão da câmera e tente de novo.`)
        return
      }
    }
    // 2) iPhone (Quick Look) e outros: motor nativo via model-viewer
    const el = ref.current
    if (!el) return
    if (!el.canActivateAR) { setArMsg('Este aparelho/navegador não liberou o AR. No Android use o Chrome (com o app “Google Play Services para RA” instalado); no iPhone use o Safari.'); return }
    try { el.activateAR() } catch { setArMsg('Não foi possível abrir o AR. Tente novamente.') }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 top-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[420px] sm:h-[720px] sm:max-h-[92vh] z-[121] flex flex-col bg-[#1d130b]/95 backdrop-blur-2xl text-white sm:rounded-[28px] sm:border border-white/15 outline-none overflow-hidden"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="flex items-center justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-white/50">Visualização 3D</div>
              <Dialog.Title className="text-[19px] font-bold tracking-tight truncate">{title}</Dialog.Title>
            </div>
            <Dialog.Close aria-label="Fechar" className="w-11 h-11 rounded-full border border-white/25 grid place-items-center active:scale-95 transition flex-shrink-0">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <div className="relative flex-1 min-h-0">
            {ready && !failed && createElement('model-viewer', {
              ref, src, alt: `Modelo 3D de ${title}`,
              ar: true, 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'fixed', 'ar-placement': 'floor',
              'camera-controls': true, 'auto-rotate': true, 'touch-action': 'pan-y',
              'shadow-intensity': '1', 'shadow-softness': '1', exposure: '1.05', 'xr-environment': true,
              loading: 'eager', style: { width: '100%', height: '100%', background: 'transparent', '--poster-color': 'transparent' },
            })}
            {!loaded && !failed && <div className="absolute inset-0 grid place-items-center text-white/60 text-[13px]">Carregando modelo…</div>}
            {failed && <div className="absolute inset-0 grid place-items-center px-8 text-center text-[#ffc9c0] text-[13px]">Não foi possível carregar o modelo 3D.</div>}
          </div>

          <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-2.5">
            <button
              disabled={!loaded && !xrOk}
              onClick={startAr}
              className="w-full h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-40"
            >
              <ScanLine className="w-4 h-4" /> Ver na minha mesa (AR)
            </button>
            {arMsg && <div role="alert" className="rounded-[14px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3 py-2 text-[12px] leading-snug">{arMsg}</div>}
            <p className="text-[11.5px] leading-snug text-white/55 text-center">
              <span className="inline-flex items-center gap-1.5"><Box className="w-3.5 h-3.5" /> Arraste para girar</span>
              <span className="block mt-1">No AR: aponte para a mesa e mova o celular devagar até aparecerem os pontinhos; só então toque para fixar o prato. Mesa com boa luz e textura fixa melhor.</span>
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
