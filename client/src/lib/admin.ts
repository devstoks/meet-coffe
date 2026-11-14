import type { ClosureScope, OptionGroup, PaymentMethod, Selection } from './api'

export type AdminUser = { id: string; name: string; email: string; role: string }

export type KitchenOrderItem = {
  id: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
  observations: string | null
  selections: Selection[] // personalização escolhida (kit, sabor, recheio…)
  imagePath: string | null // Mantido para compatibilidade, mas pode ser images[0]
}

export type KitchenOrder = {
  id: string
  status: string
  totalAmount: number
  createdAt: string
  sessionId: string
  tableId: string
  customerName: string | null
  deviceId: string | null
  table: { number: string }
  items: KitchenOrderItem[]
}

export type TableStat = {
  tableId: string
  tableNumber: string
  orderCount: number
  customerCount: number
  subtotal: number
}

export type AdminProduct = {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  categoryId: string | null
  images: string[] // NOVO: Array de até 3 imagens
  videoPath: string | null
  active: boolean
  optionGroups?: OptionGroup[]
}

export type AdminCategory = {
  id: string
  name: string
  productCount: number
}

export type PaymentStatus = {
  connected: boolean
  mpUserId?: string
  terminals: { id: string; nickname: string | null; active: boolean }[]
}

export type AvailableTerminal = {
  id: string
  name: string
  operating_mode: string
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================
export async function adminLogin(email: string, password: string): Promise<{ user: AdminUser }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha no login')
  }
  return res.json()
}

export async function adminLogout() {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
}

export async function fetchAdminMe(): Promise<{ user: AdminUser }> {
  const res = await fetch('/api/admin/me', { credentials: 'include' })
  if (!res.ok) throw new Error('Não autenticado')
  return res.json()
}

// ==========================================
// PEDIDOS (COZINHA)
// ==========================================
export async function fetchKitchenOrders(): Promise<{ orders: KitchenOrder[]; tableStats: TableStat[] }> {
  const res = await fetch('/api/admin/orders', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao carregar pedidos')
  return res.json()
}

export async function updateOrderStatus(orderId: string, status: string) {
  const res = await fetch(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha ao atualizar status')
  }
  return res.json()
}

// ==========================================
// PRODUTOS
// ==========================================
export async function fetchAdminProducts(): Promise<{ products: AdminProduct[] }> {
  const res = await fetch('/api/admin/products', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao carregar produtos')
  return res.json()
}

export async function createProduct(data: { name: string; description: string; price: number; categoryId: string; active: boolean; optionGroups?: OptionGroup[] }) {
  const res = await fetch('/api/admin/products', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Falha ao criar produto')
  }
  return res.json() as Promise<{ product: AdminProduct }>
}

export async function updateProduct(id: string, patch: Partial<{ name: string; description: string; price: number; categoryId: string; active: boolean; optionGroups: OptionGroup[] }>) {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha ao atualizar produto')
  }
  return res.json() as Promise<{ product: AdminProduct }>
}

export async function deleteProduct(id: string) {
  const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao deletar produto')
  return res.json()
}

/** Foto de UMA opção de combo (já recortada em quadrado). Devolve só a URL; ela é gravada na opção quando o produto é salvo. */
export async function uploadOptionImage(file: File): Promise<{ url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/option-images', { method: 'POST', credentials: 'include', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha no envio da foto da opção')
  }
  return res.json() as Promise<{ url: string }>
}

export async function uploadProductImages(id: string, files: File[]) {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  const res = await fetch(`/api/admin/products/${id}/images`, { method: 'POST', credentials: 'include', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha no upload das imagens')
  }
  return res.json() as Promise<{ images: string[] }>
}

export async function removeProductImage(id: string, imageUrl: string) {
  const res = await fetch(`/api/admin/products/${id}/images`, {
    method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  })
  if (!res.ok) throw new Error('Falha ao remover imagem')
  return res.json() as Promise<{ images: string[] }>
}

export async function reorderProductImages(id: string, images: string[]) {
  const res = await fetch(`/api/admin/products/${id}/images/order`, {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha ao reordenar imagens')
  }
  return res.json() as Promise<{ images: string[] }>
}

export async function uploadProductVideo(id: string, file: File): Promise<{ videoPath: string }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`/api/admin/products/${id}/video`, { method: 'POST', credentials: 'include', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha no upload do vídeo')
  }
  return res.json()
}

export async function removeProductVideo(id: string): Promise<void> {
  const res = await fetch(`/api/admin/products/${id}/video`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao remover vídeo')
}

// ==========================================
// CATEGORIAS
// ==========================================
async function categoryError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}))
  const err: any = new Error(data.error ?? fallback)
  if (data.code) err.code = data.code
  if (typeof data.productCount === 'number') err.productCount = data.productCount
  throw err
}

