import express, { Router } from 'express'
import multer from 'multer'
import { prisma } from '../../db.js'
import { requireAdmin } from '../../middleware/auth.js'
import { ar3dEnabled, MAX_GLB_BYTES, MAX_IMAGE_BYTES } from './config.js'
import { getProvider } from './providers/index.js'
import { glbUrlOf, listMetas, readMeta, readOrig, removeModel, saveGlb, saveOrig, writeMeta, type ModelMeta } from './store.js'
import { bakeRealSize, horizontalSizeCm, isGlb } from './glb.js'

export const ar3dRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Use JPG, PNG ou WebP.')),
})

const uploadGlb = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_GLB_BYTES },
})

const parseCm = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 5 && n <= 100 ? Math.round(n * 10) / 10 : null
}

const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')

// Config pública: o front só mostra botão/aba 3D se enabled = true.
ar3dRouter.get('/ar/config', (_req, res) => res.json({ enabled: ar3dEnabled() }))

// Lista pública de modelos prontos, por produto (usada pelo botão AR do Feed).
ar3dRouter.get('/ar/models', async (_req, res) => {
  if (!ar3dEnabled()) return res.json({ models: {} })
  const ready = listMetas().filter((m) => m.status === 'READY')
  if (ready.length === 0) return res.json({ models: {} })
  const active = await prisma.product.findMany({
    where: { id: { in: ready.map((m) => m.productId) }, active: true },
    select: { id: true },
  })
  const ok = new Set(active.map((p) => p.id))
  const models: Record<string, { glb: string; v: number }> = {}
  for (const m of ready) if (ok.has(m.productId)) models[m.productId] = { glb: glbUrlOf(m.productId), v: Date.parse(m.updatedAt) }
  res.json({ models })
})

function adminOnly(req: any, res: any, next: any) {
  if (!ar3dEnabled()) return res.status(404).json({ error: 'Recurso 3D desativado' })
  if (req.admin?.role !== 'ADMIN') return res.status(403).json({ error: 'Apenas administradores' })
  next()
}

async function refresh(meta: ModelMeta): Promise<ModelMeta> {
  if (meta.status !== 'PROCESSING' || !meta.taskId) return meta
  try {
    const r = await getProvider().getTask(meta.taskId)
    const next: ModelMeta = { ...meta, progress: r.progress, updatedAt: new Date().toISOString() }
    if (r.state === 'READY' && r.glb) {
      if (r.glb.length > MAX_GLB_BYTES) {
        next.status = 'FAILED'
        next.error = `Modelo muito pesado (${(r.glb.length / 1048576).toFixed(1)} MB). O limite para o celular é ${MAX_GLB_BYTES / 1048576} MB.`
      } else {
        saveOrig(meta.productId, r.glb)
        const baked = bakeRealSize(r.glb, meta.diameterCm ?? 0)
        saveGlb(meta.productId, baked)
        next.status = 'READY'; next.sizeBytes = baked.length; next.error = null
      }
    } else if (r.state === 'FAILED') {
      next.status = 'FAILED'; next.error = r.error ?? 'Falha na geração'
    }
    writeMeta(next)
    return next
  } catch (err: any) {
    return meta // erro de rede temporário: tenta de novo no próximo poll
  }
}

const view = (m: ModelMeta | null) => m && ({
  status: m.status, progress: m.progress, credits: m.credits, diameterCm: m.diameterCm, source: m.source, sizeBytes: m.sizeBytes, error: m.error,
  description: m.description, updatedAt: m.updatedAt, glb: m.status === 'READY' ? glbUrlOf(m.productId) : null,
})

ar3dRouter.get('/admin/3d/overview', requireAdmin, adminOnly, async (req, res) => {
  const provider = getProvider()
  let balance: number | null = null
  try { balance = await provider.getBalance() } catch { /* saldo indisponível */ }
  const products = await prisma.product.findMany({
    where: { businessId: req.admin!.businessId },
    select: { id: true, name: true, images: true, active: true },
    orderBy: { createdAt: 'asc' },
  })
  const out = []
  for (const p of products) {
    let m = readMeta(p.id)
    if (m && m.businessId !== req.admin!.businessId) m = null
    if (m) m = await refresh(m)
    out.push({ id: p.id, name: p.name, image: p.images[0] ?? null, active: p.active, model: view(m) })
  }
  res.json({ provider: provider.name, balance, estimatedCost: provider.estimateCost(), maxGlbMb: MAX_GLB_BYTES / 1048576, products: out })
})

