import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { ensureCategories, findOrCreateCategory, normalizeCategoryName } from '../lib/categories.js'
import { uploadImage, uploadVideo, pathToUrl, safeUnlink, faststartMp4 } from '../lib/storage.js'
import { readOptionGroups, sanitizeOptionGroups } from '../lib/options.js'

export const productsAdminRouter = Router()

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

// Resolve a categoria do produto: aceita categoryId (preferido) ou nome legado em texto.
async function resolveCategory(businessId: string, body: any) {
  if (typeof body?.categoryId === 'string' && body.categoryId) {
    const found = await prisma.category.findFirst({ where: { id: body.categoryId, businessId } })
    return found ?? null
  }
  const name = normalizeCategoryName(body?.category)
  if (!name) return null
  return findOrCreateCategory(businessId, name)
}

function serializeProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    category: p.categoryRef?.name ?? p.category,
    categoryId: p.categoryId ?? null,
    images: p.images,
    videoPath: p.videoPath,
    optionGroups: readOptionGroups(p.optionGroups),
    active: p.active,
  }
}

// CRIAR PRODUTO
productsAdminRouter.post('/admin/products', requireAdmin, async (req, res) => {
  const { name, description, price, active } = req.body
  if (!name || !price) return res.status(400).json({ error: 'Nome e preço são obrigatórios' })

  try {
    const category = await resolveCategory(req.admin!.businessId, req.body)
    if (!category) return res.status(400).json({ error: 'Escolha uma categoria válida' })

    const groups = sanitizeOptionGroups(req.body?.optionGroups)
    if (!groups.ok) return res.status(400).json({ error: groups.error })

    const product = await prisma.product.create({
      data: {
        ...(groups.value.length > 0 ? { optionGroups: groups.value as any } : {}),
        businessId: req.admin!.businessId,
        name,
        description,
        price: Number(price),
        category: category.name,
        categoryId: category.id,
        active: active ?? true,
      },
      include: { categoryRef: true },
    })
    return res.json({ product: serializeProduct(product) })
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao criar produto' })
  }
})

// LISTAR PRODUTOS
productsAdminRouter.get('/admin/products', requireAdmin, async (req, res) => {
  await ensureCategories(req.admin!.businessId)
  const products = await prisma.product.findMany({
    where: { businessId: req.admin!.businessId },
    include: { categoryRef: true },
    orderBy: { createdAt: 'asc' },
  })

  return res.json({ products: products.map(serializeProduct) })
})

// DELETAR PRODUTO
productsAdminRouter.delete('/admin/products/:id', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  const product = await prisma.product.findUnique({ where: { id } })

  if (!product || product.businessId !== req.admin!.businessId) {
    return res.status(404).json({ error: 'Produto não encontrado' })
  }

  // Remove imagens e vídeo do disco
  product.images.forEach(img => safeUnlink(img))
  if (product.videoPath) safeUnlink(product.videoPath)

  await prisma.product.delete({ where: { id } })
  return res.json({ ok: true })
})

// EDITAR INFORMAÇÕES DO PRODUTO
productsAdminRouter.patch('/admin/products/:id', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  const { name, description, price, active } = req.body

  const product = await prisma.product.findUnique({ where: { id } })
  if (!product || product.businessId !== req.admin!.businessId) {
    return res.status(404).json({ error: 'Produto não encontrado' })
  }

  const data: any = {}
  if (name) data.name = name
  if (description !== undefined) data.description = description
  if (price) data.price = Number(price)
  if (active !== undefined) data.active = active

  if (req.body?.categoryId !== undefined || req.body?.category !== undefined) {
    const category = await resolveCategory(req.admin!.businessId, req.body)
    if (!category) return res.status(400).json({ error: 'Escolha uma categoria válida' })
    data.categoryId = category.id
    data.category = category.name
  }

  if (req.body?.optionGroups !== undefined) {
    const groups = sanitizeOptionGroups(req.body.optionGroups)
    if (!groups.ok) return res.status(400).json({ error: groups.error })
    // lista vazia remove a personalização do produto
    data.optionGroups = groups.value.length > 0 ? (groups.value as any) : null
  }

  const updated = await prisma.product.update({ where: { id }, data, include: { categoryRef: true } })
  return res.json({ product: serializeProduct(updated) })
})

