import type { Product, Selection, SelectionInput } from './api'

type Piece = { group: string; text: string }

/** Junta as escolhas do mesmo grupo numa linha só: "Escolha sua comida: Croissant · Frango" / "Adicionais: Rosquinha, Mel". */
function joinByGroup(pieces: Piece[]): string[] {
  const order: string[] = []
  const byGroup = new Map<string, string[]>()
  for (const p of pieces) {
    if (!byGroup.has(p.group)) { byGroup.set(p.group, []); order.push(p.group) }
    byGroup.get(p.group)!.push(p.text)
  }
  return order.map((g) => `${g}: ${byGroup.get(g)!.join(', ')}`)
}

/** Texto das escolhas de um item já enviado (snapshot do servidor). */
export function describeSaved(selections: Selection[] | undefined | null): string[] {
  return joinByGroup((selections ?? []).map((s) => ({ group: s.groupName, text: `${s.optionName}${s.variantName ? ` · ${s.variantName}` : ''}` })))
}

/** Mesmo texto para o rascunho (ainda não enviado), a partir das opções configuradas no produto. */
export function describeDraft(product: Product | undefined, selections: SelectionInput[]): string[] {
  if (!product) return []
  const pieces: Piece[] = []
  for (const s of selections) {
    const g = product.optionGroups?.find((x) => x.id === s.groupId)
    const o = g?.options.find((x) => x.id === s.optionId)
    if (!g || !o) continue
    const v = o.variants.find((x) => x.id === s.variantId)
    pieces.push({ group: g.name, text: `${o.name}${v ? ` · ${v.name}` : ''}` })
  }
  return joinByGroup(pieces)
}
