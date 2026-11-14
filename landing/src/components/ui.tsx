import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/cn'

export function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block text-[11px] font-bold uppercase tracking-[3px] text-amber mb-4', className)}>{children}</span>
}

type BtnProps = {
  children: ReactNode
  variant?: 'dark' | 'light' | 'ghost' | 'ghost-dark'
  href?: string
  onClick?: () => void
  external?: boolean
  className?: string
}

const VARIANT: Record<NonNullable<BtnProps['variant']>, { base: string; fill: string }> = {
  dark: { base: 'bg-ink text-latte', fill: 'bg-amber' },
  light: { base: 'bg-latte text-roast', fill: 'bg-amber' },
  ghost: { base: 'border border-white/35 text-latte', fill: 'bg-white/15' },
  'ghost-dark': { base: 'border border-ink/35 text-ink', fill: 'bg-ink/10' },
}

/** Botão "café sendo servido": no hover/toque o fundo sobe de baixo como uma xícara enchendo. */
export function Button({ children, variant = 'light', href, onClick, external, className }: BtnProps) {
  const v = VARIANT[variant]
  const cls = cn(
    'group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-7 text-[13px] font-semibold tracking-wide transition-transform active:scale-[0.97]',
    v.base,
    className
  )
  const inner = (
    <>
      <span aria-hidden className={cn('absolute inset-0 translate-y-full transition-transform duration-500 ease-out group-hover:translate-y-0 group-active:translate-y-0', v.fill)} />
      <span className="relative flex items-center gap-2 transition-colors group-hover:text-roast group-active:text-roast">{children}</span>
    </>
  )
  if (href) {
    return (
      <a href={href} onClick={onClick} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

/** Foto com fallback (se a imagem não carregar, mostra um bloco marrom em vez de ícone quebrado). */
export function Photo({ src, alt, className, imgClassName }: { src: string; alt: string; className?: string; imgClassName?: string }) {
  const [bad, setBad] = useState(false)
  return (
    <div className={cn('relative overflow-hidden bg-mocha', className)}>
      {!bad && (
        <motion.img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setBad(true)}
          initial={{ scale: 1.14 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      )}
    </div>
  )
}
