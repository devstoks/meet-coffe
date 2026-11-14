// Divisão de conta por consumo: mesas em que a equipe iniciou a fila automática de cobranças.
// Fica em memória (se o servidor reiniciar, a fila para e a equipe pode iniciá-la de novo: os pagamentos já feitos continuam valendo).
const active = new Set<string>()

export const startSplit = (tableId: string) => { active.add(tableId) }
export const stopSplit = (tableId: string) => { active.delete(tableId) }
export const isSplitActive = (tableId: string) => active.has(tableId)
