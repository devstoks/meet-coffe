import { Check, Utensils } from 'lucide-react'
import { formatCents, priceBreakdown, type OptionGroup, type Product, type ProductOption, type SelectionInput } from '../lib/api'
import { cn } from '../lib/cn'

/** Estilo visual: `dark` combina com o Feed (foto em tela cheia); `light` combina com a Lista (fundo creme). */
export type Tone = 'dark' | 'light'

const T = {
  dark: {
    title: 'text-white', sub: 'text-white/60', badgeReq: 'bg-white text-[#1f1a14]', badgeOpt: 'bg-white/12 text-white/80',
    card: 'bg-white/[0.07] border-white/15 text-white', cardOn: 'border-white bg-white/[0.15] ring-2 ring-white',
    check: 'bg-white text-[#1f1a14]', img: 'bg-white/10 text-white/35',
    chip: 'border-white/30 text-white', chipOn: 'bg-white text-[#1f1a14] border-white', label: 'text-white/70',
    box: 'bg-white/[0.07] border-white/15 text-white', line: 'border-white/15', muted: 'text-white/65',
  },
  light: {
    title: 'text-[#1f1a14]', sub: 'text-[#1f1a14]/55', badgeReq: 'bg-[#1f1a14] text-white', badgeOpt: 'bg-[#1f1a14]/8 text-[#1f1a14]/65',
    card: 'bg-white border-[#1f1a14]/10 text-[#1f1a14] shadow-[0_10px_24px_-16px_rgba(31,26,20,0.4)]', cardOn: 'border-[#1f1a14] ring-2 ring-[#1f1a14]',
    check: 'bg-[#1f1a14] text-white', img: 'bg-[#1f1a14]/6 text-[#1f1a14]/30',
    chip: 'border-[#1f1a14]/25 text-[#1f1a14] bg-white', chipOn: 'bg-[#1f1a14] text-white border-[#1f1a14]', label: 'text-[#1f1a14]/65',
    box: 'bg-white border-[#1f1a14]/10 text-[#1f1a14]', line: 'border-[#1f1a14]/10', muted: 'text-[#1f1a14]/60',
  },
} as const

/** "Escolha 1" · "Escolha até 3" · "Escolha de 2 a 3" — a regra do grupo em palavras. */
export function ruleText(g: OptionGroup): string {
  if (g.max === 1) return g.min === 0 ? 'Escolha até 1' : 'Escolha 1'
  if (g.min === g.max) return `Escolha ${g.max}`
  return g.min === 0 ? `Escolha até ${g.max}` : `Escolha de ${g.min} a ${g.max}`
}

/** Marca/desmarca uma opção respeitando o máximo do grupo (em grupo de escolha única, trocar substitui). */
export function toggleOption(groups: OptionGroup[], value: SelectionInput[], groupId: string, optionId: string): SelectionInput[] {
  const g = groups.find((x) => x.id === groupId)
  if (!g) return value
  const inGroup = value.filter((s) => s.groupId === groupId)
  if (inGroup.some((s) => s.optionId === optionId)) return value.filter((s) => !(s.groupId === groupId && s.optionId === optionId))
  if (g.max === 1) return [...value.filter((s) => s.groupId !== groupId), { groupId, optionId, variantId: null }]
  if (inGroup.length >= g.max) return value
  return [...value, { groupId, optionId, variantId: null }]
}

export function setVariant(value: SelectionInput[], groupId: string, optionId: string, variantId: string): SelectionInput[] {
  return value.map((s) => (s.groupId === groupId && s.optionId === optionId ? { ...s, variantId } : s))
}

function Thumb({ option, tone }: { option: ProductOption; tone: Tone }) {
  return option.image
    ? <img src={option.image} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
    : <span className={cn('w-full h-full grid place-items-center', T[tone].img)}><Utensils className="w-8 h-8" strokeWidth={1.3} /></span>
}

type PickerProps = { groups: OptionGroup[]; value: SelectionInput[]; onChange: (next: SelectionInput[]) => void; tone?: Tone }

