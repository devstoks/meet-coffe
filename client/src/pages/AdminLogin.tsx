import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin, fetchAdminMe } from '../lib/admin'
import { useAuth } from '../store/auth'

export function AdminLogin() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [email, setEmail] = useState('admin@meetcoffe.com')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminMe()
      .then((data) => {
        setUser(data.user)
        navigate(data.user.role === 'ADMIN' ? '/admin/dashboard' : '/admin/pedidos', { replace: true })
      })
      .catch(() => {})
  }, [navigate, setUser])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await adminLogin(email, password)
      setUser(data.user)
      navigate(data.user.role === 'ADMIN' ? '/admin/dashboard' : '/admin/pedidos', { replace: true })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-moss flex items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-warm-white rounded-2xl p-7 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="font-serif text-2xl text-moss">meetcoffe</div>
          <div className="text-[10px] uppercase tracking-[3px] text-olive font-semibold mt-1">Painel da equipe</div>
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-olive font-bold mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-4 py-3 rounded-lg border border-sand bg-cream text-sm text-moss outline-none focus:border-moss transition"
          autoComplete="email"
          required
        />

        <label className="block text-[11px] uppercase tracking-wider text-olive font-bold mb-1.5">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 px-4 py-3 rounded-lg border border-sand bg-cream text-sm text-moss outline-none focus:border-moss transition"
          autoComplete="current-password"
          required
        />

        {error && (
          <div className="mb-4 text-[12px] text-[#B66B65] bg-[#B66B65]/10 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-full bg-moss text-cream text-[11px] font-bold uppercase tracking-widest hover:bg-olive transition disabled:opacity-50"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <div className="mt-6 pt-5 border-t border-sand text-[11px] text-coffee/80 leading-relaxed">
          <div className="font-bold text-moss mb-1">Credenciais de teste</div>
          <div>Admin: admin@meetcoffe.com · admin123</div>
          <div>Funcionário: fun@meetcoffe.com · fun123</div>
        </div>
      </form>
    </div>
  )
}