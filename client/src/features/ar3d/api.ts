// Feature 3D/AR — chamadas à API (tudo isolado aqui).
export type ArModel = { glb: string; v: number }

export type ModelView = {
  status: 'PROCESSING' | 'READY' | 'FAILED'
  progress: number
  credits: number
  diameterCm: number | null
  source: 'ai' | 'upload'
  sizeBytes: number | null
  error: string | null
  description: string | null
  updatedAt: string
  glb: string | null
}
export type ArProduct = { id: string; name: string; image: string | null; active: boolean; model: ModelView | null }
export type ArOverview = { provider: string; balance: number | null; estimatedCost: number; maxGlbMb: number; products: ArProduct[] }

async function jsonOrThrow(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? fallback)
  return data
}

export async function fetchArConfig(): Promise<boolean> {
  try {
    const res = await fetch('/api/ar/config')
    if (!res.ok) return false
    return !!(await res.json()).enabled
  } catch { return false }
}

export async function fetchArModels(): Promise<Record<string, ArModel>> {
  try {
    const res = await fetch('/api/ar/models')
    if (!res.ok) return {}
    return (await res.json()).models ?? {}
  } catch { return {} }
}

export async function fetchOverview(): Promise<ArOverview> {
  const res = await fetch('/api/admin/3d/overview', { credentials: 'include' })
  return jsonOrThrow(res, 'Falha ao carregar o painel 3D')
}

export async function generateModel(productId: string, image: File, description: string, diameterCm: string) {
  const fd = new FormData()
  fd.append('diameterCm', diameterCm)
  fd.append('productId', productId)
  fd.append('description', description)
  fd.append('image', image)
  const res = await fetch('/api/admin/3d/generate', { method: 'POST', credentials: 'include', body: fd })
  return jsonOrThrow(res, 'Falha ao iniciar a geração')
}

export async function deleteModel(productId: string) {
  const res = await fetch(`/api/admin/3d/${productId}`, { method: 'DELETE', credentials: 'include' })
  return jsonOrThrow(res, 'Falha ao remover o modelo')
}

export async function uploadGlb(productId: string, glb: File, diameterCm: string) {
  const fd = new FormData()
  fd.append('productId', productId)
  fd.append('diameterCm', diameterCm)
  fd.append('glb', glb)
  const res = await fetch('/api/admin/3d/upload', { method: 'POST', credentials: 'include', body: fd })
  return jsonOrThrow(res, 'Falha ao enviar o modelo')
}

export async function setModelSize(productId: string, diameterCm: string) {
  const res = await fetch(`/api/admin/3d/${productId}/size`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diameterCm }),
  })
  return jsonOrThrow(res, 'Falha ao ajustar o tamanho')
}
