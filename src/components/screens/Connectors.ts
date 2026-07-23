import { el, button } from '@/lib/dom'
import { EmptyState, alertBanner, sectionLabel, detailDescription, detailTitleRow, metaGrid, metaGridCell } from '@/components/shared/layout'
import { relativeTime } from '@/lib/format'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  connectConnector,
  disconnectConnector,
  filterConnectorsForPrefs,
  getState,
  navigate,
  showBlocking,
} from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import { Btn } from '@/components/shared/controls'
import {
  fetchChromeCdpStatus,
  fetchConnectorPermissions,
  fetchSafariJsStatus,
  saveConnectorPermissions,
  type GenericPermissions,
  type GitPermissions,
  type ShellPermissions,
  type WebBrowserPermissions,
} from '@/lib/daemonClient'
import type { Connector, LogEntry } from '@/types/domain'

export function Connectors() {
  const page = el('div', 'screen settings-screen')
  let selectedId: string | null = null
  const body = el('div', 'screen-body connectors-page')

  const render = () => {
    const state = getState()
    const connectors = filterConnectorsForPrefs(state.connectors)
    const attention = connectors.filter(
      (c) => c.authStatus === 'expired' || c.authStatus === 'error',
    )

    if (!connectors.some((c) => c.id === selectedId)) {
      selectedId = connectors[0]?.id ?? null
    }
    const selected = connectors.find((c) => c.id === selectedId) ?? null

    page.replaceChildren()
    body.replaceChildren()

    if (!connectors.length) {
      body.append(
        EmptyState({
          title: 'No connectors yet',
          body: state.other.allowCloudConnectors
            ? 'Connect a service to start building automations.'
            : 'Cloud connectors are hidden. Enable them in Settings → Privacy.',
        }),
      )
      page.append(body)
      return
    }

    if (attention.length) {
      body.append(
        alertBanner({
          message:
            attention.length === 1
              ? `${attention[0].name} needs re-auth`
              : `${attention.length} connectors need re-auth`,
          actionLabel: 'Review',
          onClick: () => {
            selectedId = attention[0]?.id ?? selectedId
            render()
          },
        }),
      )
    }

    const split = el('div', 'connectors-split')
    const main = el('div', 'connectors-main')

    const table = el('div', 'connector-table')
    const head = el('div', 'connector-table-head')
    head.append(
      el('span', undefined, ['Connector']),
      el('span', undefined, ['Type']),
      el('span', undefined, ['Status']),
      el('span', undefined, ['']),
    )
    table.append(head)

    for (const connector of connectors) {
      table.append(
        tableRow(
          connector,
          connector.id === selectedId,
          () => {
            selectedId = connector.id
            render()
          },
          render,
        ),
      )
    }
    main.append(table)

    const side = el('aside', 'connectors-side')
    if (selected) {
      side.append(detailPanel(selected, state, render))
    }

    split.append(main, side)
    body.append(split)
    page.append(body)
  }

  return bindScreen(page, render)
}

function tableRow(
  connector: Connector,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const row = button(
    `connector-table-row${selected ? ' is-selected' : ''}`,
  )
  row.type = 'button'
  const name = el('div', 'connector-table-name')
  name.append(logoTile(connector), el('span', undefined, [connector.name]))

  const actionWrap = el('div', 'connector-table-status')
  const action = statusAction(connector, refresh)
  action.addEventListener('click', (e) => e.stopPropagation())
  actionWrap.append(action)

  row.append(
    name,
    el('span', 'connector-table-type', [connector.kind]),
    el('span', `connector-table-state tone-${connector.authStatus}`, [
      statusLabel(connector.authStatus),
    ]),
    actionWrap,
  )
  row.addEventListener('click', onSelect)
  return row
}

