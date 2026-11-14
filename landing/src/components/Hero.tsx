import { motion } from 'framer-motion'
import { Coffee } from 'lucide-react'
import { CoffeeCup } from './CoffeeCup'
import { Button } from './ui'
import type { Target } from '../App'

const WORDS = ['Um', 'encontro', 'de', 'sabores.']

export function Hero({ go }: { go: (t: Target) => void }) {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(900px_520px_at_80%_20%,#f8e8d0,transparent_65%)] bg-peach text-ink">
      <div className="mx-auto grid min-h-[100svh] max-w-[1200px] grid-cols-1 items-center gap-6 px-5 pb-28 pt-28 md:grid-cols-2 md:gap-10 md:pb-32">
        <div className="relative z-10">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white/40 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[2.5px] backdrop-blur"
          >
            <Coffee className="h-3.5 w-3.5" /> Bem-vindo à meetcoffe
          </motion.span>

          <h1 className="text-[2.9rem] font-medium leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.6rem]">
            {WORDS.map((w, i) => (
              <span key={w} className="mr-[0.25em] inline-block overflow-hidden pb-[0.1em] align-bottom">
                <motion.span
                  className={i === 1 ? 'inline-block font-serif italic font-semibold text-amber' : 'inline-block'}
                  initial={{ y: '115%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.8 }}
            className="mt-6 max-w-md text-[15.5px] leading-relaxed text-ink/80"
          >
            Mais do que uma cafeteria, um espaço desenhado para desacelerar, saborear o momento e criar conexões em cada detalhe.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Button variant="dark" onClick={() => go('menu')}>Ver cardápio</Button>
            <Button variant="ghost-dark" onClick={() => go('local')}>Como chegar</Button>
          </motion.div>
        </div>

        <CoffeeCup className="relative z-0 mx-auto w-[min(88vw,460px)] md:w-full md:max-w-[500px]" />
      </div>

      {/* superfície do café: duas ondas em velocidades diferentes */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden sm:h-20">
        <div className="absolute bottom-0 left-0 flex w-[200%] animate-wave-slow opacity-40">
          {[0, 1].map((i) => <Wave key={i} fill="#4d3a32" />)}
        </div>
        <div className="absolute bottom-0 left-0 flex w-[200%] animate-wave">
          {[0, 1].map((i) => <Wave key={i} fill="#1b120b" />)}
        </div>
      </div>
    </section>
  )
}

function Wave({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="block h-16 w-1/2 sm:h-20">
      <path d="M0 40 C 120 8, 240 8, 360 40 S 600 72, 720 40 S 960 8, 1080 40 S 1320 72, 1440 40 L1440 80 L0 80Z" fill={fill} />
    </svg>
  )
}
