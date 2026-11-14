import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardList } from 'lucide-react'
import { OrderTicket } from './OrderTicket'
import type { KitchenOrder } from '../lib/admin'

type Props = {
  orders: KitchenOrder[]
  now: number
  busyId: string | null
  /** Registra a finalização no servidor (lança erro se falhar — nesse caso o card não some). */
  onFinish: (orderId: string) => Promise<void>
  compact?: boolean
  showTable?: boolean
}

const EXIT_AFTER_MS = 850

/**
 * Lista única PEDIDOS (substitui "Novos" + "Em preparo"): do mais antigo para o mais novo.
 * Ao tocar em "Finalizado" o card muda de cor, fica um instante na tela e sai com animação; o próximo card sobe.
 */
export function PedidosList({ orders, now, busyId, onFinish, compact, showTable }: Props) {
  // Pedidos recém-finalizados: o servidor já não os devolve, mas o card fica por um instante para mostrar a conclusão
  const [lingering, setLingering] = useState<Record<string, KitchenOrder>>({})

  const list = useMemo(() => {
    const byId = new Map<string, KitchenOrder>()
    for (const o of orders) byId.set(o.id, o)
    for (const o of Object.values(lingering)) byId.set(o.id, o)
    return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [orders, lingering])

  async function finish(orderId: string) {
    const snapshot = orders.find((o) => o.id === orderId)
    await onFinish(orderId)
    if (!snapshot) return
    setLingering((m) => ({ ...m, [orderId]: { ...snapshot, status: 'DELIVERED' } }))
    setTimeout(() => setLingering((m) => { const next = { ...m }; delete next[orderId]; return next }), EXIT_AFTER_MS)
  }

  if (list.length === 0) {
    return (
      <div className="text-center text-[13px] text-white/45 py-12 border border-dashed border-white/15 rounded-[24px] flex flex-col items-center gap-2">
        <ClipboardList className="w-5 h-5 text-white/35" strokeWidth={1.5} />
        Nenhum pedido no momento. Tudo em dia.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <AnimatePresence initial={false}>
        {list.map((order) => (
          <motion.div
            key={order.id}
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 14 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.97 }}
            transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <OrderTicket
              order={order}
              now={now}
              busy={busyId === order.id}
              finished={!!lingering[order.id]}
              onAdvance={(id) => { void finish(id).catch(() => {}) }}
              compact={compact}
              showTable={showTable}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
