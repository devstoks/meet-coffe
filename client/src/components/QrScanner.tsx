import { useEffect, useRef, useState } from 'react'
import { X, Camera, Keyboard, Loader2, QrCode, SmartphoneNfc } from 'lucide-react'
import jsQR from 'jsqr'
import { clearWaitingForTap, markWaitingForTap } from '../lib/tableProof'

type Props = {
  open: boolean
  onClose: () => void
  onResult: (text: string) => Promise<void> | void
  errorMessage?: string | null
}

export function QrScanner({ open, onClose, onResult, errorMessage }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [manual, setManual] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [nfcState, setNfcState] = useState<'idle' | 'listening' | 'unsupported' | 'error'>('idle')
  const [nfcMsg, setNfcMsg] = useState<string | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  // NFC: lê a tag da mesa pelo navegador (Web NFC — Android/Chrome). Nos demais aparelhos, encostar na tag abre a
  // página da mesa e a validação é concluída automaticamente (ver lib/tableProof).
  useEffect(() => {
    if (!open) { clearWaitingForTap(); return }
    markWaitingForTap()
    if (!nfcSupported) { setNfcState('unsupported'); return () => clearWaitingForTap() }

    const ctrl = new AbortController()
    let done = false
    setNfcMsg(null)
    try {
      const reader = new (window as any).NDEFReader()
      reader.scan({ signal: ctrl.signal }).then(() => setNfcState('listening')).catch(() => setNfcState('error'))
      reader.onreadingerror = () => setNfcMsg('Não foi possível ler a tag. Encoste de novo.')
      reader.onreading = (ev: any) => {
        if (done) return
        for (const rec of ev.message?.records ?? []) {
          if (!['text', 'url', 'absolute-url'].includes(rec.recordType)) continue
          const text = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data).trim()
          if (!text) continue
          done = true
          stopCamera()
          setSubmitting(true)
          Promise.resolve(onResultRef.current(text)).finally(() => setSubmitting(false))
          return
        }
        setNfcMsg('Tag sem conteúdo reconhecido. Use o QR Code da mesa.')
      }
    } catch {
      setNfcState('error')
    }
    return () => { ctrl.abort(); clearWaitingForTap() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nfcSupported])

  useEffect(() => {
    if (!open) {
      setIsReady(false)
      return
    }
    
    let cancelled = false
    // Pequeno delay para garantir que o <video> foi montado na tela
    const timer = setTimeout(() => {
      startCamera()
    }, 300)

    async function startCamera() {
      try {
        setCameraError(null)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        
        streamRef.current = stream
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {})
            setIsReady(true)
            scan()
          }
        }
      } catch (err: any) {
        console.error('Erro na câmera:', err)
        if (err.name === 'NotAllowedError') {
          setCameraError('Permissão negada. Libere a câmera nas configurações do navegador ou digite o código.')
        } else if (err.name === 'NotFoundError') {
          setCameraError('Câmera não encontrada neste dispositivo.')
        } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          setCameraError('A câmera exige HTTPS. Use o link do túnel Cloudflare.')
        } else {
          setCameraError('Falha ao iniciar a câmera.')
        }
      }
    }

    function scan() {
      if (!videoRef.current || !canvasRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data) {
            handleCode(code.data)
            return
          }
        }
      }
      rafRef.current = requestAnimationFrame(scan)
    }

    async function handleCode(text: string) {
      stopCamera()
      setSubmitting(true)
      try {
        await onResult(text)
      } finally {
        setSubmitting(false)
      }
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
      stopCamera()
    }
  }, [open, onResult])

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  async function handleManual() {
    if (!manual.trim()) return
    setSubmitting(true)
    try {
      await onResult(manual.trim())
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div style={{ pointerEvents: 'auto' }} className="fixed inset-0 z-[70] bg-moss/95 backdrop-blur-md flex flex-col items-center justify-center p-5">
      <button
        onClick={() => {
          stopCamera()
          onClose()
        }}
        className="absolute top-[calc(env(safe-area-inset-top)+20px)] right-5 w-11 h-11 rounded-full bg-cream/10 text-cream grid place-items-center hover:bg-cream/20 transition z-10"
        aria-label="Fechar"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="font-serif text-2xl text-cream mb-2">Valide a mesa</div>
          <p className="text-[13px] text-sand/80 leading-relaxed">
            Aponte a câmera para o <strong>QR Code</strong> ou encoste o celular na <strong>tag NFC</strong> da sua mesa.
          </p>
        </div>

        <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden mb-4">
          {cameraError ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-cream text-sm bg-moss/50">
              <div>
                <Camera className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <div className="mb-2 font-medium">Câmera indisponível</div>
                <div className="text-[11px] text-sand/70">{cameraError}</div>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
                playsInline
                muted
                autoPlay
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {!isReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-cream">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-sand" />
                  <span className="text-xs tracking-widest uppercase">Iniciando câmera…</span>
                </div>
              )}

              {isReady && (
                <>
                  <div className="absolute inset-0 border-4 border-cream/30 rounded-2xl pointer-events-none" />
                  <div className="absolute inset-12 border-2 border-cream/60 rounded-lg pointer-events-none" />
                </>
              )}

              {submitting && (
                <div className="absolute inset-0 bg-black/60 grid place-items-center text-cream text-sm z-20">
                  Validando…
                </div>
              )}
            </>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-[11.5px]">
          <div className="flex items-center gap-2 rounded-xl border border-cream/20 bg-cream/10 px-3 py-2 text-cream">
            <QrCode className="h-4 w-4 flex-shrink-0" />
            <span>{cameraError ? 'Câmera indisponível' : isReady ? 'QR: câmera ativa' : 'QR: iniciando…'}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-cream/20 bg-cream/10 px-3 py-2 text-cream">
            <SmartphoneNfc className={`h-4 w-4 flex-shrink-0 ${nfcState === 'listening' ? 'animate-pulse' : ''}`} />
            <span>{nfcState === 'listening' ? 'NFC: encoste na tag' : nfcState === 'unsupported' ? 'NFC: encoste na tag' : nfcState === 'error' ? 'NFC: indisponível aqui' : 'NFC: iniciando…'}</span>
          </div>
        </div>
        {nfcState === 'unsupported' && (
          <p className="mb-4 text-center text-[11px] leading-relaxed text-sand/70">
            Neste aparelho, encoste o celular na tag da mesa: a página abre sozinha e a validação é concluída.
          </p>
        )}
        {nfcMsg && <p className="mb-4 text-center text-[11px] text-[#FFC9C4]">{nfcMsg}</p>}

        {errorMessage && (
          <div className="mb-4 text-[12px] text-[#FFC9C4] bg-[#B66B65]/40 rounded-lg px-3 py-2 text-center">
            {errorMessage}
          </div>
        )}

        <details className="group">
          <summary className="cursor-pointer list-none text-center text-[11px] text-sand/70 hover:text-sand transition flex items-center justify-center gap-1.5">
            <Keyboard className="w-3 h-3" />
            Digitar código da mesa
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="QR-M01-meetcoffe"
              className="flex-1 px-3 py-2.5 rounded-lg bg-cream/10 border border-cream/20 text-cream text-sm outline-none focus:border-cream/50"
            />
            <button
              onClick={handleManual}
              disabled={!manual.trim() || submitting}
              className="px-4 py-2.5 rounded-lg bg-cream text-moss text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}