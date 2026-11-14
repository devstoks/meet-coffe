import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AdminUser = {
  id: string
  name: string
  email: string
  role: string
}

type AuthState = {
  user: AdminUser | null
  setUser: (user: AdminUser | null) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'upvo_auth' }
  )
)