export type Product = {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  images: string[]
  videoPath: string | null
  optionGroups?: OptionGroup[]
}

// Personalização: cada grupo (Escolha sua comida, bebida, adicionais…) pede de `min` a `max` opções; a opção pode ter
// imagem, descrição, valor adicional (em CENTAVOS inteiros) e variações (Recheio, Sabor…).
export type OptionVariant = { id: string; name: string }
export type ProductOption = {
  id: string; name: string; description?: string | null; image?: string | null
  priceCents: number; priceDelta: number; variantLabel: string | null; variants: OptionVariant[]
}
export type OptionGroup = { id: string; name: string; description?: string | null; min: number; max: number; required: boolean; options: ProductOption[] }
export type SelectionInput = { groupId: string; optionId: string; variantId?: string | null }
export type Selection = {
  groupId: string; groupName: string; optionId: string; optionName: string
  variantId: string | null; variantName: string | null; priceCents: number; priceDelta: number
}

export type ProductsResponse = {
  business: { name: string; slug: string }
  categories?: string[]
  products: Product[]
}

export type SubmittedOrderItem = {
  id: string
  productId: string
  name: string
  unitPrice: number
  quantity: number
  subtotal: number
  observations: string | null
  selections?: Selection[]
}

export type SubmittedOrder = {
  id: string
  status: string
  totalAmount: number
  createdAt: string
  customerName: string | null
  deviceId: string | null
  items: SubmittedOrderItem[]
}

export type SummaryEntry = {
  deviceId: string
  customerName: string
  orderCount: number
  subtotal: number
  totalWithFee: number
}

export type PaymentMethod = 'DEBIT' | 'CREDIT' | 'PIX' | 'CASH'
export type ClosureScope = 'INDIVIDUAL' | 'TABLE'

/** Estado do encerramento DESTE celular (vem do servidor): é ele que decide a tela, nunca o pagamento de outra pessoa. */
export type ClosureState = {
  requestId: string
  scope: ClosureScope
  status: 'AWAITING_PAYMENT' | 'PAID'
  paymentMethod: PaymentMethod
  amount: number
  customerName: string | null
  chargeSent: boolean
  createdAt: string
}

export type SessionResponse = {
  session: { id: string; status: string; authorized: boolean }
  table: { number: string }
  business?: { googleReviewUrl: string | null }
  tab: { id: string; status: string; totalAmount: number } | null
  orders: SubmittedOrder[]
  summary: SummaryEntry[]
  peopleCount: number
  subtotal: number
  serviceFee: number
  totalWithFee: number
  serviceFeePercent: number
  tablePaid: number
  tableDue: number // quanto ainda falta pagar na mesa toda (já descontando quem quitou a própria comanda)
  /** Outras pessoas com comanda em aberto (não pediram o pagamento individual). 0 = "Mesa toda" indisponível. */
  othersOpen?: number
  /** Formato de cardápio que este celular escolheu na entrada (null = ainda não escolheu). */
  menuView?: MenuView | null
  closure: ClosureState | null
}

export async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch('/api/products', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao carregar produtos')
  return res.json()
}

type OpenTableResult = { sessionId: string; table: { id: string; number: string; status: string } }
const openTableInFlight = new Map<string, Promise<OpenTableResult>>()

// Chamadas simultâneas para a mesma mesa (ex.: StrictMode em dev) compartilham uma única requisição
export function openTable(tableCode: string): Promise<OpenTableResult> {
  const existing = openTableInFlight.get(tableCode)
  if (existing) return existing
  const req = (async () => {
    const res = await fetch(`/api/mesa/${encodeURIComponent(tableCode)}`, { method: 'POST', credentials: 'include' })
    if (!res.ok) throw new Error('Mesa não encontrada')
    return res.json() as Promise<OpenTableResult>
  })().finally(() => { openTableInFlight.delete(tableCode) })
  openTableInFlight.set(tableCode, req)
  return req
}

export class SessionInvalidError extends Error {}

export async function fetchSession(deviceId?: string): Promise<SessionResponse> {
  const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
  const res = await fetch(`/api/session${qs}`, { credentials: 'include' })
  if (res.status === 401) throw new SessionInvalidError('Sessão inválida')
  if (!res.ok) throw new Error('Falha ao carregar a sessão')
  return res.json()
}

export type DraftItemPayload = { productId: string; quantity: number; observations?: string; selections?: SelectionInput[] }

export async function submitOrder(
  items: DraftItemPayload[],
  idempotencyKey: string,
  customerName?: string,
  deviceId?: string,
): Promise<{ order: SubmittedOrder }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, idempotencyKey, customerName, deviceId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err: any = new Error(data.error ?? 'Falha ao enviar pedido')
    if (data.code) err.code = data.code
    throw err
  }
  return res.json()
}

/** Encerramento: escolher a forma só registra a solicitação; o pagamento só vale quando a maquininha/equipe confirma. */
export async function requestClosure(input: {
  scope: 'individual' | 'table'
  method: PaymentMethod
  deviceId: string
  customerName?: string
}): Promise<{ ok: true; duplicate: boolean; closure: { requestId: string; scope: ClosureScope; status: string; paymentMethod: PaymentMethod; amount: number } }> {
  const res = await fetch('/api/session/close-request', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: any = new Error(data.error ?? 'Falha ao solicitar o encerramento')
    if (data.code) err.code = data.code
    throw err
  }
  return data
}

/** Falta alguma escolha? Devolve o nome do grupo/variação pendente (ou null se está tudo certo). Respeita mínimo e máximo. */
export function missingSelection(groups: OptionGroup[] | undefined, selections: SelectionInput[]): string | null {
  for (const g of groups ?? []) {
    const chosen = selections.filter((s) => s.groupId === g.id)
    if (chosen.length < g.min || chosen.length > g.max) return g.name
    for (const sel of chosen) {
      const opt = g.options.find((o) => o.id === sel.optionId)
      if (opt && opt.variants.length > 0 && !sel.variantId) return opt.variantLabel || opt.name
    }
  }
  return null
}

/** Valor original, adicionais e valor final de UMA unidade — tudo em centavos inteiros (sem erro de arredondamento). */
export function priceBreakdown(product: Product, selections: SelectionInput[]) {
  const baseCents = Math.round(product.price * 100)
  let extraCents = 0
  for (const s of selections) {
    const opt = product.optionGroups?.find((g) => g.id === s.groupId)?.options.find((o) => o.id === s.optionId)
    if (opt) extraCents += opt.priceCents || 0
  }
  return { baseCents, extraCents, totalCents: baseCents + extraCents }
}

/** Preço unitário (em reais) com os adicionais das opções escolhidas. */
export function unitPriceWith(product: Product, selections: SelectionInput[]): number {
  return priceBreakdown(product, selections).totalCents / 100
}

export function formatPrice(value: number) {
  return formatCents(Math.round(value * 100))
}

/** Centavos inteiros → "R$ 1.234,50" (formato brasileiro). */
export function formatCents(cents: number) {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`
}

/** Preferência de navegação do cliente, registrada na entrada da mesa. */
export type MenuView = 'feed' | 'list'

export async function saveMenuView(view: MenuView, deviceId: string): Promise<void> {
  const res = await fetch('/api/session/menu-view', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ view, deviceId }),
  })
  if (res.status === 401) throw new SessionInvalidError('Sessão inválida')
  if (!res.ok) throw new Error('Não foi possível registrar a sua escolha')
}