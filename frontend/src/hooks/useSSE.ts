import { useEffect, useRef, useState } from 'react'
import type { OrderEvent } from '../types'

export function useSSE(orderId: string | null) {
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [finalStatus, setFinalStatus] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!orderId) {
      setEvents([])
      setFinalStatus(null)
      return
    }

    const source = new EventSource(`/api/orders/${orderId}/events`)
    sourceRef.current = source

    source.addEventListener('order_update', (e) => {
      const event: OrderEvent = JSON.parse(e.data)
      setEvents((prev) => [...prev, event])
    })

    source.addEventListener('order_complete', (e) => {
      const data = JSON.parse(e.data)
      setFinalStatus(data.final_status)
      source.close()
    })

    source.addEventListener('timeout', () => {
      source.close()
    })

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [orderId])

  const reset = () => {
    sourceRef.current?.close()
    setEvents([])
    setFinalStatus(null)
  }

  return { events, finalStatus, reset }
}
