import { motion } from 'framer-motion'
import { Clock, Coffee, Cookie, Heart } from 'lucide-react'
import { Eyebrow, Photo, Reveal } from './ui'
import { IMAGES, PILLARS } from '../content'

const ICONS = { coffee: Coffee, cookie: Cookie, heart: Heart, clock: Clock }

export function About() {
  return (
    <section id="sobre" className="bg-roast px-5 py-20 md:py-28">
      <div className="mx-auto grid max-w-[1100px] items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal>
          <Photo src={IMAGES.essence} alt="Preparo de café" className="aspect-[4/3] rounded-[28px] border border-white/10" />
        </Reveal>
        <Reveal delay={0.1}>
          <Eyebrow>Quem somos</Eyebrow>
          <h2 className="text-[2rem] font-medium leading-[1.08] tracking-tight sm:text-5xl">
            Mais que café.
            <br />
            Um lugar para <span className="font-serif italic font-semibold text-crema">se encontrar.</span>
          </h2>
          <p className="mt-6 text-[15.5px] leading-relaxed text-latte/75">
            A meetcoffe nasceu do desejo de criar um refúgio urbano onde o tempo passa mais devagar. Um lugar onde a arquitetura acolhedora e o aroma do café fresco se unem para transformar o seu dia.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-latte/60">
            Aqui, cada xícara é preparada com intenção, cada doce é pensado para acompanhar uma boa conversa, e cada canto foi desenhado para que você se sinta em casa.
          </p>
        </Reveal>
      </div>

      <div className="mx-auto mt-16 grid max-w-[1100px] grid-cols-2 gap-3 md:mt-24 md:grid-cols-4 md:gap-5">
        {PILLARS.map((p, i) => {
          const Icon = ICONS[p.icon]
          return (
            <Reveal key={p.title} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.98 }}
                className="h-full rounded-[24px] border border-white/12 bg-white/[0.05] p-5 backdrop-blur md:p-6"
              >
                <motion.div
                  whileInView={{ rotate: [0, -10, 8, 0] }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }}
                  className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-amber/15 text-amber"
                >
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </motion.div>
                <h3 className="text-[16px] font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-latte/60">{p.text}</p>
              </motion.div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}
