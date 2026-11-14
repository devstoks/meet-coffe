import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ChevronLeft, ChevronRight, Play, Plus, Trash2, Star, Video as VideoIcon, Save, ArrowLeft, AlertCircle, CheckCircle2, Crop,
} from 'lucide-react'
import {
  fetchAdminProducts, fetchCategories, createProduct, createCategory, updateProduct, deleteProduct,
  uploadProductImages, removeProductImage, reorderProductImages, uploadProductVideo, removeProductVideo,
  type AdminProduct, type AdminCategory,
} from '../lib/admin'
import { formatCents, type OptionGroup } from '../lib/api'
import { cn } from '../lib/cn'
import { PhotoCropper, type CroppedPhoto } from '../components/PhotoCropper'
import { ProductOptionsEditor, optionGroupsProblem } from '../components/ProductOptionsEditor'
import { MoneyInput } from '../components/MoneyInput'

type MediaItem = { type: 'image' | 'video'; src: string }

const MAX_IMAGES = 3
const MAX_VIDEO_MB = 30
const NEW_CATEGORY = '__new__'

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('rounded-2xl border border-sand bg-warm-white p-5 sm:p-6 min-w-0', className)}>
      <header className="mb-4">
        <h2 className="text-[15px] font-semibold text-moss">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-coffee/75">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}

function isPortraitVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { resolve(v.videoHeight >= v.videoWidth); URL.revokeObjectURL(url) }
    v.onerror = () => { resolve(true); URL.revokeObjectURL(url) }
    v.src = url
  })
}

/**
 * Mesma página para CRIAR (/admin/produtos/novo) e EDITAR (/admin/produtos/:id).
 * Na criação, fotos e vídeo ficam locais e são enviados logo após o produto ser criado.
 */
