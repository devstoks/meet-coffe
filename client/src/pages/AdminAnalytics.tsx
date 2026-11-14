import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { RefreshCw, Star, Clock, Package, TrendingUp, X, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatPrice } from '../lib/api'
import { cn } from '../lib/cn'

type RevenueBucket = { label: string; total: number }
type RevenueData = { data: RevenueBucket[]; grandTotal: number; count: number }
type ProductStat = { productId: string; name: string; quantity: number; revenue: number }
type ProductsData = { top: ProductStat[]; bottom: ProductStat[] }
type HourBucket = { hour: number; label: string; count: number; revenue: number }
type RatingData = {
  avgRating: number
  totalRatings: number
  distribution: { stars: number; count: number }[]
  recent: { rating: number | null; comment: string | null; ratedAt: string | null; tableNumber: string }[]
}

type Period = 'day' | 'month' | 'year'
type ModalKind = 'products' | 'hours' | 'ratings' | null

const PERIOD_LABEL: Record<Period, string> = { day: 'Dia', month: 'Mês', year: 'Ano' }
const card = 'rounded-[24px] border border-white/12 bg-white/[0.06] backdrop-blur-xl'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`Erro ${res.status}`)
  return res.json()
}

export function AdminAnalytics() {
  const [period, setPeriod] = useState<Period>('day')
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [products, setProducts] = useState<ProductsData | null>(null)
  const [hours, setHours] = useState<HourBucket[]>([])
  const [ratings, setRatings] = useState<RatingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [modal, setModal] = useState<ModalKind>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const errs: string[] = []
    await Promise.all([
      getJson<RevenueData>(`/api/admin/analytics/revenue?period=${period}`).then(setRevenue).catch(() => errs.push('faturamento')),
      getJson<ProductsData>('/api/admin/analytics/products').then(setProducts).catch(() => errs.push('produtos')),
      getJson<{ data: HourBucket[] }>('/api/admin/analytics/hours').then((d) => setHours(d.data)).catch(() => errs.push('horários')),
      getJson<RatingData>('/api/admin/analytics/ratings').then(setRatings).catch(() => errs.push('avaliações')),
    ])
    setErrors(errs)
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const maxRevenue = useMemo(() => revenue?.data.reduce((m, d) => Math.max(m, d.total), 0) ?? 0, [revenue])
  const maxHour = useMemo(() => hours.reduce((m, h) => Math.max(m, h.count), 0), [hours])
  const peak = useMemo(() => hours.reduce<HourBucket | null>((b, h) => (h.count > (b?.count ?? 0) ? h : b), null), [hours])
  const hoursRanked = useMemo(() => [...hours].filter((h) => h.count > 0).sort((a, b) => b.count - a.count), [hours])

  return (
    <div className="flex flex-col gap-5">
      {/* BARRA: período + atualizar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Período do faturamento">
          {(['day', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                'h-10 px-5 rounded-full border text-[13px] font-medium transition',
                period === p ? 'bg-[#F5F1E8] border-[#F5F1E8] text-[#1f1a14]' : 'border-white/35 text-white hover:bg-white/10',
              )}
            >{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        <button onClick={load} disabled={loading} aria-label="Atualizar" className="w-11 h-11 rounded-full border border-white/25 bg-white/[0.06] text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-40">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ff9b8f]/40 bg-[#ff9b8f]/10 text-[#ffc9c0] px-4 py-3 text-[12.5px]">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> Não foi possível carregar: {errors.join(', ')}.</span>
          <button onClick={load} className="font-bold underline underline-offset-2 whitespace-nowrap">Tentar de novo</button>
        </div>
      )}

      {/* INDICADORES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Faturamento" value={revenue ? formatPrice(revenue.grandTotal) : '—'} note={`por ${PERIOD_LABEL[period].toLowerCase()}`} />
        <Kpi label="Pedidos pagos" value={revenue ? String(revenue.count) : '—'} note="no período" />
        <Kpi label="Ticket médio" value={revenue ? (revenue.count > 0 ? formatPrice(revenue.grandTotal / revenue.count) : formatPrice(0)) : '—'} note="por pedido" />
        <Kpi label="Avaliação média" value={ratings && ratings.totalRatings > 0 ? `${ratings.avgRating} ★` : '—'} note={ratings ? `${ratings.totalRatings} ${ratings.totalRatings === 1 ? 'avaliação' : 'avaliações'}` : ''} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
        {/* FATURAMENTO */}
        <section className={cn(card, 'p-5')}>
          <SectionTitle icon={<TrendingUp className="w-4 h-4" />} title={`Faturamento por ${PERIOD_LABEL[period].toLowerCase()}`} />
          {!revenue || revenue.data.length === 0 ? (
            <Empty text="Sem faturamento registrado." />
          ) : (
            <ul className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1 [scrollbar-width:thin]">
              {revenue.data.map((d) => (
                <li key={d.label} className="flex items-center gap-3">
                  <span className="w-20 flex-shrink-0 text-[12px] text-white/55 tabular-nums">{d.label}</span>
                  <div className="flex-1 h-5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full rounded-full bg-[#F5F1E8]/85" style={{ width: `${maxRevenue > 0 ? Math.max(2, (d.total / maxRevenue) * 100) : 0}%` }} />
                  </div>
                  <span className="w-24 flex-shrink-0 text-right text-[13px] font-semibold text-[#F5F1E8] tabular-nums">{formatPrice(d.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {/* PRODUTOS */}
          <section className={cn(card, 'p-5')}>
            <SectionTitle icon={<Package className="w-4 h-4" />} title="Produtos" action={{ label: 'Ver todos', onClick: () => setModal('products') }} />
            {!products || products.top.length === 0 ? (
              <Empty text="Sem dados." />
            ) : (
              <ProductRows rows={products.top.slice(0, 3)} />
            )}
          </section>

          {/* HORÁRIOS */}
          <section className={cn(card, 'p-5')}>
            <SectionTitle icon={<Clock className="w-4 h-4" />} title="Horários" action={{ label: 'Detalhes', onClick: () => setModal('hours') }} />
            {hours.length === 0 || maxHour === 0 ? (
              <Empty text="Sem pedidos registrados." />
            ) : (
              <>
                <div className="text-[13px] text-white/65 mb-3">
                  Pico às <strong className="text-[#F5F1E8]">{peak?.label}</strong> · {peak?.count} {peak?.count === 1 ? 'pedido' : 'pedidos'}
                </div>
                <HoursChart hours={hours} maxHour={maxHour} height={84} />
              </>
            )}
          </section>

          {/* AVALIAÇÕES */}
          <section className={cn(card, 'p-5')}>
            <SectionTitle icon={<Star className="w-4 h-4" />} title="Avaliações" action={{ label: 'Ver avaliações', onClick: () => setModal('ratings') }} />
            {!ratings || ratings.totalRatings === 0 ? (
              <Empty text="Nenhuma avaliação ainda." />
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-center flex-shrink-0">
                  <div className="text-[34px] leading-none font-bold text-[#F5F1E8] tabular-nums">{ratings.avgRating}</div>
                  <div className="flex justify-center gap-0.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn('w-3 h-3', n <= Math.round(ratings.avgRating) ? 'fill-[#E8A317] text-[#E8A317]' : 'text-white/25')} />)}
                  </div>
                </div>
                <Distribution ratings={ratings} compact />
              </div>
            )}
          </section>
        </div>
      </div>

      {/* MODAL: PRODUTOS */}
      <Modal open={modal === 'products'} onClose={() => setModal(null)} title="Produtos" subtitle="Mais e menos pedidos">
        {products && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[2px] text-[#8fb06b] font-bold mb-3">Mais pedidos</div>
              {products.top.length === 0 ? <Empty text="Sem dados." /> : <ProductRows rows={products.top} />}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[2px] text-[#ffb3a8] font-bold mb-3">Menos pedidos</div>
              {products.bottom.length === 0 ? <Empty text="Sem dados." /> : <ProductRows rows={products.bottom} />}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: HORÁRIOS */}
      <Modal open={modal === 'hours'} onClose={() => setModal(null)} title="Horários" subtitle="Pedidos e faturamento por hora do dia" wide>
        <HoursChart hours={hours} maxHour={maxHour} height={150} />
        <div className="mt-6 text-[11px] uppercase tracking-[2px] text-white/45 font-bold mb-3">Horários mais movimentados</div>
        {hoursRanked.length === 0 ? <Empty text="Sem pedidos registrados." /> : (
          <ul className="rounded-[20px] border border-white/10 overflow-hidden">
            {hoursRanked.map((h, i) => (
              <li key={h.hour} className={cn('flex items-center gap-3 px-4 py-2.5 text-[14px]', i > 0 && 'border-t border-white/8', i < 3 && 'bg-[#E8A317]/10')}>
                <span className="w-6 text-white/45 font-bold text-[12px]">#{i + 1}</span>
                <span className="flex-1 font-medium text-[#F5F1E8] tabular-nums">{h.label}</span>
                <span className="text-white/65 tabular-nums">{h.count} {h.count === 1 ? 'pedido' : 'pedidos'}</span>
                <span className="w-24 text-right font-semibold text-[#F5F1E8] tabular-nums">{formatPrice(h.revenue)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* MODAL: AVALIAÇÕES */}
      <Modal open={modal === 'ratings'} onClose={() => setModal(null)} title="Avaliações" subtitle={ratings ? `${ratings.totalRatings} ${ratings.totalRatings === 1 ? 'avaliação' : 'avaliações'} · média ${ratings.avgRating}` : undefined}>
        {ratings && (
          <>
            <Distribution ratings={ratings} />
            <div className="mt-6 text-[11px] uppercase tracking-[2px] text-white/45 font-bold mb-3">Comentários recentes</div>
            {ratings.recent.length === 0 ? <Empty text="Nenhuma avaliação ainda." /> : (
              <ul className="flex flex-col gap-3">
                {ratings.recent.map((r, i) => (
                  <li key={i} className="rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn('w-3.5 h-3.5', n <= (r.rating ?? 0) ? 'fill-[#E8A317] text-[#E8A317]' : 'text-white/20')} />)}</span>
                        <span className="text-[12px] text-white/55 ml-1">Mesa {r.tableNumber}</span>
                      </div>
                      <span className="text-[11.5px] text-white/45">{r.ratedAt ? new Date(r.ratedAt).toLocaleDateString('pt-BR') : ''}</span>
                    </div>
                    {r.comment && <p className="mt-2 text-[13.5px] text-white/80 leading-relaxed">“{r.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}

/* ---------- peças ---------- */

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[22px] border border-white/12 bg-white/[0.06] backdrop-blur-xl p-4 sm:p-5">
      <div className="text-[11.5px] text-white/55 font-medium">{label}</div>
      <div className="text-[24px] sm:text-[28px] leading-none font-bold tracking-tight text-[#F5F1E8] mt-3 mb-1.5 break-words tabular-nums">{value}</div>
      <div className="text-[11.5px] text-white/45">{note}</div>
    </div>
  )
}

function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-[#F5F1E8]"><span className="text-white/55">{icon}</span>{title}</h2>
      {action && (
        <button onClick={action.onClick} className="h-9 pl-4 pr-3 rounded-full border border-white/30 text-white text-[12px] font-medium inline-flex items-center gap-1 hover:bg-white/10 transition">
          {action.label}<ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-[13px] text-white/45 py-6">{text}</div>
}

function ProductRows({ rows }: { rows: ProductStat[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((p, i) => (
        <li key={p.productId} className={cn('flex items-center gap-3 py-2.5 text-[13.5px]', i > 0 && 'border-t border-white/8')}>
          <span className="w-6 text-white/40 font-bold text-[12px]">#{i + 1}</span>
          <span className="flex-1 min-w-0 truncate text-[#F5F1E8] font-medium">{p.name}</span>
          <span className="text-white/55 text-[12px] tabular-nums">{p.quantity}×</span>
          <span className="w-24 text-right font-semibold text-[#F5F1E8] tabular-nums">{formatPrice(p.revenue)}</span>
        </li>
      ))}
    </ul>
  )
}

function HoursChart({ hours, maxHour, height }: { hours: HourBucket[]; maxHour: number; height: number }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: height + 28 }}>
      {hours.map((h) => (
        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${h.label}: ${h.count} pedidos · ${formatPrice(h.revenue)}`}>
          <div
            className={cn('w-full rounded-t-md', h.count === maxHour && maxHour > 0 ? 'bg-[#E8A317]' : 'bg-[#F5F1E8]/55')}
            style={{ height: Math.max(2, maxHour > 0 ? (h.count / maxHour) * height : 2) }}
          />
          <div className="text-[9px] text-white/45 tabular-nums h-3">{h.hour % 3 === 0 ? h.label.slice(0, 2) : ''}</div>
        </div>
      ))}
    </div>
  )
}

function Distribution({ ratings, compact }: { ratings: RatingData; compact?: boolean }) {
  return (
    <ul className="flex-1 flex flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = ratings.distribution.find((d) => d.stars === stars)?.count ?? 0
        const pct = ratings.totalRatings > 0 ? (count / ratings.totalRatings) * 100 : 0
        return (
          <li key={stars} className="flex items-center gap-2 text-[12px]">
            <span className="w-7 text-white/70 font-medium">{stars}★</span>
            <div className={cn('flex-1 rounded-full bg-white/[0.08] overflow-hidden', compact ? 'h-2' : 'h-3')}>
              <div className="h-full bg-[#E8A317] rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 text-white/55 text-right tabular-nums">{count}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Modal({ open, onClose, title, subtitle, wide, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; wide?: boolean; children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-md z-[100]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-h-[90vh] z-[101] flex flex-col rounded-[28px] bg-[#1d130b]/95 backdrop-blur-2xl border border-white/15 text-[#F5F1E8] outline-none overflow-hidden',
            wide ? 'max-w-3xl' : 'max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/10">
            <div>
              <Dialog.Title className="text-[22px] leading-tight font-bold tracking-tight">{title}</Dialog.Title>
              {subtitle && <div className="text-[12.5px] text-white/55 mt-1">{subtitle}</div>}
            </div>
            <Dialog.Close asChild>
              <button aria-label="Fechar" className="w-10 h-10 rounded-full border border-white/25 text-white grid place-items-center hover:bg-white/10 transition flex-shrink-0"><X className="w-4 h-4" /></button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:thin]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
