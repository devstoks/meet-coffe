import { BRAND, CONTACT } from '../content'
import type { Target } from '../App'

export function Footer({ go }: { go: (t: Target) => void }) {
  return (
    <footer className="border-t border-white/10 bg-espresso px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-12">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-10 md:flex-row md:justify-between">
        <div>
          <div className="text-[22px] font-bold tracking-tight">{BRAND.name}</div>
          <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-latte/55">{BRAND.tagline}. Um refúgio urbano dedicado ao café e às boas conversas.</p>
        </div>
        <div className="flex gap-14 text-[13.5px]">
          <ul className="flex flex-col gap-3 text-latte/65">
            <li className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-latte/40">Navegue</li>
            <li><button onClick={() => go('menu')} className="hover:text-latte">Cardápio</button></li>
            <li><button onClick={() => go('digital')} className="hover:text-latte">Cardápio digital</button></li>
            <li><button onClick={() => go('local')} className="hover:text-latte">Onde estamos</button></li>
          </ul>
          <ul className="flex flex-col gap-3 text-latte/65">
            <li className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-latte/40">Conecte-se</li>
            <li><a href={CONTACT.instagram.url} target="_blank" rel="noopener noreferrer" className="hover:text-latte">Instagram</a></li>
            <li><a href={CONTACT.whatsapp.url} target="_blank" rel="noopener noreferrer" className="hover:text-latte">WhatsApp</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1100px] flex-col gap-2 border-t border-white/10 pt-6 text-[12px] text-latte/40 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.</p>
        <p>Feito com cuidado e café.</p>
      </div>
    </footer>
  )
}
