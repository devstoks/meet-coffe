import { Check } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatPrice } from '../lib/api'
import { describeSaved } from '../lib/optionsView'
import type { KitchenOrder } from '../lib/admin'

const FALLBACK = 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=400&q=80'

export function elapsedLabel(iso: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  return `há ${Math.floor(mins / 60)} h ${mins % 60} min`
}

type Props = {
  order: KitchenOrder
  now: number
  busy: boolean
  /** "Finalizado": sempre leva o pedido para DELIVERED (o cliente passa a ver "Finalizado"). */
  onAdvance: (orderId: string, nextStatus: string) => void
  /** Pedido acabou de ser finalizado: o card muda de cor e sai da lista com animação (controlado pela lista). */
  finished?: boolean
  compact?: boolean
  showTable?: boolean
}

/** Card de pedido da lista PEDIDOS: foto à esquerda, detalhes à direita, altura que acompanha o conteúdo. */
export function OrderTicket({ order, now, busy, onAdvance, finished, compact, showTable = true }: Props) {
  const isNew = order.status === 'SENT'
  const mins = Math.floor((now - new Date(order.createdAt).getTime()) / 60000)
  const late = !finished && (isNew ? mins >= 3 : mins >= 15)

  return (
    <div className={cn(
      'rounded-[24px] border backdrop-blur-xl flex flex-col transition-colors duration-500',
      compact ? 'p-3.5 gap-3' : 'p-4 gap-3.5',
      finished ? 'bg-[#8fb06b]/[0.14] border-[#8fb06b]/60' : isNew ? 'bg-[#E8A317]/[0.09] border-[#E8A317]/50' : 'bg-white/[0.06] border-white/12',
    )}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold text-[#F5F1E8] leading-tight break-words">{order.customerName || 'Cliente'}</div>
          <div className="text-[11.5px] text-white/55 mt-1 flex flex-wrap items-center gap-x-1.5">
            {showTable && <span className="text-[#E8A317] font-semibold">Mesa {order.table.number}</span>}
            {showTable && <span>·</span>}
            <span>#{order.id.slice(-4).toUpperCase()}</span>
            <span>·</span>
            <span>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>·</span>
            <span className={cn(late && 'text-[#ff9b8f] font-bold')}>{elapsedLabel(order.createdAt, now)}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[16px] font-semibold text-[#F5F1E8] leading-tight tabular-nums">{formatPrice(order.totalAmount)}</div>
          {(isNew || finished) && (
            <span className={cn('inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-wider', finished ? 'bg-[#8fb06b] text-[#16220b]' : 'bg-[#E8A317] text-[#2a1a0e]')}>
              {finished ? 'FINALIZADO' : 'NOVO'}
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {order.items.map((it) => {
          const options = describeSaved(it.selections)
          return (
            <li key={it.id} className="flex gap-3.5 items-start">
              <img
                src={it.imagePath || FALLBACK}
                alt={it.name}
                className={cn('rounded-2xl object-cover bg-black/30 flex-shrink-0', compact ? 'w-[72px] h-[72px]' : 'w-24 h-24')}
                loading="lazy"
              />
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[15px] font-semibold text-[#F5F1E8] leading-tight break-words">{it.quantity}× {it.name}</div>
                  <div className="text-[12.5px] font-semibold text-white/65 flex-shrink-0 tabular-nums">{formatPrice(it.subtotal)}</div>
                </div>
                {options.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {options.map((o) => <li key={o} className="text-[12.5px] leading-snug text-[#F5F1E8]/85 break-words">{o}</li>)}
                  </ul>
                )}
                {it.observations && <div className="mt-1 text-[12px] text-[#ffb3a8] italic break-words">obs: {it.observations}</div>}
              </div>
            </li>
          )
        })}
      </ul>

      <button
        onClick={() => onAdvance(order.id, 'DELIVERED')}
        disabled={busy || finished}
        className={cn(
          'w-full h-12 rounded-full text-[14px] font-semibold transition-colors duration-500 disabled:cursor-default flex items-center justify-center gap-2 active:scale-[0.98]',
          finished ? 'bg-[#8fb06b] text-[#16220b]' : 'bg-[#F5F1E8] text-[#1f1a14] disabled:opacity-50',
        )}
      >
        <Check className="w-4 h-4" strokeWidth={2.2} />
        {finished ? 'Finalizado' : busy ? 'Salvando…' : 'Finalizado'}
      </button>
    </div>
  )
}