ar3dRouter.post('/admin/3d/generate', requireAdmin, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const productId = str(req.body?.productId)
    const description = str(req.body?.description).trim().slice(0, 500) || null
    const diameterCm = parseCm(req.body?.diameterCm)
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem do prato.' })
    const product = await prisma.product.findFirst({ where: { id: productId, businessId: req.admin!.businessId } })
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' })
    const current = readMeta(productId)
    if (current?.status === 'PROCESSING') return res.status(409).json({ error: 'Já existe uma geração em andamento para este produto.' })

    const provider = getProvider()
    const { taskId, credits } = await provider.createTask({ image: req.file.buffer, mime: req.file.mimetype, description: description ?? undefined })
    const now = new Date().toISOString()
    const meta: ModelMeta = {
      productId, businessId: req.admin!.businessId, status: 'PROCESSING', progress: 0, provider: provider.name, taskId,
      description, diameterCm, source: 'ai', credits: (current?.credits ?? 0) + credits, sizeBytes: current?.sizeBytes ?? null, error: null,
      createdAt: current?.createdAt ?? now, updatedAt: now,
    }
    writeMeta(meta)
    res.status(202).json({ model: view(meta) })
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Falha ao iniciar a geração' })
  }
})

ar3dRouter.delete('/admin/3d/:productId', requireAdmin, adminOnly, async (req, res) => {
  const productId = str(req.params.productId)
  const m = readMeta(productId)
  if (!m || m.businessId !== req.admin!.businessId) return res.status(404).json({ error: 'Modelo não encontrado' })
  removeModel(productId)
  res.json({ ok: true })
})

// Envio manual de um GLB pronto (ex.: baixado de Meshy/Tripo/Polycam). Não gasta créditos.
ar3dRouter.post('/admin/3d/upload', requireAdmin, adminOnly, uploadGlb.single('glb'), async (req, res) => {
  try {
    const productId = str(req.body?.productId)
    const diameterCm = parseCm(req.body?.diameterCm)
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo .glb.' })
    if (!isGlb(req.file.buffer)) return res.status(400).json({ error: 'Arquivo inválido: precisa ser um GLB (glTF binário 2.0).' })
    const product = await prisma.product.findFirst({ where: { id: productId, businessId: req.admin!.businessId } })
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' })
    const current = readMeta(productId)
    if (current?.status === 'PROCESSING') return res.status(409).json({ error: 'Já existe uma geração em andamento para este produto.' })
    saveOrig(productId, req.file.buffer)
    const baked = bakeRealSize(req.file.buffer, diameterCm ?? 0)
    saveGlb(productId, baked)
    const now = new Date().toISOString()
    const meta: ModelMeta = {
      productId, businessId: req.admin!.businessId, status: 'READY', progress: 100, provider: 'upload', taskId: null,
      description: current?.description ?? null, diameterCm, source: 'upload', credits: current?.credits ?? 0,
      sizeBytes: baked.length, error: null, createdAt: current?.createdAt ?? now, updatedAt: now,
    }
    writeMeta(meta)
    res.json({ model: view(meta), originalCm: horizontalSizeCm(req.file.buffer) })
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Falha ao enviar o modelo' })
  }
})

// Reajusta o tamanho real (diâmetro do prato, em cm) a partir do arquivo original guardado.
ar3dRouter.patch('/admin/3d/:productId/size', requireAdmin, adminOnly, express.json(), async (req, res) => {
  const productId = str(req.params.productId)
  const m = readMeta(productId)
  if (!m || m.businessId !== req.admin!.businessId || m.status !== 'READY') return res.status(404).json({ error: 'Modelo não encontrado' })
  const diameterCm = parseCm(req.body?.diameterCm)
  if (diameterCm === null) return res.status(400).json({ error: 'Informe um diâmetro entre 5 e 100 cm.' })
  const orig = readOrig(productId)
  if (!orig) return res.status(409).json({ error: 'Arquivo original não encontrado; gere ou envie o modelo de novo.' })
  const baked = bakeRealSize(orig, diameterCm)
  saveGlb(productId, baked)
  const next: ModelMeta = { ...m, diameterCm, sizeBytes: baked.length, updatedAt: new Date().toISOString() }
  writeMeta(next)
  res.json({ model: view(next) })
})