function detailPanel(
  connector: Connector,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const autos = state.automations.filter((a) =>
    a.steps.some((s) => s.connectorId === connector.id),
  )
  const rules = state.ruleLibrary.filter((r) => r.connectorId === connector.id)
  const rulesInstalled =
    connector.id === 'fs' ||
    connector.id === 'shell' ||
    connector.authStatus === 'connected'
  const pending = state.pending.filter((p) => p.connectorId === connector.id)
  const logs = state.logs
    .filter((l) => l.connectorId === connector.id)
    .slice(0, 4)

  const panel = el('section', 'connectors-detail')

  const head = el('div', 'detail-head')
  const copy = el('div', 'detail-copy')
  copy.append(detailTitleRow(connector.name, statusAction(connector, refresh)))
  head.append(logoTile(connector), copy)
  panel.append(head)

  if (connector.description) {
    panel.append(detailDescription(connector.description))
  }

  panel.append(
    metaGrid([
      metaGridCell('Type', connector.kind),
      metaGridCell('Automations', String(autos.length)),
      metaGridCell(
        'Rules',
        rulesInstalled ? String(rules.length) : 'Not installed',
      ),
      metaGridCell(
        connector.auth?.type === 'oauth2' ? 'Account' : 'Scope',
        connector.auth?.type === 'oauth2'
          ? connector.accountLabel ||
              (connector.authStatus === 'connected' ? 'Connected' : 'Not connected')
          : connector.scope,
      ),
    ]),
  )

  if (connector.auth?.type === 'oauth2' && connector.authStatus !== 'connected') {
    panel.append(
      el('p', 'connectors-detail-note muted', [
        connector.auth.clientId.startsWith('YOUR_') ||
        connector.auth.clientId.startsWith('<')
          ? 'Set auth.clientId in this connector’s pack manifest, then Connect to sign in.'
          : 'Connect opens your browser to sign in. Enable Accounts (Auth pack) first. Tokens stay on this Mac.',
      ]),
    )
  }

  if (!rulesInstalled) {
    panel.append(
      el('p', 'connectors-detail-note muted', [
        'Connect this connector to install its rules.',
      ]),
    )
  }
  if (
    connector.id === 'shell' ||
    connector.id === 'fs' ||
    connector.id === 'git' ||
    connector.id === 'safari' ||
    connector.id === 'chrome'
  ) {
    panel.append(
      el('p', 'connectors-detail-note muted', [
        'Filesystem = folders you pick; Shell = commands you allow; Git = repos under scopes; Safari/Chrome = local browser control (macOS).',
      ]),
    )
  }

  if (connector.id === 'shell') {
    panel.append(shellPermissionsPanel(refresh))
  }
  if (connector.id === 'git') {
    panel.append(gitPermissionsPanel(refresh))
  }
  if (connector.id === 'safari' || connector.id === 'chrome') {
    panel.append(webBrowserPermissionsPanel(connector.id, refresh))
  }
  if (
    connector.id !== 'shell' &&
    connector.id !== 'git' &&
    connector.id !== 'fs' &&
    connector.id !== 'safari' &&
    connector.id !== 'chrome' &&
    connector.permission
  ) {
    panel.append(genericPermissionsPanel(connector, refresh))
  }

  if (pending.length) {
    const block = el('div', 'connectors-detail-block')
    block.append(sectionLabel('In review'))
    const openReview = button('connectors-usage-row')
    openReview.type = 'button'
    openReview.append(
      el('span', 'connectors-usage-name', ['Open Review']),
      el('span', 'connectors-usage-meta', [
        `${pending.length} pending`,
      ]),
    )
    openReview.addEventListener('click', () => navigate('review'))
    block.append(openReview)
    panel.append(block)
  }

  if (autos.length) {
    const block = el('div', 'connectors-detail-block')
    block.append(sectionLabel('Used by'))
    const list = el('div', 'connectors-usage-list')
    for (const automation of autos.slice(0, 4)) {
      const row = button('connectors-usage-row')
      row.type = 'button'
      row.append(
        el('span', 'connectors-usage-name', [automation.name]),
        el('span', 'connectors-usage-meta', [
          automation.active ? 'Active' : 'Paused',
        ]),
      )
      row.addEventListener('click', () => navigate('automations'))
      list.append(row)
    }
    block.append(list)
    panel.append(block)
  }

  if (logs.length) {
    const block = el('div', 'connectors-detail-block')
    block.append(sectionLabel('Recent activity'))
    const list = el('div', 'connectors-run-list')
    for (const entry of logs) list.append(logRow(entry, state))
    block.append(list)
    panel.append(block)
  }

  return panel
}

