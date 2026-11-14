// Backfill opcional e idempotente: cria Category a partir de Product.category e vincula categoryId.
// Não apaga nada e não altera preços/pedidos. A API também faz isso sozinha sob demanda,
// então rodar este script é só uma forma de migrar tudo de uma vez.
// Uso (na pasta server):  npx tsx prisma/backfill-categories.ts
import 'dotenv/config'
import { ensureCategories } from '../src/lib/categories.js'
import { prisma } from '../src/db.js'

async function main() {
  const businesses = await prisma.business.findMany({ select: { id: true, name: true } })
  for (const b of businesses) {
    const before = await prisma.product.count({ where: { businessId: b.id, categoryId: null } })
    await ensureCategories(b.id)
    const after = await prisma.product.count({ where: { businessId: b.id, categoryId: null } })
    const cats = await prisma.category.count({ where: { businessId: b.id } })
    console.log(`${b.name}: ${before - after} produtos vinculados, ${after} sem vínculo, ${cats} categorias`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
