import { Router } from 'express'
import { randomBytes, createHash } from 'crypto'
import { prisma } from '../db.js'
import { emitToKitchen } from '../socket.js'

export const tableRouter = Router()

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

tableRouter.post('/mesa/:tableCode', async (req, res) => {
  const { tableCode } = req.params

  // Aceita o código público da tag NFC (ex.: M01) ou o identificador do QR Code (ex.: QR-M01-slug) — ambos são únicos.
  const table = await prisma.cafeTable.findFirst({
    where: { OR: [{ nfcPublicId: tableCode }, { qrIdentifier: tableCode }] },
    include: {
      sessions: { where: { status: { not: 'CLOSED' } }, take: 1 },
    },
  })

  if (!table) return res.status(404).json({ error: 'Mesa não encontrada' })

  let session = table.sessions[0]

  let created = false
  if (!session) {
    // Trava por mesa: dois acessos simultâneos (ex.: 2 celulares ou clique duplo) não criam sessões duplicadas
    // nem disparam o aviso "mesa ocupada" duas vezes.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${table.id}))`

      const existing = await tx.tableSession.findFirst({
        where: { tableId: table.id, status: { not: 'CLOSED' } },
      })
      if (existing) return { session: existing, created: false }

      await tx.cafeTable.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED' },
      })

      const newSession = await tx.tableSession.create({
        data: {
          businessId: table.businessId,
          tableId: table.id,
          tokenHash: hashToken(randomBytes(32).toString('hex')),
          status: 'OPEN',
        },
      })

      await tx.tab.create({
        data: {
          businessId: table.businessId,
          sessionId: newSession.id,
          tableId: table.id,
          status: 'OPEN',
          totalAmount: 0,
        },
      })

      return { session: newSession, created: true }
    })
    session = result.session
    created = result.created
  }

  // AVISA A DASHBOARD QUE UMA MESA FOI ABERTA (só quando esta chamada realmente criou a sessão)
  if (created) {
    emitToKitchen(table.businessId, 'table_opened', {
      tableNumber: table.number,
      tableId: table.id,
    })
  }

  const rawAccessToken = randomBytes(32).toString('hex')
  await prisma.sessionAccess.create({
    data: {
      sessionId: session.id,
      tokenHash: hashToken(rawAccessToken),
      deviceIdentifier: req.headers['user-agent'] ?? null,
    },
  })

  res.cookie('session_access', rawAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 4,
  })

  return res.json({
    sessionId: session.id,
    table: { id: table.id, number: table.number, status: 'OCCUPIED' },
  })
})