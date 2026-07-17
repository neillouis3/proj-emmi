import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { relativeTime } from '@/lib/format'
import { connectorLogo } from '@/lib/connectorLogos'
import {
  connectConnector,
  disconnectConnector,
  getState,
  navigate,
  triggerAuthExpired,
} from '@/app/store'
import type { Connector, LogEntry } from '@/types/domain'

type ConnectorFilter = 'all' | 'connected' | 'disconnected' | 'attention'

export function Connectors() {
  const page = el('div', 'screen settings-screen')
  let filter: ConnectorFilter = 'all'
  let selectedId: string | null = null
  const body = el('div', 'screen-body connectors-page')

  const render = () => {
    const state = getState()
    const connected = state.connectors.filter((c) => c.authStatus === 'connected')
    const attention = state.connectors.filter(
      (c) => c.authStatus === 'expired' || c.authStatus === 'error',
    )
    const disconnected = state.connectors.filter((c) => c.authStatus !== 'connected')

    const visible =
      filter === 'connected'
        ? connected
        : filter === 'disconnected'
          ? disconnected
          : filter === 'attention'
            ? attention
            : state.connectors

    if (!visible.some((c) => c.id === selectedId)) {
      selectedId = visible[0]?.id ?? null
    }
    const selected = visible.find((c) => c.id === selectedId) ?? null

    page.replaceChildren()
    body.replaceChildren()

    if (!state.connectors.length) {
      body.append(
        EmptyState({
          title: 'No connectors yet',
          body: 'Connect a service to start building automations.',
        }),
      )
      page.append(body)
      return
    }

    body.append(
      PageToolbar({
        leading: [
          filterTabs(
            [
              { value: 'all', label: 'All' },
              { value: 'connected', label: `Connected (${connected.length})` },
              {
                value: 'attention',
                label: attention.length
                  ? `Attention (${attention.length})`
                  : 'Attention',
              },
              { value: 'disconnected', label: 'Not connected' },
            ],
            filter,
            (next) => {
              filter = next as ConnectorFilter
              render()
            },
          ),
        ],
      }),
    )

    if (attention.length && filter !== 'attention') {
      const banner = button('connectors-attention-banner')
      banner.type = 'button'
      banner.append(
        el('span', undefined, [
          attention.length === 1
            ? `${attention[0].name} needs re-auth`
            : `${attention.length} connectors need re-auth`,
        ]),
        el('span', 'connectors-attention-action', ['Review']),
      )
      banner.addEventListener('click', () => {
        filter = 'attention'
        render()
      })
      body.append(banner)
    }

    if (!visible.length) {
      body.append(
        EmptyState({
          title: 'No connectors here',
          body: 'Try another filter.',
        }),
      )
      page.append(body)
      return
    }

    const split = el('div', 'connectors-split')
    const main = el('div', 'connectors-main')

    if (filter === 'all') {
      const popular = state.connectors.filter((c) => c.popular)
      if (popular.length) {
        const popularSection = el('section', 'connectors-section')
        const grid = el('div', 'connector-popular-grid')
        for (const connector of popular) {
          grid.append(
            popularCard(connector, connector.id === selectedId, () => {
              selectedId = connector.id
              render()
            }, render),
          )
        }
        popularSection.append(grid)
        main.append(popularSection)
      }
    }

    const table = el('div', 'connector-table')
    const head = el('div', 'connector-table-head')
    head.append(
      el('span', undefined, ['Connector']),
      el('span', undefined, ['Type']),
      el('span', undefined, ['Status']),
      el('span', undefined, ['']),
    )
    table.append(head)

    for (const connector of visible) {
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

  render()
  return page
}

function filterTabs(
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void,
) {
  const bar = el('div', 'connector-tabs')
  for (const option of options) {
    const tab = button(
      `connector-tab${option.value === current ? ' active' : ''}`,
      option.label,
    )
    tab.addEventListener('click', () => onChange(option.value))
    bar.append(tab)
  }
  return bar
}

function popularCard(
  connector: Connector,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const card = button(
    `connector-popular-card${selected ? ' is-selected' : ''}`,
  )
  card.type = 'button'
  const left = el('div', 'connector-popular-left')
  left.append(logoTile(connector), el('span', 'connector-popular-name', [connector.name]))
  const action = statusAction(connector, refresh, true)
  action.addEventListener('click', (e) => e.stopPropagation())
  card.append(left, action)
  card.addEventListener('click', onSelect)
  return card
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
  const action = statusAction(connector, refresh, false)
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
  const rules = state.rules.filter((r) => r.connectorId === connector.id)
  const pending = state.pending.filter((p) => p.connectorId === connector.id)
  const logs = state.logs
    .filter((l) => l.connectorId === connector.id)
    .slice(0, 4)

  const panel = el('section', 'connectors-detail')
  const head = el('div', 'connectors-detail-head')
  head.append(logoTile(connector))
  const copy = el('div', 'connectors-detail-copy')
  copy.append(
    el('div', 'connectors-detail-title', [connector.name]),
    el('div', 'connectors-detail-meta', [
      `${connector.kind} · ${statusLabel(connector.authStatus)}`,
    ]),
  )
  head.append(copy)
  panel.append(head)

  panel.append(el('div', 'connectors-detail-desc', [connector.description]))

  const actions = el('div', 'connectors-detail-actions')
  const primary = statusAction(connector, refresh, false)
  actions.append(primary)
  if (connector.authStatus === 'connected') {
    actions.append(
      pillBtn('Simulate expire', 'ghost', () => {
        triggerAuthExpired(connector.id)
        refresh()
      }),
    )
  }
  panel.append(actions)

  const facts = el('div', 'connectors-detail-facts')
  facts.append(
    fact('Scope', connector.scope),
    fact('Status', statusLabel(connector.authStatus)),
    fact('Automations', String(autos.length)),
    fact('Rules', String(rules.length)),
  )
  panel.append(facts)

  if (pending.length) {
    const block = el('div', 'connectors-detail-block')
    block.append(
      el('div', 'dashboard-section-title', ['In review']),
      el('div', 'connectors-detail-note', [
        `${pending.length} pending item${pending.length === 1 ? '' : 's'} use this connector.`,
      ]),
      pillBtn('Open Review', 'ghost', () => navigate('review')),
    )
    panel.append(block)
  }

  if (autos.length) {
    const block = el('div', 'connectors-detail-block')
    block.append(el('div', 'dashboard-section-title', ['Used by']))
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
    block.append(el('div', 'dashboard-section-title', ['Recent activity']))
    const list = el('div', 'connectors-run-list')
    for (const entry of logs) list.append(logRow(entry))
    block.append(list)
    panel.append(block)
  }

  return panel
}

function logRow(entry: LogEntry) {
  const row = el('div', `connectors-run-row ${entry.success ? 'ok' : 'fail'}`)
  row.append(
    el('span', 'connectors-run-time', [relativeTime(entry.at)]),
    el('span', 'connectors-run-summary', [
      entry.undone
        ? 'Undone'
        : entry.success
          ? entry.action
          : entry.error ?? 'Failed',
    ]),
  )
  return row
}

function fact(label: string, value: string) {
  const row = el('div', 'review-report-row')
  row.append(
    el('span', 'review-report-label', [label]),
    el('span', 'review-report-value', [value]),
  )
  return row
}

function logoTile(connector: Connector) {
  const tile = el('span', `connector-logo tone-${connector.id}`)
  tile.innerHTML = connectorLogo(connector.id)
  return tile
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
  compact: boolean,
) {
  if (connector.authStatus === 'connected') {
    const btn = button('connector-action connected pill', 'Connected')
    btn.addEventListener('click', () => {
      disconnectConnector(connector.id)
      refresh()
    })
    btn.title = 'Disconnect'
    return btn
  }

  if (connector.authStatus === 'expired' || connector.authStatus === 'error') {
    const wrap = el('div', 'connector-action-group')
    const reconnect = button('connector-action pill', 'Reconnect')
    reconnect.addEventListener('click', () => {
      connectConnector(connector.id)
      refresh()
    })
    if (!compact) {
      const prompt = button('connector-action ghost pill', 'Prompt')
      prompt.addEventListener('click', () => triggerAuthExpired(connector.id))
      wrap.append(reconnect, prompt)
    } else {
      wrap.append(reconnect)
    }
    return wrap
  }

  const connect = button('connector-action pill', 'Connect')
  connect.addEventListener('click', () => {
    connectConnector(connector.id)
    refresh()
  })
  return connect
}

function pillBtn(
  label: string,
  tone: 'primary' | 'ghost',
  onClick: () => void,
) {
  const btn = button(
    `connector-action pill${tone === 'primary' ? ' primary' : ' ghost'}`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}
