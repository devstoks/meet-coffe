import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

/**
 * Valor em reais digitado como a pessoa escreve ("1,5", "2,75", "10,99", "R$ 0,50", "1.234,56") → CENTAVOS INTEIROS.
 * Nunca passa por ponto flutuante: o valor é montado a partir dos dígitos, então não há erro de arredondamento.
 * Regra: com vírgula, a vírgula é o decimal e pontos são milhar; só com ponto, vale como decimal se tiver até 2 dígitos depois dele.
 * Mais de 2 casas decimais são ignoradas (a 3ª casa não entra). Vazio/inválido → null.
 */
export function parseCents(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null
  let intPart: string
  let frac = ''
  const comma = s.lastIndexOf(',')
  if (comma >= 0) {
    intPart = s.slice(0, comma).replace(/[.,]/g, '')
    frac = s.slice(comma + 1).replace(/[.,]/g, '')
  } else if (s.includes('.')) {
    const dot = s.lastIndexOf('.')
    const after = s.slice(dot + 1)
    if (s.indexOf('.') === dot && after.length <= 2) { intPart = s.slice(0, dot); frac = after } // "1.5", "2.75"
    else intPart = s.replace(/\./g, '') // "1.000" → mil
  } else intPart = s
  const reais = Number((intPart || '0').slice(0, 7))
  const centavos = Number((frac + '00').slice(0, 2))
  if (!Number.isFinite(reais) || !Number.isFinite(centavos)) return null
  return reais * 100 + centavos
}

/** Centavos → "1.234,50" (sem o "R$", que o campo mostra à parte). */
export function formatBRL(cents: number): string {
  const c = Math.max(0, Math.round(cents))
  return `${Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(c % 100).padStart(2, '0')}`
}

type Props = {
  /** Valor em centavos inteiros. */
  valueCents: number
  onChange: (cents: number) => void
  id?: string
  label?: string
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
}

/** Campo de valor em reais (R$) para a dashboard: aceita vírgula ou ponto e guarda sempre em centavos. */
export function MoneyInput({ valueCents, onChange, id, label, placeholder = '0,00', className, inputClassName, disabled }: Props) {
  const [text, setText] = useState(() => formatBRL(valueCents))
  const [focused, setFocused] = useState(false)

  // Mudança vinda de fora (carregar o produto, desfazer…) atualiza o texto; enquanto digita, o texto é de quem digita.
  useEffect(() => { if (!focused) setText(formatBRL(valueCents)) }, [valueCents, focused])

  function onType(raw: string) {
    // só dígitos, vírgula e ponto; no máximo 2 casas depois da vírgula
    let t = raw.replace(/[^\d.,]/g, '').slice(0, 12)
    const c = t.indexOf(',')
    if (c >= 0) t = t.slice(0, c + 1) + t.slice(c + 1).replace(/[.,]/g, '').slice(0, 2)
    setText(t)
    onChange(parseCents(t) ?? 0)
  }

  return (
    <label className={cn('block', className)}>
      {label && <span className="text-[10px] font-bold text-olive uppercase">{label}</span>}
      <span className={cn('mt-1 flex items-center rounded-lg border border-sand bg-white/[0.06] focus-within:border-moss transition', disabled && 'opacity-50')}>
        <span className="pl-3 pr-1 text-sm text-coffee select-none" aria-hidden>R$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onFocus={(e) => { setFocused(true); e.currentTarget.select() }}
          onBlur={() => { setFocused(false); setText(formatBRL(valueCents)) }}
          onChange={(e) => onType(e.target.value)}
          aria-label={label ?? 'Valor em reais'}
          className={cn('min-w-0 w-full bg-transparent px-2 pr-3 min-h-11 text-sm text-moss outline-none tabular-nums', inputClassName)}
        />
      </span>
    </label>
  )
}
