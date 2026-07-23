import type { ToolDef } from '../types.js'
import { registerCoreTools } from './core.js'
import { registerFsTools } from './fs.js'
import { registerStubTools } from './stubs.js'

const tools = new Map<string, ToolDef>()

export function registerTool(def: ToolDef) {
  tools.set(def.id, def)
}

export function getTool(id: string) {
  return tools.get(id)
}

export function listTools() {
  return [...tools.values()].map(({ id, description, params }) => ({
    id,
    description,
    params,
  }))
}

export function initTools() {
  tools.clear()
  registerCoreTools(registerTool)
  registerFsTools(registerTool)
  registerStubTools(registerTool)
}
