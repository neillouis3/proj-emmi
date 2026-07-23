import {
  ensureEmmiDirs,
  migrateLegacyEmmiHome,
} from './paths.js'
import { migrateBrowserConnector, migrateRulesLayout } from './rules/migrate.js'
import { syncPacks } from './packs/index.js'

/** Ensure app data dirs exist and install/refresh packs (core auto-installs). */
export function seedIfNeeded() {
  migrateLegacyEmmiHome()
  ensureEmmiDirs()
  migrateRulesLayout()
  // Drop the legacy Browser connector before packs reconcile Safari/Chrome.
  migrateBrowserConnector()
  syncPacks()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedIfNeeded()
  console.log('Seeded Emmi app data')
}
