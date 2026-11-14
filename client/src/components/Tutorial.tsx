import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpDown, ListPlus, Send } from 'lucide-react'
import { cn } from '../lib/cn'
import { Stage, GLASS, BTN_PRIMARY, IconBadge } from './Stage'

export const TUTORIAL_STORAGE_KEY = 'meetcoffe_tutorial_seen_v1'

type Slide = {
  icon: React.ReactNode
  title: string
  text: string
}

const slides: Slide[] = [
  {
    icon: <ArrowUpDown className="w-7 h-7" strokeWidth={1.5} />,
    title: 'Explore o cardápio',
    text: 'Deslize para cima ou para baixo para trocar de produto. Toque nas laterais da foto para ver mais imagens e vídeos.',
  },
  {
    icon: <ListPlus className="w-7 h-7" strokeWidth={1.5} />,
    title: 'Monte sua lista',
    text: 'Toque em "Adicionar à lista" para incluir um item. A cada inclusão, perguntamos se você quer continuar escolhendo ou finalizar.',
  },
  {
    icon: <Send className="w-7 h-7" strokeWidth={1.5} />,
    title: 'Envie para a cozinha',
    text: 'Revise sua lista, confirme o pedido e acompanhe o status. Novos pedidos podem ser feitos a qualquer momento na mesma mesa.',
  },
]

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const isLast = index === slides.length - 1

  function finish() {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
    onClose()
  }

  function next() {
    if (isLast) finish()
    else setIndex(index + 1)
  }

  const slide = slides[index]

  return (
    <div role="dialog" aria-modal="true">
      <Stage fixed>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          className={cn(GLASS, 'w-full max-w-[360px] px-6 pt-8 pb-6 flex flex-col')}
        >
          <div className="text-[10px] uppercase tracking-[3px] text-white/45 font-semibold mb-5">
            Como funciona · {index + 1}/{slides.length}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center min-h-[210px]"
            >
              <div className="mb-5">
                <IconBadge>{slide.icon}</IconBadge>
              </div>
              <h2 className="text-[22px] font-bold tracking-tight mb-2.5 leading-tight">{slide.title}</h2>
              <p className="text-[13.5px] text-white/65 leading-relaxed">{slide.text}</p>
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-center gap-2 mb-6">
            {slides.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === index ? 'w-6 bg-[#F5F1E8]' : 'w-1.5 bg-white/25'
                )}
              />
            ))}
          </div>

          <button onClick={next} className={BTN_PRIMARY}>
            {isLast ? 'Vamos começar' : 'Próximo'}
          </button>
          <button
            onClick={finish}
            className="mt-3 w-full h-9 text-center text-[12.5px] text-white/50 hover:text-white/80 transition"
          >
            Pular tutorial
          </button>
        </motion.div>
      </Stage>
    </div>
  )
}
