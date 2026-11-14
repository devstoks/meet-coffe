import { Router } from 'express'
import { prisma } from '../db.js'
import { ensureCategories } from '../lib/categories.js'
import { readOptionGroups } from '../lib/options.js'

export const productsRouter = Router()

productsRouter.get('/products', async (_req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: 'meetcoffe' },
  })

  if (!business) {
    return res.status(404).json({ error: 'Estabelecimento não encontrado' })
  }

  await ensureCategories(business.id)

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      include: { categoryRef: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    }),
  ])

  // Só categorias que têm produto ativo aparecem no filtro do feed (sem chip vazio)
  const used = new Set(products.map((p) => p.categoryRef?.name ?? p.category))
  const feedCategories = categories.map((c) => c.name).filter((n) => used.has(n))
  for (const name of used) if (!feedCategories.includes(name)) feedCategories.push(name)

  return res.json({
    business: { name: business.name, slug: business.slug },
    categories: feedCategories,
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      category: p.categoryRef?.name ?? p.category,
      images: p.images, 
      videoPath: p.videoPath,
      optionGroups: readOptionGroups(p.optionGroups),
    })),
  })
})