export async function fetchCategories(): Promise<{ categories: AdminCategory[] }> {
  const res = await fetch('/api/admin/categories', { credentials: 'include' })
  if (!res.ok) return categoryError(res, 'Falha ao carregar categorias')
  return res.json()
}

export async function createCategory(name: string): Promise<{ category: AdminCategory }> {
  const res = await fetch('/api/admin/categories', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) return categoryError(res, 'Falha ao criar categoria')
  return res.json()
}

export async function renameCategory(id: string, name: string): Promise<{ category: AdminCategory }> {
  const res = await fetch(`/api/admin/categories/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) return categoryError(res, 'Falha ao renomear categoria')
  return res.json()
}

export async function deleteCategory(id: string, reassignTo?: string): Promise<{ ok: true; moved: number; movedTo?: string }> {
  const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : ''
  const res = await fetch(`/api/admin/categories/${id}${qs}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) return categoryError(res, 'Falha ao excluir categoria')
  return res.json()
}

// ==========================================
// PAGAMENTO E TERMINAIS
// ==========================================
export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  const res = await fetch('/api/admin/payment/status', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao carregar status do MP')
  return res.json()
}

export async function getMpConnectUrl(): Promise<{ url: string }> {
  const res = await fetch('/api/admin/payment/connect', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao gerar URL de conexão')
  return res.json()
}

export async function fetchAvailableTerminals(): Promise<{ terminals: AvailableTerminal[] }> {
  const res = await fetch('/api/admin/payment/terminals/available', { credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha ao listar terminais')
  }
  return res.json()
}

export async function saveTerminal(terminalId: string, nickname: string): Promise<{ pdv?: { ok: boolean; detail?: string } }> {
  const res = await fetch('/api/admin/payment/terminal', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminalId, nickname }),
  })
  if (!res.ok) throw new Error('Falha ao salvar terminal')
  return res.json().catch(() => ({}))
}

export async function cancelPendingPayments(): Promise<{ encontradas: number; resultados: { pedido: string; ok: boolean }[] }> {
  const res = await fetch('/api/admin/payment/cancel-pending', { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao cancelar cobranças pendentes')
  return res.json()
}

// ==========================================
// ENCERRAMENTO DE COMANDA / MESA
// ==========================================
export type ClosureItem = {
  id: string; productId: string; name: string; quantity: number; unitPrice: number; subtotal: number
  observations: string | null; selections: Selection[]; imagePath: string | null; status: string
}

export type ClosureParticipant = {
  key: string
  deviceId: string | null
  customerName: string
  subtotal: number
  fee: number
  total: number
  paid: number
  due: number
  inPreparation: number
  items: ClosureItem[]
}

export type ClosureRequestView = {
  id: string
  scope: ClosureScope
  status: 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED'
  paymentMethod: PaymentMethod
  amount: number
  total: number
  due: number
  tableId: string
  tableNumber: string
  sessionId: string
  deviceId: string | null
  customerName: string | null
  createdAt: string
  resolvedAt: string | null
  serviceFeePercent: number
  chargeSent: boolean
  inPreparation: number
  participants: ClosureParticipant[]
}

async function jsonOrThrow(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? fallback)
  return data
}

export async function fetchClosureRequests(): Promise<{ requests: ClosureRequestView[] }> {
  const res = await fetch('/api/admin/closure-requests', { credentials: 'include' })
  return jsonOrThrow(res, 'Falha ao carregar os encerramentos')
}

export async function cancelClosureRequest(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/admin/closure-requests/${id}/cancel`, { method: 'POST', credentials: 'include' })
  return jsonOrThrow(res, 'Falha ao cancelar o encerramento')
}

/** Dinheiro: a equipe recebeu e encerra a comanda (individual) ou a mesa (mesa toda). */
export async function settleClosureCash(id: string): Promise<{ ok: true; tableClosed: boolean }> {
  const res = await fetch(`/api/admin/closure-requests/${id}/settle-cash`, { method: 'POST', credentials: 'include' })
  return jsonOrThrow(res, 'Falha ao encerrar a comanda')
}

/** Botão "encerrar comanda desta pessoa" (recebido em dinheiro), sem precisar de solicitação do cliente. */
export async function closePersonCash(tableId: string, deviceId: string): Promise<{ ok: true; tableClosed: boolean }> {
  const res = await fetch(`/api/admin/tables/${tableId}/close-person`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })
  return jsonOrThrow(res, 'Falha ao encerrar a comanda da pessoa')
}

/** Cartão/PIX: envia a cobrança deste encerramento para a maquininha (a confirmação volta pelo webhook do Mercado Pago). */
export async function sendClosureToTerminal(req: ClosureRequestView): Promise<void> {
  const body = req.scope === 'INDIVIDUAL'
    ? { amount: req.due, deviceId: req.deviceId, customerName: req.customerName ?? req.participants[0]?.customerName }
    : {}
  const res = await fetch(`/api/admin/tables/${req.tableId}/request-payment`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await jsonOrThrow(res, 'Falha ao enviar a cobrança para a maquininha')
}
