import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ShoppingBag, ArrowRight, Plus, Check, QrCode, SmartphoneNfc
} from 'lucide-react'
import {
  fetchProducts, fetchSession, submitOrder, saveMenuView, formatPrice, unitPriceWith, missingSelection, SessionInvalidError,
  type ClosureState, type MenuView, type Product, type SelectionInput, type SessionResponse, type SubmittedOrder, type SummaryEntry,
} from '../lib/api'
import { useOrderDraft } from '../store/orderDraft'
import { cn } from '../lib/cn'
import { Tutorial, TUTORIAL_STORAGE_KEY } from '../components/Tutorial'
import { NewComandaButton } from '../components/NewComandaButton'
import { ComandaSheet, type ConsumedLine, type DraftLine } from '../components/ComandaSheet'
import { ProductOptionsSheet } from '../components/ProductOptionsSheet'
import { CloseFlow } from '../components/CloseFlow'
import { EntryFlow } from '../components/EntryFlow'
import { ListMenu } from '../components/ListMenu'
import { ListProductSheet } from '../components/ListProductSheet'
import { describeDraft, describeSaved } from '../lib/optionsView'
import { getDeviceId, getCustomerName, getMenuView, saveMenuViewLocal, rotateDeviceId } from '../lib/identity'
import { getSocket } from '../lib/socket'
import { uuid } from '../lib/uuid'
import { ArFeedButton } from '../features/ar3d/ArFeedButton' // ar3d

type MediaItem = { type: 'image' | 'video'; src: string }
type ReviewTab = 'novo' | 'enviados'

const FALLBACK_IMAGES = [
  // 1. Morning Ritual
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1400&q=90',
  // 2. Avocado Toast
  'https://images.unsplash.com/photo-1603046891744-1f81b20e7a22?auto=format&fit=crop&w=1400&q=90',
  // 3. Pão de Queijo
  'https://images.unsplash.com/photo-1599140973792-7df5a94ea1c8?auto=format&fit=crop&w=1400&q=90',
  // 4. Coxinha de Frango
  'https://images.unsplash.com/photo-1626082927389-6cd097cee6a6?auto=format&fit=crop&w=1400&q=90',
  // 5. Garden Bowl
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=90',
  // 6. Pasta della Casa
  'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1400&q=90',
  // 7. Escondidinho de Carne Seca
  'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?auto=format&fit=crop&w=1400&q=90',
  // 8. Maison Burger
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=90',
  // 9. Pão na Chapa
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=90',
  // 10. Iced Coffee
  'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=1400&q=90',
  // 11. Suco de Maracujá
  'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1400&q=90',
  // 12. Bolo de Cenoura
  'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=90',
  // 13. Brigadeiro Gourmet
  'https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=1400&q=90',
  // 14. Berry Cheesecake
  'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1400&q=90',
  // 15. Açaí na Tigela
  'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1400&q=90',
  // 16. Tapioca de Coco
  'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?auto=format&fit=crop&w=1400&q=90',
]

const STATUS_LABEL: Record<string, string> = {
  // O cliente não precisa saber a diferença entre "novo" e "em preparo": para ele, enviou = em preparo.
  SENT: 'Em preparo', PREPARING: 'Em preparo', READY: 'Pronto', DELIVERED: 'Finalizado', PAID: 'Pago', CANCELLED: 'Cancelado',
}

/**
 * Enquadramento adaptativo: se a proporção da mídia é parecida com a da área, preenche (cover)
 * com corte mínimo; se for muito diferente, mostra o produto INTEIRO (contain) sobre um fundo
 * desfocado da própria foto, mantendo o visual imersivo sem cortar nem distorcer.
 */
