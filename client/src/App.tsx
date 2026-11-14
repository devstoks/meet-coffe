import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Cardapio } from './pages/Cardapio'
import { TableEntry } from './pages/TableEntry'
import { AdminLogin } from './pages/AdminLogin'
import { AdminLayout } from './components/AdminLayout'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminOrders } from './pages/AdminOrders'
import { AdminProducts } from './pages/AdminProducts'
import { AdminProductDetail } from './pages/AdminProductDetail'
import { AdminSettings } from './pages/AdminSettings'
import { AdminPayments } from './pages/AdminPayments'
import { ThankYou } from './pages/ThankYou'
import { AdminAnalytics } from './pages/AdminAnalytics'
import { AdminThreeD } from './features/ar3d/AdminThreeD' // ar3d
import { useAuth } from './store/auth'

function RequireAuth({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/admin/login" replace />
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/admin/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/mesa/:tableCode" element={<TableEntry />} />
        <Route path="/cardapio" element={<Cardapio />} />
        <Route path="/" element={<Cardapio />} />
        <Route path="/obrigado" element={<ThankYou />} />

        <Route path="/admin/login" element={<AdminLogin />} />

        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="pedidos" element={<AdminOrders />} />
          <Route path="pagamentos" element={<AdminPayments />} />
          <Route path="produtos" element={<RequireAuth adminOnly><AdminProducts /></RequireAuth>} />
          <Route path="produtos/novo" element={<RequireAuth adminOnly><AdminProductDetail /></RequireAuth>} />
          <Route path="produtos/:productId" element={<RequireAuth adminOnly><AdminProductDetail /></RequireAuth>} />
          <Route path="analytics" element={<RequireAuth adminOnly><AdminAnalytics /></RequireAuth>} />
          <Route path="modelos-3d" element={<RequireAuth adminOnly><AdminThreeD /></RequireAuth>} /> {/* ar3d */}
          <Route path="configuracoes" element={<RequireAuth adminOnly><AdminSettings /></RequireAuth>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}