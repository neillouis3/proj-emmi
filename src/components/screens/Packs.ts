import { el } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { Btn } from '@/components/shared/controls'
import { PageToolbar, TabBar, EmptyState, sectionLabel } from '@/components/shared/layout'
import { uniqueInlineSvg } from '@/lib/connectorLogos'
import {
  DAEMON_BASE,
  fetchPacks,
  installPack,
  removePack,
  updatePack,
  type Pack,
} from '@/lib/daemonClient'
import { syncFromDaemon } from '@/app/store'

type PackFilter = 'all' | 'installed' | 'available'

function packLogoEl(pack: Pack) {
  const wrap = el('span', 'pack-card-logo')
  if (!pack.logo) {
    wrap.innerHTML = icons.plug
    wrap.classList.add('is-fallback')
    return wrap
  }
  const url = `${DAEMON_BASE}/packs/${encodeURIComponent(pack.id)}/logo?v=${encodeURIComponent(pack.version)}`
  void fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('logo missing')
      return r.text()
    })
    .then((raw) => {
      wrap.innerHTML = uniqueInlineSvg(raw.trim())
      const svg = wrap.querySelector('svg')
      if (!svg) throw new Error('invalid logo')
      svg.setAttribute('aria-hidden', 'true')
      // Mono marks (no explicit color fill) follow text color.
      const hasColorFill = [...svg.querySelectorAll('[fill]')].some((n) => {
        const v = n.getAttribute('fill')
        return !!v && v !== 'none' && v !== 'currentColor'
      })
      if (!hasColorFill) {
        wrap.classList.add('is-mono')
        for (const node of svg.querySelectorAll('path, circle, rect, polygon')) {
          if (!node.getAttribute('fill') || node.getAttribute('fill') === 'none') {
            node.setAttribute('fill', 'currentColor')
          }
        }
      }
    })
    .catch(() => {
      wrap.replaceChildren()
      wrap.innerHTML = icons.plug
      wrap.classList.add('is-fallback')
    })
  return wrap
}

function packStatusLabel(pack: Pack) {
  if (pack.core) return 'Always on'
  if (pack.updateAvailable) return 'Update available'
  if (pack.installed) return 'Installed'
  return 'Available'
}

function packStatusClass(pack: Pack) {
  if (pack.core) return 'is-core'
  if (pack.updateAvailable) return 'is-update'
  if (pack.installed) return 'is-installed'
  return 'is-available'
}

