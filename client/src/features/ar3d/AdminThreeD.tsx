import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Box, Coins, ImagePlus, Loader2, Sparkles, Trash2, X, Eye, Upload, Ruler } from 'lucide-react'
import { cn } from '../../lib/cn'
import { deleteModel, fetchOverview, generateModel, setModelSize, uploadGlb, type ArOverview, type ArProduct } from './api'
import { ModelViewerDialog } from './ModelViewerDialog'

const GLASS = 'rounded-[22px] border border-white/12 bg-white/[0.06] backdrop-blur-xl'
const BTN_PRIMARY = 'h-11 px-5 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50'
const BTN_GHOST = 'h-11 px-5 rounded-full border border-white/35 text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 hover:bg-white/10'

function statusChip(m: ArProduct['model']) {
  if (!m) return { text: 'Sem modelo', cls: 'bg-white/8 text-white/55 border-white/15' }
  if (m.status === 'PROCESSING') return { text: `Gerando ${m.progress}%`, cls: 'bg-[#E8A317]/15 text-[#E8A317] border-[#E8A317]/50' }
  if (m.status === 'FAILED') return { text: 'Falhou', cls: 'bg-[#ff9b8f]/10 text-[#ffc9c0] border-[#ff9b8f]/40' }
  return { text: 'Pronto', cls: 'bg-[#8fb06b]/15 text-[#b9d39a] border-[#8fb06b]/40' }
}