function shellPermissionsPanel(refresh: () => void) {
  const block = el('div', 'connectors-detail-block shell-permissions')
  block.append(sectionLabel('Permissions'))
  const body = el('div', 'shell-permissions-body')
  body.append(el('p', 'muted', ['Loading…']))
  block.append(body)

  let draft: ShellPermissions = {
    status: 'ask',
    allowlist: [],
    folderScopes: ['~/Desktop', '~/Downloads', '~/Documents'],
    network: false,
  }

  const paint = () => {
    body.replaceChildren()

    const networkRow = el('div', 'settings-row shell-perm-row')
    networkRow.append(
      el('div', 'settings-row-copy', [
        el('div', 'settings-row-title', ['Network']),
        el(
          'div',
          'settings-row-desc muted',
          ['Off by default. Blocks curl, wget, ssh, and similar CLIs.'],
        ),
      ]),
    )
    const toggle = button(
      `settings-toggle${draft.network ? ' on' : ''}`,
    )
    toggle.type = 'button'
    toggle.setAttribute('aria-pressed', draft.network ? 'true' : 'false')
    toggle.append(el('span', 'settings-toggle-knob'))
    toggle.addEventListener('click', () => {
      draft = { ...draft, network: !draft.network }
      paint()
    })
    networkRow.append(toggle)
    body.append(networkRow)

    const scopesBlock = el('div', 'shell-perm-section')
    scopesBlock.append(el('div', 'shell-perm-label', ['Folder scopes']))
    const chips = el('div', 'rule-create-chips shell-scope-chips')
    for (const scope of draft.folderScopes) {
      const chip = button('rule-create-chip', scope)
      chip.type = 'button'
      chip.title = 'Remove scope'
      chip.addEventListener('click', () => {
        draft = {
          ...draft,
          folderScopes: draft.folderScopes.filter((s) => s !== scope),
        }
        paint()
      })
      chips.append(chip)
    }
    scopesBlock.append(chips)
    const addScope = Btn({
      label: 'Add folder',
      variant: 'ghost',
      className: 'btn-compact',
      onClick: () => {
        void (async () => {
          const picked = await window.emmi?.pickPath?.({
            kind: 'folder',
            title: 'Allow shell access in folder',
          })
          if (typeof picked !== 'string' || !picked) return
          if (draft.folderScopes.includes(picked)) return
          draft = { ...draft, folderScopes: [...draft.folderScopes, picked] }
          paint()
        })()
      },
    })
    scopesBlock.append(addScope)
    body.append(scopesBlock)

    const allowBlock = el('div', 'shell-perm-section')
    allowBlock.append(el('div', 'shell-perm-label', ['Allowlist']))
    const allowList = el('div', 'rule-create-chips shell-allow-chips')
    for (const bin of draft.allowlist) {
      const chip = button('rule-create-chip', bin)
      chip.type = 'button'
      chip.title = 'Remove from allowlist'
      chip.addEventListener('click', () => {
        draft = {
          ...draft,
          allowlist: draft.allowlist.filter((b) => b !== bin),
        }
        paint()
      })
      allowList.append(chip)
    }
    allowBlock.append(allowList)

    const addRow = el('div', 'shell-allow-add')
    const input = el('input', 'field-input-control') as HTMLInputElement
    input.type = 'text'
    input.placeholder = 'ffmpeg, rsync, /usr/bin/echo…'
    input.spellcheck = false
    const addBin = Btn({
      label: 'Add',
      variant: 'ghost',
      className: 'btn-compact',
      onClick: () => {
        const value = input.value.trim()
        if (!value || draft.allowlist.includes(value)) return
        draft = { ...draft, allowlist: [...draft.allowlist, value] }
        input.value = ''
        paint()
      },
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addBin.click()
      }
    })
    addRow.append(input, addBin)
    allowBlock.append(addRow)
    body.append(allowBlock)

    const save = Btn({
      label: 'Save permissions',
      variant: 'primary',
      className: 'btn-compact',
      onClick: () => {
        void saveConnectorPermissions('shell', {
          status: draft.status === 'denied' ? 'ask' : draft.status,
          allowlist: draft.allowlist,
          folderScopes: draft.folderScopes,
          network: draft.network,
          approvedCommands: draft.approvedCommands,
        })
          .then((res) => {
            draft = res.permissions as ShellPermissions
            refresh()
          })
          .catch(() => {
            showBlocking({
              id: `shell-perms-fail-${Date.now()}`,
              kind: 'action-failed',
              title: 'Could not save',
              body: 'Shell permissions were not saved. Is the daemon running?',
              primaryLabel: 'OK',
              secondaryLabel: 'Dismiss',
              connectorId: 'shell',
            })
          })
      },
    })
    body.append(save)
  }

  void fetchConnectorPermissions('shell')
    .then((res) => {
      const p = res.permissions as ShellPermissions
      draft = {
        status: p.status ?? 'ask',
        allowlist: Array.isArray(p.allowlist) ? p.allowlist : [],
        folderScopes: Array.isArray(p.folderScopes)
          ? p.folderScopes
          : ['~/Desktop', '~/Downloads', '~/Documents'],
        network: Boolean(p.network),
        approvedCommands: Array.isArray(p.approvedCommands)
          ? p.approvedCommands
          : [],
      }
      paint()
    })
    .catch(() => {
      body.replaceChildren(
        el('p', 'muted', ['Could not load shell permissions.']),
      )
    })

  return block
}

