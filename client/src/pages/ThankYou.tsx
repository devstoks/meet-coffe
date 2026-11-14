import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, QrCode, SmartphoneNfc, Star, ExternalLink, Send } from 'lucide-react'
import { formatPrice } from '../lib/api'
import { cn } from '../lib/cn'
import { Stage, Brand, GLASS, BTN_PRIMARY, BTN_GHOST, IconBadge } from '../components/Stage'
import { NewComandaButton } from '../components/NewComandaButton'

export function ThankYou() {
  const location = useLocation()
  const [closed, setClosed] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [googleUrl, setGoogleUrl] = useState<string | null>(null)

  const amount = location.state?.amount || 0
  const tableNumber = location.state?.tableNumber || ''
  const sessionId = location.state?.sessionId || null
  const passedGoogleUrl = location.state?.googleReviewUrl || null

  function handleClose() {
    window.close()
    setTimeout(() => setClosed(true), 500)
  }

  async function handleSubmitRating() {
    if (!sessionId || rating === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/session/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, rating, comment }),
      })
      if (res.ok) {
        const data = await res.json()
        setGoogleUrl(data.googleReviewUrl || passedGoogleUrl)
        setSubmitted(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // TELA: Fallback
  if (closed) {
    return (
      <Stage>
        <Brand className="mb-8" />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn(GLASS, 'w-full max-w-[340px] p-6 flex flex-col items-center')}>
          <div className="mb-4"><IconBadge><QrCode className="w-7 h-7" strokeWidth={1.5} /></IconBadge></div>
          <h2 className="text-[22px] font-bold tracking-tight mb-1.5">Comanda encerrada</h2>
          <p className="text-[13px] text-white/65 mb-5 leading-relaxed">Obrigado pela visita! Esperamos ver você em breve.</p>
          <div className="w-full rounded-[20px] border border-white/12 bg-white/[0.05] p-4 text-left">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[2px] text-white/60 font-bold mb-2">
              <SmartphoneNfc className="w-4 h-4" /> Abrir nova comanda
            </div>
            <p className="text-[12.5px] text-white/65 leading-relaxed">
              Para fazer um novo pedido, aproxime seu celular da tag <strong className="text-white">NFC</strong> na mesa ou escaneie o <strong className="text-white">QR Code</strong> fixo.
            </p>
            <NewComandaButton className={cn(BTN_PRIMARY, 'mt-4')}>
              <SmartphoneNfc className="w-4 h-4" /> Abrir nova comanda
            </NewComandaButton>
          </div>
        </motion.div>
      </Stage>
    )
  }

  return (
    <Stage>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="mb-5"
      >
        <IconBadge tone="success"><CheckCircle2 className="w-8 h-8" strokeWidth={1.6} /></IconBadge>
      </motion.div>

      <h1 className="text-[28px] font-bold tracking-tight mb-1.5">Obrigado!</h1>
      <p className="text-[13.5px] text-white/65 mb-6 max-w-xs leading-relaxed">
        {amount > 0
          ? <>Pagamento de <strong className="text-white">{formatPrice(amount)}</strong>{tableNumber ? ` · Mesa ${tableNumber}` : ''} aprovado.</>
          : <>Comanda encerrada{tableNumber ? ` · Mesa ${tableNumber}` : ''}.</>}
      </p>

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="rating"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(GLASS, 'p-6 w-full max-w-[360px]')}
          >
            <div className="text-[10px] uppercase tracking-[3px] text-white/45 font-bold mb-1">Avaliação</div>
            <h2 className="text-[19px] font-bold tracking-tight mb-5 leading-tight">Como foi sua experiência?</h2>

            <div className="flex justify-center gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition active:scale-90"
                >
                  <Star
                    className={cn(
                      'w-9 h-9 transition',
                      (hoverRating || rating) >= star ? 'fill-[#E8A317] text-[#E8A317]' : 'text-white/25'
                    )}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>

            {rating > 0 ? (
              <>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Deixe um comentário (opcional)"
                  rows={3}
                  className="w-full mb-4 px-4 py-3 rounded-[18px] border border-white/20 bg-white/[0.06] text-[14px] text-white placeholder:text-white/40 outline-none focus:border-white/50 transition resize-none"
                />
                <button onClick={handleSubmitRating} disabled={submitting} className={BTN_PRIMARY}>
                  <Send className="w-4 h-4" />
                  {submitting ? 'Enviando…' : 'Enviar avaliação'}
                </button>
              </>
            ) : (
              <p className="text-[12px] text-white/50 text-center">Toque nas estrelas para avaliar</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="thanks"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(GLASS, 'p-6 w-full max-w-[360px]')}
          >
            <div className="mb-3 flex justify-center"><IconBadge><CheckCircle2 className="w-7 h-7" strokeWidth={1.5} /></IconBadge></div>
            <h2 className="text-[20px] font-bold tracking-tight mb-2">Obrigado pelo feedback!</h2>

            <p className="text-[13px] text-white/65 leading-relaxed mb-5">
              {rating >= 4
                ? 'Ficamos felizes que tenha gostado! Nos ajude compartilhando sua experiência no Google também?'
                : 'Vamos trabalhar para melhorar! Se quiser, deixe sua opinião no Google também.'}
            </p>

            <div className="flex flex-col gap-2">
              {googleUrl && (
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                  <ExternalLink className="w-4 h-4" />
                  Avaliar no Google
                </a>
              )}
              <button onClick={handleClose} className={BTN_GHOST}>Fechar página</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Stage>
  )
}
