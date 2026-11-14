import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { missingSelection, priceBreakdown, formatCents, type OptionGroup, type Product, type ProductOption, type SelectionInput } from '../lib/api'
import { uploadOptionImage } from '../lib/admin'
import { squareImage } from '../lib/squareImage'
import { cn } from '../lib/cn'
import { MoneyInput } from './MoneyInput'
import { OptionsPicker, OptionsSummary, type Tone } from './OptionsPicker'

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3)

const INPUT = 'w-full min-w-0 px-3 min-h-11 rounded-lg border border-sand bg-white/[0.06] text-sm text-moss outline-none focus:border-moss placeholder:text-coffee/45'
const LABEL = 'text-[10px] font-bold text-olive uppercase'
const HELP = 'mt-1 text-[11.5px] leading-snug text-coffee/70'
const GHOST = 'min-h-11 px-4 rounded-full border border-moss text-moss text-[11px] font-bold uppercase tracking-wider hover:bg-moss hover:text-cream transition flex items-center gap-1.5'
const ICON_BTN = 'w-11 h-11 flex-shrink-0 rounded-full border border-sand grid place-items-center transition disabled:opacity-30 disabled:cursor-not-allowed'

export function emptyOption(): ProductOption {
  return { id: newId(), name: '', description: null, image: null, priceCents: 0, priceDelta: 0, variantLabel: null, variants: [] }
}
export function emptyGroup(name = ''): OptionGroup {
  return { id: newId(), name, description: null, min: 1, max: 1, required: true, options: [emptyOption()] }
}

/** Mantém as regras do grupo coerentes: 1 ≤ máximo ≤ nº de opções; 0 ≤ mínimo ≤ máximo; obrigatório = mínimo ≥ 1. */
function fix(g: OptionGroup): OptionGroup {
  const n = Math.max(1, g.options.length)
  const max = Math.min(Math.max(1, Math.round(g.max)), n)
  const min = Math.min(Math.max(0, Math.round(g.min)), max)
  return { ...g, min, max, required: min > 0 }
}

/** A regra do grupo em uma frase simples, para o dono conferir o que configurou. */
export function ruleSentence(g: OptionGroup): string {
  if (g.max === 1) return g.min === 1 ? 'O cliente escolhe 1 opção (obrigatório).' : 'O cliente pode escolher 1 opção, ou nenhuma (opcional).'
  if (g.min === g.max) return `O cliente escolhe exatamente ${g.max} opções.`
  if (g.min === 0) return `O cliente pode escolher até ${g.max} opções (opcional).`
  return `O cliente escolhe de ${g.min} a ${g.max} opções.`
}

/** Mensagem de erro (ou null) para o que o dono montou; o servidor valida de novo ao salvar. */
export function optionGroupsProblem(groups: OptionGroup[]): string | null {
  for (const g of groups) {
    if (!g.name.trim()) return 'Todo grupo de escolhas precisa de um nome (ex.: Escolha sua comida).'
    if (g.options.length === 0) return `O grupo "${g.name}" precisa de pelo menos uma opção.`
    if (g.max > g.options.length) return `O grupo "${g.name}" tem só ${g.options.length} ${g.options.length === 1 ? 'opção' : 'opções'}: a quantidade máxima não pode passar disso.`
    if (g.min > g.max) return `No grupo "${g.name}", a quantidade mínima não pode ser maior que a máxima.`
    for (const o of g.options) {
      if (!o.name.trim()) return `Há uma opção sem nome no grupo "${g.name}".`
      if (!Number.isInteger(o.priceCents) || o.priceCents < 0) return `Valor adicional inválido em "${o.name}".`
      if (o.variants.some((v) => !v.name.trim())) return `Há uma variação sem nome em "${o.name}".`
    }
  }
  return null
}