function folderScopesEditor(
  scopes: string[],
  onChange: (next: string[]) => void,
) {
  const wrap = el('div', 'shell-perm-section')
  wrap.append(el('div', 'shell-perm-label', ['Folder scopes']))
  const chips = el('div', 'rule-create-chips shell-scope-chips')
  for (const scope of scopes) {
    const chip = button('rule-create-chip', scope)
    chip.type = 'button'
    chip.title = 'Remove scope'
    chip.addEventListener('click', () => {
      onChange(scopes.filter((s) => s !== scope))
    })
    chips.append(chip)
  }
  wrap.append(chips)
  wrap.append(
    Btn({
      label: 'Add folder',
      variant: 'ghost',
      className: 'btn-compact',
      onClick: () => {
        void (async () => {
          const picked = await window.emmi?.pickPath?.({
            kind: 'folder',
            title: 'Allow folder',
          })
          if (typeof picked !== 'string' || !picked) return
          if (scopes.includes(picked)) return
          onChange([...scopes, picked])
        })()
      },
    }),
  )
  return wrap
}

/** Manifest-driven permissions panel for pack connectors (not the built-in five). */
function genericPermissionsPanel(connector: Connector, refresh: () => void) {
  const decl = connector.permission ?? {}
  const block = el('div', 'connectors-detail-block shell-permissions')
  block.append(sectionLabel('Permissions'))
  const body = el('div', 'shell-permissions-body')
  body.append(el('p', 'muted', ['Loading…']))
  block.append(body)

  let draft: GenericPermissions = {
    status: decl.grant ? 'ask' : 'granted',
    folderScopes: decl.folderScopes ? ['~/Desktop', '~/Downloads', '~/Documents'] : [],
    allowlist: [],
    hostAllowlist: [],
    flags: Object.fromEntries((decl.flags ?? []).map((f) => [f.id, false])),
  }

  const chipEditor = (
    label: string,
    values: string[],
    placeholder: string,
    onChange: (next: string[]) => void,
  ) => {
    const wrap = el('div', 'shell-perm-section')
    wrap.append(el('div', 'shell-perm-label', [label]))
    const chips = el('div', 'rule-create-chips shell-allow-chips')
    for (const value of values) {
      const chip = button('rule-create-chip', value)
      chip.type = 'button'
      chip.title = 'Remove'
      chip.addEventListener('click', () => onChange(values.filter((v) => v !== value)))
      chips.append(chip)
    }
    wrap.append(chips)
    const input = document.createElement('input')
    input.className = 'text-input btn-compact'
    input.placeholder = placeholder
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const v = input.value.trim()
      if (v && !values.includes(v)) onChange([...values, v])
      input.value = ''
    })
    wrap.append(input)
    return wrap
  }

  const paint = () => {
    body.replaceChildren()

    for (const flag of decl.flags ?? []) {
      const row = el('div', 'settings-row shell-perm-row')
      row.append(
        el('div', 'settings-row-copy', [
          el('div', 'settings-row-title', [flag.label]),
          ...(flag.help
            ? [el('div', 'settings-row-desc muted', [flag.help])]
            : []),
        ]),
      )
      const on = draft.flags[flag.id] === true
      const toggle = button(`settings-toggle${on ? ' on' : ''}`)
      toggle.type = 'button'
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false')
      toggle.append(el('span', 'settings-toggle-knob'))
      toggle.addEventListener('click', () => {
        draft = { ...draft, flags: { ...draft.flags, [flag.id]: !on } }
        paint()
      })
      row.append(toggle)
      body.append(row)
    }

    if (decl.folderScopes) {
      body.append(
        folderScopesEditor(draft.folderScopes, (next) => {
          draft = { ...draft, folderScopes: next }
          paint()
        }),
      )
    }
    if (decl.allowlist) {
      body.append(
        chipEditor('Allowlist', draft.allowlist, 'Add and press Enter', (next) => {
          draft = { ...draft, allowlist: next }
          paint()
        }),
      )
    }
    if (decl.hostAllowlist) {
      body.append(
        chipEditor(
          'Allowed hosts',
          draft.hostAllowlist,
          'example.com, press Enter',
          (next) => {
            draft = { ...draft, hostAllowlist: next }
            paint()
          },
        ),
      )
    }

    body.append(
      Btn({
        label: 'Save permissions',
        variant: 'primary',
        className: 'btn-compact',
        onClick: () => {
          void saveConnectorPermissions(connector.id, {
            status: draft.status === 'denied' ? 'ask' : draft.status,
            folderScopes: draft.folderScopes,
            allowlist: draft.allowlist,
            hostAllowlist: draft.hostAllowlist,
            flags: draft.flags,
          })
            .then((res) => {
              draft = res.permissions as GenericPermissions
              refresh()
            })
            .catch(() => {
              showBlocking({
                id: `perms-fail-${Date.now()}`,
                kind: 'action-failed',
                title: 'Could not save',
                body: `${connector.name} permissions were not saved. Is the daemon running?`,
                primaryLabel: 'OK',
                secondaryLabel: 'Dismiss',
                connectorId: connector.id,
              })
            })
        },
      }),
    )
  }

  void fetchConnectorPermissions(connector.id)
    .then((res) => {
      draft = res.permissions as GenericPermissions
      paint()
    })
    .catch(() => paint())

  return block
}

