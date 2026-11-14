import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X, Video as VideoIcon, Trash2, Edit2, AlertCircle, Tags, Pencil, Check, CheckCircle2 } from 'lucide-react'
import {
  fetchAdminProducts, deleteProduct,
  fetchCategories, createCategory, renameCategory, deleteCategory,
  type AdminProduct, type AdminCategory,
} from '../lib/admin'
import { formatPrice } from '../lib/api'
import { cn } from '../lib/cn'

const PLACEHOLDER = 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=400&q=80'

export function AdminProducts() {
  const navigate = useNavigate()
  const location = useLocation()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [toast, setToast] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [createdInfo, setCreatedInfo] = useState<{ id: string; name: string; warning?: string } | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { refresh() }, [])
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current) }, [])

  // Vindo da página "Novo produto": abre a confirmação assim que a lista carregar
  useEffect(() => {
    const created = (location.state as { created?: { id: string; name: string; warning?: string } } | null)?.created
    if (!created || loading) return
    setFilter('all')
    setCreatedInfo(created)
    navigate(location.pathname, { replace: true, state: null })
  }, [loading, location.state, location.pathname, navigate])

  // Fecha o aviso de criação, rola até o card do produto novo e o destaca por alguns segundos.
  function revealCreated() {
    const info = createdInfo
    setCreatedInfo(null)
    if (!info) return
    setFilter('all')
    setTimeout(() => {
      document.getElementById(`product-${info.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(info.id)
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
      highlightTimer.current = setTimeout(() => setHighlightId(null), 4500)
    }, 200) // espera o modal liberar o scroll da página
  }

  async function refresh() {
    try {
      // categorias primeiro: o servidor vincula produtos antigos às categorias sob demanda
      const cats = await fetchCategories()
      const data = await fetchAdminProducts()
      setCategories(cats.categories)
      setProducts(data.products)
      setLoadError(null)
    } catch (err: any) {
      setLoadError(err?.message || 'Falha ao carregar o cardápio')
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirmId) return
    try {
      await deleteProduct(deleteConfirmId)
      setDeleteConfirmId(null)
      await refresh()
      showToast('Produto deletado com sucesso')
    } catch (err: any) { setDeleteConfirmId(null); showToast(err?.message || 'Erro ao deletar') }
  }

  if (loading) return <div className="text-coffee text-sm py-10 text-center">Carregando cardápio…</div>

  if (loadError && products.length === 0) {
    return (
      <div role="alert" className="rounded-xl border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-5 py-6 text-sm flex flex-col items-start gap-3">
        <div className="font-semibold">Não foi possível carregar o cardápio.</div>
        <div className="text-[12.5px] opacity-80">{loadError}</div>
        <button onClick={refresh} className="min-h-11 px-4 rounded-lg bg-moss text-cream text-[12px] font-bold">Tentar novamente</button>
      </div>
    )
  }

  const visibleProducts = filter === 'all' ? products : products.filter((p) => p.categoryId === filter)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-coffee/70">{products.length} produtos · {categories.length} categorias</div>
        <div className="flex gap-2">
          <button onClick={() => setCategoriesOpen(true)} className="min-h-11 px-4 rounded-full border border-moss text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-moss hover:text-cream transition flex items-center gap-2">
            <Tags className="w-4 h-4" /> Categorias
          </button>
          <button onClick={() => navigate('/admin/produtos/novo')} className="min-h-11 px-5 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest hover:bg-olive transition flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          Dados podem estar desatualizados: {loadError}
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 pb-1">
          {[{ id: 'all', name: 'Todas', productCount: products.length }, ...categories].map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)} className={cn(
              'min-h-10 px-4 rounded-full border text-[12px] font-semibold whitespace-nowrap transition flex items-center gap-2',
              filter === c.id ? 'bg-moss text-cream border-moss' : 'bg-warm-white text-moss border-sand hover:bg-sand/50',
            )}>
              {c.name} <span className="opacity-60 text-[10px]">{c.productCount}</span>
            </button>
          ))}
        </div>
      )}

      {products.length === 0 && (
        <div className="text-center text-[12px] text-coffee/60 py-12 bg-warm-white border border-sand border-dashed rounded-xl">
          Nenhum produto cadastrado ainda. Toque em “Novo Produto” para começar.
        </div>
      )}
      {products.length > 0 && visibleProducts.length === 0 && (
        <div className="text-center text-[12px] text-coffee/60 py-10 bg-warm-white border border-sand border-dashed rounded-xl">
          Nenhum produto nesta categoria.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {visibleProducts.map((p) => (
          <motion.div key={p.id} id={`product-${p.id}`} layout className={cn(
            'h-[88px] rounded-[22px] border backdrop-blur-xl bg-white/[0.06] p-2 flex items-center gap-3 transition-all duration-500 scroll-mt-24',
            highlightId === p.id ? 'border-[#E8A317] ring-4 ring-[#E8A317]/40' : 'border-white/12',
            !p.active && 'opacity-60',
          )}>
            {/* Miniatura padronizada: só para identificar o produto */}
            <button onClick={() => navigate(`/admin/produtos/${p.id}`)} aria-label={`Abrir ${p.name}`} className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden bg-black/30 flex-shrink-0">
              <img src={p.images?.[0] ?? PLACEHOLDER} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              {p.videoPath && (
                <span className="absolute bottom-1 right-1 bg-black/65 text-white rounded-full p-1"><VideoIcon className="w-2.5 h-2.5" /></span>
              )}
            </button>

            <button onClick={() => navigate(`/admin/produtos/${p.id}`)} className="flex-1 min-w-0 text-left">
              <div className="text-[10px] uppercase tracking-widest text-white/45 font-bold truncate">
                {p.category}{!p.active && ' · inativo'}
              </div>
              <div className="text-[15px] font-semibold text-[#F5F1E8] leading-tight truncate mt-0.5">{p.name}</div>
              <div className="text-[13px] font-medium text-white/70 mt-0.5 tabular-nums">{formatPrice(p.price)}</div>
            </button>

            <div className="flex gap-1.5 flex-shrink-0 pr-1">
              <button onClick={() => navigate(`/admin/produtos/${p.id}`)} aria-label="Abrir e editar produto" className="w-10 h-10 rounded-full border border-white/25 text-white grid place-items-center hover:bg-white/10 transition"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => setDeleteConfirmId(p.id)} aria-label="Apagar produto" className="w-10 h-10 rounded-full border border-white/25 text-[#ffb3a8] grid place-items-center hover:bg-[#ff9b8f]/15 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* CONFIRMAÇÃO DE PRODUTO CRIADO */}
      <Dialog.Root open={!!createdInfo} onOpenChange={(o) => !o && revealCreated()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[110]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-sm bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white rounded-[26px] z-[111] p-6 text-center outline-none" aria-describedby={undefined}>
            <div className="w-14 h-14 rounded-full bg-[#637a4d]/15 text-[#637a4d] grid place-items-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <Dialog.Title className="font-serif text-xl text-moss mb-2">Produto criado com sucesso!</Dialog.Title>
            <p className="text-[12.5px] text-coffee leading-relaxed mb-1">
              “{createdInfo?.name}” já está no cardápio.
            </p>
            {createdInfo?.warning && (
              <p role="alert" className="text-[12px] text-[#ffc9c0] bg-[#ff9b8f]/10 border border-[#ff9b8f]/40 rounded-lg px-3 py-2 mt-3">{createdInfo.warning}</p>
            )}
            <button autoFocus onClick={revealCreated} className="w-full mt-5 min-h-12 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest hover:bg-olive transition">
              Ver produto
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CategoryManager
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={async (msg) => { await refresh(); if (msg) showToast(msg) }}
      />

      {/* MODAL DE CONFIRMAÇÃO DE DELEÇÃO */}
      <Dialog.Root open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[110]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-sm bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white rounded-[26px] z-[111] p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#ff9b8f]/15 text-[#ffb3a8] grid place-items-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <Dialog.Title className="font-serif text-xl text-moss mb-2">Apagar produto?</Dialog.Title>
            <p className="text-[12.5px] text-coffee leading-relaxed mb-6">
              Essa ação não pode ser desfeita. Todas as fotos e vídeos serão apagados permanentemente.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleDeleteConfirm} className="w-full py-3.5 rounded-full bg-[#ff9b8f] text-[#2a1a0e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#ffb3a8] transition">
                Sim, apagar
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="w-full py-3 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-sand/50 transition">
                Cancelar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-moss text-cream text-xs px-5 py-3 rounded-full shadow-lg z-[100]">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CategoryManager({ open, categories, onClose, onChanged }: {
  open: boolean
  categories: AdminCategory[]
  onClose: () => void
  onChanged: (msg?: string) => Promise<void> | void
}) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reassignTo, setReassignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setNewName(''); setEditingId(null); setDeletingId(null); setReassignTo(''); setError(null) }
  }, [open])

  async function run(action: () => Promise<unknown>, successMsg: string, after?: () => void) {
    setBusy(true); setError(null)
    try { await action(); await onChanged(successMsg); after?.() }
    catch (err: any) { setError(err?.message || 'Algo deu errado') }
    finally { setBusy(false) }
  }

  const deleting = categories.find((c) => c.id === deletingId) ?? null
  const targets = categories.filter((c) => c.id !== deletingId)

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[110]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-w-md max-h-[88vh] overflow-y-auto bg-cream rounded-2xl z-[111] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3 mb-1">
            <Dialog.Title className="font-serif text-xl text-moss">Categorias</Dialog.Title>
            <Dialog.Close aria-label="Fechar" className="w-10 h-10 rounded-full border border-sand text-moss grid place-items-center flex-shrink-0"><X className="w-4 h-4" /></Dialog.Close>
          </div>
          <Dialog.Description className="text-[12px] text-coffee/80 mb-4">
            Organizam o cardápio e os filtros que o cliente vê. Renomear atualiza todos os produtos da categoria.
          </Dialog.Description>

          {error && <div role="alert" className="mb-3 rounded-lg border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3 py-2.5 text-[12.5px]">{error}</div>}

          <form
            className="flex gap-2 mb-4"
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) run(() => createCategory(newName), 'Categoria criada', () => setNewName('')) }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova categoria (ex.: Sobremesas)" maxLength={40}
              className="flex-1 min-w-0 px-3 min-h-11 rounded-lg border border-sand bg-warm-white text-sm text-moss outline-none focus:border-moss" />
            <button disabled={busy || !newName.trim()} className="min-h-11 px-4 rounded-lg bg-moss text-cream text-[11px] font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Criar
            </button>
          </form>

          {categories.length === 0 && (
            <div className="text-center text-[12px] text-coffee/60 py-6 border border-dashed border-sand rounded-xl">Nenhuma categoria ainda. Crie a primeira acima.</div>
          )}

          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <li key={c.id} className="bg-warm-white border border-sand rounded-xl p-3">
                {editingId === c.id ? (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (editName.trim()) run(() => renameCategory(c.id, editName), 'Categoria renomeada', () => setEditingId(null)) }}>
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={40}
                      className="flex-1 min-w-0 px-3 min-h-11 rounded-lg border border-moss bg-white/[0.06] text-sm text-moss outline-none" />
                    <button disabled={busy || !editName.trim()} aria-label="Salvar" className="w-11 h-11 rounded-lg bg-moss text-cream grid place-items-center disabled:opacity-50"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditingId(null)} aria-label="Cancelar" className="w-11 h-11 rounded-lg border border-sand text-moss grid place-items-center"><X className="w-4 h-4" /></button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-moss truncate">{c.name}</div>
                      <div className="text-[11px] text-coffee/60">{c.productCount} {c.productCount === 1 ? 'produto' : 'produtos'}</div>
                    </div>
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); setDeletingId(null); setError(null) }} aria-label={`Renomear ${c.name}`} className="w-11 h-11 rounded-full border border-sand text-moss grid place-items-center hover:bg-moss hover:text-cream transition"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { setDeletingId(c.id); setReassignTo(''); setEditingId(null); setError(null) }} aria-label={`Excluir ${c.name}`} className="w-11 h-11 rounded-full border border-sand text-[#ffb3a8] grid place-items-center hover:bg-[#B66B65] hover:text-cream transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}

                {deleting?.id === c.id && (
                  <div className="mt-3 pt-3 border-t border-sand flex flex-col gap-2.5">
                    {c.productCount > 0 ? (
                      <>
                        <p className="text-[12.5px] text-coffee leading-snug">
                          “{c.name}” tem <b>{c.productCount} {c.productCount === 1 ? 'produto' : 'produtos'}</b>. Para não deixá-los sem categoria, escolha para onde movê-los:
                        </p>
                        {targets.length === 0 ? (
                          <p className="text-[12px] text-[#8f4a44]">Crie outra categoria primeiro para poder mover os produtos.</p>
                        ) : (
                          <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="w-full px-3 min-h-11 rounded-lg border border-sand bg-white/[0.06] text-sm text-moss outline-none focus:border-moss">
                            <option value="" disabled>Mover produtos para…</option>
                            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                      </>
                    ) : (
                      <p className="text-[12.5px] text-coffee">Excluir a categoria vazia “{c.name}”?</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        disabled={busy || (c.productCount > 0 && !reassignTo)}
                        onClick={() => run(() => deleteCategory(c.id, c.productCount > 0 ? reassignTo : undefined), 'Categoria excluída', () => setDeletingId(null))}
                        className="flex-1 min-h-11 rounded-lg bg-[#ff9b8f] text-[#2a1a0e] text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                      >
                        {busy ? 'Excluindo…' : c.productCount > 0 ? 'Mover e excluir' : 'Excluir'}
                      </button>
                      <button onClick={() => setDeletingId(null)} className="min-h-11 px-4 rounded-lg border border-sand text-moss text-[11px] font-bold uppercase tracking-wider">Cancelar</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
