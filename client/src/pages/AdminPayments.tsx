import { Navigate } from 'react-router-dom'

// A página de mesas foi incorporada à tela de Pedidos (barra lateral). Mantido só para links antigos.
export function AdminPayments() {
  return <Navigate to="/admin/pedidos" replace />
}
