import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ChevronLeft,
  Link2,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import {
  fetchPaymentStatus,
  getMpConnectUrl,
  fetchAvailableTerminals,
  saveTerminal,
  cancelPendingPayments,
  type PaymentStatus,
  type AvailableTerminal,
} from '../lib/admin'

export function AdminSettings() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [terminals, setTerminals] = useState<AvailableTerminal[]>([])
  const [selectedTerminal, setSelectedTerminal] = useState('')
  const [savingTerminal, setSavingTerminal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Reset
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  async function loadStatus() {
    try {
      const data = await fetchPaymentStatus()
      setStatus(data)
      if (data.connected) {
        loadTerminals()
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadTerminals() {
    try {
      const data = await fetchAvailableTerminals()
      setTerminals(data.terminals)
    } catch (err: any) {
      showToast(err.message)
    }
  }

  async function handleConnect() {
    try {
      setConnecting(true)
      const { url } = await getMpConnectUrl()
      const popup = window.open(url, 'mp_oauth', 'width=600,height=700')
      const interval = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(interval)
          setConnecting(false)
          await loadStatus()
        }
      }, 1000)
    } catch (err: any) {
      showToast(err.message)
      setConnecting(false)
    }
  }

  async function handleCancelPending() {
    try {
      const r = await cancelPendingPayments()
      const ok = r.resultados.filter((x) => x.ok).length
      showToast(r.encontradas === 0 ? 'Nenhuma cobrança pendente no sistema.' : `${ok} de ${r.encontradas} cobrança(s) cancelada(s).`)
    } catch (err: any) {
      showToast(err.message)
    }
  }

  async function handleSaveTerminal() {
    if (!selectedTerminal) return
    try {
      setSavingTerminal(true)
      const term = terminals.find((t) => t.id === selectedTerminal)
      const out = await saveTerminal(selectedTerminal, term?.name || 'Terminal Principal')
      showToast(out.pdv && !out.pdv.ok
        ? `Terminal salvo, mas não foi possível ativar o modo PDV (${out.pdv.detail || 'erro'}). Ative no aparelho ou veja o diagnóstico.`
        : 'Terminal configurado e em modo PDV!')
      await loadStatus()
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setSavingTerminal(false)
    }
  }

  async function handleReset() {
    if (resetConfirmText !== 'RESETAR') return
    setResetting(true)
    try {
      const res = await fetch('/api/admin/reset-tables', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESETAR' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Falha no reset')
      }
      const data = await res.json()
      const d = data.deleted || {}
      showToast(
        `Reset concluído: ${d.sessions ?? 0} sessões, ${d.orders ?? 0} pedidos apagados.`
      )
      setResetModalOpen(false)
      setResetConfirmText('')
    } catch (err: any) {
      showToast(err.message)
    } finally {
      setResetting(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center text-coffee">Carregando...</div>

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-warm-white border-b border-sand px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/admin/pedidos')} className="w-9 h-9 rounded-full border border-sand bg-cream text-moss grid place-items-center hover:bg-moss hover:text-cream transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="font-serif text-lg text-moss leading-tight">Configurações</div>
          <div className="text-[10px] uppercase tracking-wider text-olive font-semibold">Integração de Pagamento</div>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-xl mx-auto w-full flex flex-col gap-6">
        <section className="bg-warm-white border border-sand rounded-xl p-5">
          <h2 className="font-serif text-lg text-moss mb-2">Mercado Pago</h2>
          <p className="text-sm text-coffee mb-4">Conecte a conta do Mercado Pago da cafeteria para receber pagamentos automáticos via Point.</p>

          {!status?.connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full py-3 rounded-full bg-[#009EE3] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#008CC9] transition flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {connecting ? 'Aguardando conexão...' : 'Conectar Mercado Pago'}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Conta conectada (ID: {status.mpUserId})</span>
            </div>
          )}
          {status?.connected && (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="mt-3 w-full py-2.5 rounded-full border border-[#009EE3] text-[#009EE3] text-[11px] font-bold uppercase tracking-widest hover:bg-[#009EE3] hover:text-white transition flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {connecting ? 'Aguardando conexão...' : 'Reconectar / trocar conta'}
            </button>
          )}
        </section>

        {status?.connected && (
          <section className="bg-warm-white border border-sand rounded-xl p-5">
            <h2 className="font-serif text-lg text-moss mb-2">Terminal Point</h2>
            <p className="text-sm text-coffee mb-4">Selecione o terminal Point Smart que será usado para enviar as cobranças.</p>

            <div className="flex flex-col gap-3 mb-4">
              {terminals.map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-3 border border-sand rounded-lg cursor-pointer hover:bg-cream">
                  <input
                    type="radio"
                    name="terminal"
                    value={t.id}
                    checked={selectedTerminal === t.id}
                    onChange={(e) => setSelectedTerminal(e.target.value)}
                    className="w-4 h-4 accent-moss"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-moss">{t.name}</div>
                    <div className="text-[11px] text-olive">ID: {t.id} | Modo: {t.operating_mode}</div>
                  </div>
                </label>
              ))}
              {terminals.length === 0 && (
                <div className="text-sm text-coffee italic">Nenhum terminal encontrado.</div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={loadTerminals} className="w-10 h-10 rounded-full border border-sand text-moss grid place-items-center hover:bg-moss hover:text-cream transition">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleSaveTerminal}
                disabled={!selectedTerminal || savingTerminal}
                className="flex-1 py-3 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest hover:bg-olive transition disabled:opacity-50"
              >
                {savingTerminal ? 'Salvando...' : 'Salvar Terminal'}
              </button>
            </div>

            <button
              onClick={handleCancelPending}
              className="mt-3 w-full py-2.5 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-cream transition"
            >
              Cancelar cobranças pendentes
            </button>

            {status.terminals.length > 0 && (
              <div className="mt-4 pt-4 border-t border-sand">
                <div className="text-[10px] uppercase tracking-widest text-olive font-bold mb-2">Terminal Ativo</div>
                <div className="text-sm text-moss font-semibold">{status.terminals[0].nickname} ({status.terminals[0].id})</div>
              </div>
            )}
          </section>
        )}

        {/* ZONA DE PERIGO */}
        <section className="bg-warm-white border border-[#ff9b8f]/60/40 rounded-xl p-5">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-[#ffb3a8] flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif text-lg text-[#ffb3a8] leading-tight">Zona de Perigo</h2>
              <p className="text-[11px] text-coffee mt-0.5">Ações irreversíveis</p>
            </div>
          </div>
          <p className="text-sm text-coffee mb-4 leading-relaxed">
            O botão abaixo apaga <strong>todos os pedidos, comandas, sessões e pagamentos</strong> de todas as mesas.
            As mesas voltam ao status <code className="text-[11px] bg-cream px-1 rounded">AVAILABLE</code>. Use apenas em ambiente de teste.
          </p>
          <button
            onClick={() => { setResetModalOpen(true); setResetConfirmText('') }}
            className="w-full py-3 rounded-full border border-[#ff9b8f]/60 text-[#ffb3a8] text-[11px] font-bold uppercase tracking-widest hover:bg-[#B66B65] hover:text-cream transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Resetar Todas as Mesas
          </button>
        </section>
      </main>

      {/* MODAL: Confirmar reset */}
      <Dialog.Root open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-[120]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-md bg-cream rounded-2xl z-[121] p-6 shadow-2xl" aria-describedby={undefined}>
            <div className="w-14 h-14 rounded-full bg-[#ff9b8f]/15 text-[#ffb3a8] grid place-items-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <Dialog.Title className="font-serif text-xl text-moss text-center mb-2">
              Resetar Todas as Mesas?
            </Dialog.Title>
            <p className="text-[12.5px] text-coffee text-center leading-relaxed mb-4">
              Você vai apagar <strong>permanentemente</strong>:
            </p>
            <ul className="text-[12px] text-coffee bg-warm-white border border-sand rounded-lg p-3 mb-4 flex flex-col gap-1 list-disc list-inside">
              <li>Todas as sessões de mesa (abertas e fechadas)</li>
              <li>Todas as comandas e pedidos</li>
              <li>Todos os registros de pagamento</li>
              <li>Credenciais de acesso dos clientes</li>
            </ul>
            <p className="text-[12px] text-coffee text-center leading-relaxed mb-3">
              Para confirmar, digite <strong>RESETAR</strong> abaixo:
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
              placeholder="RESETAR"
              className="w-full mb-4 px-4 py-3 rounded-lg border border-sand bg-warm-white text-sm text-center text-moss outline-none focus:border-[#ff9b8f]/60 transition tracking-widest font-bold"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={handleReset}
                disabled={resetConfirmText !== 'RESETAR' || resetting}
                className="w-full py-3.5 rounded-full bg-[#ff9b8f] text-[#2a1a0e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#ffb3a8] transition disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Resetando…
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Confirmar Reset
                  </>
                )}
              </button>
              <button
                onClick={() => { setResetModalOpen(false); setResetConfirmText('') }}
                disabled={resetting}
                className="w-full py-3 rounded-full border border-sand text-moss text-[11px] font-bold uppercase tracking-widest hover:bg-sand/50 transition disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[130] bg-moss text-cream text-xs px-5 py-3 rounded-full shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  )
}