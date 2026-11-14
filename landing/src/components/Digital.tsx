import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, QrCode, SmartphoneNfc } from 'lucide-react'
import { Button, Eyebrow, Reveal } from './ui'
import { MENU, MENU_APP_URL, STEPS, formatPrice } from '../content'
import type { Target } from '../App'

const SLIDES = [
  MENU[0].items[0], // Morning Ritual
  MENU[3].items[0], // Iced Coffee
  MENU[4].items[2], // Berry Cheesecake
  MENU[0].items[2], // Pão de Queijo
]

/** Celular que imita o feed do cardápio digital: um produto por vez, deslizando para cima. */
function PhoneMock() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 3000)
    return () => clearInterval(t)
  }, [])
  const s = SLIDES[i]
  return (
    <div className="relative mx-auto w-[min(70vw,250px)]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-amber/15 blur-3xl" aria-hidden />
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[40px] border-[7px] border-[#0c0805] bg-bean shadow-[0_30px_70px_-20px_rgba(0,0,0,0.8)]">
        <div className="absolute left-1/2 top-2 z-20 h-4 w-16 -translate-x-1/2 rounded-full bg-[#0c0805]" aria-hidden />
        <AnimatePresence initial={false}>
          <motion.div
            key={i}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.7, ease: [0.7, 0, 0.2, 1] }}
            className="absolute inset-0"
          >
            <img src={s.image} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
            <div className="absolute inset-x-4 bottom-5 text-left">
              <div className="text-[19px] font-bold leading-tight tracking-tight">{s.name}</div>
              <div className="mt-0.5 text-[12px] text-white/70">{formatPrice(s.price)}</div>
              <div className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/50 bg-white/10 text-[11.5px] font-medium backdrop-blur">
                <Plus className="h-3.5 w-3.5" /> Adicionar à lista
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="absolute right-2.5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5">
          {SLIDES.map((_, k) => (
            <span key={k} className={`h-1.5 w-1.5 rounded-full transition ${k === i ? 'scale-125 bg-white' : 'bg-white/35'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Digital({ go }: { go: (t: Target) => void }) {
  return (
    <section id="digital" className="overflow-hidden bg-roast px-5 py-20 md:py-28">
      <div className="mx-auto grid max-w-[1100px] items-center gap-14 md:grid-cols-2">
        <div>
          <Reveal>
            <Eyebrow>Cardápio digital</Eyebrow>
            <h2 className="text-[2rem] font-medium leading-[1.08] tracking-tight sm:text-5xl">
              Seu pedido começa <span className="font-serif italic font-semibold text-crema">na sua mesa.</span>
            </h2>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-latte/70">
              Sem fila e sem esperar o garçom: você escolhe pelo celular e a cozinha já recebe o pedido.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-2 text-[12.5px] font-medium"><SmartphoneNfc className="h-4 w-4 text-amber" /> Tag NFC</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-2 text-[12.5px] font-medium"><QrCode className="h-4 w-4 text-amber" /> QR Code</span>
              <span className="self-center text-[12.5px] text-latte/50">— você escolhe</span>
            </div>
          </Reveal>

          <ol className="mt-9 flex flex-col gap-5">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.1}>
                <li className="flex gap-4">
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-amber/50 bg-amber/10 text-[14px] font-bold text-amber">
                    {i === 0 ? <SmartphoneNfc className="h-[18px] w-[18px]" /> : i + 1}
                  </span>
                  <div>
                    <h3 className="text-[16px] font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-latte/60">{s.text}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={0.2} className="mt-9 flex flex-wrap gap-3">
            {MENU_APP_URL ? (
              <Button variant="light" href={MENU_APP_URL} external>Abrir cardápio digital</Button>
            ) : (
              <Button variant="light" onClick={() => go('menu')}>Ver o cardápio</Button>
            )}
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <PhoneMock />
        </Reveal>
      </div>
    </section>
  )
}
