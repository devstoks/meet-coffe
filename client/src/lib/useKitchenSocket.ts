import { useEffect, useRef, useState } from 'react'
import { getSocket } from './socket'

const KITCHEN_EVENTS = [
  'new_order',
  'order_status_changed',
  'table_opened',
  'table_closed',
  'closure_requested',
  'closure_updated',
  'payment_approved',
  'payment_expired',
  'payment_partial',
  'tables_reset',
] as const

export type KitchenEventName = (typeof KITCHEN_EVENTS)[number]
export type KitchenHandlers = Partial<Record<KitchenEventName, (data: any) => void>>

/**
 * Conecta a equipe à sala da cozinha do próprio negócio.
 * - Entra na sala a cada `connect` (o servidor perde a sala quando o socket reconecta).
 * - `onResync` roda após cada entrada confirmada, para recuperar o que foi perdido offline.
 * - `connected` só é true quando o servidor confirmou a entrada (sessão admin válida).
 */
export function useKitchenSocket(handlers: KitchenHandlers, onResync?: () => void) {
  const [connected, setConnected] = useState(false)
  const handlersRef = useRef(handlers)
  const resyncRef = useRef(onResync)
  handlersRef.current = handlers
  resyncRef.current = onResync

  useEffect(() => {
    const socket = getSocket()

    function join() {
      socket.emit('join:kitchen', (res?: { ok: boolean }) => {
        const ok = !!res?.ok
        setConnected(ok)
        if (ok) resyncRef.current?.()
      })
    }
    function onDisconnect() { setConnected(false) }

    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('disconnect', onDisconnect)

    const listeners = KITCHEN_EVENTS.map((name) => {
      const fn = (data: any) => handlersRef.current[name]?.(data)
      socket.on(name, fn)
      return [name, fn] as const
    })

    return () => {
      socket.off('connect', join)
      socket.off('disconnect', onDisconnect)
      listeners.forEach(([name, fn]) => socket.off(name, fn))
    }
  }, [])

  return { connected }
}
