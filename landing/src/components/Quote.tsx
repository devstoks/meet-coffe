import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { QUOTE } from '../content'

function Word({ w, i, n, progress }: { w: string; i: number; n: number; progress: MotionValue<number> }) {
  const start = i / n
  const opacity = useTransform(progress, [start, Math.min(start + 1.6 / n, 1)], [0.18, 1])
  return <motion.span style={{ opacity }} className="mr-[0.28em] inline-block">{w}</motion.span>
}

/** Frase da marca que "acende" palavra por palavra conforme a rolagem. */
export function Quote() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.55'] })
  const words = QUOTE.split(' ')
  return (
    <section ref={ref} className="bg-bean px-5 py-24 md:py-40">
      <p className="mx-auto max-w-[900px] text-center text-[1.9rem] font-medium leading-[1.25] tracking-tight sm:text-5xl md:text-6xl">
        “{words.map((w, i) => <Word key={i} w={w} i={i} n={words.length} progress={scrollYProgress} />)}”
      </p>
    </section>
  )
}
