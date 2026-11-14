import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { openTable } from '../lib/api'
import { clearWaitingForTap } from '../lib/tableProof'
import { Stage, Brand, GLASS, BTN_PRIMARY } from '../components/Stage'
import { cn } from '../lib/cn'

export function TableEntry() {
  const { tableCode } = useParams<{ tableCode: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [tableNumber, setTableNumber] = useState<string | null>(null)

  useEffect(() => {
    if (!tableCode) return

    let cancelled = false
    const minDelay = new Promise((r) => setTimeout(r, 1000))
    const open = openTable(tableCode)

    Promise.all([open, minDelay])
      .then(([data]) => {
        if (cancelled) return
        setTableNumber(data.table.number)
        clearWaitingForTap()
        setTimeout(() => {
          if (!cancelled) navigate('/cardapio', { replace: true })
        }, 400)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [tableCode, navigate])

  if (error) {
    return (
      <Stage>
        <Brand className="mb-8" />
        <div className={cn(GLASS, 'w-full max-w-[340px] p-6 flex flex-col items-center')}>
          <h1 className="text-[22px] font-bold tracking-tight mb-2">Mesa não encontrada</h1>
          <p className="text-[13px] text-white/65 leading-relaxed mb-6">{error}</p>
          <button onClick={() => navigate('/cardapio')} className={BTN_PRIMARY}>Ver cardápio</button>
        </div>
      </Stage>
    )
  }

  return (
    <Stage>
      <Brand className="mb-10" />
      {tableNumber ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn(GLASS, 'w-full max-w-[300px] px-6 py-8')}>
          <div className="text-[10px] uppercase tracking-[3px] text-white/50 font-semibold mb-2">Bem-vindo à mesa</div>
          <div className="text-[64px] leading-none font-bold tracking-tight">{tableNumber}</div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-white/25 border-t-white rounded-full animate-spin" />
          <div className="text-[11px] text-white/55 tracking-[3px] uppercase">Abrindo sua mesa…</div>
        </div>
      )}
    </Stage>
  )
}