// IMAGEM DE UMA OPÇÃO DE PERSONALIZAÇÃO (um arquivo; devolve só a URL, que o painel grava na opção ao salvar o produto)
productsAdminRouter.post('/admin/option-images', requireAdmin, uploadImage.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' })
  return res.json({ url: pathToUrl(file.path) })
})

// UPLOAD DE MÚLTIPLAS IMAGENS (até 3)
productsAdminRouter.post(
  '/admin/products/:id/images',
  requireAdmin,
  uploadImage.array('files', 3), // Aceita até 3 arquivos de uma vez
  async (req, res) => {
    const id = paramString(req.params.id)
    if (!id) return res.status(400).json({ error: 'ID obrigatório' })

    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado' })

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product || product.businessId !== req.admin!.businessId) {
      files.forEach(f => safeUnlink(pathToUrl(f.path)))
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    // Limita a 3 imagens no total
    if (product.images.length + files.length > 3) {
      files.forEach(f => safeUnlink(pathToUrl(f.path)))
      return res.status(400).json({ error: 'Limite de 3 imagens por produto excedido' })
    }

    const newUrls = files.map(f => pathToUrl(f.path)!)
    const updatedImages = [...product.images, ...newUrls]

    await prisma.product.update({
      where: { id },
      data: { images: updatedImages },
    })

    return res.json({ images: updatedImages })
  }
)

// DELETAR UMA IMAGEM ESPECÍFICA
productsAdminRouter.delete('/admin/products/:id/images', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  const { imageUrl } = req.body

  if (!imageUrl) return res.status(400).json({ error: 'URL da imagem obrigatória' })

  const product = await prisma.product.findUnique({ where: { id } })
  if (!product || product.businessId !== req.admin!.businessId) {
    return res.status(404).json({ error: 'Produto não encontrado' })
  }

  const updatedImages = product.images.filter(img => img !== imageUrl)
  safeUnlink(imageUrl)

  await prisma.product.update({
    where: { id },
    data: { images: updatedImages },
  })

  return res.json({ images: updatedImages })
})

// REORDENAR IMAGENS (a primeira é a capa no cardápio)
productsAdminRouter.put('/admin/products/:id/images/order', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  const order = req.body?.images
  if (!Array.isArray(order) || order.some((i) => typeof i !== 'string')) {
    return res.status(400).json({ error: 'Lista de imagens inválida' })
  }

  const product = await prisma.product.findUnique({ where: { id } })
  if (!product || product.businessId !== req.admin!.businessId) {
    return res.status(404).json({ error: 'Produto não encontrado' })
  }

  // Precisa ser exatamente a mesma lista, só em outra ordem (nada entra nem sai)
  const same =
    order.length === product.images.length &&
    new Set(order).size === order.length &&
    order.every((img) => product.images.includes(img))
  if (!same) return res.status(400).json({ error: 'A lista deve conter exatamente as imagens atuais do produto' })

  await prisma.product.update({ where: { id }, data: { images: order } })
  return res.json({ images: order })
})

// UPLOAD DE VÍDEO (1)
productsAdminRouter.post(
  '/admin/products/:id/video',
  requireAdmin,
  uploadVideo.single('file'),
  async (req, res) => {
    const id = paramString(req.params.id)
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' })

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product || product.businessId !== req.admin!.businessId) {
      safeUnlink(pathToUrl(req.file.path))
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    await faststartMp4(req.file.path) // melhor esforço; mantém o original se o ffmpeg faltar
    const newUrl = pathToUrl(req.file.path)!
    if (product.videoPath) safeUnlink(product.videoPath)

    await prisma.product.update({
      where: { id },
      data: { videoPath: newUrl },
    })

    return res.json({ videoPath: newUrl })
  }
)

// DELETAR VÍDEO
productsAdminRouter.delete('/admin/products/:id/video', requireAdmin, async (req, res) => {
  const id = paramString(req.params.id)
  const product = await prisma.product.findUnique({ where: { id } })

  if (!product || product.businessId !== req.admin!.businessId) {
    return res.status(404).json({ error: 'Produto não encontrado' })
  }

  if (product.videoPath) safeUnlink(product.videoPath)

  await prisma.product.update({
    where: { id },
    data: { videoPath: null },
  })

  return res.json({ ok: true })
})