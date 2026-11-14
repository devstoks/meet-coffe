/**
 * QR Code e NFC servem SÓ para entrar no cardápio (abrir/reabrir a mesa). Pedir e encerrar a comanda não exigem nova leitura.
 * Aqui ficam: o marcador de "leitor aberto aguardando a tag" e a extração do código da mesa a partir do que foi lido.
 */
const WAIT_KEY = 'meetcoffe_tap_wait'
const WAIT_MS = 5 * 60_000

function read(key: string): { at: number; code?: string } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw)
    return typeof v?.at === 'number' ? v : null
  } catch {
    return null
  }
}

export function markWaitingForTap() {
  try { localStorage.setItem(WAIT_KEY, JSON.stringify({ at: Date.now() })) } catch { /* storage indisponível */ }
}

export function clearWaitingForTap() {
  try { localStorage.removeItem(WAIT_KEY) } catch { /* noop */ }
}

export function isWaitingForTap(): boolean {
  const v = read(WAIT_KEY)
  return !!v && Date.now() - v.at < WAIT_MS
}

/** Extrai o código da mesa do conteúdo lido (QR/NFC/digitado): URL …/mesa/<código>, URL …?qr=<id> ou o código puro. */
export function tableCodeFromScan(text: string): string | null {
  const raw = text.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    const m = url.pathname.match(/\/mesa\/([^/]+)\/?$/)
    if (m) return decodeURIComponent(m[1])
    const qr = url.searchParams.get('qr')
    return qr ? qr.trim() : null
  } catch {
    return raw
  }
}