function Switch({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string; disabled?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-50')}>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
        onClick={() => onChange(!checked)}
        className="mt-0.5 flex-shrink-0 w-12 h-11 grid place-items-center"
      >
        <span className={cn('relative w-11 h-6 rounded-full transition-colors', checked ? 'bg-[#E8A317]' : 'bg-white/20')}>
          <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
        </span>
      </button>
      <div className="min-w-0 pt-2">
        <div className="text-[13px] font-semibold text-moss">{label}</div>
        <p className={HELP.replace('mt-1 ', '')}>{help}</p>
      </div>
    </div>
  )
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-sand" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Diminuir ${label.toLowerCase()}`} className="w-11 h-11 grid place-items-center text-moss disabled:opacity-30"><Minus className="w-4 h-4" /></button>
      <span className="min-w-8 text-center text-[15px] font-semibold tabular-nums text-moss" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Aumentar ${label.toLowerCase()}`} className="w-11 h-11 grid place-items-center text-moss disabled:opacity-30"><Plus className="w-4 h-4" /></button>
    </div>
  )
}

function OptionImage({ option, onChange, onError }: { option: ProductOption; onChange: (image: string | null) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (input.current) input.current.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { onError('Use uma foto JPG, PNG ou WEBP.'); return }
    setBusy(true)
    try {
      const square = await squareImage(file)
      const { url } = await uploadOptionImage(square)
      onChange(url)
    } catch (err: any) { onError(err?.message ?? 'Não foi possível enviar a foto.') }
    finally { setBusy(false) }
  }

  return (
    <div className="relative flex-shrink-0 w-[76px]">
      <button
        type="button" onClick={() => input.current?.click()} disabled={busy}
        aria-label={option.image ? 'Trocar a foto da opção' : 'Adicionar foto da opção'}
        className="w-[76px] h-[76px] rounded-xl overflow-hidden border border-dashed border-sand bg-white/[0.06] text-coffee/60 grid place-items-center hover:bg-white/10 transition"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : option.image
          ? <img src={option.image} alt="" className="w-full h-full object-cover" />
          : <span className="flex flex-col items-center gap-1"><ImagePlus className="w-5 h-5" /><span className="text-[9px] font-bold uppercase">Foto</span></span>}
      </button>
      {option.image && !busy && (
        <button type="button" onClick={() => onChange(null)} aria-label="Remover a foto da opção" className="mt-1 w-full min-h-8 rounded-md text-[10px] font-bold uppercase text-[#ffb3a8] hover:bg-white/10">Remover</button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="hidden" />
    </div>
  )
}

/** Como o cliente vê as opções, ao vivo, no estilo do Feed (escuro) ou da Lista (claro). Dá para clicar e testar as regras. */
function Preview({ groups, productName, basePriceCents }: { groups: OptionGroup[]; productName: string; basePriceCents: number }) {
  const [tone, setTone] = useState<Tone>('dark')
  const [sel, setSel] = useState<SelectionInput[]>([])
  const product = useMemo<Product>(() => ({
    id: 'preview', name: productName.trim() || 'Seu combo', description: null, price: basePriceCents / 100, category: '', images: [], videoPath: null, optionGroups: groups,
  }), [groups, productName, basePriceCents])
  // some escolha de teste que não existe mais (o dono removeu a opção)
  const valid = useMemo(() => sel.filter((s) => groups.some((g) => g.id === s.groupId && g.options.some((o) => o.id === s.optionId))), [sel, groups])
  const missing = missingSelection(groups, valid)
  const { totalCents } = priceBreakdown(product, valid)

  return (
    <aside aria-label="Pré-visualização para o cliente" className="flex flex-col gap-3">
      <div>
        <div className={LABEL}>Como o cliente vai ver</div>
        <p className={HELP}>Pode clicar nas opções para testar as regras e o preço.</p>
      </div>
      <div role="tablist" aria-label="Estilo do cardápio" className="inline-flex self-start rounded-full border border-sand p-1">
        {([['dark', 'Feed'], ['light', 'Lista']] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tone === t} onClick={() => setTone(t)}
            className={cn('min-h-9 px-4 rounded-full text-[12px] font-semibold transition', tone === t ? 'bg-[#F5F1E8] text-[#1f1a14]' : 'text-moss')}>{label}</button>
        ))}
      </div>
      <div className={cn('rounded-[28px] border overflow-hidden', tone === 'dark' ? 'bg-[#1c120a] border-white/15 text-white' : 'bg-[#F5F1E8] border-[#1f1a14]/10 text-[#1f1a14]')}>
        <div className="max-h-[560px] overflow-y-auto px-4 pt-4 pb-4 [scrollbar-width:thin]">
          <div className="text-[19px] font-bold tracking-tight">{product.name}</div>
          <div className="mt-0.5 text-[13px] opacity-65">{formatCents(basePriceCents)}</div>
          <div className="mt-4 flex flex-col gap-6">
            <OptionsPicker groups={groups} value={valid} onChange={setSel} tone={tone} />
            <OptionsSummary product={product} selections={valid} tone={tone} />
          </div>
        </div>
        <div className={cn('px-4 py-3 border-t flex items-center justify-between gap-3', tone === 'dark' ? 'border-white/10 bg-black/20' : 'border-[#1f1a14]/8 bg-white')}>
          <span className="text-[12px] opacity-70">{missing ? `Falta escolher: ${missing}` : 'Pronto para adicionar'}</span>
          <span className="text-[16px] font-bold tabular-nums">{formatCents(totalCents)}</span>
        </div>
      </div>
    </aside>
  )
}

/**
 * Editor de personalização (combos/kits e sabores), pensado para quem não é técnico:
 * grupos de escolhas → opções com foto e valor adicional → regras simples (obrigatório, múltipla, mínimo/máximo).
 */
export function ProductOptionsEditor({ value, onChange, productName, basePriceCents, onError }: {
  value: OptionGroup[]
  onChange: (g: OptionGroup[]) => void
  productName: string
  basePriceCents: number
  onError: (message: string) => void
}) {
  const setGroup = (gi: number, patch: Partial<OptionGroup>) => onChange(value.map((g, i) => (i === gi ? fix({ ...g, ...patch }) : g)))
  const setOption = (gi: number, oi: number, patch: Partial<ProductOption>) =>
    setGroup(gi, { options: value[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) })
  const move = (gi: number, to: number) => {
    if (to < 0 || to >= value.length) return
    const next = [...value]; const [g] = next.splice(gi, 1); next.splice(to, 0, g); onChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-coffee/80 leading-relaxed">
        Use para <b className="text-moss">combos e kits</b> (ex.: escolha o lanche e a bebida) ou para pedir <b className="text-moss">sabor e recheio</b>.
        O cliente vê as opções em cards com foto, como nos apps de delivery, e o valor final é atualizado na hora.
      </p>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sand px-4 py-8 flex flex-col items-center text-center gap-4">
          <div>
            <div className="text-[14px] font-semibold text-moss">Este produto ainda não tem personalização</div>
            <p className={HELP}>Adicione um grupo de escolhas para o cliente montar o pedido do jeito dele.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => onChange([emptyGroup()])} className={GHOST}><Plus className="w-4 h-4" /> Adicionar grupo de escolhas</button>
            <button type="button" onClick={() => onChange([emptyGroup('Escolha sua comida'), emptyGroup('Escolha sua bebida')])} className={GHOST}>Usar modelo: comida + bebida</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            {value.map((g, gi) => {
              const multiple = g.max > 1
              const canMultiple = g.options.length >= 2
              return (
                <section key={g.id} aria-label={`Grupo ${gi + 1}`} className="rounded-2xl border border-sand p-4 flex flex-col gap-4 bg-white/[0.03]">
                  <header className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-olive uppercase">Grupo {gi + 1}</div>
                      <p className="text-[12px] text-coffee/75 leading-snug">Defina quais alimentos o cliente poderá escolher neste grupo.</p>
                    </div>
                    <button type="button" onClick={() => move(gi, gi - 1)} disabled={gi === 0} aria-label="Subir grupo" className={cn(ICON_BTN, 'text-moss')}><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(gi, gi + 1)} disabled={gi === value.length - 1} aria-label="Descer grupo" className={cn(ICON_BTN, 'text-moss')}><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => onChange(value.filter((_, i) => i !== gi))} aria-label="Remover grupo" className={cn(ICON_BTN, 'text-[#ffb3a8] hover:bg-[#B66B65] hover:text-cream')}><Trash2 className="w-4 h-4" /></button>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL} htmlFor={`g-name-${g.id}`}>Nome do grupo</label>
                      <input id={`g-name-${g.id}`} value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} maxLength={60} placeholder="Ex.: Escolha seu lanche" className={cn(INPUT, 'mt-1 font-semibold')} />
                      <p className={HELP}>É o título que o cliente vê acima das opções.</p>
                    </div>
                    <div>
                      <label className={LABEL} htmlFor={`g-desc-${g.id}`}>Instrução para o cliente (opcional)</label>
                      <input id={`g-desc-${g.id}`} value={g.description ?? ''} onChange={(e) => setGroup(gi, { description: e.target.value })} maxLength={140} placeholder="Ex.: Escolha 1 sabor de hambúrguer" className={cn(INPUT, 'mt-1')} />
                      <p className={HELP}>Uma frase curta que aparece embaixo do título.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-sand/70 p-3.5 flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                      <Switch
                        checked={g.min > 0} onChange={(v) => setGroup(gi, { min: v ? Math.max(1, g.min) : 0 })}
                        label="Escolha obrigatória" help="Ligado: o cliente não consegue adicionar o produto sem escolher neste grupo."
                      />
                      <Switch
                        checked={multiple} disabled={!canMultiple && !multiple}
                        onChange={(v) => setGroup(gi, v ? { max: 2 } : { max: 1, min: Math.min(g.min, 1) })}
                        label="Escolha múltipla" help={canMultiple || multiple ? 'Ligado: o cliente pode marcar mais de uma opção (até o máximo abaixo).' : 'Adicione pelo menos 2 opções para permitir mais de uma escolha.'}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <div className={LABEL}>Quantidade mínima</div>
                        <div className="mt-1"><Stepper label="Quantidade mínima" value={g.min} min={0} max={g.max} onChange={(v) => setGroup(gi, { min: v })} /></div>
                        <p className={HELP}>Quantas opções o cliente precisa escolher, no mínimo. 0 = ele pode pular este grupo.</p>
                      </div>
                      <div>
                        <div className={LABEL}>Quantidade máxima</div>
                        <div className="mt-1"><Stepper label="Quantidade máxima" value={g.max} min={Math.max(1, g.min)} max={Math.max(1, g.options.length)} onChange={(v) => setGroup(gi, { max: v })} /></div>
                        <p className={HELP}>Quantas opções ele pode escolher, no máximo. Não passa do número de opções do grupo ({g.options.length}).</p>
                      </div>
                    </div>
                    <p className="text-[12.5px] font-medium text-moss rounded-lg bg-white/[0.06] px-3 py-2" aria-live="polite">{ruleSentence(g)}</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className={LABEL}>Opções do grupo</div>
                    {g.options.map((o, oi) => (
                      <div key={o.id} className="rounded-xl bg-black/15 p-3 flex flex-col gap-3">
                        <div className="flex gap-3 items-start">
                          <OptionImage option={o} onChange={(image) => setOption(gi, oi, { image })} onError={onError} />
                          <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_150px] gap-3">
                            <div className="min-w-0">
                              <label className={LABEL} htmlFor={`o-name-${o.id}`}>Nome da opção</label>
                              <input id={`o-name-${o.id}`} value={o.name} onChange={(e) => setOption(gi, oi, { name: e.target.value })} maxLength={60} placeholder="Ex.: Hambúrguer artesanal" className={cn(INPUT, 'mt-1')} />
                            </div>
                            <div>
                              <MoneyInput
                                label="Valor adicional" valueCents={o.priceCents}
                                onChange={(c) => setOption(gi, oi, { priceCents: c, priceDelta: c / 100 })}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className={LABEL} htmlFor={`o-desc-${o.id}`}>Descrição curta (opcional)</label>
                              <input id={`o-desc-${o.id}`} value={o.description ?? ''} onChange={(e) => setOption(gi, oi, { description: e.target.value })} maxLength={140} placeholder="Ex.: Pão brioche, carne 150 g e queijo" className={cn(INPUT, 'mt-1')} />
                              <p className={HELP}><b>Valor adicional:</b> quanto soma ao preço quando o cliente escolhe esta opção. R$ 0,00 = sem custo extra.</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} disabled={g.options.length <= 1} aria-label="Remover opção" title={g.options.length <= 1 ? 'O grupo precisa de pelo menos uma opção' : undefined} className={cn(ICON_BTN, 'text-[#ffb3a8] hover:bg-[#B66B65] hover:text-cream')}><Trash2 className="w-4 h-4" /></button>
                        </div>

                        <details className="group/v" open={o.variants.length > 0}>
                          <summary className="cursor-pointer select-none min-h-9 flex items-center text-[11px] font-bold uppercase tracking-wider text-olive hover:text-moss">
                            Variações desta opção ({o.variants.length}) — opcional
                          </summary>
                          <div className="pt-2 pl-3 border-l-2 border-sand/60 flex flex-col gap-2">
                            <p className={cn(HELP, 'mt-0')}>Use quando a opção tem versões. Ex.: opção “Croissant” com variações “Frango” e “Queijo”. O cliente escolhe uma delas.</p>
                            {o.variants.length > 0 && (
                              <input value={o.variantLabel ?? ''} onChange={(e) => setOption(gi, oi, { variantLabel: e.target.value })} maxLength={60} placeholder="Pergunta das variações (ex.: Recheio)" aria-label="Pergunta das variações" className={INPUT} />
                            )}
                            {o.variants.map((v, vi) => (
                              <div key={v.id} className="flex gap-2 items-center">
                                <input value={v.name} onChange={(e) => setOption(gi, oi, { variants: o.variants.map((x, i) => (i === vi ? { ...x, name: e.target.value } : x)) })} maxLength={60} placeholder="Variação (ex.: Frango)" aria-label="Nome da variação" className={cn(INPUT, 'flex-1')} />
                                <button type="button" onClick={() => setOption(gi, oi, { variants: o.variants.filter((_, i) => i !== vi), variantLabel: o.variants.length === 1 ? null : o.variantLabel })} aria-label="Remover variação" className={cn(ICON_BTN, 'text-[#ffb3a8] hover:bg-[#B66B65] hover:text-cream')}><Trash2 className="w-4 h-4" /></button>
                              </div>
                            ))}
                            <button type="button" onClick={() => setOption(gi, oi, { variants: [...o.variants, { id: newId(), name: '' }], variantLabel: o.variantLabel ?? 'Escolha' })} className="self-start text-[11px] font-bold uppercase tracking-wider text-olive hover:text-moss flex items-center gap-1 min-h-11"><Plus className="w-3.5 h-3.5" /> Adicionar variação</button>
                          </div>
                        </details>
                      </div>
                    ))}
                    <button type="button" onClick={() => setGroup(gi, { options: [...g.options, emptyOption()] })} className={cn(GHOST, 'self-start')}><Plus className="w-4 h-4" /> Adicionar opção</button>
                  </div>
                </section>
              )
            })}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onChange([...value, emptyGroup()])} disabled={value.length >= 8} className={GHOST}><Plus className="w-4 h-4" /> Adicionar grupo de escolhas</button>
            </div>
          </div>

          <div className="xl:sticky xl:top-4">
            <Preview groups={value} productName={productName} basePriceCents={basePriceCents} />
          </div>
        </div>
      )}
    </div>
  )
}
