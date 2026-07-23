import fs from 'node:fs'
import path from 'node:path'
import { connectorsDir, rulesDir } from '../paths.js'

/** Remove legacy YAML policy rules; ensure connector layout exists. */
export function migrateRulesLayout() {
  if (!fs.existsSync(rulesDir())) return

  for (const name of fs.readdirSync(rulesDir())) {
    const file = path.join(rulesDir(), name)
    if (!fs.statSync(file).isFile()) continue
    if (name.endsWith('.yaml') || name.endsWith('.yml')) {
      fs.unlinkSync(file)
    }
  }
}

/** Drop the legacy Browser connector; Safari/Chrome are provided by their packs. */
export function migrateBrowserConnector() {
  const dest = connectorsDir()
  const legacy = path.join(dest, 'browser.yaml')
  if (fs.existsSync(legacy)) {
    fs.unlinkSync(legacy)
  }
  const legacyYml = path.join(dest, 'browser.yml')
  if (fs.existsSync(legacyYml)) {
    fs.unlinkSync(legacyYml)
  }
  // User-copied browser rules folder is unused after split.
  const legacyRules = path.join(rulesDir(), 'browser')
  if (fs.existsSync(legacyRules)) {
    fs.rmSync(legacyRules, { recursive: true, force: true })
  }
}