export function AdminProductDetail() {
  const { productId } = useParams()
  // A rota /admin/produtos/novo não tem :productId, então "sem id" também significa criação
  const isNew = !productId || productId === 'novo'
  const navigate = useNavigate()

  const [product, setProduct] = useState<AdminProduct | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // formulário
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceCents, setPriceCents] = useState(0) // sempre em centavos inteiros
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState(true)
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([])
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // mídia local (só na criação)
  const [pendingImages, setPendingImages] = useState<CroppedPhoto[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [pendingVideo, setPendingVideo] = useState<File | null>(null)
  const pendingImageUrls = useMemo(() => pendingImages.map((p) => URL.createObjectURL(p.file)), [pendingImages])
  const pendingVideoUrl = useMemo(() => (pendingVideo ? URL.createObjectURL(pendingVideo) : null), [pendingVideo])
  useEffect(() => () => { pendingImageUrls.forEach((u) => URL.revokeObjectURL(u)) }, [pendingImageUrls])
  useEffect(() => () => { if (pendingVideoUrl) URL.revokeObjectURL(pendingVideoUrl) }, [pendingVideoUrl])

  const [sel, setSel] = useState(0)
  const [saving, setSaving] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null)
  const [cropFiles, setCropFiles] = useState<File[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string, tone: 'ok' | 'warn' = 'ok') {
    setToast({ msg, tone })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), tone === 'warn' ? 6000 : 2500)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const fillForm = useCallback((p: AdminProduct) => {
    setName(p.name)
    setDescription(p.description ?? '')
    setPriceCents(Math.round(p.price * 100))
    setCategoryId(p.categoryId ?? '')
    setActive(p.active)
    setOptionGroups(p.optionGroups ?? [])
  }, [])

  const load = useCallback(async (resetForm: boolean) => {
    try {
      const cats = await fetchCategories() // vincula produtos antigos às categorias antes de listar
      setCategories(cats.categories)
      if (!productId || productId === 'novo') { setLoadError(null); return }
      const data = await fetchAdminProducts()
      const found = data.products.find((p) => p.id === productId) ?? null
      setProduct(found)
      if (found && resetForm) fillForm(found)
      setLoadError(found ? null : 'Produto não encontrado.')
    } catch (err: any) {
      setLoadError(err?.message || 'Falha ao carregar os dados')
    } finally {
      setLoading(false)
    }
  }, [productId, fillForm])

  useEffect(() => { load(true) }, [load])

  // Visão única da mídia: local na criação, do servidor na edição
  const images = isNew ? pendingImageUrls : (product?.images ?? [])
  const videoSrc = isNew ? pendingVideoUrl : (product?.videoPath ?? null)

  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = images.map((src) => ({ type: 'image', src }))
    if (videoSrc) items.push({ type: 'video', src: videoSrc })
    return items
  }, [images, videoSrc])

  // a mídia selecionada nunca fica fora da lista (ex.: depois de remover)
  useEffect(() => { if (sel > 0 && sel >= media.length) setSel(Math.max(0, media.length - 1)) }, [media.length, sel])

  const dirty = isNew || (!!product && (
    name !== product.name ||
    description !== (product.description ?? '') ||
    priceCents !== Math.round(product.price * 100) ||
    categoryId !== (product.categoryId ?? '') ||
    active !== product.active ||
    JSON.stringify(optionGroups) !== JSON.stringify(product.optionGroups ?? [])
  ))

  function validate(): string | null {
    if (!name.trim() || !(priceCents > 0) || !categoryId) return 'Preencha nome, preço (maior que zero) e categoria.'
    return optionGroupsProblem(optionGroups)
  }

  async function handleSave() {
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true); setError(null)
    try {
      if (isNew) {
        const { product: created } = await createProduct({ name: name.trim(), description, price: priceCents / 100, categoryId, active, optionGroups })
        // O produto já existe; se algum envio falhar, avisamos em vez de perder o cadastro.
        const problems: string[] = []
        if (pendingImages.length > 0) {
          try { await uploadProductImages(created.id, pendingImages.map((p) => p.file)) } catch (e: any) { problems.push(`fotos: ${e.message}`) }
        }
        if (pendingVideo) {
          try { await uploadProductVideo(created.id, pendingVideo) } catch (e: any) { problems.push(`vídeo: ${e.message}`) }
        }
        const warning = problems.length ? `Produto criado, mas falhou o envio de ${problems.join(' e ')}. Abra o produto para tentar de novo.` : undefined
        navigate('/admin/produtos', { replace: true, state: { created: { id: created.id, name: created.name, warning } } })
        return
      }
      await updateProduct(product!.id, { name: name.trim(), description, price: priceCents / 100, categoryId, active, optionGroups })
      await load(true)
      showToast('Alterações salvas')
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleCreateCategory() {
    setError(null)
    try {
      const { category } = await createCategory(newCategoryName)
      const cats = await fetchCategories()
      setCategories(cats.categories)
      setCategoryId(category.id); setNewCategoryName(''); setAddingCategory(false)
    } catch (err: any) { setError(err.message) }
  }

  async function runMedia(action: () => Promise<unknown>, okMsg: string) {
    setMediaBusy(true); setError(null)
    try { await action(); await load(false); showToast(okMsg) }
    catch (err: any) { setError(err.message) }
    finally { setMediaBusy(false) }
  }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (imageInput.current) imageInput.current.value = ''
    if (files.length === 0) return
    const room = MAX_IMAGES - images.length
    if (files.length > room) { setError(room > 0 ? `Cabem só mais ${room} ${room === 1 ? 'foto' : 'fotos'} (máximo ${MAX_IMAGES}).` : `O limite é de ${MAX_IMAGES} fotos.`); return }
    setError(null)
    setCropFiles(files) // cada foto passa pelo ajuste 9:16 antes de entrar
  }

  async function onCropDone(items: CroppedPhoto[]) {
    const editing = editingIndex
    setCropFiles([])
    setEditingIndex(null)
    if (items.length === 0) return
    if (isNew && editing !== null) {
      // reajuste de uma foto já adicionada: troca só essa, mantendo a posição
      setPendingImages((prev) => prev.map((p, i) => (i === editing ? items[0] : p)))
      showToast('Enquadramento atualizado')
      return
    }
    if (!isNew && editing !== null) {
      // reajuste de foto já salva: envia a versão recortada e troca a antiga, mantendo a posição
      const oldUrl = images[editing]
      setMediaBusy(true); setError(null)
      try {
        let current = [...images]
        if (current.length >= MAX_IMAGES) current = (await removeProductImage(product!.id, oldUrl) as any)?.images ?? current.filter((u) => u !== oldUrl)
        const up = await uploadProductImages(product!.id, [items[0].file])
        let list = up.images
        const added = list.filter((u) => !current.includes(u))[0] ?? list[list.length - 1]
        if (list.includes(oldUrl)) list = (await removeProductImage(product!.id, oldUrl) as any)?.images ?? list.filter((u) => u !== oldUrl)
        const rest = list.filter((u) => u !== added)
        rest.splice(Math.min(editing, rest.length), 0, added)
        await reorderProductImages(product!.id, rest)
        await load(false)
        setSel(editing)
        showToast('Enquadramento atualizado')
      } catch (err: any) { setError(err.message); await load(false) }
      finally { setMediaBusy(false) }
      return
    }
    const before = images.length
    if (isNew) {
      setPendingImages((prev) => [...prev, ...items])
    } else {
      await runMedia(() => uploadProductImages(product!.id, items.map((i) => i.file)), items.length === 1 ? 'Foto adicionada' : 'Fotos adicionadas')
    }
    setSel(before) // mostra a primeira foto recém-adicionada
  }

  // Reabre o ajuste 9:16 a partir da foto ORIGINAL e do enquadramento anterior (só na criação)
  async function editCrop(idx: number) {
    if (isNew) {
      const item = pendingImages[idx]
      if (!item) return
      setEditingIndex(idx)
      setCropFiles([item.original])
      return
    }
    const url = images[idx]
    if (!url) return
    try {
      setMediaBusy(true); setError(null)
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Não foi possível carregar a foto')
      const blob = await res.blob()
      const file = new File([blob], `foto-${idx + 1}.jpg`, { type: blob.type || 'image/jpeg' })
      setEditingIndex(idx)
      setCropFiles([file])
    } catch (err: any) { setError(err.message) }
    finally { setMediaBusy(false) }
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (videoInput.current) videoInput.current.value = ''
    if (!file) return
    if (file.type !== 'video/mp4') { setError('Use um vídeo MP4.'); return }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { setError(`O vídeo deve ter até ${MAX_VIDEO_MB}MB.`); return }
    setError(null)
    const portrait = await isPortraitVideo(file)
    if (isNew) setPendingVideo(file)
    else await runMedia(() => uploadProductVideo(product!.id, file), 'Vídeo atualizado')
    setSel(images.length) // o vídeo é o último item
    if (!portrait) showToast('Vídeo na horizontal: no celular ele aparece inteiro, com bordas. O ideal é gravar na vertical (9:16).', 'warn')
  }

  async function makeCover(idx: number) {
    if (idx <= 0) return
    if (isNew) {
      setPendingImages((prev) => [prev[idx], ...prev.filter((_, i) => i !== idx)])
      setSel(0)
      return
    }
    const next = [images[idx], ...images.filter((_, i) => i !== idx)]
    await runMedia(() => reorderProductImages(product!.id, next), 'Foto definida como capa')
    setSel(0)
  }

  async function removeImage(idx: number) {
    if (isNew) { setPendingImages((prev) => prev.filter((_, i) => i !== idx)); return }
    await runMedia(() => removeProductImage(product!.id, images[idx]), 'Foto removida')
  }

  async function removeVideo() {
    if (isNew) { setPendingVideo(null); return }
    await runMedia(() => removeProductVideo(product!.id), 'Vídeo removido')
  }

  async function handleDelete() {
    if (!product) return
    try { await deleteProduct(product.id); navigate('/admin/produtos', { replace: true }) }
    catch (err: any) { setDeleteOpen(false); setError(err.message) }
  }

  if (loading) return <div className="text-coffee text-sm py-10 text-center">Carregando…</div>

  if (!isNew && !product) {
    return (
      <div role="alert" className="rounded-xl border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-5 py-6 text-sm flex flex-col items-start gap-3">
        <div className="font-semibold">{loadError || 'Produto não encontrado.'}</div>
        <Link to="/admin/produtos" className="min-h-11 px-4 rounded-lg bg-moss text-cream text-[12px] font-bold inline-flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Voltar ao cardápio</Link>
      </div>
    )
  }

  const current = media[sel] ?? null
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? product?.category ?? null
  const displayName = name.trim() || (isNew ? 'Novo produto' : product?.name ?? '')
  const canAddImage = images.length < MAX_IMAGES

  return (
    <div className="flex flex-col gap-4">
      {/* VOLTAR */}
      <div>
        <button
          onClick={() => navigate('/admin/produtos')}
          className="h-11 pl-3.5 pr-5 rounded-full border border-white/35 text-white text-[13.5px] font-medium inline-flex items-center gap-2 hover:bg-white/10 active:scale-[0.98] transition"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.7} /> Voltar ao cardápio
        </button>
      </div>

      {/* MIGALHAS */}
      <nav className="flex items-center gap-1.5 text-[12px] text-olive flex-wrap" aria-label="Navegação">
        <Link to="/admin/produtos" className="text-white/70 hover:underline">Cardápio</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        {categoryName && <><span>{categoryName}</span><ChevronRight className="w-3.5 h-3.5" /></>}
        <span className="text-coffee truncate max-w-[60vw]">{displayName}</span>
      </nav>

      {loadError && isNew && (
        <div role="alert" className="rounded-xl border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          Não foi possível carregar as categorias: {loadError}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button onClick={() => setError(null)} className="font-bold">OK</button>
        </div>
      )}

      {/* LINHA 1: informações básicas + imagens e mídia */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-5 items-start">
        <Card title="Informações básicas" subtitle="O que o cliente lê no cardápio.">
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-[10px] font-bold text-olive uppercase" htmlFor="pd-name">Nome</label>
              <input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isNew ? 'Ex.: Cappuccino cremoso' : undefined} className="w-full mt-1 px-3 min-h-12 rounded-lg border border-sand bg-white/[0.06] font-serif text-xl lg:text-2xl text-moss outline-none focus:border-moss" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <MoneyInput id="pd-price" label="Preço (R$)" valueCents={priceCents} onChange={setPriceCents} inputClassName="text-xl font-semibold min-h-12" />
                <div className="text-[11px] text-coffee/70 mt-1.5">No cardápio aparece como <b>{formatCents(priceCents)}</b></div>
              </div>
              <div>
            <label className="text-[10px] font-bold text-olive uppercase" htmlFor="pd-cat">Categoria</label>
            <select
              id="pd-cat"
              value={categoryId}
              onChange={(e) => { if (e.target.value === NEW_CATEGORY) setAddingCategory(true); else setCategoryId(e.target.value) }}
              className="w-full mt-1 px-3 min-h-12 rounded-lg border border-sand bg-white/[0.06] text-sm text-moss outline-none focus:border-moss"
            >
              <option value="" disabled>Selecione…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW_CATEGORY}>＋ Nova categoria…</option>
            </select>
            {addingCategory && (
              <div className="flex gap-2 items-center mt-2">
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newCategoryName.trim()) { e.preventDefault(); handleCreateCategory() } }}
                  placeholder="Nome da nova categoria"
                  maxLength={40}
                  className="flex-1 min-w-0 px-3 min-h-11 rounded-lg border border-sand bg-white/[0.06] text-sm text-moss outline-none focus:border-moss"
                />
                <button type="button" disabled={!newCategoryName.trim()} onClick={handleCreateCategory} className="min-h-11 px-4 rounded-lg bg-moss text-cream text-[11px] font-bold uppercase disabled:opacity-50">Criar</button>
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryName('') }} className="min-h-11 px-3 rounded-lg border border-sand text-moss text-[11px] font-bold uppercase">Cancelar</button>
              </div>
            )}
            <div className="text-[11px] text-olive/70 mt-1">Para renomear ou excluir categorias, use “Categorias” na tela do Cardápio.</div>
          </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-olive uppercase" htmlFor="pd-desc">Descrição</label>
              <textarea id="pd-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Conte em poucas linhas o que vem no produto." className="w-full mt-1 px-3 py-3 rounded-lg border border-sand bg-white/[0.06] text-sm text-moss outline-none focus:border-moss resize-y" />
            </div>
          </div>
        </Card>

        <Card title="Imagens e mídia" subtitle="Fotos e vídeo que aparecem para o cliente.">
        <div className="flex flex-col gap-3 w-full max-w-[380px] mx-auto lg:mx-0">
          <div className="relative w-full aspect-[9/16] max-h-[56vh] mx-auto bg-[#1c1c18] rounded-xl overflow-hidden">
            {current?.type === 'image' && (
              <img
                key={current.src}
                src={current.src}
                alt={displayName}
                onClick={current?.type === 'image' ? () => editCrop(sel) : undefined}
                className={cn('absolute inset-0 w-full h-full object-contain', current?.type === 'image' && 'cursor-pointer')}
              />
            )}
            {current?.type === 'image' && (
              <button onClick={() => editCrop(sel)} className="absolute bottom-3 right-3 min-h-10 px-3 rounded-full bg-black/60 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-black/80 flex items-center gap-1.5">
                <Crop className="w-4 h-4" /> Ajustar
              </button>
            )}
            {current?.type === 'video' && (
              <video key={current.src} src={current.src} controls playsInline loop className="absolute inset-0 w-full h-full object-contain" />
            )}
            {!current && (
              <div className="absolute inset-0 grid place-items-center text-center text-cream/70 text-xs px-6">
                {isNew ? 'Adicione fotos e vídeo do produto nas miniaturas abaixo.' : 'Este produto ainda não tem fotos. Adicione abaixo.'}
              </div>
            )}
            {media.length > 1 && (
              <>
                <button onClick={() => setSel((sel - 1 + media.length) % media.length)} aria-label="Anterior" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white grid place-items-center hover:bg-black/70"><ChevronLeft className="w-5 h-5" /></button>
                <button onClick={() => setSel((sel + 1) % media.length)} aria-label="Próxima" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white grid place-items-center hover:bg-black/70"><ChevronRight className="w-5 h-5" /></button>
              </>
            )}
            {current?.type === 'image' && sel === 0 && (
              <div className="absolute top-3 left-3 bg-[#E8A317] text-[#2a1a0e] text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Capa</div>
            )}
          </div>

          {/* MINIATURAS */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {media.map((m, i) => (
              <button key={`${m.type}-${m.src}`} onClick={() => setSel(i)} aria-label={m.type === 'video' ? 'Ver vídeo' : `Ver foto ${i + 1}`} className={cn(
                'relative flex-shrink-0 w-[58px] h-[103px] rounded-lg overflow-hidden border-2 bg-sand transition',
                i === sel ? 'border-[#E8A317]' : 'border-transparent hover:border-sage',
              )}>
                {m.type === 'image'
                  ? <img src={m.src} alt="" className="w-full h-full object-cover" />
                  : <>
                      <video src={m.src} muted preload="metadata" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/30"><Play className="w-5 h-5 text-white fill-white" /></span>
                    </>}
              </button>
            ))}
            {canAddImage && (
              <button onClick={() => imageInput.current?.click()} disabled={mediaBusy} aria-label="Adicionar foto" className="flex-shrink-0 w-[58px] h-[103px] rounded-lg border-2 border-dashed border-sand text-coffee/60 hover:bg-sand flex flex-col items-center justify-center gap-1 disabled:opacity-50">
                <Plus className="w-4 h-4" /><span className="text-[9px] font-bold uppercase">Foto</span>
              </button>
            )}
            {!videoSrc && (
              <button onClick={() => videoInput.current?.click()} disabled={mediaBusy} aria-label="Adicionar vídeo" className="flex-shrink-0 w-[58px] h-[103px] rounded-lg border-2 border-dashed border-sand text-coffee/60 hover:bg-sand flex flex-col items-center justify-center gap-1 disabled:opacity-50">
                <VideoIcon className="w-4 h-4" /><span className="text-[9px] font-bold uppercase">Vídeo</span>
              </button>
            )}
          </div>
          <input ref={imageInput} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={onPickImages} className="hidden" />
          <input ref={videoInput} type="file" accept="video/mp4" onChange={onPickVideo} className="hidden" />

          {/* AÇÕES DA MÍDIA SELECIONADA */}
          {current && (
            <div className="flex flex-wrap gap-2">
              {current.type === 'image' && (
                <button onClick={() => editCrop(sel)} className="min-h-11 px-4 rounded-full border border-moss text-moss text-[11px] font-bold uppercase tracking-wider hover:bg-moss hover:text-cream transition flex items-center gap-2"><Crop className="w-4 h-4" /> Ajustar enquadramento</button>
              )}
              {current.type === 'image' && sel > 0 && (
                <button onClick={() => makeCover(sel)} disabled={mediaBusy} className="min-h-11 px-4 rounded-full border border-moss text-moss text-[11px] font-bold uppercase tracking-wider hover:bg-moss hover:text-cream transition disabled:opacity-50 flex items-center gap-2"><Star className="w-4 h-4" /> Tornar capa</button>
              )}
              {current.type === 'image' && (
                <button onClick={() => removeImage(sel)} disabled={mediaBusy} className="min-h-11 px-4 rounded-full border border-sand text-[#ffb3a8] text-[11px] font-bold uppercase tracking-wider hover:bg-[#B66B65] hover:text-cream transition disabled:opacity-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Remover foto</button>
              )}
              {current.type === 'video' && (
                <>
                  <button onClick={() => videoInput.current?.click()} disabled={mediaBusy} className="min-h-11 px-4 rounded-full border border-moss text-moss text-[11px] font-bold uppercase tracking-wider hover:bg-moss hover:text-cream transition disabled:opacity-50 flex items-center gap-2"><VideoIcon className="w-4 h-4" /> Trocar vídeo</button>
                  <button onClick={removeVideo} disabled={mediaBusy} className="min-h-11 px-4 rounded-full border border-sand text-[#ffb3a8] text-[11px] font-bold uppercase tracking-wider hover:bg-[#B66B65] hover:text-cream transition disabled:opacity-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Remover vídeo</button>
                </>
              )}
            </div>
          )}
          <p className="text-[11px] text-olive/80 leading-snug">
            Fotos {images.length}/{MAX_IMAGES} · Vídeo {videoSrc ? '1/1' : '0/1'}. As fotos são ajustadas para 9:16 (celular); grave o vídeo na vertical (MP4, até {MAX_VIDEO_MB}MB).
            {isNew && ' A mídia é enviada quando você criar o produto.'}
            {mediaBusy && ' Enviando…'}
          </p>
        </div>
        </Card>
      </div>

      {/* LINHA 2: personalização (largura total, com pré-visualização) */}
      <Card title="Personalização" subtitle="Combos, kits, sabores e recheios — opcional.">
        <ProductOptionsEditor value={optionGroups} onChange={setOptionGroups} productName={name} basePriceCents={priceCents} onError={(m) => setError(m)} />
      </Card>

      {/* LINHA 3: configurações */}
      <Card title="Configurações" subtitle="Visibilidade no cardápio e exclusão.">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
          <label className="flex items-center justify-between gap-4 p-3 min-h-12 rounded-lg border border-sand bg-white/[0.06] cursor-pointer sm:min-w-[360px]">
            <span>
              <span className="block text-sm text-moss">Produto ativo no cardápio</span>
              <span className="block text-[11.5px] text-coffee/70">Desligado: o cliente não vê este produto, mas ele continua cadastrado.</span>
            </span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-5 h-5 accent-moss flex-shrink-0" />
          </label>
          {!isNew && (
            <button onClick={() => setDeleteOpen(true)} className="min-h-12 px-5 rounded-full border border-sand text-[#ffb3a8] text-[11px] font-bold uppercase tracking-widest hover:bg-[#B66B65] hover:text-cream transition flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Apagar produto</button>
          )}
        </div>
      </Card>

      {/* AÇÕES: sempre à vista, sem precisar rolar até o fim */}
      <div className="sticky bottom-3 z-30 rounded-2xl border border-sand bg-[#1b120b]/92 backdrop-blur-md px-4 py-3 flex flex-wrap items-center gap-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]">
        <span className="text-[12px] text-coffee/80 mr-auto" aria-live="polite">{isNew ? 'Novo produto' : dirty ? 'Há alterações não salvas' : 'Tudo salvo'}</span>
        <button onClick={() => navigate('/admin/produtos')} className="min-h-12 px-6 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-sand/50 transition">{isNew ? 'Cancelar' : 'Voltar'}</button>
        <button onClick={handleSave} disabled={!dirty || saving} className="min-h-12 px-8 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest hover:bg-olive transition disabled:opacity-40 flex items-center justify-center gap-2">
          <Save className="w-4 h-4" />
          {isNew
            ? (saving ? 'Criando e enviando mídia…' : 'Criar produto')
            : (saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Tudo salvo')}
        </button>
      </div>

      <PhotoCropper
        files={cropFiles}
        initialSettings={isNew && editingIndex !== null ? pendingImages[editingIndex]?.settings : undefined}
        onDone={onCropDone}
      />

      {!isNew && product && (
        <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[110]" />
            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-sm bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white rounded-[26px] z-[111] p-6 text-center" aria-describedby={undefined}>
              <div className="w-14 h-14 rounded-full bg-[#ff9b8f]/15 text-[#ffb3a8] grid place-items-center mx-auto mb-4"><AlertCircle className="w-7 h-7" /></div>
              <Dialog.Title className="font-serif text-xl text-moss mb-2">Apagar “{product.name}”?</Dialog.Title>
              <p className="text-[12.5px] text-coffee leading-relaxed mb-6">Essa ação não pode ser desfeita. Fotos e vídeo serão apagados permanentemente. Pedidos antigos continuam no histórico.</p>
              <div className="flex flex-col gap-2">
                <button onClick={handleDelete} className="w-full min-h-12 rounded-full bg-[#ff9b8f] text-[#2a1a0e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#ffb3a8] transition">Sim, apagar</button>
                <button onClick={() => setDeleteOpen(false)} className="w-full min-h-12 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-sand/50 transition">Cancelar</button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {toast && (
        <div role="status" className={cn(
          'fixed left-1/2 bottom-6 -translate-x-1/2 max-w-[calc(100%-32px)] text-xs px-5 py-3 rounded-2xl shadow-lg z-[130] flex items-center gap-2',
          toast.tone === 'warn' ? 'bg-[#a8753c] text-white' : 'bg-moss text-cream',
        )}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {toast.msg}
        </div>
      )}
    </div>
  )
}
