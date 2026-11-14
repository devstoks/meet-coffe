import { Eyebrow, Photo, Reveal } from './ui'
import { IMAGES } from '../content'
import { cn } from '../lib/cn'

/** Mobile: carrossel horizontal com snap. Desktop: grade assimétrica. */
export function Gallery() {
  const spans = ['md:col-span-7 md:row-span-2', 'md:col-span-5', 'md:col-span-5', 'md:col-span-4', 'md:col-span-4']
  return (
    <section id="ambiente" className="bg-roast pb-20 pt-4 md:pb-28">
      <div className="mx-auto max-w-[1100px] px-5">
        <Reveal>
          <Eyebrow>Ambiente</Eyebrow>
          <h2 className="max-w-xl text-[2rem] font-medium leading-[1.08] tracking-tight sm:text-5xl">
            Um canto para <span className="font-serif italic font-semibold text-crema">ficar um pouco mais.</span>
          </h2>
        </Reveal>
      </div>

      <div className="no-scrollbar mt-9 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 md:mx-auto md:grid md:max-w-[1100px] md:auto-rows-[220px] md:grid-cols-12 md:gap-4 md:overflow-visible">
        {IMAGES.gallery.map((g, i) => (
          <Photo
            key={g.src}
            src={g.src}
            alt={g.alt}
            className={cn('h-[360px] w-[78vw] max-w-[340px] flex-shrink-0 snap-center rounded-[26px] border border-white/10 md:h-auto md:w-auto md:max-w-none', spans[i])}
          />
        ))}
      </div>
    </section>
  )
}
