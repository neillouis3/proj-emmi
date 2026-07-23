import type { ToolDef } from '../types.js'

const STUBS: { id: string; description: string }[] = [
  { id: 'fs.sort', description: 'Sort folder by type (not implemented)' },
  { id: 'fs.open', description: 'Open path in app (not implemented)' },
]

export function registerStubTools(register: (def: ToolDef) => void) {
  for (const stub of STUBS) {
    register({
      id: stub.id,
      description: stub.description,
      params: {},
      async run() {
        return { ok: false, summary: `${stub.id} is not implemented yet` }
      },
    })
  }
}