export function Packs() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body packs-page')
  page.append(body)

  let packs: Pack[] = []
  let filter: PackFilter = 'all'
  let busy: string | null = null
  let error: string | null = null
  let loading = true
  const expanded = new Set<string>()

  const act = (id: string, fn: (id: string) => Promise<Pack[]>) => {
    if (busy) return
    busy = id
    error = null
    render()
    void fn(id)
      .then((next) => {
        packs = next
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : 'Pack action failed'
      })
      .finally(() => {
        busy = null
        render()
        void syncFromDaemon()
      })
  }

  const packCard = (pack: Pack) => {
    const card = el('div', 'pack-card')

    const head = el('div', 'pack-card-head')
    const title = el('div', 'pack-card-title')
    title.append(packLogoEl(pack), el('span', 'pack-card-name', [pack.name]))
    head.append(title)
    head.append(
      el('span', `pack-card-tag ${packStatusClass(pack)}`, [packStatusLabel(pack)]),
    )
    card.append(head)

    if (pack.description) {
      card.append(el('p', 'pack-card-desc', [pack.description]))
    }

    const facts = el('dl', 'pack-card-facts')
    const addFact = (label: string, value: string) => {
      facts.append(el('dt', undefined, [label]), el('dd', undefined, [value]))
    }
    addFact(
      'Version',
      pack.updateAvailable && pack.installedVersion
        ? `v${pack.installedVersion} → v${pack.version}`
        : `v${pack.version}`,
    )
    if (pack.author) addFact('Author', pack.author)
    if (pack.connectors.length) {
      addFact(
        pack.connectors.length === 1 ? 'Connector' : 'Connectors',
        pack.connectors.join(', '),
      )
    }
    const requires = pack.requires ?? []
    if (requires.length) {
      const names = requires.map((id) => {
        const dep = packs.find((p) => p.id === id)
        return dep?.name ?? id
      })
      addFact(requires.length === 1 ? 'Requires' : 'Requires', names.join(', '))
    }
    card.append(facts)

    const starters = pack.starters ?? []
    if (starters.length) {
      const isOpen = expanded.has(pack.id)
      const details = el('div', `pack-card-details${isOpen ? ' is-open' : ''}`)
      const toggle = el('button', 'pack-card-details-toggle') as HTMLButtonElement
      toggle.type = 'button'
      const countLabel =
        starters.length === 1
          ? '1 starter automation'
          : `${starters.length} starter automations`
      const chevron = el('span', 'pack-card-details-chevron')
      chevron.innerHTML = icons.chevronDown
      toggle.append(el('span', undefined, [countLabel]), chevron)
      toggle.addEventListener('click', () => {
        if (expanded.has(pack.id)) expanded.delete(pack.id)
        else expanded.add(pack.id)
        render()
      })
      details.append(toggle)
      if (isOpen) {
        const list = el('ul', 'pack-card-starters')
        for (const starter of starters) {
          const item = el('li', 'pack-card-starter')
          item.append(el('div', 'pack-card-starter-name', [starter.name]))
          if (starter.description) {
            item.append(
              el('p', 'pack-card-starter-desc', [starter.description]),
            )
          }
          list.append(item)
        }
        details.append(list)
      }
      card.append(details)
    }

    const actions = el('div', 'pack-card-actions')
    const isBusy = busy === pack.id
    if (pack.core) {
      actions.append(
        Btn({ label: 'Always on', variant: 'ghost', disabled: true, onClick: () => {} }),
      )
    } else if (!pack.installed) {
      actions.append(
        Btn({
          label: isBusy ? 'Installing…' : 'Install',
          variant: 'primary',
          disabled: isBusy,
          onClick: () => act(pack.id, installPack),
        }),
      )
    } else {
      if (pack.updateAvailable) {
        actions.append(
          Btn({
            label: isBusy ? 'Updating…' : 'Update',
            variant: 'primary',
            disabled: isBusy,
            onClick: () => act(pack.id, updatePack),
          }),
        )
      }
      actions.append(
        Btn({
          label: isBusy ? 'Removing…' : 'Remove',
          variant: 'ghost',
          disabled: isBusy,
          onClick: () => act(pack.id, removePack),
        }),
      )
    }
    card.append(actions)
    return card
  }

  const render = () => {
    body.replaceChildren()

    const installedCount = packs.filter((p) => p.installed).length
    const availableCount = packs.filter((p) => !p.installed).length

    body.append(
      PageToolbar({
        leading: [
          TabBar({
            value: filter,
            options: [
              { value: 'all', label: 'All' },
              { value: 'installed', label: `Installed (${installedCount})` },
              { value: 'available', label: `Available (${availableCount})` },
            ],
            onChange: (next) => {
              filter = next as PackFilter
              render()
            },
          }),
        ],
      }),
    )

    body.append(
      el('p', 'muted packs-intro', [
        'Packs bundle a connector, its rules, and starter automations. Core is always on; install or remove the rest independently.',
      ]),
    )

    if (error) {
      body.append(el('p', 'muted packs-error', [error]))
    }

    if (loading) {
      body.append(el('p', 'muted', ['Loading packs…']))
      return
    }

    const visible = packs.filter((p) =>
      filter === 'installed'
        ? p.installed
        : filter === 'available'
          ? !p.installed
          : true,
    )

    if (!visible.length) {
      body.append(
        EmptyState({
          title: filter === 'available' ? 'Everything installed' : 'No packs',
          body:
            filter === 'available'
              ? 'All available packs are installed.'
              : 'No packs are available right now.',
        }),
      )
      return
    }

    const updates = visible.filter((p) => p.updateAvailable)
    const installed = visible.filter((p) => p.installed && !p.updateAvailable)
    const available = visible.filter((p) => !p.installed)

    const list = el('div', 'pack-list')
    if (updates.length) {
      list.append(sectionLabel('Updates available'))
      for (const pack of updates) list.append(packCard(pack))
    }
    if (installed.length) {
      list.append(sectionLabel('Installed'))
      for (const pack of installed) list.append(packCard(pack))
    }
    if (available.length) {
      list.append(sectionLabel('Available'))
      for (const pack of available) list.append(packCard(pack))
    }
    body.append(list)
  }

  render()

  void fetchPacks()
    .then((next) => {
      packs = next
    })
    .catch((err: unknown) => {
      error = err instanceof Error ? err.message : 'Could not load packs'
    })
    .finally(() => {
      loading = false
      render()
    })

  return page
}