function gitPermissionsPanel(refresh: () => void) {
  const block = el('div', 'connectors-detail-block shell-permissions')
  block.append(sectionLabel('Permissions'))
  const body = el('div', 'shell-permissions-body')
  body.append(el('p', 'muted', ['Loading…']))
  block.append(body)

  let draft: GitPermissions = {
    status: 'ask',
    folderScopes: ['~/Desktop', '~/Downloads', '~/Documents'],
    remoteOps: false,
  }

  const paint = () => {
    body.replaceChildren()

    const remoteRow = el('div', 'settings-row shell-perm-row')
    remoteRow.append(
      el('div', 'settings-row-copy', [
        el('div', 'settings-row-title', ['Pull & push']),
        el(
          'div',
          'settings-row-desc muted',
          [
            'Off by default. Uses network and git credentials; repos still limited to folder scopes.',
          ],
        ),
      ]),
    )
    const toggle = button(
      `settings-toggle${draft.remoteOps ? ' on' : ''}`,
    )
    toggle.type = 'button'
    toggle.setAttribute('aria-pressed', draft.remoteOps ? 'true' : 'false')
    toggle.append(el('span', 'settings-toggle-knob'))
    toggle.addEventListener('click', () => {
      draft = { ...draft, remoteOps: !draft.remoteOps }
      paint()
    })
    remoteRow.append(toggle)
    body.append(remoteRow)

    body.append(
      folderScopesEditor(draft.folderScopes, (next) => {
        draft = { ...draft, folderScopes: next }
        paint()
      }),
    )
    body.append(
      Btn({
        label: 'Save permissions',
        variant: 'primary',
        className: 'btn-compact',
        onClick: () => {
          void saveConnectorPermissions('git', {
            status: draft.status === 'denied' ? 'ask' : draft.status,
            folderScopes: draft.folderScopes,
            remoteOps: draft.remoteOps,
          })
            .then((res) => {
              draft = res.permissions as GitPermissions
              refresh()
            })
            .catch(() => {
              showBlocking({
                id: `git-perms-fail-${Date.now()}`,
                kind: 'action-failed',
                title: 'Could not save',
                body: 'Git permissions were not saved. Is the daemon running?',
                primaryLabel: 'OK',
                secondaryLabel: 'Dismiss',
                connectorId: 'git',
              })
            })
        },
      }),
    )
  }

  void fetchConnectorPermissions('git')
    .then((res) => {
      const p = res.permissions as GitPermissions
      draft = {
        status: p.status ?? 'ask',
        folderScopes: Array.isArray(p.folderScopes)
          ? p.folderScopes
          : ['~/Desktop', '~/Downloads', '~/Documents'],
        remoteOps: Boolean(p.remoteOps),
      }
      paint()
    })
    .catch(() => {
      body.replaceChildren(el('p', 'muted', ['Could not load git permissions.']))
    })

  return block
}

