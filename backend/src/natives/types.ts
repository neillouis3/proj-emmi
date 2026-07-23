import type { ToolContext, ToolResult } from '../types.js'

/** Declared capability — custom natives only get what they ask for (after grant). */
export type NativePermission = 'read' | 'write' | 'execute' | 'network'

export type NativeTrust = 'builtin' | 'custom'

export type NativeGrantStatus = 'ask' | 'granted' | 'denied'

/**
 * Plugin-shaped native — same interface for built-ins and user-authored code.
 * Aligns with MCP tool schema: name + typed params + run().
 */
export type NativeManifest = {
  name: string
  description?: string
  params: Record<string, string>
  returns?: string
  permission: NativePermission
  /** Optional path/host scopes, e.g. "~/Desktop", "api.spotify.com" */
  scopes?: string[]
  trust: NativeTrust
  /** Absolute path for custom natives */
  source?: string
}

/** Capability object — not raw Node. Custom code can only call what this exposes. */
export type NativeCtx = ToolContext & {
  currentFile?: string
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, data: string) => Promise<string>
  listDir: (dirPath: string) => Promise<string[]>
  log: (message: string) => void
}

export type NativeResult = ToolResult & {
  output?: unknown
}

export type Native = NativeManifest & {
  run: (
    params: Record<string, unknown>,
    ctx: NativeCtx,
  ) => Promise<NativeResult>
}

export type NativeGrant = {
  status: NativeGrantStatus
  permission: NativePermission
  scopes: string[]
  grantedAt?: string
}

export type NativeListItem = NativeManifest & {
  grant?: NativeGrant
}
