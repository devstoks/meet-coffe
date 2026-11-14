import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'path'
import { createServer } from 'http'
import { tableRouter } from './routes/table.js'
import { ar3dRouter } from './features/ar3d/routes.js' // ar3d
import { productsRouter } from './routes/products.js'
import { ordersRouter } from './routes/orders.js'
import { adminRouter } from './routes/admin.js'
import { productsAdminRouter } from './routes/productsAdmin.js'
import { categoriesAdminRouter } from './routes/categoriesAdmin.js'
import { paymentAdminRouter } from './routes/paymentAdmin.js'
import { paymentsAdminRouter } from './routes/paymentsAdmin.js'
import { closureAdminRouter } from './routes/closureAdmin.js'
import { webhookRouter } from './routes/webhook.js'
import { analyticsRouter } from './routes/analytics.js' // NOVO
import { initSocket } from './socket.js'

const app = express()
const httpServer = createServer(app)

initSocket(httpServer)

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      if (/^http:\/\/(\d{1,3}\.){3}\d{1,3}:5173$/.test(origin)) {
        return cb(null, true)
      }
      if (origin.endsWith('.trycloudflare.com') || origin.endsWith('.ts.net')) {
        return cb(null, true)
      }
      return cb(new Error(`CORS bloqueado: ${origin}`))
    },
    credentials: true,
  })
)

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)
app.use(express.json())
app.use(cookieParser())

const uploadsDir = path.resolve(process.cwd(), '..', 'uploads')
app.use(
  '/uploads',
  express.static(uploadsDir, {
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })
)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'upvo-api' })
})

app.use('/api', tableRouter)
app.use('/api', productsRouter)
app.use('/api', ordersRouter)
app.use('/api', adminRouter)
app.use('/api', productsAdminRouter)
app.use('/api', categoriesAdminRouter)
app.use('/api', paymentAdminRouter)
app.use('/api', paymentsAdminRouter)
app.use('/api', closureAdminRouter)
app.use('/api', webhookRouter)
app.use('/api', analyticsRouter) // NOVO
app.use('/api', ar3dRouter) // ar3d (feature 3D/AR — desligada sem FEATURE_3D=true)

const PORT = Number(process.env.PORT) || 3333
httpServer.listen(PORT, '0.0.0.0', () =>
  console.log(`API on :${PORT} (0.0.0.0)`)
)