import { create } from 'zustand'

// Pedidos que ainda não foram recebidos pela equipe (status SENT).
type AlertsState = {
  pendingOrders: number
  setPendingOrders: (n: number) => void
}

export const useAdminAlerts = create<AlertsState>((set) => ({
  pendingOrders: 0,
  setPendingOrders: (n) => set({ pendingOrders: n }),
}))
