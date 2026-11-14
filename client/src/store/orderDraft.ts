import { create } from 'zustand'
import type { SelectionInput } from '../lib/api'
import { uuid } from '../lib/uuid'

/**
 * Linha do pedido ainda não enviado. A mesma pessoa pode ter, por exemplo, dois sucos com sabores diferentes:
 * cada combinação (produto + escolhas) é uma linha própria, então a personalização nunca "gruda" no item errado.
 */
export type DraftLine = {
  id: string
  productId: string
  qty: number
  observations?: string
  selections: SelectionInput[]
}

const keyOf = (productId: string, selections: SelectionInput[]) =>
  productId + '|' + [...selections].sort((a, b) => a.groupId.localeCompare(b.groupId)).map((s) => `${s.groupId}:${s.optionId}:${s.variantId ?? ''}`).join(',')

type DraftState = {
  lines: DraftLine[]
  /** Soma uma unidade (ou `amount`) à linha igual (mesmo produto e mesmas escolhas); cria a linha se ela não existe. */
  add: (productId: string, selections?: SelectionInput[], amount?: number) => void
  /** Linha idêntica já existente (mesmo produto e mesmas escolhas), se houver. */
  find: (productId: string, selections?: SelectionInput[]) => DraftLine | undefined
  setQty: (lineId: string, qty: number) => void
  remove: (lineId: string) => void
  clear: () => void
  count: () => number
}

export const useOrderDraft = create<DraftState>((set, get) => ({
  lines: [],
  add: (productId, selections = [], amount = 1) =>
    set((s) => {
      const k = keyOf(productId, selections)
      const existing = s.lines.find((l) => keyOf(l.productId, l.selections) === k)
      if (existing) return { lines: s.lines.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + amount } : l)) }
      return { lines: [...s.lines, { id: uuid(), productId, qty: amount, selections }] }
    }),
  find: (productId, selections = []) => {
    const k = keyOf(productId, selections)
    return get().lines.find((l) => keyOf(l.productId, l.selections) === k)
  },
  setQty: (lineId, qty) =>
    set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.id !== lineId) : s.lines.map((l) => (l.id === lineId ? { ...l, qty } : l)) })),
  remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.id !== lineId) })),
  clear: () => set({ lines: [] }),
  count: () => get().lines.reduce((n, l) => n + l.qty, 0),
}))
