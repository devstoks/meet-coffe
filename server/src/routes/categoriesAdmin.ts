import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import {
  ensureCategories,
  isUniqueViolation,
  normalizeCategoryName,
  MAX_CATEGORY_NAME,
} from '../lib/categories.js'

export const categoriesAdminRouter = Router()

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function serialize(c: { id: string; name: string; _count?: { products: number } }) {
  return { id: c.id, name: c.name, productCount: c._count?.products ?? 0 }
}

// LISTAR (com contagem de produtos)
categoriesAdminRouter.get('/admin/categories', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  await ensureCategories(businessId)
  const categories = await prisma.category.findMany({
    where: { businessId },
    include: { _count: { select: { products: true } } },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
  })
  return res.json({ categories: categories.map(serialize) })
})

// CRIAR
categoriesAdminRouter.post('/admin/categories', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const name = normalizeCategoryName(req.body?.name)
  if (!name) return res.status(400).json({ error: `Informe um nome de até ${MAX_CATEGORY_NAME} caracteres.` })

  const existing = await prisma.category.findFirst({
    where: { businessId, name: { equals: name, mode: 'insensitive' } },
  })
  if (existing) return res.status(409).json({ error: `Já existe a categoria "${existing.name}".` })

  try {
    const category = await prisma.category.create({ data: { businessId, name } })
    return res.status(201).json({ category: serialize({ ...category, _count: { products: 0 } }) })
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' })
    console.error('Erro ao criar categoria:', err)
    return res.status(500).json({ error: 'Falha ao criar categoria.' })
  }
})

// RENOMEAR — os produtos continuam vinculados pelo id; o texto espelho é atualizado junto.
categoriesAdminRouter.patch('/admin/categories/:id', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const id = paramString(req.params.id)
  const name = normalizeCategoryName(req.body?.name)
  if (!name) return res.status(400).json({ error: `Informe um nome de até ${MAX_CATEGORY_NAME} caracteres.` })

  const category = await prisma.category.findFirst({ where: { id, businessId } })
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada.' })

  const clash = await prisma.category.findFirst({
    where: { businessId, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
  })
  if (clash) return res.status(409).json({ error: `Já existe a categoria "${clash.name}".` })

  try {
    const [updated] = await prisma.$transaction([
      prisma.category.update({
        where: { id },
        data: { name },
        include: { _count: { select: { products: true } } },
      }),
      prisma.product.updateMany({ where: { businessId, categoryId: id }, data: { category: name } }),
    ])
    return res.json({ category: serialize(updated) })
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' })
    console.error('Erro ao renomear categoria:', err)
    return res.status(500).json({ error: 'Falha ao renomear categoria.' })
  }
})

// EXCLUIR — nunca deixa produto órfão: se houver produtos, exige reatribuição (?reassignTo=<id>).
categoriesAdminRouter.delete('/admin/categories/:id', requireAdmin, async (req, res) => {
  const businessId = req.admin!.businessId
  const id = paramString(req.params.id)
  const reassignTo = typeof req.query.reassignTo === 'string' ? req.query.reassignTo : ''

  const category = await prisma.category.findFirst({
    where: { id, businessId },
    include: { _count: { select: { products: true } } },
  })
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada.' })

  const productCount = category._count.products

  if (productCount > 0 && !reassignTo) {
    return res.status(409).json({
      error: `A categoria "${category.name}" tem ${productCount} ${productCount === 1 ? 'produto' : 'produtos'}. Escolha outra categoria para movê-los antes de excluir.`,
      code: 'CATEGORY_IN_USE',
      productCount,
    })
  }

  try {
    if (productCount > 0) {
      if (reassignTo === id) return res.status(400).json({ error: 'Escolha uma categoria diferente da que será excluída.' })
      const target = await prisma.category.findFirst({ where: { id: reassignTo, businessId } })
      if (!target) return res.status(400).json({ error: 'Categoria de destino inválida.' })

      await prisma.$transaction([
        prisma.product.updateMany({
          where: { businessId, categoryId: id },
          data: { categoryId: target.id, category: target.name },
        }),
        prisma.category.delete({ where: { id } }),
      ])
      return res.json({ ok: true, moved: productCount, movedTo: target.name })
    }

    await prisma.category.delete({ where: { id } })
    return res.json({ ok: true, moved: 0 })
  } catch (err: any) {
    // Restrict no banco: se alguém criou um produto nessa categoria no meio do caminho, bloqueia em vez de orfanar.
    if (err?.code === 'P2003') {
      return res.status(409).json({ error: 'A categoria passou a ter produtos. Tente novamente.', code: 'CATEGORY_IN_USE' })
    }
    console.error('Erro ao excluir categoria:', err)
    return res.status(500).json({ error: 'Falha ao excluir categoria.' })
  }
})

