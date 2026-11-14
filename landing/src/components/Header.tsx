import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { BRAND } from '../content'
import { cn } from '../lib/cn'
import type { Target, View } from '../App'

const LINKS: { id: Target; label: string }[] = [
  { id: 'sobre', label: 'Sobre' },
  { id: 'digital', label: 'Cardápio digital' },
  { id: 'ambiente', label: 'Ambiente' },
  { id: 'local', label: 'Onde estamos' },
]

/** Xícara que vai enchendo conforme a página é rolada. */
function ProgressCup({ light }: { light: boolean }) {
  const { scrollYProgress } = useScroll()
  const fill = useSpring(scrollYProgress, { stiffness: 110, damping: 24 })
  const stroke = light ? '#3b2a22' : '#F5F1E8'
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="flex-shrink-0">
      <defs>
        <clipPath id="pc-clip"><path d="M4 9h14v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z" /></clipPath>
      </defs>
      <g clipPath="url(#pc-clip)">
        <motion.rect x="3" y="9" width="16" height="13" fill="#E8A317" style={{ scaleY: fill, transformBox: 'fill-box', transformOrigin: 'bottom' }} />
      </g>
      <path d="M4 9h14v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18 11h1.5a2.5 2.5 0 0 1 0 5H18" fill="none" stroke={stroke} strokeWidth="1.6" />
      <path d="M8 6c-1-1.5 1-2 0-3.5M12 6c-1-1.5 1-2 0-3.5M16 6c-1-1.5 1-2 0-3.5" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

export function Header({ view, go }: { view: View; go: (t: Target) => void }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const light = view === 'home' && !scrolled && !open
  const nav = (t: Target) => { setOpen(false); go(t) }

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          light ? 'bg-transparent py-4 text-ink' : 'border-b border-white/10 bg-roast/80 py-3 text-latte backdrop-blur-xl'
        )}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5">
          <button onClick={() => nav('top')} className="flex items-center gap-2.5" aria-label="Início">
            <ProgressCup light={light} />
            <span className="text-[19px] font-bold tracking-tight">{BRAND.name}</span>
          </button>

          <nav className="hidden items-center gap-8 text-[13px] font-medium md:flex">
            {LINKS.map((l) => (
              <button key={l.id} onClick={() => nav(l.id)} className="opacity-80 transition hover:opacity-100">
                {l.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => nav('menu')}
              className={cn(
                'h-10 rounded-full px-5 text-[12.5px] font-semibold transition active:scale-95',
                light ? 'bg-ink text-latte' : 'bg-latte text-roast',
                view === 'menu' && 'ring-2 ring-amber'
              )}
            >
              Cardápio
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              className="grid h-10 w-10 place-items-center rounded-full md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ clipPath: 'circle(0% at 92% 4%)' }}
            animate={{ clipPath: 'circle(150% at 92% 4%)' }}
            exit={{ clipPath: 'circle(0% at 92% 4%)' }}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed inset-0 z-40 flex flex-col justify-center bg-bean px-8 text-latte md:hidden"
          >
            <ul className="flex flex-col gap-2">
              {[{ id: 'top' as Target, label: 'Início' }, ...LINKS, { id: 'menu' as Target, label: 'Cardápio' }].map((l, i) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
                  <button onClick={() => nav(l.id)} className="w-full py-3 text-left text-[34px] font-bold tracking-tight">
                    {l.label}
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
