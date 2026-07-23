type Listener = (event: string, data: unknown) => void

const listeners = new Set<Listener>()

export function subscribeEvents(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitEvent(event: string, data: unknown = {}) {
  for (const listener of listeners) {
    try {
      listener(event, data)
    } catch {
      // ignore subscriber errors
    }
  }
}
