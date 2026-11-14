import { motion, useScroll, useTransform } from 'framer-motion'

/** Grão de café em SVG. */
export function Bean({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" className={className} aria-hidden>
      <ellipse cx="20" cy="28" rx="17" ry="25" fill="#6b3d24" />
      <ellipse cx="14" cy="18" rx="5" ry="9" fill="#8a5232" opacity=".55" />
      <path d="M20 4 C 9 20, 31 36, 20 52" stroke="#25120a" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const BEANS = [
  { left: '4%', top: '12%', size: 26, rot: 20, speed: 0.35, dur: 6.5 },
  { left: '46%', top: '4%', size: 20, rot: -35, speed: 0.6, dur: 7.5 },
  { left: '90%', top: '16%', size: 30, rot: 60, speed: 0.25, dur: 6 },
  { left: '2%', top: '70%', size: 32, rot: -10, speed: 0.5, dur: 8 },
  { left: '88%', top: '74%', size: 22, rot: 140, speed: 0.7, dur: 7 },
  { left: '52%', top: '92%', size: 18, rot: 80, speed: 0.4, dur: 9 },
]

function FloatingBean({ b }: { b: (typeof BEANS)[number] }) {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 700], [0, -b.speed * 160])
  return (
    <motion.div className="absolute" style={{ left: b.left, top: b.top, y }}>
      <motion.div
        animate={{ y: [0, -14, 0], rotate: [b.rot, b.rot + 14, b.rot] }}
        transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Bean size={b.size} />
      </motion.div>
    </motion.div>
  )
}

/** Xícara vista de cima com latte art, ondulações e vapor — tudo animado em SVG. */
export function CoffeeCup({ className }: { className?: string }) {
  const { scrollY } = useScroll()
  const rotate = useTransform(scrollY, [0, 800], [0, 40])
  const y = useTransform(scrollY, [0, 800], [0, 60])

  return (
    <div className={className}>
      <div className="relative">
        {BEANS.map((b, i) => (
          <FloatingBean key={i} b={b} />
        ))}
        <motion.div style={{ y }}>
          <motion.svg
            viewBox="0 0 440 400"
            className="relative block h-auto w-full"
            role="img"
            aria-label="Xícara de café com latte art"
            initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
          >
            <defs>
              <radialGradient id="cc-coffee" cx="50%" cy="45%" r="58%">
                <stop offset="0" stopColor="#a56b3e" />
                <stop offset=".6" stopColor="#6d3f22" />
                <stop offset="1" stopColor="#3a1e10" />
              </radialGradient>
              <radialGradient id="cc-cup" cx="38%" cy="32%" r="75%">
                <stop offset="0" stopColor="#fffaf0" />
                <stop offset="1" stopColor="#e6d4b4" />
              </radialGradient>
              <filter id="cc-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
              <filter id="cc-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6" /></filter>
              <filter id="cc-haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
              <clipPath id="cc-clip"><circle cx="210" cy="200" r="104" /></clipPath>
            </defs>

            <ellipse cx="290" cy="285" rx="150" ry="118" fill="#2a160a" opacity=".38" filter="url(#cc-shadow)" transform="rotate(28 290 285)" />

            <circle cx="210" cy="200" r="178" fill="#f6ecd8" />
            <circle cx="210" cy="200" r="178" fill="none" stroke="#dcc7a4" strokeWidth="3" />
            <circle cx="210" cy="200" r="152" fill="#eddfc4" />

            <path d="M334 160 C 412 146, 420 254, 334 242" fill="none" stroke="#cdb58d" strokeWidth="32" strokeLinecap="round" />
            <path d="M334 160 C 412 146, 420 254, 334 242" fill="none" stroke="#fbf3e2" strokeWidth="25" strokeLinecap="round" />

            <circle cx="210" cy="200" r="134" fill="url(#cc-cup)" />
            <circle cx="210" cy="200" r="134" fill="none" stroke="#d6c2a0" strokeWidth="2" />
            <circle cx="210" cy="200" r="118" fill="#efe1c8" />
            <circle cx="210" cy="200" r="104" fill="url(#cc-coffee)" />

            <g clipPath="url(#cc-clip)">
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx="210"
                  cy="200"
                  fill="none"
                  stroke="#e6c89c"
                  strokeWidth="2"
                  initial={{ r: 8, opacity: 0 }}
                  animate={{ r: [8, 106], opacity: [0.55, 0] }}
                  transition={{ duration: 4.2, repeat: Infinity, delay: i * 1.4, ease: 'easeOut' }}
                />
              ))}
              <motion.g
                style={{ rotate }}
                animate={{ scale: [1, 1.035, 1] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <g filter="url(#cc-soft)">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <ellipse key={i} cx="210" cy={252 - i * 26} rx={64 - i * 9} ry="15" fill="#f3e0c2" opacity=".94" />
                  ))}
                  <path d="M210 266 L210 134" stroke="#4a2814" strokeWidth="3.4" strokeLinecap="round" opacity=".55" />
                </g>
              </motion.g>
              {[
                [150, 150, 4], [160, 134, 2.6], [262, 146, 3.4], [276, 188, 2.2], [146, 238, 3], [268, 250, 3.6], [232, 118, 2.4],
              ].map(([cx, cy, r], i) => (
                <circle key={i} cx={cx} cy={cy} r={r} fill="#c48d5a" opacity=".7" />
              ))}
            </g>

            {[0, 1, 2].map((i) => (
              <motion.circle
                key={`haze-${i}`}
                cx={170 + i * 44}
                cy={210 - i * 18}
                fill="#fff6e6"
                filter="url(#cc-haze)"
                initial={{ r: 14, opacity: 0 }}
                animate={{ r: [14, 40], opacity: [0, 0.28, 0], cy: [210 - i * 18, 120 - i * 18] }}
                transition={{ duration: 5.5, repeat: Infinity, delay: i * 1.7, ease: 'easeOut' }}
              />
            ))}
          </motion.svg>
        </motion.div>
      </div>
    </div>
  )
}
