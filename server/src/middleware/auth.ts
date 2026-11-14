import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'

export type AdminPayload = {
  sub: string
  businessId: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload
    }
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = (req as any).cookies?.admin_token
  if (!token) return res.status(401).json({ error: 'Não autenticado' })

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as unknown as AdminPayload

    const user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
    })

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sessão inválida' })
    }

    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Sessão inválida' })
  }
}