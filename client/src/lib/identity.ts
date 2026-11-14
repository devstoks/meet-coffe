import { uuid } from './uuid'

const DEVICE_KEY = 'meetcoffe_device_id'
const NAME_KEY = 'meetcoffe_customer_name'

/** Identifica este celular como "uma pessoa" na mesa (consumo e encerramento individual). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = uuid(); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch {
    return uuid()
  }
}

/**
 * Depois que a comanda deste celular é paga, ele vira "uma pessoa nova": o histórico antigo (e o pagamento) continua
 * na comanda anterior e um novo pedido começa do zero, sem ser bloqueado pelo encerramento anterior.
 */
export function rotateDeviceId(): string {
  const id = uuid()
  try { localStorage.setItem(DEVICE_KEY, id) } catch { /* storage indisponível */ }
  return id
}

export function getCustomerName(): string {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

export function saveCustomerName(name: string) {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* noop */ }
}

const VIEW_KEY = 'meetcoffe_menu_view'
export type MenuViewChoice = 'feed' | 'list'

/** Formato de cardápio escolhido por ESTE celular. Vale só para a comanda atual: se o celular começa uma comanda nova, pergunta de novo. */
export function getMenuView(deviceId: string): MenuViewChoice | null {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null')
    return raw && raw.deviceId === deviceId && (raw.view === 'feed' || raw.view === 'list') ? raw.view : null
  } catch { return null }
}

export function saveMenuViewLocal(deviceId: string, view: MenuViewChoice) {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ deviceId, view })) } catch { /* noop */ }
}
