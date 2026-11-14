import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { randomUUID } from 'node:crypto'
import { encrypt, decrypt } from '../lib/crypto.js'
import { reopenAfterFailedCharge } from '../lib/tableBilling.js'
import { stopSplit } from '../lib/splitQueue.js'

export const paymentAdminRouter = Router()

// 1. Verifica se a conta já está conectada
paymentAdminRouter.get('/admin/payment/status', requireAdmin, async (req, res) => {
  const account = await prisma.businessPaymentAccount.findUnique({
    where: { businessId: req.admin!.businessId },
    include: { terminals: true },
  })
  if (!account) return res.json({ connected: false, terminals: [] })

  return res.json({
    connected: true,
    mpUserId: account.mpUserId,
    terminals: account.terminals.map((t) => ({
      id: t.terminalId,
      nickname: t.nickname,
      active: t.active,
    })),
  })
})

// 2. Gera URL de autorização do Mercado Pago
paymentAdminRouter.get('/admin/payment/connect', requireAdmin, (req, res) => {
  const url = `https://auth.mercadopago.com.br/authorization?client_id=${process.env.MP_CLIENT_ID}&response_type=code&platform_id=mp&redirect_uri=${process.env.MP_REDIRECT_URI}&state=${req.admin!.businessId}`
  res.json({ url })
})

// 3. Callback que recebe o code e troca por Access Token
paymentAdminRouter.get('/admin/payment/callback', async (req, res) => {
  const { code, state: businessId } = req.query
  if (!code || !businessId) return res.status(400).send('Parâmetros inválidos')

  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.MP_REDIRECT_URI,
    }),
  })

  const data = await tokenRes.json()
  if (!tokenRes.ok) {
    console.error('Erro OAuth:', data)
    return res.status(400).send('Falha ao obter token')
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.businessPaymentAccount.upsert({
    where: { businessId: businessId as string },
    update: {
      mpUserId: String(data.user_id),
      accessTokenEncrypted: encrypt(data.access_token),
      refreshTokenEncrypted: encrypt(data.refresh_token),
      tokenExpiresAt: expiresAt,
      status: 'ACTIVE',
    },
    create: {
      businessId: businessId as string,
      mpUserId: String(data.user_id),
      accessTokenEncrypted: encrypt(data.access_token),
      refreshTokenEncrypted: encrypt(data.refresh_token),
      tokenExpiresAt: expiresAt,
      status: 'ACTIVE',
    },
  })

  res.send(`
    <html><body style="background:#F5F1E8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;">
        <h2 style="color:#354638;">Conta conectada com sucesso!</h2>
        <p style="color:#574538;">Você já pode fechar esta janela.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </div>
    </body></html>
  `)
})

