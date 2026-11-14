import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { QrScanner } from './QrScanner'
import { openTable } from '../lib/api'
import { tableCodeFromScan } from '../lib/tableProof'
import { rotateDeviceId } from '../lib/identity'

/**
 * "Abrir nova comanda": abre o leitor (câmera QR + NFC + código digitado). A leitura serve só para ENTRAR no cardápio:
 * abre/reabre a mesa e vai para o cardápio (depois disso, pedir e encerrar não pedem nova leitura).
 * No iPhone/sem Web NFC, encostar na tag abre /mesa/<código> e o fluxo segue sozinho (ver TableEntry).
 */
export function NewComandaButton({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanKey, setScanKey] = useState(0)

  const handleResult = useCallback(async (text: string) => {
    const fail = (msg: string) => { setError(msg); setScanKey((k) => k + 1) } // remonta o leitor para a câmera voltar
    const code = tableCodeFromScan(text)
    if (!code) { fail('Código não reconhecido. Leia o QR Code ou a tag NFC da mesa.'); return }
    try {
      await openTable(code)
    } catch {
      fail('Mesa não encontrada. Leia o QR Code ou a tag NFC da sua mesa.')
      return
    }
    rotateDeviceId() // começa uma comanda nova: este aparelho deixa de ser a pessoa que já encerrou a anterior
    window.location.assign('/cardapio')
  }, [])

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true) }} className={className}>
        {children}
      </button>
      {open && createPortal(
        <QrScanner
          key={scanKey}
          open
          onClose={() => { setOpen(false); setError(null) }}
          onResult={handleResult}
          errorMessage={error}
        />,
        document.body,
      )}
    </>
  )
}