export function AdminThreeD() {
  const [data, setData] = useState<ArOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [genFor, setGenFor] = useState<ArProduct | null>(null)
  const [preview, setPreview] = useState<ArProduct | null>(null)
  const [delFor, setDelFor] = useState<ArProduct | null>(null)
  const [upFor, setUpFor] = useState<ArProduct | null>(null)
  const [sizeFor, setSizeFor] = useState<ArProduct | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setData(await fetchOverview()); setError(null) }
    catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])
  // enquanto houver modelo sendo gerado, atualiza a cada 3s
  const processing = data?.products.some((p) => p.model?.status === 'PROCESSING')
  useEffect(() => {
    if (!processing) return
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [processing, load])

  async function confirmDelete() {
    if (!delFor) return
    setBusy(true)
    try { await deleteModel(delFor.id); setDelFor(null); await load() }
    catch (e: any) { setError(e.message); setDelFor(null) }
    finally { setBusy(false) }
  }

  if (error && !data) {
    return <div role="alert" className="rounded-[22px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-5 py-6 text-sm">{error}</div>
  }
  if (!data) return <div className="flex items-center gap-2 text-white/60 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>

  const low = data.balance !== null && data.balance < data.estimatedCost

  return (
    <div className="flex flex-col gap-5">
      {/* SALDO */}
      <div className={cn(GLASS, 'p-5 flex flex-wrap items-center gap-x-8 gap-y-3')}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#E8A317]/15 text-[#E8A317] grid place-items-center"><Coins className="w-5 h-5" /></div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Créditos disponíveis</div>
            <div className={cn('text-[28px] leading-none font-bold tabular-nums mt-1', low ? 'text-[#ffb3a8]' : 'text-[#F5F1E8]')}>
              {data.balance === null ? '—' : data.balance}
            </div>
          </div>
        </div>
        <div className="text-[12.5px] text-white/65 leading-relaxed">
          <div>Custo por modelo: <b className="text-white">~{data.estimatedCost} créditos</b></div>
          <div>Peso máximo do modelo: <b className="text-white">{data.maxGlbMb} MB</b> (leve para o celular)</div>
        </div>
        <span className={cn('ml-auto text-[10.5px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border',
          data.provider === 'mock' ? 'border-[#E8A317]/50 text-[#E8A317] bg-[#E8A317]/10' : 'border-white/25 text-white/70')}>
          {data.provider === 'mock' ? 'Modo de teste · sem IA real' : `Provedor: ${data.provider}`}
        </span>
        {low && <div className="basis-full text-[12.5px] text-[#ffc9c0]">Créditos insuficientes para gerar um novo modelo. Recarregue no painel do provedor.</div>}
      </div>

      {error && <div role="alert" className="rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">{error}</div>}

      {/* PRODUTOS */}
      <div className="flex flex-col gap-2.5">
        {data.products.map((p) => {
          const chip = statusChip(p.model)
          const generating = p.model?.status === 'PROCESSING'
          return (
            <div key={p.id} className={cn(GLASS, 'px-3.5 py-3 flex items-center gap-3.5 min-h-[88px]')}>
              <div className="w-[64px] h-[64px] rounded-[14px] overflow-hidden bg-white/[0.06] border border-white/10 flex-shrink-0 grid place-items-center">
                {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Box className="w-5 h-5 text-white/30" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[#F5F1E8] truncate">{p.name}</div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border', chip.cls)}>{chip.text}</span>
                  {p.model?.status === 'READY' && p.model.sizeBytes != null && (
                    <span className="text-[11.5px] text-white/50">{(p.model.sizeBytes / 1048576).toFixed(2)} MB · {p.model.credits} créd. gastos</span>
                  )}
                  {p.model?.status === 'READY' && (
                    <button onClick={() => setSizeFor(p)} className="text-[11px] font-semibold text-white/80 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white/10">
                      <Ruler className="w-3 h-3" /> {p.model.diameterCm ? `Ø ${p.model.diameterCm} cm` : 'Definir tamanho'}
                    </button>
                  )}
                  {p.model?.status === 'FAILED' && p.model.error && <span className="text-[11.5px] text-[#ffc9c0] truncate max-w-[320px]">{p.model.error}</span>}
                </div>
                {generating && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-[260px]">
                    <div className="h-full bg-[#E8A317] transition-all" style={{ width: `${p.model!.progress}%` }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.model?.status === 'READY' && (
                  <button onClick={() => setPreview(p)} aria-label={`Ver 3D de ${p.name}`} className="h-10 w-10 rounded-full border border-white/25 text-white grid place-items-center hover:bg-white/10"><Eye className="w-4 h-4" /></button>
                )}
                <button onClick={() => setUpFor(p)} disabled={generating} aria-label={`Enviar GLB para ${p.name}`} title="Enviar arquivo .glb" className="h-10 w-10 rounded-full border border-white/25 text-white grid place-items-center hover:bg-white/10 disabled:opacity-40"><Upload className="w-4 h-4" /></button>
                <button onClick={() => setGenFor(p)} disabled={generating || low} className={cn(BTN_GHOST, '!h-10 !px-4 text-[12.5px]')}>
                  <Sparkles className="w-4 h-4" /> {p.model ? 'Gerar de novo' : 'Gerar 3D'}
                </button>
                {p.model && !generating && (
                  <button onClick={() => setDelFor(p)} aria-label={`Remover 3D de ${p.name}`} className="h-10 w-10 rounded-full border border-white/25 text-white/80 grid place-items-center hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          )
        })}
        {data.products.length === 0 && <div className="text-white/50 text-sm text-center py-8">Cadastre produtos no Cardápio para gerar modelos 3D.</div>}
      </div>

      {genFor && <GenerateDialog product={genFor} overview={data} onClose={() => setGenFor(null)} onStarted={async () => { setGenFor(null); await load() }} />}

      {upFor && <UploadDialog product={upFor} onClose={() => setUpFor(null)} onDone={async () => { setUpFor(null); await load() }} />}
      {sizeFor && <SizeDialog product={sizeFor} onClose={() => setSizeFor(null)} onDone={async () => { setSizeFor(null); await load() }} />}

      {preview?.model?.glb && (
        <ModelViewerDialog open onOpenChange={(o) => !o && setPreview(null)} src={`${preview.model.glb}?v=${Date.parse(preview.model.updatedAt)}`} title={preview.name} />
      )}

      <Dialog.Root open={!!delFor} onOpenChange={(o) => !o && setDelFor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-40px)] max-w-[360px] z-[101] rounded-[26px] bg-[#2a1a0e]/90 backdrop-blur-xl border border-white/15 text-white p-5 outline-none">
            <Dialog.Title className="text-[18px] font-bold">Remover modelo 3D?</Dialog.Title>
            <p className="mt-2 text-[13px] text-white/65">O botão AR some do Feed para “{delFor?.name}”. Os créditos já gastos não voltam.</p>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={confirmDelete} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Removendo…' : 'Remover'}</button>
              <Dialog.Close className={BTN_GHOST}>Cancelar</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function GenerateDialog({ product, overview, onClose, onStarted }: { product: ArProduct; overview: ArOverview; onClose: () => void; onStarted: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(product.image)
  const [description, setDescription] = useState(product.model?.description ?? '')
  const [diameter, setDiameter] = useState(product.model?.diameterCm ? String(product.model.diameterCm) : '')
  const [loadingImg, setLoadingImg] = useState(!!product.image)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // por padrão usa a foto do produto
  useEffect(() => {
    let alive = true
    if (!product.image) return
    fetch(product.image).then((r) => r.blob()).then((b) => {
      if (alive) setFile(new File([b], 'produto.jpg', { type: b.type || 'image/jpeg' }))
    }).catch(() => {}).finally(() => alive && setLoadingImg(false))
    return () => { alive = false }
  }, [product.image])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (input.current) input.current.value = ''
    if (!f) return
    setFile(f); setPreview(URL.createObjectURL(f))
  }

  async function start() {
    if (!file) return
    setSending(true); setErr(null)
    try { await generateModel(product.id, file, description, diameter); onStarted() }
    catch (e: any) { setErr(e.message); setSending(false) }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-w-[460px] max-h-[92vh] overflow-y-auto z-[101] rounded-[28px] bg-[#1d130b]/95 backdrop-blur-2xl border border-white/15 text-[#F5F1E8] p-5 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-white/50">Gerar modelo 3D</div>
              <Dialog.Title className="text-[20px] font-bold tracking-tight">{product.name}</Dialog.Title>
            </div>
            <Dialog.Close aria-label="Fechar" className="w-10 h-10 rounded-full border border-white/25 grid place-items-center flex-shrink-0"><X className="w-4 h-4" /></Dialog.Close>
          </div>

          <div className="mt-4 flex gap-3.5 items-start">
            <div className="w-[104px] h-[104px] rounded-[18px] overflow-hidden bg-white/[0.06] border border-white/12 flex-shrink-0 grid place-items-center">
              {preview ? <img src={preview} alt="Imagem de origem" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-white/30" />}
            </div>
            <div className="flex-1 text-[12.5px] text-white/65 leading-snug">
              <p>A IA usa esta foto para criar o modelo. Quanto mais nítida e com o prato inteiro, a fundo limpo, melhor.</p>
              <button onClick={() => input.current?.click()} className="mt-2 text-[12.5px] font-semibold text-[#F5F1E8] underline underline-offset-2">Usar outra imagem</button>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
            </div>
          </div>

          <label className="block mt-4">
            <span className="text-[11.5px] font-bold uppercase tracking-widest text-white/50">Descrição (opcional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3}
              placeholder="Ex.: hambúrguer artesanal com queijo derretido, em prato branco redondo"
              className="mt-1.5 w-full rounded-[16px] bg-white/[0.06] border border-white/15 px-3.5 py-3 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-white/40 resize-none" />
          </label>

          <DiameterField value={diameter} onChange={setDiameter} />

          <div className="mt-3 rounded-[16px] bg-white/[0.05] border border-white/10 px-3.5 py-3 text-[12.5px] text-white/70">
            Vai gastar <b className="text-white">~{overview.estimatedCost} créditos</b>
            {overview.balance !== null && <> (saldo atual: <b className="text-white">{overview.balance}</b>)</>}.
            {overview.provider === 'mock' && <span className="text-[#E8A317]"> Modo de teste: gera um modelo de exemplo, sem custo real.</span>}
          </div>

          {err && <div role="alert" className="mt-3 rounded-[16px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3.5 py-2.5 text-[12.5px]">{err}</div>}

          <div className="mt-5 flex flex-col gap-2">
            <button onClick={start} disabled={!file || sending || loadingImg} className={BTN_PRIMARY}>
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Sparkles className="w-4 h-4" /> Gerar modelo</>}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DiameterField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mt-4">
      <span className="text-[11.5px] font-bold uppercase tracking-widest text-white/50">Diâmetro real do prato (cm)</span>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="Ex.: 30"
        className="mt-1.5 w-full h-11 rounded-[16px] bg-white/[0.06] border border-white/15 px-3.5 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-white/40" />
      <span className="block mt-1 text-[11.5px] text-white/45">Define o tamanho no AR (a maior largura do prato/travessa). Se deixar vazio, mantém o tamanho do arquivo.</span>
    </label>
  )
}

const DIALOG_CARD = 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-w-[440px] max-h-[92vh] overflow-y-auto z-[101] rounded-[28px] bg-[#1d130b]/95 backdrop-blur-2xl border border-white/15 text-[#F5F1E8] p-5 outline-none'

function UploadDialog({ product, onClose, onDone }: { product: ArProduct; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [diameter, setDiameter] = useState(product.model?.diameterCm ? String(product.model.diameterCm) : '')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send() {
    if (!file) return
    setSending(true); setErr(null)
    try { await uploadGlb(product.id, file, diameter); onDone() }
    catch (e: any) { setErr(e.message); setSending(false) }
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
        <Dialog.Content aria-describedby={undefined} className={DIALOG_CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-white/50">Enviar modelo pronto</div>
              <Dialog.Title className="text-[20px] font-bold tracking-tight">{product.name}</Dialog.Title>
            </div>
            <Dialog.Close aria-label="Fechar" className="w-10 h-10 rounded-full border border-white/25 grid place-items-center flex-shrink-0"><X className="w-4 h-4" /></Dialog.Close>
          </div>
          <p className="mt-3 text-[12.5px] text-white/65">Envie um arquivo <b>.glb</b> (até 8 MB), por exemplo baixado do Meshy ou Tripo. Não gasta créditos.</p>
          <button onClick={() => input.current?.click()} className={cn(BTN_GHOST, 'w-full mt-3')}>
            <Upload className="w-4 h-4" /> {file ? file.name : 'Escolher arquivo .glb'}
          </button>
          <input ref={input} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <DiameterField value={diameter} onChange={setDiameter} />
          {err && <div role="alert" className="mt-3 rounded-[16px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3.5 py-2.5 text-[12.5px]">{err}</div>}
          <button onClick={send} disabled={!file || sending} className={cn(BTN_PRIMARY, 'w-full mt-5')}>
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : 'Enviar modelo'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SizeDialog({ product, onClose, onDone }: { product: ArProduct; onClose: () => void; onDone: () => void }) {
  const [diameter, setDiameter] = useState(product.model?.diameterCm ? String(product.model.diameterCm) : '')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function apply() {
    setSending(true); setErr(null)
    try { await setModelSize(product.id, diameter); onDone() }
    catch (e: any) { setErr(e.message); setSending(false) }
  }
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
        <Dialog.Content aria-describedby={undefined} className={DIALOG_CARD}>
          <Dialog.Title className="text-[20px] font-bold tracking-tight">Tamanho real · {product.name}</Dialog.Title>
          <DiameterField value={diameter} onChange={setDiameter} />
          {err && <div role="alert" className="mt-3 rounded-[16px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-3.5 py-2.5 text-[12.5px]">{err}</div>}
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={apply} disabled={sending || !diameter} className={BTN_PRIMARY}>{sending ? 'Aplicando…' : 'Aplicar tamanho'}</button>
            <Dialog.Close className={BTN_GHOST}>Cancelar</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
