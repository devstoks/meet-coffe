import { prisma } from '../db.js'

export const DEFAULT_CATEGORY_NAME = 'Sem categoria'
export const MAX_CATEGORY_NAME = 40

/** Normaliza o nome: tira espaços nas pontas, colapsa espaços internos, 1..40 caracteres. */
export function normalizeCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name || name.length > MAX_CATEGORY_NAME) return null
  return name
}

export function isUniqueViolation(err: any) {
  return err?.code === 'P2002'
}

/** Busca (sem diferenciar maiúsculas) ou cria a categoria do negócio. */
export async function findOrCreateCategory(businessId: string, name: string) {
  const found = await prisma.category.findFirst({
    where: { businessId, name: { equals: name, mode: 'insensitive' } },
  })
  if (found) return found
  try {
    return await prisma.category.create({ data: { businessId, name } })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const again = await prisma.category.findFirst({
      where: { businessId, name: { equals: name, mode: 'insensitive' } },
    })
    if (!again) throw err
    return again
  }
}

/**
 * Migração preguiçosa e idempotente: produtos que ainda só têm o texto `category`
 * ganham uma Category do negócio e o vínculo `categoryId`. Nada é apagado e nenhum
 * produto muda de categoria (apenas a caixa/espaços do texto são normalizados).
 * Roda sozinha quando há produto sem vínculo, então funciona mesmo sem o script de backfill.
 */
export async function ensureCategories(businessId: string) {
  const orphans = await prisma.product.findMany({
    where: { businessId, categoryId: null },
    select: { id: true, category: true },
  })
  if (orphans.length === 0) return

  // chave normalizada (minúscula) -> { nome de exibição, ids dos produtos }
  const groups = new Map<string, { display: string; ids: string[] }>()
  for (const p of orphans) {
    const display = normalizeCategoryName(p.category) ?? DEFAULT_CATEGORY_NAME
    const key = display.toLowerCase()
    const group = groups.get(key) ?? { display, ids: [] }
    group.ids.push(p.id)
    groups.set(key, group)
  }

  for (const { display, ids } of groups.values()) {
    const category = await findOrCreateCategory(businessId, display)
    await prisma.product.updateMany({
      where: { id: { in: ids }, businessId, categoryId: null },
      data: { categoryId: category.id, category: category.name },
    })
  }
}