function MediaSlide({ item, alt, eager, videoRef }: {
  item: MediaItem
  alt: string
  eager: boolean
  videoRef: (el: HTMLVideoElement | null) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<'cover' | 'contain'>('contain')

  function decide(w: number, h: number) {
    const box = boxRef.current
    if (!box || !w || !h || !box.clientWidth || !box.clientHeight) return
    const diff = Math.abs(Math.log(w / h / (box.clientWidth / box.clientHeight)))
    setFit(diff < 0.22 ? 'cover' : 'contain') // ~±25% de diferença de proporção
  }

  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain'

  return (
    <div ref={boxRef} className="relative min-w-full h-full overflow-hidden bg-[#1c1c18]">
      {item.type === 'image' ? (
        <>
          {fit === 'contain' && (
            <img src={item.src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-60 pointer-events-none select-none" draggable={false} />
          )}
          <img
            src={item.src}
            alt={alt}
            onLoad={(e) => decide(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            className={cn('relative w-full h-full select-none pointer-events-none', fitClass)}
            loading={eager ? 'eager' : 'lazy'}
            draggable={false}
          />
        </>
      ) : (
        <video
          ref={videoRef}
          src={item.src}
          onLoadedMetadata={(e) => decide(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          muted loop playsInline preload={eager ? 'auto' : 'metadata'}
          className={cn('relative w-full h-full pointer-events-none', fitClass)}
        />
      )}
    </div>
  )
}

const MODAL_OVERLAY = 'fixed inset-0 bg-black/60 backdrop-blur-md'
const MODAL_CARD = 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-40px)] max-w-[340px] rounded-[26px] bg-[#2a1a0e]/85 backdrop-blur-xl border border-white/15 text-white p-5 outline-none'
const BTN_PRIMARY = 'w-full h-11 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed'
const BTN_GHOST = 'w-full h-11 rounded-full border border-white/35 text-white text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60'

/**
 * Cardápio do cliente. A pessoa escolhe UMA VEZ, na entrada da mesa, como quer ver o cardápio (Feed ou Lista);
 * as duas experiências são independentes e compartilham a mesma sessão, o mesmo catálogo, a comanda e a personalização.
 */
export function Cardapio() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [apiCategories, setApiCategories] = useState<string[] | null>(null)
  const [businessName, setBusinessName] = useState('meetcoffe')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [currentProduct, setCurrentProduct] = useState(0)
  const [currentMedia, setCurrentMedia] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1) // sentido da última troca vertical (anima a transição)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [itemAddedToast, setItemAddedToast] = useState<string | null>(null)
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null)
  const [dup, setDup] = useState<{ product: Product; selections: SelectionInput[]; qty: number } | null>(null)
  const bagControls = useAnimation()

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('novo')
  const [submitting, setSubmitting] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successOrderNumber, setSuccessOrderNumber] = useState(0)
  const [successTotal, setSuccessTotal] = useState(0)

  // Encerramento: o estado vem do SERVIDOR, por celular. Nenhuma tela de pagamento nasce do pagamento de outra pessoa.
  const [closeOpen, setCloseOpen] = useState(false)
  const [closure, setClosure] = useState<ClosureState | null>(null)
  const [tableDue, setTableDue] = useState(0)

  const [customerName, setCustomerName] = useState(getCustomerName())
  const [deviceId] = useState(getDeviceId())
  // Formato escolhido na entrada (por celular/comanda). Enquanto não houver escolha, a tela de entrada fica na frente.
  const [menuView, setMenuView] = useState<MenuView | null>(() => getMenuView(getDeviceId()))
  const [listProduct, setListProduct] = useState<Product | null>(null)
  const viewSynced = useRef(false)

  const [submittedOrders, setSubmittedOrders] = useState<SubmittedOrder[]>([])
  const [tableNumber, setTableNumber] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  // Só afirmamos "comanda encerrada" quando o servidor DIZ que a sessão é inválida (401). Falha de rede/servidor é outra coisa.
  const [sessionChecked, setSessionChecked] = useState(false)
  const [othersOpen, setOthersOpen] = useState<number | null>(null)
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [sessionGoogleUrl, setSessionGoogleUrl] = useState<string | null>(null)

  // === RESUMO OFICIAL (vem do backend) ===
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [serviceFeePercent, setServiceFeePercent] = useState(10)

  const draft = useOrderDraft()
  const touchStart = useRef({ x: 0, y: 0 })
  const wheelLock = useRef(false)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  // Dados mais recentes para os handlers de socket/polling (evita reassinar eventos a cada render)
  const latest = useRef({ closure: null as ClosureState | null, tableNumber: null as string | null, sessionId: null as string | null, googleUrl: null as string | null, menuView: null as MenuView | null })
  latest.current = { closure, tableNumber, sessionId, googleUrl: sessionGoogleUrl, menuView }
  const hadSession = useRef(false)
  const leaving = useRef(false)

  // Pedidos ativos
  const activeOrders = submittedOrders.filter((o) => o.status !== 'CANCELLED')

  function showToast(msg: string, ms = 2000) { setToast(msg); setTimeout(() => setToast(null), ms) }

  /** Único caminho para a tela de "obrigado": o pagamento DESTE celular foi confirmado ou a mesa foi encerrada. */
  function leaveToThankYou(amount?: number) {
    if (leaving.current) return
    leaving.current = true
    const l = latest.current
    useOrderDraft.getState().clear()
    rotateDeviceId() // próximo pedido deste aparelho começa uma comanda nova
    navigate('/obrigado', { state: { amount: amount ?? l.closure?.amount ?? 0, tableNumber: l.tableNumber, sessionId: l.sessionId, googleReviewUrl: l.googleUrl } })
  }

  async function refreshSession(): Promise<SessionResponse | null> {
    try {
      const data = await fetchSession(deviceId)
      hadSession.current = true
      setSubmittedOrders(data.orders)
      setTableNumber(data.table.number)
      setSessionId(data.session.id)
      setSessionGoogleUrl(data.business?.googleReviewUrl || null)
      setSummary(data.summary || [])
      setServiceFeePercent(data.serviceFeePercent ?? 10)
      setTableDue(data.tableDue ?? data.totalWithFee ?? 0)
      setClosure(data.closure ?? null)
      setOthersOpen(typeof data.othersOpen === 'number' ? data.othersOpen : null)
      // A escolha de formato é registrada por participante no servidor: se o servidor já tem, vale ela;
      // se só este aparelho tem (ex.: o registro falhou na entrada), registra agora.
      const serverView = data.menuView ?? null
      const localView = latest.current.menuView
      if (serverView && serverView !== localView) { saveMenuViewLocal(deviceId, serverView); setMenuView(serverView) }
      else if (!serverView && localView && !viewSynced.current) {
        viewSynced.current = true
        saveMenuView(localView, deviceId).catch(() => { viewSynced.current = false })
      }
      if (serverView) viewSynced.current = true
      setSessionLoadError(null)
      setSessionChecked(true)
      return data
    } catch (e) {
      setSessionChecked(true)
      if (!(e instanceof SessionInvalidError) && !hadSession.current) setSessionLoadError(e instanceof Error ? e.message : 'Falha ao carregar a sessão')
      // A sessão deixou de existir enquanto este celular aguardava o pagamento: a mesa foi encerrada pela equipe/pagamento.
      if (e instanceof SessionInvalidError && hadSession.current && latest.current.closure) leaveToThankYou()
      else if (e instanceof SessionInvalidError && hadSession.current) { setSessionId(null); setClosure(null) }
      return null
    }
  }

  useEffect(() => {
    fetchProducts().then((data) => { setProducts(data.products); setApiCategories(data.categories ?? null); setBusinessName(data.business.name) })
      .catch((err) => setError(err.message)).finally(() => setLoading(false))
    refreshSession().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // O tutorial explica os gestos do Feed: só aparece depois da entrada e só para quem escolheu o Feed.
  useEffect(() => {
    if (menuView !== 'feed' || !customerName) return
    if (localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'true') {
      const timer = setTimeout(() => setTutorialOpen(true), 600)
      return () => clearTimeout(timer)
    }
  }, [menuView, customerName])

  // Tempo real: qualquer evento só pede ao servidor o estado atual deste celular. Quem decide a tela é o `closure`.
  useEffect(() => {
    if (!sessionId) return
    const socket = getSocket()
    const join = () => socket.emit('join:session', sessionId)
    join()
    socket.on('connect', join)

    const refresh = () => { void refreshSession() }
    const onSessionClosed = (d?: { amount?: number }) => leaveToThankYou(d?.amount)
    const onClosureCancelled = () => { refresh(); showToast('O atendente cancelou o encerramento. Você já pode pedir de novo.', 5000) }
    const onPaymentExpired = (d?: { reason?: string }) => {
      refresh()
      showToast(d?.reason === 'cancelled'
        ? 'Pagamento cancelado na maquininha. Nada foi cobrado.'
        : 'Tempo esgotado: o pagamento não foi concluído.', 6000)
    }
    const onPartialPaid = (d?: { amount?: number; customerName?: string | null; deviceId?: string | null }) => {
      refresh()
      if (d?.deviceId && d.deviceId !== deviceId) showToast(`Pagamento de ${d.customerName || 'outra pessoa'} confirmado. A sua comanda não mudou.`, 4500)
    }
    const events: [string, (...a: any[]) => void][] = [
      ['order_status_changed', refresh], ['closure_requested', refresh], ['closure_paid', refresh],
      ['charge_sent', refresh], ['split_started', refresh],
      ['closure_cancelled', onClosureCancelled], ['session_closed', onSessionClosed],
      ['payment_expired', onPaymentExpired], ['partial_paid', onPartialPaid],
    ]
    for (const [ev, fn] of events) socket.on(ev, fn)
    return () => {
      socket.off('connect', join)
      for (const [ev, fn] of events) socket.off(ev, fn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Rede de segurança: com um encerramento em andamento, confere o estado no servidor a cada poucos segundos
  // (cobre socket caído) e quando o celular volta a ficar visível.
  const hasClosure = !!closure
  useEffect(() => {
    if (!sessionId) return
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSession() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = hasClosure ? setInterval(() => { void refreshSession() }, 4000) : null
    return () => { document.removeEventListener('visibilitychange', onVisible); if (timer) clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hasClosure])

  // O pagamento DESTE celular foi confirmado → obrigado. (Pagamento de outra pessoa nunca chega aqui.)
  useEffect(() => {
    if (closure?.status === 'PAID') leaveToThankYou(closure.amount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closure])

  // Ao abrir a escolha de pagamento, confere o estado atual da mesa (quem ainda está em aberto decide se "Mesa toda" existe)
  useEffect(() => { if (closeOpen) void refreshSession() }, [closeOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rede de segurança de toque: o Radix bloqueia a página (body { pointer-events: none }) enquanto um modal está aberto.
  // Se dois modais abrem/fecham no mesmo instante esse bloqueio pode ficar preso e "nada clica". Sem modal aberto, solta.
  const anyModalOpen = !!dup || confirmOpen || successOpen || reviewOpen || !!optionsProduct || !!listProduct || tutorialOpen
  useEffect(() => {
    if (anyModalOpen) return
    const t = setTimeout(() => { if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '' }, 500)
    return () => clearTimeout(t)
  }, [anyModalOpen])

  // Há encerramento em andamento: a sacola e o seletor de pagamento saem da frente da tela de espera
  useEffect(() => {
    if (closure) { setReviewOpen(false); setCloseOpen(false); setOptionsProduct(null); setListProduct(null); setConfirmOpen(false); setDup(null) }
  }, [closure])

  useEffect(() => {
    if (!reviewOpen) return
    if (draft.count() > 0) setReviewTab('novo')
    else if (activeOrders.some((o) => o.deviceId === deviceId)) setReviewTab('enviados')
    else setReviewTab('novo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewOpen])

  // Pega a primeira imagem do array para usar como thumbnail
  function resolveImage(p: Product | undefined | null): string {
    if (!p) return FALLBACK_IMAGES[0]
    if (p.images && p.images.length > 0) return p.images[0]
    const idx = products.findIndex((x) => x.id === p.id)
    return FALLBACK_IMAGES[(idx >= 0 ? idx : 0) % FALLBACK_IMAGES.length]
  }

  // Ordem e nomes vêm das categorias do negócio; só aparecem as que têm produto ativo.
  const categories = useMemo(() => {
    const used = new Set(products.map((p) => p.category))
    const ordered = (apiCategories ?? []).filter((c) => used.has(c))
    for (const c of used) if (!ordered.includes(c)) ordered.push(c)
    return ['Todos', ...ordered]
  }, [products, apiCategories])
  const filtered = useMemo(() => selectedCategory === 'Todos' ? products : products.filter((p) => p.category === selectedCategory), [products, selectedCategory])
  useEffect(() => { setDirection(1); setCurrentProduct(0); setCurrentMedia(0) }, [selectedCategory])
  const product = filtered[currentProduct]

  // Monta o carrossel com todas as imagens + vídeo
  const media = useMemo<MediaItem[]>(() => {
    if (!product) return []
    const items: MediaItem[] = []
    
    // Adiciona as fotos reais se existirem
    if (product.images && product.images.length > 0) {
      product.images.forEach(img => items.push({ type: 'image', src: img }))
    } else {
      // Se não tiver fotos, usa o fallback
      items.push({ type: 'image', src: FALLBACK_IMAGES[currentProduct % FALLBACK_IMAGES.length] })
    }

    // Adiciona o vídeo no final, se existir
    if (product.videoPath) {
      items.push({ type: 'video', src: product.videoPath })
    }
    
    return items
  }, [product, currentProduct])

  useEffect(() => { setCurrentMedia(0) }, [currentProduct])

  useEffect(() => {
    if (!product) return
    media.forEach((m, i) => {
      if (m.type !== 'video') return
      const v = videoRefs.current[`${product.id}-${i}`]
      if (v) { if (i === currentMedia) v.play().catch(() => {}); else v.pause() }
    })
  }, [currentMedia, product, media])

  function commitAdd(p: Product, selections: SelectionInput[]) {
    draft.add(p.id, selections)
    bagControls.start({ scale: [1, 1.25, 1, 1.15, 1], rotate: [0, -10, 10, -10, 0], transition: { duration: 0.5, ease: "easeInOut" } })
    setItemAddedToast(`${p.name} adicionado`)
    if ((window as any).addedToastTimer) clearTimeout((window as any).addedToastTimer)
    ;(window as any).addedToastTimer = setTimeout(() => setItemAddedToast(null), 3000)
  }

  // Item idêntico (mesmo produto e mesmas escolhas) já na lista: pede confirmação antes de somar de novo
  function addWithSelections(p: Product, selections: SelectionInput[]) {
    const existing = draft.find(p.id, selections)
    if (existing) setDup({ product: p, selections, qty: existing.qty })
    else commitAdd(p, selections)
  }

  // Produto com opções (kit, sabor, recheio) abre a escolha; sem opções entra direto
  function requestAdd(p: Product) {
    if (p.optionGroups && p.optionGroups.length > 0) setOptionsProduct(p)
    else addWithSelections(p, [])
  }

  // LISTA: toque no item abre o produto aqui mesmo; o "+" adiciona direto o que não tem opções.
  function quickAddFromList(p: Product) {
    if (p.optionGroups && p.optionGroups.length > 0) setListProduct(p)
    else addWithSelections(p, [])
  }

  function nextProduct() { if (currentProduct < filtered.length - 1) { setDirection(1); setCurrentProduct(currentProduct + 1) } }
  function prevProduct() { if (currentProduct > 0) { setDirection(-1); setCurrentProduct(currentProduct - 1) } }
  // Seta lateral: avança e volta à primeira ao passar da última
  function nextMediaLoop() { if (media.length > 1) setCurrentMedia((currentMedia + 1) % media.length) }
  // Gesto horizontal: só troca a mídia do produto atual, sem dar a volta
  function swipeMedia(step: 1 | -1) {
    const next = currentMedia + step
    if (next >= 0 && next < media.length) setCurrentMedia(next)
  }

  // Vertical => muda o produto. Horizontal => muda só a mídia. Gestos que começam nas categorias são ignorados.
  const gestureIgnored = useRef(false)
  function onTouchStart(e: React.TouchEvent) {
    gestureIgnored.current = !e.currentTarget.contains(e.target as Node) || !!(e.target as HTMLElement).closest('[data-no-swipe]')
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (gestureIgnored.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -60) nextProduct(); else if (dy > 60) prevProduct()
    } else if (Math.abs(dx) > 50) {
      swipeMedia(dx < 0 ? 1 : -1)
    }
  }
  function onWheel(e: React.WheelEvent) {
    if (!e.currentTarget.contains(e.target as Node)) return
    if (reviewOpen || tutorialOpen || confirmOpen || successOpen || closeOpen || !!closure || !!optionsProduct || wheelLock.current) return
    if (Math.abs(e.deltaY) < 15) return
    wheelLock.current = true
    if (e.deltaY > 0) nextProduct(); else prevProduct()
    setTimeout(() => { wheelLock.current = false }, 450)
  }

  const draftTotal = draft.lines.reduce((sum, l) => { const p = products.find((x) => x.id === l.productId); return p ? sum + unitPriceWith(p, l.selections) * l.qty : sum }, 0)
  // As notificações (item adicionado / aviso) ficam no rodapé: sobe o bloco nome/descrição/botões para não ficar por baixo delas
  const noticeLift = itemAddedToast && toast ? 76 : itemAddedToast ? 28 : toast ? 24 : 0
  // Na Lista, a barra "Ver comanda" ocupa o rodapé: os avisos sobem acima dela
  const toastBase = menuView === 'list' && draft.count() > 0 ? 82 : 14

  function handleStartOrder() {
    if (draft.lines.length === 0) return
    setPendingIdempotencyKey(uuid())
    setConfirmOpen(true)
  }

  async function handleConfirmOrder() {
    if (draft.lines.length === 0 || !pendingIdempotencyKey) return
    // Confere as escolhas obrigatórias antes de enviar (o servidor valida de novo)
    for (const l of draft.lines) {
      const p = products.find((x) => x.id === l.productId)
      const miss = p ? missingSelection(p.optionGroups, l.selections) : null
      if (miss) { showToast(`${p?.name}: escolha ${miss}`, 3500); setConfirmOpen(false); setReviewOpen(true); return }
    }
    setSubmitting(true)
    try {
      const items = draft.lines.map((l) => ({ productId: l.productId, quantity: l.qty, observations: l.observations, selections: l.selections.length ? l.selections : undefined }))
      const submittedTotal = draftTotal
      await submitOrder(items, pendingIdempotencyKey, customerName, deviceId)
      draft.clear()
      const data = await refreshSession()
      setSuccessOrderNumber(data?.orders.length ?? submittedOrders.length + 1)
      setSuccessTotal(submittedTotal)
      setPendingIdempotencyKey(null)
      setConfirmOpen(false); setReviewOpen(false); setSuccessOpen(true)
    } catch (err: any) {
      if (err?.code === 'TABLE_CLOSING' || err?.code === 'DEVICE_CLOSED') { setConfirmOpen(false); void refreshSession() }
      showToast(err.message ?? 'Erro ao enviar', 4000)
    } finally { setSubmitting(false) }
  }

  function handleCancelConfirm() { setConfirmOpen(false); setPendingIdempotencyKey(null); setReviewOpen(true) }

  if (loading || !sessionChecked) return <div className="flex items-center justify-center h-full text-coffee text-sm">Carregando cardápio…</div>

  if (!sessionId && sessionLoadError) {
    return (
      <div role="alert" className="h-screen bg-cream flex flex-col items-center justify-center gap-4 px-8 text-center text-coffee text-sm">
        <div>Não foi possível carregar a sua comanda agora.<br /><span className="text-xs opacity-70">{sessionLoadError}. Se continuar, chame um atendente.</span></div>
        <button onClick={() => window.location.reload()} className="min-h-12 px-6 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest">Tentar novamente</button>
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="h-screen bg-cream flex flex-col items-center justify-center p-6 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-24 h-24 bg-sand rounded-full flex items-center justify-center mb-6 text-olive"><QrCode className="w-10 h-10" /></motion.div>
        <h2 className="font-serif text-2xl text-moss mb-2">Comanda Encerrada</h2>
        <p className="text-sm text-coffee mb-8 max-w-xs">Obrigado pela visita! Esperamos ver você em breve.</p>
        <div className="bg-warm-white border border-sand rounded-2xl p-6 max-w-sm w-full shadow-sm">
          <div className="flex items-center justify-center gap-2 text-moss font-bold text-[11px] uppercase tracking-widest mb-3"><SmartphoneNfc className="w-4 h-4" /> Abrir Nova Comanda</div>
          <p className="text-xs text-coffee leading-relaxed">Para fazer um novo pedido, aproxime seu celular da tag <strong>NFC</strong> na mesa ou escaneie o <strong>QR Code</strong> fixo.</p>
          <NewComandaButton className="mt-5 w-full min-h-12 px-6 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition">
            <SmartphoneNfc className="w-4 h-4" /> Abrir nova comanda
          </NewComandaButton>
        </div>
      </div>
    )
  }

  if (error) return (
    <div role="alert" className="flex flex-col items-center justify-center gap-4 h-full px-8 text-center text-coffee text-sm">
      <div>Não foi possível carregar o cardápio.<br /><span className="text-xs opacity-70">{error}</span></div>
      <button onClick={() => window.location.reload()} className="min-h-12 px-6 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest">Tentar novamente</button>
    </div>
  )
  if (!product) return <div className="flex items-center justify-center h-full px-8 text-center text-coffee text-sm">Nenhum produto disponível no momento.</div>

  const gated = !closure && (!customerName || !menuView)

  const draftLines: DraftLine[] = draft.lines.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId)
    return p ? [{ id: l.id, name: p.name, description: p.description, price: unitPriceWith(p, l.selections), image: resolveImage(p), qty: l.qty, options: describeDraft(p, l.selections) }] : []
  })
  // Minha comanda: somente os pedidos feitos por ESTE aparelho (histórico, sem alterar o registro original)
  const consumedLines: ConsumedLine[] = activeOrders
    .filter((o) => o.deviceId === deviceId)
    .flatMap((o) =>
      o.items.map((it) => {
        const p = products.find((x) => x.id === it.productId)
        return {
          key: it.id, name: it.name, description: p?.description ?? null, image: resolveImage(p),
          quantity: it.quantity, unitPrice: it.unitPrice, subtotal: it.subtotal,
          status: STATUS_LABEL[o.status] ?? o.status, observations: it.observations,
          options: describeSaved(it.selections),
        }
      }),
    )
  const myEntry = summary.find((e) => e.deviceId === deviceId)
  const mySubtotal = myEntry?.subtotal ?? 0
  const myTotal = myEntry?.totalWithFee ?? 0
  const myFee = Math.max(0, myTotal - mySubtotal)

  const slideVariants = {
    enter: (d: number) => ({ y: d > 0 ? '100%' : '-100%' }),
    center: { y: 0 },
    exit: (d: number) => ({ y: d > 0 ? '-100%' : '100%' }),
  }

  return (
    <div className="h-dvh bg-[#0f0e0c] overflow-hidden">
    <div
      className="relative h-full mx-auto max-w-[480px] overflow-hidden bg-black select-none"
      style={menuView === 'feed' ? { touchAction: 'none' } : undefined}
      onTouchStart={menuView === 'feed' ? onTouchStart : undefined}
      onTouchEnd={menuView === 'feed' ? onTouchEnd : undefined}
      onWheel={menuView === 'feed' ? onWheel : undefined}
    >
      {/* MODAL: Item idêntico já adicionado (só Novos pedidos) */}
      <Dialog.Root open={!!dup} onOpenChange={(o) => !o && setDup(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={cn(MODAL_OVERLAY, 'z-[59]')} />
          <Dialog.Content className={cn(MODAL_CARD, 'z-[60]')} aria-describedby={undefined}>
            <Dialog.Title className="text-[19px] font-bold tracking-tight">Você já adicionou este item</Dialog.Title>
            <p className="mt-1.5 mb-4 text-[13px] leading-relaxed text-white/70">
              {dup ? `${dup.product.name}${describeDraft(dup.product, dup.selections).length ? ` (${describeDraft(dup.product, dup.selections).join(' · ')})` : ''} já está nos seus novos pedidos (${dup.qty}×). Quer adicionar mais uma unidade?` : ''}
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setDup(null)} className={cn(BTN_GHOST, 'flex-1')}>Cancelar</button>
              <button onClick={() => { if (dup) commitAdd(dup.product, dup.selections); setDup(null) }} className={cn(BTN_PRIMARY, 'flex-1')}>Adicionar mais</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {menuView === 'feed' && (<>
      {/* CABEÇALHO: nome + categorias sobre a própria fotografia */}
      <header className="absolute inset-x-0 top-0 z-30 pointer-events-none pt-[calc(env(safe-area-inset-top)+12px)] pb-8 bg-gradient-to-b from-black/60 via-black/25 to-transparent">
        <div className="px-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[19px] leading-none font-medium tracking-tight text-white drop-shadow-sm">{businessName}</div>
            {(tableNumber || customerName) && (
              <div className="mt-1 text-[10.5px] tracking-wide text-white/65">
                {tableNumber ? `Mesa ${tableNumber}` : ''}{tableNumber && customerName ? ' · ' : ''}{customerName}
              </div>
            )}
          </div>
        </div>
        <nav data-no-swipe className="pointer-events-auto mt-3 px-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Categorias">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={selectedCategory === cat}
              className={cn(
                'flex-shrink-0 h-10 px-4 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors backdrop-blur-[2px]',
                selectedCategory === cat
                  ? 'bg-[#F5F1E8] border-[#F5F1E8] text-[#1f1a14]'
                  : 'bg-black/10 border-white/35 text-white hover:bg-white/10',
              )}
            >{cat}</button>
          ))}
        </nav>
      </header>

      {/* FEED: um produto por vez, tela cheia */}
      <main className="absolute inset-0">
        <AnimatePresence initial={false} custom={direction}>
          <motion.article
            key={product.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 overflow-hidden"
          >
            {/* Mídia: preenche a tela inteira, sem moldura */}
            <div className="absolute inset-0 overflow-hidden bg-[#1c1c18]">
              <div className="flex h-full transition-transform duration-[450ms] ease-[cubic-bezier(0.2,0.75,0.25,1)]" style={{ transform: `translateX(-${currentMedia * 100}%)` }}>
                {media.map((m, i) => (
                  <MediaSlide
                    key={`${product.id}-${i}`}
                    item={m}
                    alt={product.name}
                    eager={i === 0}
                    videoRef={(el) => { videoRefs.current[`${product.id}-${i}`] = el }}
                  />
                ))}
              </div>
            </div>

            {/* Gradiente inferior para legibilidade */}
            <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />

            {/* Seta circular: próxima mídia deste produto */}
            {media.length > 1 && (
              <button
                onClick={nextMediaLoop}
                aria-label="Próxima foto ou vídeo"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white grid place-items-center active:scale-95 transition"
              >
                <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
              </button>
            )}

            {/* Informações + ações */}
            <motion.div animate={{ y: -noticeLift }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom)+48px)] pointer-events-none">
              <h1 className="text-[25px] leading-[1.1] font-bold tracking-tight text-white drop-shadow-sm break-words">{product.name}</h1>
              {product.description && (
                <p className="mt-1.5 text-[13px] leading-snug text-white/80 max-w-[85%] line-clamp-2">{product.description}</p>
              )}
              <div className="mt-2.5 text-[21px] leading-none font-bold tracking-tight text-white">{formatPrice(product.price)}</div>

              <div className="mt-3.5 flex items-center gap-2.5 pointer-events-auto">
                <button
                  onClick={() => requestAdd(product)}
                  className="flex-1 h-11 rounded-full border border-white/50 bg-white/10 backdrop-blur-md text-white text-[13.5px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <span className="w-5 h-5 rounded-full bg-white text-[#1f1a14] grid place-items-center"><Plus className="w-3.5 h-3.5" strokeWidth={2.6} /></span>
                  Adicionar à comanda
                </button>
                <ArFeedButton productId={product.id} productName={product.name} /> {/* ar3d */}
                <motion.button
                  animate={bagControls}
                  onClick={() => { setReviewOpen(true); setItemAddedToast(null) }}
                  aria-label={draft.count() > 0 ? `Abrir comanda (${draft.count()} itens)` : 'Abrir comanda'}
                  className="relative flex-shrink-0 w-11 h-11 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-white grid place-items-center active:scale-95 transition"
                >
                  <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.5} />
                  {draft.count() > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[10px] font-bold grid place-items-center">{draft.count()}</span>
                  )}
                </motion.button>
              </div>
            </motion.div>

            {/* Paginação das mídias */}
            {media.length > 1 && (
              <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6px)] z-20 flex justify-center items-center pointer-events-none" role="tablist" aria-label="Fotos e vídeo do produto">
                {media.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentMedia(i)}
                    role="tab"
                    aria-selected={i === currentMedia}
                    aria-label={`Mídia ${i + 1} de ${media.length}`}
                    className="pointer-events-auto px-2.5 py-4"
                  >
                    <span className={cn('block h-1.5 rounded-full transition-all duration-300', i === currentMedia ? 'w-6 bg-white' : 'w-1.5 bg-white/45')} />
                  </button>
                ))}
              </div>
            )}
          </motion.article>
        </AnimatePresence>
      </main>
      </>)}

      {/* LISTA: experiência própria (não depende do Feed) */}
      {menuView === 'list' && (
        <ListMenu
          businessName={businessName}
          tableNumber={tableNumber}
          customerName={customerName}
          products={products}
          categories={categories.filter((c) => c !== 'Todos')}
          imageOf={resolveImage}
          draftCount={draft.count()}
          draftTotal={draftTotal}
          onOpenProduct={setListProduct}
          onQuickAdd={quickAddFromList}
          onOpenComanda={() => { setReviewOpen(true); setItemAddedToast(null) }}
        />
      )}

      {/* ESCOLHAS DO PRODUTO: kit, sabor, recheio */}
      <ProductOptionsSheet
        product={optionsProduct}
        onClose={() => setOptionsProduct(null)}
        onConfirm={(p, selections) => { setOptionsProduct(null); addWithSelections(p, selections) }}
      />
      <ListProductSheet
        product={listProduct}
        imageOf={resolveImage}
        onClose={() => setListProduct(null)}
        onConfirm={(p, selections) => { setListProduct(null); addWithSelections(p, selections) }}
      />

      {/* SACOLA: Novos pedidos + Minha comanda */}
      <ComandaSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        tab={reviewTab}
        onTabChange={setReviewTab}
        backdropImage={resolveImage(product)}
        businessName={businessName}
        tableNumber={tableNumber}
        customerName={customerName}
        draftLines={draftLines}
        draftSubtotal={draftTotal}
        serviceFeePercent={serviceFeePercent}
        submitting={submitting}
        onSetQty={(id, qty) => draft.setQty(id, qty)}
        onRemove={(id) => draft.remove(id)}
        onSend={handleStartOrder}
        consumed={consumedLines}
        mySubtotal={mySubtotal}
        myFee={myFee}
        myTotal={myTotal}
        onCloseTab={() => { setReviewOpen(false); setCloseOpen(true) }}
      />

      {/* MODAL: Confirmar pedido */}
      <Dialog.Root open={confirmOpen} onOpenChange={(o) => !o && handleCancelConfirm()}>
        <Dialog.Portal>
          <Dialog.Overlay className={cn(MODAL_OVERLAY, 'z-[55]')} />
          <Dialog.Content className={cn(MODAL_CARD, 'z-[56]')} aria-describedby={undefined}>
            <Dialog.Title className="text-[20px] font-bold tracking-tight">Enviar pedido</Dialog.Title>
            <p className="mt-1 mb-4 text-[12.5px] text-white/65">
              {tableNumber ? `Mesa ${tableNumber} · ` : ''}{customerName} · {draftLines.length} {draftLines.length === 1 ? 'item' : 'itens'}
            </p>
            <ul className="rounded-[18px] border border-white/12 bg-white/[0.05] px-3 py-2.5 mb-3 max-h-52 overflow-y-auto flex flex-col gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {draftLines.map((l) => (
                <li key={l.id} className="flex items-start gap-2.5">
                  <img src={l.image} alt={l.name} className="w-9 h-9 rounded-lg object-cover bg-black/30 flex-shrink-0" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] break-words">{l.qty}× {l.name}</div>
                    {l.options.map((o) => <div key={o} className="text-[11px] leading-snug text-white/60 break-words">{o}</div>)}
                  </div>
                  <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums">{formatPrice(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between mb-4 px-1">
              <span className="text-[14px] text-white/75">Total</span>
              <strong className="text-[22px] font-bold tracking-tight tabular-nums">{formatPrice(draftTotal)}</strong>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleConfirmOrder} disabled={submitting} className={BTN_PRIMARY}>
                {submitting ? 'Enviando…' : (<><Check className="w-4 h-4" strokeWidth={2} /> Confirmar pedido</>)}
              </button>
              <button onClick={handleCancelConfirm} disabled={submitting} className={BTN_GHOST}>Cancelar</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* MODAL: Sucesso */}
      <Dialog.Root open={successOpen} onOpenChange={setSuccessOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={cn(MODAL_OVERLAY, 'z-[65]')} />
          <Dialog.Content className={cn(MODAL_CARD, 'z-[66] text-center px-6 py-7')} aria-describedby={undefined}>
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.05 }} className="w-14 h-14 rounded-full bg-[#7b6a46]/80 text-white grid place-items-center mx-auto mb-4"><Check className="w-7 h-7" strokeWidth={1.8} /></motion.div>
            <Dialog.Title className="text-[22px] font-bold tracking-tight">Pedido enviado!</Dialog.Title>
            <p className="mt-1.5 text-[13px] text-white/75">{tableNumber ? `Mesa ${tableNumber} · ` : ''}Pedido #{successOrderNumber} · {formatPrice(successTotal)}</p>
            <p className="mt-1 mb-5 text-[12px] leading-relaxed text-white/55">A cozinha já foi notificada. Acompanhe o status na sua comanda.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setSuccessOpen(false); setReviewTab('enviados'); setReviewOpen(true) }} className={BTN_PRIMARY}>Acompanhar pedido</button>
              <button onClick={() => setSuccessOpen(false)} className={BTN_GHOST}>Continuar pedindo</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ENCERRAR COMANDA: transição branca → individual/mesa → forma de pagamento → espera */}
      <CloseFlow
        open={closeOpen}
        onClose={() => { setCloseOpen(false); setReviewTab('enviados'); setReviewOpen(true) }}
        closure={closure}
        deviceId={deviceId}
        customerName={customerName}
        tableNumber={tableNumber}
        myTotal={myTotal}
        tableDue={tableDue}
        canCloseTable={othersOpen === null || othersOpen > 0}
        onSubmitted={async () => { await refreshSession() }}
      />

      {/* Notificação: item adicionado */}
      <AnimatePresence>
        {itemAddedToast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            onClick={() => { setItemAddedToast(null); setReviewTab('novo'); setReviewOpen(true) }}
            style={{ bottom: `calc(env(safe-area-inset-bottom) + ${toastBase}px)` }}
            className="fixed left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-32px)] max-w-[440px] rounded-full bg-[#2a1a0e]/80 backdrop-blur-xl border border-white/15 text-white pl-2.5 pr-2 py-2 flex items-center gap-3 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-full bg-[#7b6a46]/80 grid place-items-center flex-shrink-0"><Check className="w-4 h-4" strokeWidth={2} /></span>
            <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{itemAddedToast}</span>
            <span className="h-8 px-3.5 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[12px] font-semibold grid place-items-center flex-shrink-0">Ver comanda</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notificação: erro / aviso */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            style={{ bottom: `calc(env(safe-area-inset-bottom) + ${toastBase + (itemAddedToast ? 62 : 0)}px)` }}
            className="fixed left-1/2 -translate-x-1/2 z-[80] max-w-[calc(100%-32px)] rounded-full bg-[#2a1a0e]/85 backdrop-blur-xl border border-white/15 text-white text-[13px] px-5 py-3 pointer-events-none text-center"
          >{toast}</motion.div>
        )}
      </AnimatePresence>

      {tutorialOpen && menuView === 'feed' && <Tutorial onClose={() => setTutorialOpen(false)} />}

      {/* ENTRADA: nome (se faltar) → "Como deseja visualizar nosso cardápio?" — obrigatória, uma vez por comanda */}
      <AnimatePresence>
        {gated && (
          <EntryFlow
            key="entry"
            businessName={businessName}
            tableNumber={tableNumber}
            deviceId={deviceId}
            needName={!customerName}
            initialName={customerName}
            onComplete={({ name, view }) => { setCustomerName(name); setMenuView(view); viewSynced.current = true }}
          />
        )}
      </AnimatePresence>
    </div>
    </div>
  )
}
