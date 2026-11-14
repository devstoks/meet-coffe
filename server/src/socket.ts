import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from './db.js'

let io: Server | null = null

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  if (origin === 'http://localhost:5173') return true
  if (origin === 'http://127.0.0.1:5173') return true
  if (/^http:\/\/(\d{1,3}\.){3}\d{1,3}:5173$/.test(origin)) return true
  if (origin.endsWith('.trycloudflare.com') || origin.endsWith('.ts.net')) return true
  return false
}

export function kitchenRoom(businessId: string) {
  return `kitchen:${businessId}`
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()) } catch { return null }
    }
  }
  return null
}

// Autentica o socket pelo mesmo cookie JWT das rotas admin. Retorna o businessId ou null.
async function authorizeKitchen(cookieHeader: string | undefined): Promise<string | null> {
  const token = readCookie(cookieHeader, 'admin_token')
  if (!token) return null
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { sub: string }
    const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } })
    if (!user || !user.active) return null
    return user.businessId
  } catch {
    return null
  }
}

export function initSocket(httpServer: any) {
  io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin)), credentials: true },
  })

  io.on('connection', (socket) => {
    // Só entra na sala quem tem sessão admin válida; a sala é isolada por negócio.
    socket.on('join:kitchen', async (ack?: (res: { ok: boolean }) => void) => {
      const businessId = await authorizeKitchen(socket.handshake.headers.cookie)
      if (!businessId) {
        if (typeof ack === 'function') ack({ ok: false })
        return
      }
      socket.join(kitchenRoom(businessId))
      if (typeof ack === 'function') ack({ ok: true })
    })

    socket.on('join:session', (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        socket.join(`session:${sessionId}`)
      }
    })

    // Avisa os outros celulares que alguém está no processo de escanear o QR de fechamento
    socket.on('closure:requesting', (sessionId: string) => {
      if (sessionId) socket.to(`session:${sessionId}`).emit('closure:awaiting_confirmation')
    })

    // Avisa os outros celulares que o processo foi cancelado
    socket.on('closure:cancelled', (sessionId: string) => {
      if (sessionId) socket.to(`session:${sessionId}`).emit('closure:cancelled')
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO não inicializado')
  return io
}

export function emitToKitchen(businessId: string, event: string, payload: unknown) {
  getIO().to(kitchenRoom(businessId)).emit(event, payload)
}
