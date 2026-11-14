import type { ClosureScope, PaymentMethod } from './api'

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  PIX: 'PIX',
  CASH: 'Dinheiro',
}

export const SCOPE_LABEL: Record<ClosureScope, string> = {
  INDIVIDUAL: 'Individual',
  TABLE: 'Mesa toda',
}
