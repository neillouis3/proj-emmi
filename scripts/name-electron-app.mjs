import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'Emmi'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const plist = path.join(
  root,
  'node_modules/electron/dist/Electron.app/Contents/Info.plist',
)

if (!fs.existsSync(plist)) {
  console.warn('[name-electron-app] Electron.app Info.plist not found — skip')
  process.exit(0)
}

let xml = fs.readFileSync(plist, 'utf8')
const setKey = (key, value) => {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`)
  if (re.test(xml)) {
    xml = xml.replace(re, `$1${value}$2`)
    return
  }
  // Insert before CFBundleExecutable if missing
  xml = xml.replace(
    '<key>CFBundleExecutable</key>',
    `<key>${key}</key>\n\t<string>${value}</string>\n\t<key>CFBundleExecutable</key>`,
  )
}

setKey('CFBundleName', APP_NAME)
setKey('CFBundleDisplayName', APP_NAME)
fs.writeFileSync(plist, xml)
console.log(`[name-electron-app] Dock/menu name set to ${APP_NAME}`)
