import { Clock, AtSign, MapPin, MessageCircle } from 'lucide-react'
import { Button, Eyebrow, Photo, Reveal } from './ui'
import { CONTACT, IMAGES } from '../content'

export function Location() {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACT.mapQuery)}`
  const embed = `https://www.google.com/maps?q=${encodeURIComponent(CONTACT.mapQuery)}&output=embed`
  return (
    <section id="local" className="bg-bean px-5 py-20 md:py-28">
      <div className="mx-auto max-w-[1100px]">
        <Reveal>
          <Eyebrow>Onde estamos</Eyebrow>
          <h2 className="max-w-xl text-[2rem] font-medium leading-[1.08] tracking-tight sm:text-5xl">
            O seu novo <span className="font-serif italic font-semibold text-crema">lugar favorito.</span>
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Reveal>
            <Photo src={IMAGES.local} alt="O lugar" className="aspect-[4/3] rounded-[28px] border border-white/10 md:aspect-auto md:h-full md:min-h-[320px]" />
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col gap-5">
            <div className="rounded-[24px] border border-white/12 bg-white/[0.05] p-5 backdrop-blur">
              <div className="flex gap-4">
                <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber" strokeWidth={1.6} />
                <div>
                  <h3 className="text-[15px] font-semibold">Endereço</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-latte/70">
                    {CONTACT.addressLines.map((l) => (<span key={l} className="block">{l}</span>))}
                  </p>
                </div>
              </div>
              <div className="my-4 h-px bg-white/10" />
              <div className="flex gap-4">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber" strokeWidth={1.6} />
                <div className="w-full">
                  <h3 className="text-[15px] font-semibold">Horários</h3>
                  <ul className="mt-1 text-[14px] text-latte/70">
                    {CONTACT.hours.map((h) => (
                      <li key={h.days} className="flex justify-between gap-4"><span>{h.days}</span><span className="tabular-nums text-latte">{h.time}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-white/12 bg-mocha">
              <iframe
                title="Mapa"
                src={embed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full border-0 opacity-90 [filter:invert(0.9)_hue-rotate(180deg)_saturate(0.6)]"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="light" href={mapsLink} external><MapPin className="h-4 w-4" /> Como chegar</Button>
              <Button variant="ghost" href={CONTACT.whatsapp.url} external><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
              <Button variant="ghost" href={CONTACT.instagram.url} external><AtSign className="h-4 w-4" /> {CONTACT.instagram.handle}</Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
