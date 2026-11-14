import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bean } from './CoffeeCup'
import { Button, Eyebrow } from './ui'
import { MENU, MENU_APP_URL, formatPrice } from '../content'
import { cn } from '../lib/cn'

export function MenuPage() {
  const [active, setActive] = useState(MENU[0].id)
  const chipsRef = useRef<HTMLDivElement>(null)

  // destaca a categoria que está na tela
  useEffect(() => {
    const els = MENU.map((c) => document.getElementById(`cat-${c.id}`)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (vis) setActive(vis.target.id.replace('cat-', ''))
      },
      { rootMargin: '-120px 0px -65% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // mantém o chip ativo visível na barra horizontal (mobile)
  useEffect(() => {
    chipsRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])

  function jump(id: string) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  return (
    <main className="min-h-screen bg-roast pb-24 pt-24">
      <div className="relative mx-auto max-w-[860px] px-5">
        <div className="pointer-events-none absolute right-5 top-2 hidden sm:block" aria-hidden>
          <motion.div animate={{ y: [0, -10, 0], rotate: [20, 36, 20] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}><Bean size={30} /></motion.div>
        </div>
        <Eyebrow>Cardápio</Eyebrow>
        <h1 className="text-[2.6rem] font-medium leading-[1.02] tracking-tight sm:text-6xl">
          O que servimos <span className="font-serif italic font-semibold text-crema">hoje.</span>
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-latte/65">
          O mesmo cardápio que aparece no celular da sua mesa. Os valores podem variar — confirme com a nossa equipe.
        </p>
      </div>

      <div className="sticky top-[60px] z-30 mt-8 border-y border-white/10 bg-roast/85 backdrop-blur-xl">
        <div ref={chipsRef} className="no-scrollbar mx-auto flex max-w-[860px] gap-2 overflow-x-auto px-5 py-3">
          {MENU.map((c) => (
            <button
              key={c.id}
              data-chip={c.id}
              onClick={() => jump(c.id)}
              className={cn(
                'relative h-9 flex-shrink-0 rounded-full border px-4 text-[13px] font-medium transition-colors',
                active === c.id ? 'border-transparent text-roast' : 'border-white/20 text-latte/75'
              )}
            >
              {active === c.id && <motion.span layoutId="chip" className="absolute inset-0 rounded-full bg-latte" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <span className="relative">{c.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-5">
        {MENU.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="pt-12">
            <motion.h2
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.6 }}
              className="mb-5 text-[1.6rem] font-semibold tracking-tight"
            >
              {cat.title}
            </motion.h2>
            <ul className="flex flex-col">
              {cat.items.map((it, i) => (
                <motion.li
                  key={it.name}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '0px 0px -8% 0px' }}
                  transition={{ duration: 0.55, delay: Math.min(i * 0.05, 0.2) }}
                  className="border-b border-white/10 py-4 last:border-b-0"
                >
                  <div className="flex items-end gap-3">
                    <h3 className="text-[16.5px] font-semibold tracking-tight">{it.name}</h3>
                    <span aria-hidden className="mb-1.5 min-w-4 flex-1 border-b border-dotted border-white/25" />
                    <span className="text-[16px] font-semibold tabular-nums text-crema">{formatPrice(it.price)}</span>
                  </div>
                  <p className="mt-1 max-w-[34rem] text-[13.5px] leading-relaxed text-latte/55">{it.description}</p>
                </motion.li>
              ))}
            </ul>
          </section>
        ))}

        <div className="mt-16 rounded-[28px] border border-white/12 bg-white/[0.05] p-6 text-center backdrop-blur">
          <h3 className="text-[1.3rem] font-semibold tracking-tight">Pedindo pela mesa?</h3>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-latte/60">Encoste o celular na tag NFC da sua mesa ou escaneie o QR Code e peça direto do celular, com fotos de cada item.</p>
          {MENU_APP_URL && <div className="mt-5 flex justify-center"><Button variant="light" href={MENU_APP_URL} external>Abrir cardápio digital</Button></div>}
        </div>
      </div>
    </main>
  )
}
