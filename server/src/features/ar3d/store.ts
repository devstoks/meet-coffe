// Armazenamento em ARQUIVOS (uploads/models3d/<productId>/): sem tabela nova no banco, entra
// automaticamente no backup da pasta uploads e é removido apagando a pasta.
import fs from 'fs'
import path from 'path'
import { MODELS_ROOT } from './config.js'

export type ModelMeta = {
  productId: string
  businessId: string
  status: 'PROCESSING' | 'READY' | 'FAILED'
  progress: number
  provider: string
  taskId: string | null
  description: string | null
  credits: number
  diameterCm: number | null
  source: 'ai' | 'upload'
  sizeBytes: number | null
  error: string | null
  createdAt: string
  updatedAt: string
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '')
export const modelDir = (productId: string) => path.join(MODELS_ROOT, safeId(productId))
export const glbPathOf = (productId: string) => path.join(modelDir(productId), 'model.glb')
export const origPathOf = (productId: string) => path.join(modelDir(productId), 'model.orig.glb')
export const glbUrlOf = (productId: string) => `/uploads/models3d/${safeId(productId)}/model.glb`

export function readMeta(productId: string): ModelMeta | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(modelDir(productId), 'meta.json'), 'utf8'))
    return { diameterCm: null, source: 'ai', ...m }
  } catch { return null }
}
export function writeMeta(meta: ModelMeta) {
  fs.mkdirSync(modelDir(meta.productId), { recursive: true })
  fs.writeFileSync(path.join(modelDir(meta.productId), 'meta.json'), JSON.stringify(meta, null, 2))
}
export function saveGlb(productId: string, buf: Buffer) {
  fs.mkdirSync(modelDir(productId), { recursive: true })
  fs.writeFileSync(glbPathOf(productId), buf)
}
export function saveOrig(productId: string, buf: Buffer) {
  fs.mkdirSync(modelDir(productId), { recursive: true })
  fs.writeFileSync(origPathOf(productId), buf)
}
export function readOrig(productId: string): Buffer | null {
  try { return fs.readFileSync(origPathOf(productId)) } catch { return null }
}
export function removeModel(productId: string) {
  fs.rmSync(modelDir(productId), { recursive: true, force: true })
}
export function listMetas(): ModelMeta[] {
  try {
    return fs.readdirSync(MODELS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => readMeta(d.name))
      .filter((m): m is ModelMeta => !!m)
  } catch { return [] }
}