// 4. Lista os terminais reais da conta MP
paymentAdminRouter.get('/admin/payment/terminals/available', requireAdmin, async (req, res) => {
  const account = await prisma.businessPaymentAccount.findUnique({
    where: { businessId: req.admin!.businessId },
  })
  if (!account) return res.status(400).json({ error: 'Conta não conectada' })

  const mpRes = await fetch('https://api.mercadopago.com/terminals/v1/list', {
    headers: {
      Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}`,
    },
  })
  
  const data = await mpRes.json()
  if (!mpRes.ok) {
    console.error('Erro ao listar terminais:', data)
    return res.status(500).json({ error: 'Falha ao listar terminais no MP' })
  }
  
  res.json({
    terminals: ((data.data?.terminals ?? data.terminals) || []).map((t: any) => ({
      id: t.id,
      name: t.name ?? "Point " + String(t.id).split("__").pop(),
      operating_mode: t.operating_mode,
    })),
  })
})

// 5. Define o terminal principal para a cafeteria
paymentAdminRouter.post('/admin/payment/terminal', requireAdmin, async (req, res) => {
  const { terminalId, nickname } = req.body
  const account = await prisma.businessPaymentAccount.findUnique({
    where: { businessId: req.admin!.businessId },
  })
  if (!account) return res.status(400).json({ error: 'Conta não conectada' })

  await prisma.businessTerminal.upsert({
    where: { id: `${account.id}_${terminalId}` },
    update: { terminalId, nickname: nickname || null, active: true },
    create: {
      id: `${account.id}_${terminalId}`,
      businessId: req.admin!.businessId,
      paymentAccountId: account.id,
      terminalId,
      nickname: nickname || null,
      operatingMode: 'PDV',
      active: true,
    },
  })
  // Só um terminal ativo por estabelecimento: evita cobrar num terminal antigo (ex.: o virtual de teste).
  await prisma.businessTerminal.updateMany({
    where: { businessId: req.admin!.businessId, id: { not: `${account.id}_${terminalId}` } },
    data: { active: false },
  })

  // Melhor esforço: coloca o terminal em modo PDV (necessário para receber cobranças pela API).
  let pdv: { ok: boolean; detail?: string } = { ok: true }
  try {
    const r = await fetch('https://api.mercadopago.com/terminals/v1/setup', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${decrypt(account.accessTokenEncrypted)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminals: [{ id: terminalId, operating_mode: 'PDV' }] }),
    })
    if (!r.ok) {
      const d: any = await r.json().catch(() => ({}))
      pdv = { ok: false, detail: `${r.status} ${d?.errors?.[0]?.code ?? d?.message ?? ''}`.trim() }
      console.warn('Ativar PDV falhou:', r.status, d)
    }
  } catch (e: any) { pdv = { ok: false, detail: e.message } }
  res.json({ ok: true, pdv })
})
// Diagnóstico (somente admin): mostra com qual conta/terminal o sistema está cobrando e o que o
// Mercado Pago diz das últimas cobranças. Não retorna tokens nem segredos.
paymentAdminRouter.get('/admin/payment/diagnostics', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId }, include: { terminals: true } })
  if (!account) return res.json({ conectado: false, aviso: 'Nenhuma conta Mercado Pago conectada.' })

  const token = decrypt(account.accessTokenEncrypted)
  const payments = await prisma.payment.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 3 })
  const ultimas = []
  for (const p of payments) {
    let mp: any = null
    if (p.mpOrderId) {
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/orders/${p.mpOrderId}`, { headers: { Authorization: `Bearer ${token}` } })
        const d: any = await r.json()
        mp = r.ok
          ? { status: d.status, status_detail: d.status_detail, terminal_id: d.config?.point?.terminal_id, valor: d.total_amount, pagamentos: (d.transactions?.payments ?? []).map((x: any) => ({ status: x.status, status_detail: x.status_detail })) }
          : { erro: r.status, detalhe: d?.errors ?? d?.message ?? d }
      } catch (e: any) { mp = { erro: 'falha ao consultar', detalhe: e.message } }
    }
    ultimas.push({ criadaEm: p.createdAt, statusNoSistema: p.status, valor: Number(p.amount), terminalUsado: p.terminalId, pedidoMP: p.mpOrderId, noMercadoPago: mp })
  }

  let terminaisNaConta: unknown = null
  try {
    const r = await fetch('https://api.mercadopago.com/terminals/v1/list', { headers: { Authorization: `Bearer ${token}` } })
    const d: any = await r.json()
    terminaisNaConta = r.ok ? (d.data?.terminals ?? d.terminals ?? []).map((t: any) => ({ id: t.id, nome: t.name, modo: t.operating_mode, loja: t.store_id, caixa: t.pos_id })) : { erro: r.status, detalhe: d }
  } catch { terminaisNaConta = 'falha ao consultar' }

  res.json({
    conectado: true,
    contaMercadoPago: account.mpUserId,
    contaDeTesteAntiga: account.mpUserId === 'TEST_USER',
    terminaisNoSistema: account.terminals.map((t) => ({ id: t.terminalId, ativo: t.active })),
    terminaisNaConta,
    ultimasCobrancas: ultimas,
  })
})


// Cancela cobranças pendentes no Mercado Pago (libera a fila da maquininha) e reabre as mesas
paymentAdminRouter.post('/admin/payment/cancel-pending', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const account = await prisma.businessPaymentAccount.findUnique({ where: { businessId } })
  if (!account) return res.status(400).json({ error: 'Conta não conectada' })
  const token = decrypt(account.accessTokenEncrypted)

  const pending = await prisma.payment.findMany({ where: { businessId, status: 'PENDING', mpOrderId: { not: null } }, include: { tab: true } })
  const resultados: { pedido: string; ok: boolean; detalhe?: unknown }[] = []
  for (const p of pending) {
    try {
      const r = await fetch(`https://api.mercadopago.com/v1/orders/${p.mpOrderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': randomUUID() },
      })
      const d: any = await r.json().catch(() => ({}))
      if (r.ok) {
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'CANCELLED' } })
        stopSplit(p.tab.tableId)
        await reopenAfterFailedCharge(p.tab.tableId, businessId)
      }
      resultados.push({ pedido: p.mpOrderId!, ok: r.ok, detalhe: r.ok ? undefined : d?.errors ?? d })
    } catch (e: any) {
      resultados.push({ pedido: p.mpOrderId!, ok: false, detalhe: e.message })
    }
  }
  res.json({ encontradas: pending.length, resultados })
})