function webBrowserPermissionsPanel(
  connectorId: 'safari' | 'chrome',
  refresh: () => void,
) {
  const label = connectorId === 'chrome' ? 'Chrome' : 'Safari'
  const block = el('div', 'connectors-detail-block shell-permissions')
  block.append(sectionLabel('Permissions'))
  const body = el('div', 'shell-permissions-body')
  body.append(el('p', 'muted', ['Loading…']))
  block.append(body)

  let draft: WebBrowserPermissions = {
    status: 'ask',
    folderScopes: ['~/Desktop', '~/Downloads', '~/Documents'],
    urlHostAllowlist: [],
  }
  let cdpState: 'up' | 'no_pages' | 'down' | 'unknown' = 'unknown'
  let cdpPort = 9222
  let cdpBusy = false
  let safariJsState: 'ready' | 'needs_setting' | 'unavailable' | 'unknown' =
    'unknown'
  let safariJsDetail = ''
  let safariJsBusy = false

  const refreshCdp = () => {
    if (connectorId !== 'chrome') return
    const apply = (state: 'up' | 'no_pages' | 'down', port: number) => {
      cdpState = state
      cdpPort = port
      paint()
    }
    if (window.emmi?.chromeCdpStatus) {
      void window.emmi.chromeCdpStatus().then((s) => apply(s.state, s.port))
      return
    }
    void fetchChromeCdpStatus()
      .then((s) => apply(s.state, s.port))
      .catch(() => {
        cdpState = 'unknown'
        paint()
      })
  }

  const refreshSafariJs = () => {
    if (connectorId !== 'safari') return
    void fetchSafariJsStatus()
      .then((s) => {
        safariJsState = s.state
        safariJsDetail = s.detail ?? ''
        paint()
      })
      .catch(() => {
        safariJsState = 'unknown'
        safariJsDetail = ''
        paint()
      })
  }

  const paint = () => {
    body.replaceChildren()
    body.append(
      el('p', 'muted', [
        `macOS only. Empty host allowlist = any URL when ${label} is connected.`,
      ]),
    )

    if (connectorId === 'chrome') {
      const cdpBlock = el('div', 'shell-perm-section')
      cdpBlock.append(el('div', 'shell-perm-label', ['Remote debugging (CDP)']))
      const badge =
        cdpState === 'up'
          ? 'Up'
          : cdpState === 'no_pages'
            ? 'Up · no pages'
            : cdpState === 'down'
              ? 'Down'
              : 'Checking…'
      cdpBlock.append(
        el('p', 'muted', [
          `${badge} · port ${cdpPort}. Page actions (wait, click, pageText, tab screenshots) require CDP.`,
        ]),
      )
      const row = el('div', 'btn-row')
      row.append(
        Btn({
          label: cdpBusy ? 'Working…' : 'Enable remote debugging',
          variant: 'primary',
          className: 'btn-compact',
          onClick: () => {
            if (!window.emmi?.enableChromeDebugging) {
              showBlocking({
                id: `chrome-cdp-${Date.now()}`,
                kind: 'action-failed',
                title: 'Desktop app required',
                body: 'Enable remote debugging from the Emmi desktop app (not the browser preview).',
                primaryLabel: 'OK',
                secondaryLabel: 'Dismiss',
                connectorId: 'chrome',
              })
              return
            }
            cdpBusy = true
            paint()
            void window.emmi
              .enableChromeDebugging({ confirm: true })
              .then((res) => {
                cdpBusy = false
                if (res.cancelled) {
                  paint()
                  return
                }
                if (res.ok) {
                  cdpState = res.state
                  cdpPort = res.port
                  paint()
                  return
                }
                showBlocking({
                  id: `chrome-cdp-fail-${Date.now()}`,
                  kind: 'chrome-setup',
                  title: 'Could not enable Chrome debugging',
                  body:
                    res.error ||
                    `Start Chrome manually:\n${res.command ?? `Google Chrome --remote-debugging-port=${res.port}`}`,
                  primaryLabel: 'Try again',
                  secondaryLabel: 'Dismiss',
                  connectorId: 'chrome',
                })
                paint()
              })
              .catch(() => {
                cdpBusy = false
                paint()
              })
          },
        }),
        Btn({
          label: 'Refresh status',
          variant: 'ghost',
          className: 'btn-compact',
          onClick: () => refreshCdp(),
        }),
      )
      cdpBlock.append(row)
      body.append(cdpBlock)
    }

    if (connectorId === 'safari') {
      const jsBlock = el('div', 'shell-perm-section')
      jsBlock.append(
        el('div', 'shell-perm-label', ['JavaScript from Apple Events']),
      )
      const badge =
        safariJsState === 'ready'
          ? 'Ready'
          : safariJsState === 'needs_setting'
            ? 'Needs Develop setting'
            : safariJsState === 'unavailable'
              ? 'Unavailable'
              : 'Checking…'
      jsBlock.append(
        el('p', 'muted', [
          `${badge}. Page actions (wait, click, pageText, query) need Develop → Allow JavaScript from Apple Events. pageShot uses desktop capture.`,
        ]),
      )
      if (safariJsDetail && safariJsState !== 'ready') {
        jsBlock.append(el('p', 'muted', [safariJsDetail.slice(0, 240)]))
      }
      const row = el('div', 'btn-row')
      row.append(
        Btn({
          label: 'Open Safari settings help',
          variant: 'primary',
          className: 'btn-compact',
          onClick: () => {
            showBlocking({
              id: `safari-js-help-${Date.now()}`,
              kind: 'safari-setup',
              title: 'Enable Safari JavaScript from Apple Events',
              body:
                '1. Open Safari → Settings (or Preferences) → Advanced → show Develop menu in menu bar.\n' +
                '2. Safari menu → Develop → Allow JavaScript from Apple Events.\n' +
                '3. Keep at least one tab open, then refresh status here.\n\n' +
                'Cross-origin or locked-down pages may still refuse JS.',
              primaryLabel: 'Open Safari',
              secondaryLabel: 'Dismiss',
              connectorId: 'safari',
            })
          },
        }),
        Btn({
          label: safariJsBusy ? 'Working…' : 'Refresh status',
          variant: 'ghost',
          className: 'btn-compact',
          onClick: () => {
            safariJsBusy = true
            paint()
            void fetchSafariJsStatus()
              .then((s) => {
                safariJsState = s.state
                safariJsDetail = s.detail ?? ''
              })
              .catch(() => {
                safariJsState = 'unknown'
                safariJsDetail = ''
              })
              .finally(() => {
                safariJsBusy = false
                paint()
              })
          },
        }),
      )
      jsBlock.append(row)
      body.append(jsBlock)
    }

    body.append(
      folderScopesEditor(draft.folderScopes, (next) => {
        draft = { ...draft, folderScopes: next }
        paint()
      }),
    )

    const hostsBlock = el('div', 'shell-perm-section')
    hostsBlock.append(el('div', 'shell-perm-label', ['URL host allowlist']))
    const hostChips = el('div', 'rule-create-chips')
    for (const host of draft.urlHostAllowlist) {
      const chip = button('rule-create-chip', host)
      chip.type = 'button'
      chip.addEventListener('click', () => {
        draft = {
          ...draft,
          urlHostAllowlist: draft.urlHostAllowlist.filter((h) => h !== host),
        }
        paint()
      })
      hostChips.append(chip)
    }
    hostsBlock.append(hostChips)
    const hostRow = el('div', 'shell-allow-add')
    const input = el('input', 'field-input-control') as HTMLInputElement
    input.type = 'text'
    input.placeholder = 'example.com'
    const addHost = Btn({
      label: 'Add',
      variant: 'ghost',
      className: 'btn-compact',
      onClick: () => {
        const value = input.value.trim().toLowerCase()
        if (!value || draft.urlHostAllowlist.includes(value)) return
        draft = {
          ...draft,
          urlHostAllowlist: [...draft.urlHostAllowlist, value],
        }
        input.value = ''
        paint()
      },
    })
    hostRow.append(input, addHost)
    hostsBlock.append(hostRow)
    body.append(hostsBlock)

    body.append(
      Btn({
        label: 'Save permissions',
        variant: 'primary',
        className: 'btn-compact',
        onClick: () => {
          void saveConnectorPermissions(connectorId, {
            status: draft.status === 'denied' ? 'ask' : draft.status,
            folderScopes: draft.folderScopes,
            urlHostAllowlist: draft.urlHostAllowlist,
          })
            .then((res) => {
              draft = res.permissions as WebBrowserPermissions
              refresh()
            })
            .catch(() => {
              showBlocking({
                id: `${connectorId}-perms-fail-${Date.now()}`,
                kind: 'action-failed',
                title: 'Could not save',
                body: `${label} permissions were not saved. Is the daemon running?`,
                primaryLabel: 'OK',
                secondaryLabel: 'Dismiss',
                connectorId,
              })
            })
        },
      }),
    )
  }

  void fetchConnectorPermissions(connectorId)
    .then((res) => {
      const p = res.permissions as WebBrowserPermissions
      draft = {
        status: p.status ?? 'ask',
        folderScopes: Array.isArray(p.folderScopes)
          ? p.folderScopes
          : ['~/Desktop', '~/Downloads', '~/Documents'],
        urlHostAllowlist: Array.isArray(p.urlHostAllowlist)
          ? p.urlHostAllowlist
          : [],
      }
      paint()
      refreshCdp()
      refreshSafariJs()
    })
    .catch(() => {
      body.replaceChildren(
        el('p', 'muted', [`Could not load ${label} permissions.`]),
      )
    })

  return block
}

