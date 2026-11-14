import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { About } from './components/About'
import { Quote } from './components/Quote'
import { Digital } from './components/Digital'
import { Gallery } from './components/Gallery'
import { Location } from './components/Location'
import { Footer } from './components/Footer'
import { MenuPage } from './components/MenuPage'
import { scrollToId } from './lib/scroll'

export type View = 'home' | 'menu'
export type Target = 'top' | 'sobre' | 'digital' | 'ambiente' | 'local' | 'menu'

const readView = (): View => (window.location.hash === '#/cardapio' ? 'menu' : 'home')

export default function App() {
  const [view, setView] = useState<View>(readView)
  const pending = useRef<string | null>(null)

  useEffect(() => {
    const on = () => setView(readView())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const go = useCallback((t: Target) => {
    if (t === 'menu') {
      window.location.hash = '#/cardapio'
      return
    }
    if (readView() === 'menu') {
      pending.current = t
      window.location.hash = '#/'
      return
    }
    scrollToId(t)
  }, [])

  // ao trocar de aba: volta ao topo ou rola até a seção pedida
  useEffect(() => {
    const id = pending.current
    pending.current = null
    if (view === 'home' && id && id !== 'top') {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToId(id)))
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [view])

  return (
    <>
      <Header view={view} go={go} />
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          {view === 'home' ? (
            <main>
              <Hero go={go} />
              <Marquee />
              <About />
              <Quote />
              <Digital go={go} />
              <Gallery />
              <Location />
            </main>
          ) : (
            <MenuPage />
          )}
          <Footer go={go} />
        </motion.div>
      </AnimatePresence>
    </>
  )
}