/** Escolha das opções em cards com imagem (grade de 2 colunas), igual aos apps de delivery. */
export function OptionsPicker({ groups, value, onChange, tone = 'dark' }: PickerProps) {
  const t = T[tone]
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => {
        const chosen = value.filter((s) => s.groupId === g.id)
        const full = g.max > 1 && chosen.length >= g.max
        const single = g.max === 1
        return (
          <section key={g.id} aria-label={g.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={cn('text-[18px] leading-tight font-bold tracking-tight', t.title)}>{g.name}</h3>
                <p className={cn('mt-0.5 text-[12.5px]', t.sub)}>{g.description ? `${g.description} · ` : ''}{ruleText(g)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={cn('px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider', g.min > 0 ? t.badgeReq : t.badgeOpt)}>{g.min > 0 ? 'Obrigatório' : 'Opcional'}</span>
                {!single && <span className={cn('text-[11.5px] tabular-nums', t.sub)}>{chosen.length}/{g.max}</span>}
              </div>
            </div>

            <div role={single ? 'radiogroup' : 'group'} aria-label={g.name} className="mt-3 grid grid-cols-2 gap-3">
              {g.options.map((o) => {
                const on = chosen.some((s) => s.optionId === o.id)
                const blocked = full && !on
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={single ? 'radio' : 'checkbox'}
                    aria-checked={on}
                    disabled={blocked}
                    onClick={() => onChange(toggleOption(groups, value, g.id, o.id))}
                    className={cn('relative text-left rounded-[22px] overflow-hidden border transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100', on ? t.cardOn : t.card)}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden">
                      <Thumb option={o} tone={tone} />
                      {o.priceCents > 0 && <span className="absolute left-2 bottom-2 rounded-full bg-black/70 text-white text-[11.5px] font-bold px-2 py-0.5 tabular-nums">+ {formatCents(o.priceCents)}</span>}
                      {on && <span className={cn('absolute right-2 top-2 w-6 h-6 rounded-full grid place-items-center shadow', t.check)}><Check className="w-3.5 h-3.5" strokeWidth={2.8} /></span>}
                    </span>
                    <span className="block px-3 py-2.5">
                      <span className="block text-[13.5px] font-semibold leading-tight line-clamp-2 break-words">{o.name}</span>
                      {o.description && <span className={cn('block mt-0.5 text-[11.5px] leading-snug line-clamp-2', t.muted)}>{o.description}</span>}
                    </span>
                  </button>
                )
              })}
            </div>

            {chosen.map((s) => {
              const o = g.options.find((x) => x.id === s.optionId)
              if (!o || o.variants.length === 0) return null
              return (
                <div key={o.id} className="mt-3">
                  <div className={cn('text-[12.5px] font-semibold mb-1.5', t.label)}>{o.name}: {o.variantLabel || 'escolha uma opção'}</div>
                  <div className="flex flex-wrap gap-2">
                    {o.variants.map((v) => (
                      <button key={v.id} type="button" onClick={() => onChange(setVariant(value, g.id, o.id, v.id))} aria-pressed={s.variantId === v.id}
                        className={cn('h-11 px-4 rounded-full border text-[13.5px] font-medium transition active:scale-95', s.variantId === v.id ? t.chipOn : t.chip)}>{v.name}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

/** Resumo claro antes de adicionar: o que foi escolhido, valor original, adicionais e valor final. */
export function OptionsSummary({ product, selections, tone = 'dark' }: { product: Product; selections: SelectionInput[]; tone?: Tone }) {
  const t = T[tone]
  const { baseCents, extraCents, totalCents } = priceBreakdown(product, selections)
  const rows = (product.optionGroups ?? []).flatMap((g) =>
    g.options
      .filter((o) => selections.some((s) => s.groupId === g.id && s.optionId === o.id))
      .map((o) => {
        const v = o.variants.find((x) => x.id === selections.find((s) => s.groupId === g.id && s.optionId === o.id)?.variantId)
        return { key: `${g.id}:${o.id}`, group: g.name, label: v ? `${o.name} · ${v.name}` : o.name, cents: o.priceCents }
      }),
  )
  return (
    <div className={cn('rounded-[24px] border p-4', t.box)}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">Resumo do seu pedido</div>
      <div className="mt-1 text-[18px] font-bold tracking-tight">{product.name}</div>
      {rows.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="min-w-0"><span className={cn('text-[11.5px] mr-1.5', t.muted)}>{r.group}</span>{r.label}</span>
              {r.cents > 0 && <span className="tabular-nums whitespace-nowrap">+ {formatCents(r.cents)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className={cn('mt-3 pt-3 border-t flex flex-col gap-1 text-[13.5px]', t.line)}>
        <div className="flex justify-between"><span className={t.muted}>Valor original</span><span className="tabular-nums">{formatCents(baseCents)}</span></div>
        <div className="flex justify-between"><span className={t.muted}>Adicionais</span><span className="tabular-nums">{extraCents > 0 ? `+ ${formatCents(extraCents)}` : '—'}</span></div>
        <div className="flex justify-between items-baseline pt-1"><span className="font-semibold">Valor final</span><span className="text-[20px] font-bold tabular-nums">{formatCents(totalCents)}</span></div>
      </div>
    </div>
  )
}
