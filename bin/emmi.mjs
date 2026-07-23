#!/usr/bin/env node
/**
 * Emmi CLI — talks to the local daemon HTTP API.
 * Usage: emmi ping | emmi list | emmi run <id|name>
 */

import path from 'node:path'

const port = process.env.EMMI_PORT || '3921'
const base =
  process.env.EMMI_DAEMON || `http://127.0.0.1:${port}`

function usage(code = 1) {
  console.error(`Usage:
  emmi ping
  emmi list
  emmi run <id|name>
  emmi pack list
  emmi pack install <folder>
  emmi pack remove <id>

Daemon: ${base}
Env: EMMI_DAEMON, EMMI_PORT`)
  process.exit(code)
}

async function request(path, init) {
  let res
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Daemon unreachable at ${base} (${message})`)
    console.error('Start Emmi or run: npm run daemon')
    process.exit(1)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data?.error || res.statusText || `HTTP ${res.status}`
    throw Object.assign(new Error(err), { status: res.status, data })
  }
  return data
}

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveAutomation(automations, ref) {
  const needle = String(ref ?? '').trim()
  if (!needle) return { error: 'missing ref' }

  const byId = automations.find((a) => a.id === needle)
  if (byId) return { automation: byId }

  const lower = needle.toLowerCase()
  const byName = automations.filter(
    (a) => String(a.name ?? '').toLowerCase() === lower,
  )
  if (byName.length === 1) return { automation: byName[0] }
  if (byName.length > 1) {
    return {
      error: 'ambiguous',
      matches: byName.map((a) => `${a.id} (${a.name})`),
    }
  }

  const bySlug = automations.filter((a) => slugify(a.name) === lower)
  if (bySlug.length === 1) return { automation: bySlug[0] }
  if (bySlug.length > 1) {
    return {
      error: 'ambiguous',
      matches: bySlug.map((a) => `${a.id} (${a.name})`),
    }
  }

  return { error: 'not_found' }
}

async function cmdPing() {
  const data = await request('/health')
  console.log(JSON.stringify(data, null, 2))
}

async function cmdList() {
  const data = await request('/automations')
  const rows = (data.automations ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active,
    trigger: a.trigger,
    triggerSummary: a.triggerSummary,
  }))
  if (!rows.length) {
    console.log('(no automations)')
    return
  }
  for (const row of rows) {
    const flag = row.active ? 'on ' : 'off'
    console.log(
      `${flag}  ${row.id.padEnd(20)}  ${row.name}  · ${row.triggerSummary || row.trigger}`,
    )
  }
}

async function cmdRun(ref) {
  if (!ref) usage(2)
  const data = await request('/automations')
  const resolved = resolveAutomation(data.automations ?? [], ref)
  if (resolved.error === 'not_found') {
    console.error(`Automation not found: ${ref}`)
    process.exit(2)
  }
  if (resolved.error === 'ambiguous') {
    console.error(`Ambiguous name “${ref}”:`)
    for (const m of resolved.matches ?? []) console.error(`  ${m}`)
    process.exit(2)
  }
  if (resolved.error === 'missing ref') usage(2)

  const automation = resolved.automation
  try {
    const result = await request(
      `/automations/${encodeURIComponent(automation.id)}/run`,
      { method: 'POST', body: '{}' },
    )
    const summary = result.run?.summary ?? result.run?.status ?? 'ok'
    const pending = result.pending
    console.log(`ran ${automation.id} (${automation.name})`)
    console.log(`runId  ${result.runId ?? result.run?.id ?? '—'}`)
    console.log(`status ${result.run?.status ?? '—'}`)
    console.log(`mode   ${result.mode ?? '—'}`)
    console.log(`summary ${summary}`)
    if (pending?.id) {
      console.log(`pending ${pending.id} — ${pending.action}`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

async function cmdPack(rest) {
  const [sub, arg] = rest
  if (sub === 'list') {
    const data = await request('/packs')
    for (const p of data.packs ?? []) {
      const flag = p.installed ? 'on ' : 'off'
      const update = p.updateAvailable ? ' (update available)' : ''
      console.log(
        `${flag}  ${String(p.id).padEnd(16)}  v${p.version}  ${p.name}${update}`,
      )
    }
    return
  }
  if (sub === 'install') {
    if (!arg) usage(2)
    const dir = path.resolve(process.cwd(), arg)
    const data = await request('/packs/install-local', {
      method: 'POST',
      body: JSON.stringify({ dir }),
    })
    console.log(`installed pack from ${dir}`)
    for (const p of data.packs ?? []) {
      if (p.installed) console.log(`  ${p.id} v${p.version}`)
    }
    return
  }
  if (sub === 'remove') {
    if (!arg) usage(2)
    await request(`/packs/${encodeURIComponent(arg)}`, { method: 'DELETE' })
    console.log(`removed pack ${arg}`)
    return
  }
  usage(2)
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  if (!cmd || cmd === '-h' || cmd === '--help') usage(cmd ? 0 : 1)
  if (cmd === 'ping') return cmdPing()
  if (cmd === 'list') return cmdList()
  if (cmd === 'run') return cmdRun(rest[0])
  if (cmd === 'pack') return cmdPack(rest)
  console.error(`Unknown command: ${cmd}`)
  usage(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
