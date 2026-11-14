import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Visual compartilhado das telas do cliente (apresentação, tutorial, avaliação, agradecimento):
 *  fundo café escuro com brilho, vidro translúcido e botões no mesmo padrão do cardápio. */
export const STAGE_BG =
  'bg-[#150e08] bg-[radial-gradient(900px_480px_at_85%_-10%,rgba(150,100,55,0.35),transparent_60%),radial-gradient(800px_460px_at_-10%_105%,rgba(95,110,65,0.25),transparent_60%)]'

export const GLASS = 'rounded-[28px] bg-[#2a1a0e]/70 backdrop-blur-xl border border-white/15 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]'
export const BTN_PRIMARY = 'w-full h-12 rounded-full bg-[#F5F1E8] text-[#1f1a14] text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed'
export const BTN_GHOST = 'w-full h-12 rounded-full border border-white/35 text-white text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-white/10 active:scale-[0.98] transition disabled:opacity-60'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="text-[22px] font-bold tracking-tight text-[#F5F1E8]">meetcoffe</div>
      <div className="h-px w-10 bg-white/30" />
    </div>
  )
}

export function Stage({ children, fixed = false, className }: { children: ReactNode; fixed?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        STAGE_BG,
        'text-white flex flex-col items-center justify-center p-6 text-center',
        fixed ? 'fixed inset-0 z-[100] backdrop-blur-md' : 'min-h-screen h-full w-full',
        className
      )}
    >
      {children}
    </div>
  )
}

export function IconBadge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' }) {
  return (
    <div
      className={cn(
        'w-16 h-16 rounded-full grid place-items-center border',
        tone === 'success' ? 'bg-[#7b6a46]/80 border-white/10 text-white' : 'bg-white/10 border-white/15 text-[#F5F1E8]'
      )}
    >
      {children}
    </div>
  )
}
