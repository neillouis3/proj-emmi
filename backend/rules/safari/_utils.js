/**
 * @param {string} message
 * @param {string} [category]
 */
export function emitLog(message, category = 'safari') {
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
    throw new Error('Safari runtime is not available')
  }
  return fn
}

export const APP = 'Safari'

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
  return hook('__emmiBrowserSafariWait')(opts)
}
export function browserPageText(opts) {
  return hook('__emmiBrowserSafariPageText')(opts)
}
export function browserQuery(opts) {
  return hook('__emmiBrowserSafariQuery')(opts)
}
export function browserClick(opts) {
  return hook('__emmiBrowserSafariClick')(opts)
}
export function browserType(opts) {
  return hook('__emmiBrowserSafariType')(opts)
}
export function browserFill(opts) {
  return hook('__emmiBrowserSafariFill')(opts)
}
export function browserEval(opts) {
  return hook('__emmiBrowserSafariEval')(opts)
}
export function browserTab(opts) {
  return hook('__emmiBrowserSafariTab')(opts)
}
