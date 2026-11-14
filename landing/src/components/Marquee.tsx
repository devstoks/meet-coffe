import { Bean } from './CoffeeCup'
import { MARQUEE } from '../content'

export function Marquee() {
  const row = [...MARQUEE, ...MARQUEE]
  return (
    <div className="overflow-hidden border-y border-white/10 bg-mocha py-4" aria-hidden>
      <div className="flex w-max animate-marquee items-center gap-8 whitespace-nowrap">
        {[0, 1].map((k) => (
          <div key={k} className="flex items-center gap-8">
            {row.map((t, i) => (
              <span key={`${k}-${i}`} className="flex items-center gap-8 text-[15px] font-medium tracking-wide text-crema">
                {t}
                <Bean size={11} className="rotate-45" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
