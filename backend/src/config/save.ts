import fs from 'node:fs'
import { stringify as stringifyYaml } from 'yaml'
import { configPath, ensureEmmiDirs } from '../paths.js'
import type { EmmiConfig } from '../types.js'
import { loadConfig } from './load.js'

/** Persist path variables (and optional flags) to config.yaml. */
export function saveConfig(partial: {
  variables?: Record<string, string>
}): EmmiConfig {
  ensureEmmiDirs()
  const current = loadConfig()
  const variables = partial.variables
    ? { ...partial.variables }
    : { ...current.variables }

  const tildeVars: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables)) {
    tildeVars[key] = value
  }

  const file = configPath()
  const tmp = `${file}.tmp`
  fs.writeFileSync(
    tmp,
    stringifyYaml({
      variables: Object.fromEntries(
        Object.entries(tildeVars).map(([k, v]) => {
          // Prefer ~ form when under home for readability
          const home = process.env.HOME ?? ''
          if (home && (v === home || v.startsWith(home + '/'))) {
            return [k, v === home ? '~' : `~${v.slice(home.length)}`]
          }
          return [k, v]
        }),
      ),
    }),
  )
  fs.renameSync(tmp, file)
  return loadConfig()
}
