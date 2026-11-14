import { randomUUID } from 'crypto'

/**
 * Personalização de produtos (kits, sabores, recheios, adicionais), reutilizável por qualquer produto.
 *
 * Um produto tem GRUPOS de escolha (ex.: "Escolha sua comida", "Escolha sua bebida", "Adicionais").
 * Cada grupo define quantas opções o cliente escolhe (`min` a `max`); `required` é só o reflexo de min > 0.
 * Uma opção pode ter imagem, descrição, VARIAÇÕES (Croissant → Frango) e um valor adicional.
 *
 * DINHEIRO: tudo é calculado em CENTAVOS inteiros (`priceCents`). `priceDelta` (em reais) existe só por compatibilidade
 * com o formato antigo e é sempre derivado dos centavos.
 */
export type OptionValue = { id: string; name: string }
export type ProductOption = {
  id: string
  name: string
  description: string | null
  image: string | null
  priceCents: number
  priceDelta: number
  variantLabel: string | null
  variants: OptionValue[]
}
export type OptionGroup = {
  id: string
  name: string
  description: string | null
  min: number
  max: number
  required: boolean
  options: ProductOption[]
}

export type Selection = {
  groupId: string
  groupName: string
  optionId: string
  optionName: string
  variantId: string | null
  variantName: string | null
  priceCents: number
  priceDelta: number
}

const MAX_GROUPS = 8
const MAX_OPTIONS = 40
const MAX_VARIANTS = 40
const MAX_NAME = 60
const MAX_DESC = 140
const MAX_CENTS = 1_000_000 // R$ 10.000,00 por opção

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : '')
const cleanDesc = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_DESC) : '')
const idOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 64) : randomUUID().slice(0, 12))
const blank = (v: unknown) => v === undefined || v === null || v === ''
const cleanImage = (v: unknown) => (typeof v === 'string' && v.startsWith('/uploads/') && !v.includes('..') && v.length <= 300 ? v : null)

/** reais → centavos inteiros (arredondado, sem erro de ponto flutuante: 0,1 + 0,2 = 30 centavos). */
export const toCents = (reais: number) => Math.round(reais * 100)

/** Valor adicional da opção, em centavos. Aceita `priceCents` (novo) ou `priceDelta` em reais (formato antigo). */
function centsOf(o: any): { ok: true; cents: number } | { ok: false } {
  if (!blank(o?.priceCents)) {
    const n = Number(o.priceCents)
    return Number.isInteger(n) && n >= 0 && n <= MAX_CENTS ? { ok: true, cents: n } : { ok: false }
  }
  if (!blank(o?.priceDelta)) {
    const n = Number(o.priceDelta)
    return Number.isFinite(n) && n >= 0 && n * 100 <= MAX_CENTS ? { ok: true, cents: toCents(n) } : { ok: false }
  }
  return { ok: true, cents: 0 }
}

/** Valida e normaliza o que o painel enviou. Devolve a lista limpa (com ids) ou uma mensagem de erro. */
export function sanitizeOptionGroups(input: unknown): { ok: true; value: OptionGroup[] } | { ok: false; error: string } {
  if (input === null || input === undefined || input === '') return { ok: true, value: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'Opções inválidas.' }
  if (input.length > MAX_GROUPS) return { ok: false, error: `No máximo ${MAX_GROUPS} grupos de opções por produto.` }

  const seenGroups = new Set<string>()
  const groups: OptionGroup[] = []
  for (const g of input) {
    const name = cleanName(g?.name)
    if (!name) return { ok: false, error: 'Todo grupo de escolhas precisa de um nome (ex.: Escolha sua comida).' }
    const id = idOf(g?.id)
    if (seenGroups.has(id)) return { ok: false, error: 'Grupo de opções duplicado.' }
    seenGroups.add(id)

    const rawOptions = Array.isArray(g?.options) ? g.options : []
    if (rawOptions.length === 0) return { ok: false, error: `O grupo "${name}" precisa de pelo menos uma opção.` }
    if (rawOptions.length > MAX_OPTIONS) return { ok: false, error: `O grupo "${name}" tem opções demais.` }

    const seenOptions = new Set<string>()
    const options: ProductOption[] = []
    for (const o of rawOptions) {
      const oname = cleanName(o?.name)
      if (!oname) return { ok: false, error: `Há uma opção sem nome no grupo "${name}".` }
      const oid = idOf(o?.id)
      if (seenOptions.has(oid)) return { ok: false, error: `Opção duplicada no grupo "${name}".` }
      seenOptions.add(oid)

      const price = centsOf(o)
      if (!price.ok) return { ok: false, error: `Valor adicional inválido em "${oname}".` }

      const rawVariants = Array.isArray(o?.variants) ? o.variants : []
      if (rawVariants.length > MAX_VARIANTS) return { ok: false, error: `A opção "${oname}" tem variações demais.` }
      const seenVariants = new Set<string>()
      const variants: OptionValue[] = []
      for (const v of rawVariants) {
        const vname = cleanName(v?.name)
        if (!vname) return { ok: false, error: `Há uma variação sem nome em "${oname}".` }
        const vid = idOf(v?.id)
        if (seenVariants.has(vid)) return { ok: false, error: `Variação duplicada em "${oname}".` }
        seenVariants.add(vid)
        variants.push({ id: vid, name: vname })
      }
      options.push({
        id: oid, name: oname,
        description: cleanDesc(o?.description) || null,
        image: cleanImage(o?.image),
        priceCents: price.cents, priceDelta: price.cents / 100,
        variantLabel: variants.length > 0 ? (cleanName(o?.variantLabel) || 'Escolha') : null,
        variants,
      })
    }

    // Quantidade de escolhas. Sem min/max (formato antigo) vale: obrigatório = 1 escolha; opcional = até 1.
    let min: number, max: number
    if (blank(g?.min) && blank(g?.max)) {
      min = g?.required === false ? 0 : 1
      max = 1
    } else {
      min = blank(g?.min) ? (g?.required === false ? 0 : 1) : Number(g.min)
      max = blank(g?.max) ? Math.max(1, min) : Number(g.max)
    }
    if (!Number.isInteger(min) || !Number.isInteger(max)) return { ok: false, error: `As quantidades do grupo "${name}" precisam ser números inteiros.` }
    if (min < 0) return { ok: false, error: `A quantidade mínima do grupo "${name}" não pode ser negativa.` }
    if (max < 1) return { ok: false, error: `A quantidade máxima do grupo "${name}" precisa ser pelo menos 1.` }
    if (max < min) return { ok: false, error: `No grupo "${name}", a quantidade máxima não pode ser menor que a mínima.` }
    if (max > options.length) return { ok: false, error: `O grupo "${name}" tem só ${options.length} ${options.length === 1 ? 'opção' : 'opções'}: a quantidade máxima não pode passar disso.` }

    groups.push({ id, name, description: cleanDesc(g?.description) || null, min, max, required: min > 0, options })
  }
  return { ok: true, value: groups }
}