function logRow(entry: LogEntry, state: ReturnType<typeof getState>) {
  const summary = entry.undone
    ? 'Undone'
    : entry.success
      ? labelPathText(entry.action, state.pathVariables)
      : (entry.error ?? 'Failed')
  const row = el('div', `connectors-run-row ${entry.success ? 'ok' : 'fail'}`)
  row.append(
    el('span', 'connectors-run-time', [relativeTime(entry.at)]),
    el('span', 'connectors-run-summary', [summary]),
  )
  return row
}

function logoTile(connector: Connector) {
  return connectorIconTile(connector.id, false, connector.logo)
}

function statusLabel(status: Connector['authStatus']) {
  if (status === 'connected') return 'Connected'
  if (status === 'expired') return 'Re-auth needed'
  if (status === 'error') return 'Error'
  return 'Available'
}

function statusAction(
  connector: Connector,
  refresh: () => void,
) {
  if (connector.authStatus === 'connected') {
    const btn = button('connector-action ghost pill quiet-action', 'Disconnect')
    btn.type = 'button'
    btn.addEventListener('click', () => {
      if (!getState().automationsPrefs.confirmDestructiveActions) {
        disconnectConnector(connector.id)
        refresh()
        return
      }
      showBlocking({
        id: `disconnect-${connector.id}`,
        kind: 'confirm',
        title: 'Are you sure?',
        body: `Disconnect ${connector.name}? Automations using this connector may stop working until you reconnect.`,
        primaryLabel: 'Disconnect',
        secondaryLabel: 'Cancel',
        connectorId: connector.id,
      })
    })
    return btn
  }

  if (connector.authStatus === 'expired' || connector.authStatus === 'error') {
    const reconnect = button('btn btn-ghost btn-compact', 'Reconnect')
    reconnect.type = 'button'
    reconnect.addEventListener('click', () => {
      connectConnector(connector.id)
      refresh()
    })
    return reconnect
  }

  const connect = button('btn btn-ghost btn-compact', 'Connect')
  connect.type = 'button'
  connect.addEventListener('click', () => {
    connectConnector(connector.id)
    refresh()
  })
  return connect
}

