/**
 * @param {string} message
 * @param {string} [category]
 */
export function emitLog(message, category = 'chrome') {
  if (typeof globalThis.__emmiLog === 'function') {
    globalThis.__emmiLog(String(message), String(category))
  }
}

export function isDryRun() {
  return Boolean(globalThis.__emmiRuleDryRun)
}

function hook(name) {
  const fn = globalThis[name]
  if (typeof fn !== 'function') {
    throw new Error('Chrome runtime is not available')
  }
  return fn
}

export const APP = 'Google Chrome'

export function browserBrowse(opts) {
  return hook('__emmiBrowserBrowse')({ ...opts, app: APP })
}
export function browserTabs(opts) {
  return hook('__emmiBrowserTabs')({ ...opts, app: APP })
}
export function browserNavigate(opts) {
  return hook('__emmiBrowserNavigate')({ ...opts, app: APP })
}
export function browserPageRead(opts) {
  return hook('__emmiBrowserPageRead')({ ...opts, app: APP })
}
export function browserPageShot(opts) {
  return hook('__emmiBrowserPageShot')({ ...opts, app: APP })
}
export function browserWait(opts) {
  return hook('__emmiBrowserChromeWait')(opts)
}
export function browserPageText(opts) {
  return hook('__emmiBrowserChromePageText')(opts)
}
export function browserQuery(opts) {
  return hook('__emmiBrowserChromeQuery')(opts)
}
export function browserClick(opts) {
  return hook('__emmiBrowserChromeClick')(opts)
}
export function browserType(opts) {
  return hook('__emmiBrowserChromeType')(opts)
}
export function browserFill(opts) {
  return hook('__emmiBrowserChromeFill')(opts)
}
export function browserEval(opts) {
  return hook('__emmiBrowserChromeEval')(opts)
}
export function browserTab(opts) {
  return hook('__emmiBrowserChromeTab')(opts)
}