/** Lê o que está salvo no banco (Json) como lista tipada, ignorando lixo. Aceita o formato antigo (sem min/max/centavos). */
export function readOptionGroups(raw: unknown): OptionGroup[] {
  const r = sanitizeOptionGroups(raw)
  return r.ok ? r.value : []
}

export type SelectionInput = { groupId?: unknown; optionId?: unknown; variantId?: unknown }

/**
 * Confere as escolhas do cliente contra a configuração do produto (NUNCA confia no cliente: nomes e preços vêm do banco)
 * e devolve o snapshot a gravar no item do pedido, com o adicional em centavos.
 */
export function resolveSelections(
  groups: OptionGroup[],
  input: unknown,
): { ok: true; selections: Selection[]; deltaCents: number } | { ok: false; error: string } {
  const list: SelectionInput[] = Array.isArray(input) ? input : []
  if (groups.length === 0) {
    return list.length > 0 ? { ok: false, error: 'Este produto não tem opções de personalização.' } : { ok: true, selections: [], deltaCents: 0 }
  }

  const byGroup = new Map<string, SelectionInput[]>()
  for (const s of list) {
    const gid = typeof s?.groupId === 'string' ? s.groupId : ''
    if (!gid || !groups.some((g) => g.id === gid)) return { ok: false, error: 'Escolhas de personalização inválidas.' }
    byGroup.set(gid, [...(byGroup.get(gid) ?? []), s])
  }

  const selections: Selection[] = []
  let deltaCents = 0
  for (const group of groups) {
    const chosen = byGroup.get(group.id) ?? []
    if (chosen.length < group.min) {
      return { ok: false, error: group.min === 1 ? `Escolha uma opção em "${group.name}".` : `Escolha pelo menos ${group.min} opções em "${group.name}".` }
    }
    if (chosen.length > group.max) {
      return { ok: false, error: `Em "${group.name}" você pode escolher no máximo ${group.max} ${group.max === 1 ? 'opção' : 'opções'}.` }
    }

    const seen = new Set<string>()
    const picked: { option: ProductOption; variant: OptionValue | null }[] = []
    for (const c of chosen) {
      const option = group.options.find((o) => o.id === c.optionId)
      if (!option) return { ok: false, error: `Opção inválida em "${group.name}".` }
      if (seen.has(option.id)) return { ok: false, error: `Opção repetida em "${group.name}".` }
      seen.add(option.id)

      let variant: OptionValue | null = null
      if (option.variants.length > 0) {
        variant = option.variants.find((v) => v.id === c.variantId) ?? null
        if (!variant) return { ok: false, error: `Escolha ${option.variantLabel ?? 'uma variação'} de "${option.name}".` }
      } else if (c.variantId) {
        return { ok: false, error: `"${option.name}" não tem variações.` }
      }
      picked.push({ option, variant })
    }

    // Ordem estável: a mesma da configuração do grupo
    picked.sort((a, b) => group.options.indexOf(a.option) - group.options.indexOf(b.option))
    for (const { option, variant } of picked) {
      deltaCents += option.priceCents
      selections.push({
        groupId: group.id, groupName: group.name,
        optionId: option.id, optionName: option.name,
        variantId: variant?.id ?? null, variantName: variant?.name ?? null,
        priceCents: option.priceCents, priceDelta: option.priceCents / 100,
      })
    }
  }
  return { ok: true, selections, deltaCents }
}

/** Lê as escolhas gravadas num item de pedido (Json) de forma segura (inclui pedidos antigos, sem centavos). */
export function readSelections(raw: unknown): Selection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && typeof s === 'object' && typeof (s as any).optionName === 'string')
    .map((s: any) => {
      const cents = Number.isInteger(s.priceCents) ? s.priceCents : toCents(Number(s.priceDelta) || 0)
      return { ...s, priceCents: cents, priceDelta: cents / 100 } as Selection
    })
}
