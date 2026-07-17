import { el, button } from '@/lib/dom'
import { ThemeMenuButton } from '@/components/ThemeMenu'
import { ListRow, SectionBlock } from '@/components/shared/SectionBlock'
import { icons } from '@/lib/icons'
import {
  getState,
  navigate,
  restartDaemon,
  setDaemonStatus,
  setDefaultRuleMode,
  setGeneralPrefs,
  setLlm,
  setNotificationPrefs,
  setOtherPrefs,
} from '@/app/store'

export function Settings() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body settings-page')

  const render = () => {
    const state = getState()
    const process = processCopy(state.daemonStatus)
    const needsAuth = state.connectors.filter((c) => c.authStatus === 'expired')

    page.replaceChildren()
    body.replaceChildren()

    const about = el('section', 'settings-about')

    const head = el('div', 'settings-about-head')
    const logo = el('div', 'settings-about-logo')
    logo.innerHTML = icons.spark
    const copy = el('div', 'settings-about-copy')
    const title = el('div', 'settings-about-title')
    title.append(
      el('span', 'settings-about-name', ['Emmi']),
      el('span', 'settings-about-version', ['0.1.0']),
    )
    copy.append(
      title,
      el('div', 'settings-about-tagline', [
        'Local automation for your menu bar',
      ]),
    )
    head.append(logo, copy)

    if (state.daemonStatus === 'crashed' || state.daemonStatus === 'stopped') {
      const restart = button('btn btn-primary btn-compact', 'Restart')
      restart.addEventListener('click', () => {
        restartDaemon()
        render()
      })
      head.append(restart)
    }
    about.append(head)

    const pills = el('div', 'settings-about-pills')
    const platform = platformInfo()
    pills.append(
      aboutPill(platform.icon, platform.label),
      aboutPill(null, process.label, `status-${process.tone}`, true),
    )
    if (state.llm.mode === 'cloud') {
      pills.append(
        aboutPill(icons.cloud, 'Cloud'),
        aboutPill(icons.cpu, formatProvider(state.llm.provider)),
      )
    } else {
      pills.append(aboutPill(icons.cpu, 'Local model'))
    }
    about.append(
      pills,
      el('div', 'settings-about-credit', [
        'Designed and built by neillouis3',
      ]),
    )
    body.append(about)

    if (needsAuth.length) {
      const auth = button('dashboard-attention')
      auth.type = 'button'
      auth.append(
        el('div', 'dashboard-attention-copy', [
          el('div', 'dashboard-attention-title', [
            needsAuth.length === 1
              ? `${needsAuth[0].name} needs re-auth`
              : `${needsAuth.length} connectors need re-auth`,
          ]),
          el('div', 'dashboard-attention-meta', [
            'Reconnect so automations can keep running.',
          ]),
        ]),
        el('span', 'dashboard-attention-action', ['Fix']),
      )
      auth.addEventListener('click', () => navigate('connectors'))
      body.append(auth)
    }

    body.append(
      SectionBlock({
        icon: icons.gear,
        tone: 'gray',
        title: 'General',
        rows: [
          toggleRow('Launch at login', state.general.launchAtLogin, (v) => {
            setGeneralPrefs({ launchAtLogin: v })
            render()
          }),
          toggleRow('Hide in fullscreen', state.general.hideInFullscreen, (v) => {
            setGeneralPrefs({ hideInFullscreen: v })
            render()
          }),
          toggleRow(
            'Keep running in background',
            state.general.keepRunningInBackground,
            (v) => {
              setGeneralPrefs({ keepRunningInBackground: v })
              render()
            },
          ),
          toggleRow(
            'Open dashboard on launch',
            state.general.openDashboardOnLaunch,
            (v) => {
              setGeneralPrefs({ openDashboardOnLaunch: v })
              render()
            },
          ),
          valueRow('Background process', statusLabel(state.daemonStatus), [
            textBtn('Restart', () => {
              restartDaemon()
              render()
            }),
            textBtn(
              'Stop',
              () => {
                setDaemonStatus('stopped')
                render()
              },
              true,
            ),
          ]),
        ],
      }),
    )

    body.append(
      SectionBlock({
        icon: icons.bell,
        tone: 'pink',
        title: 'Notifications',
        rows: [
          toggleRow('Menu bar badge', state.notifications.menuBarBadge, (v) => {
            setNotificationPrefs({ menuBarBadge: v })
            render()
          }),
          toggleRow(
            'System notifications',
            state.notifications.systemNotifications,
            (v) => {
              setNotificationPrefs({ systemNotifications: v })
              render()
            },
          ),
          toggleRow('Notification sounds', state.notifications.soundEnabled, (v) => {
            setNotificationPrefs({ soundEnabled: v })
            render()
          }),
          toggleRow('Notify on failures', state.notifications.notifyOnFailure, (v) => {
            setNotificationPrefs({ notifyOnFailure: v })
            render()
          }),
          toggleRow(
            'Notify when review is needed',
            state.notifications.notifyOnReview,
            (v) => {
              setNotificationPrefs({ notifyOnReview: v })
              render()
            },
          ),
        ],
      }),
    )

    const modeControl = el('div', 'settings-segment')
    for (const value of ['review', 'ask'] as const) {
      const btn = button(
        `settings-segment-btn${state.defaultRuleMode === value ? ' active' : ''}`,
        value === 'review' ? 'Review' : 'Ask',
      )
      btn.type = 'button'
      btn.addEventListener('click', () => {
        setDefaultRuleMode(value)
        render()
      })
      modeControl.append(btn)
    }

    const llmControl = el('div', 'settings-segment')
    for (const value of ['cloud', 'local'] as const) {
      const btn = button(
        `settings-segment-btn${state.llm.mode === value ? ' active' : ''}`,
        value === 'cloud' ? 'Cloud' : 'Local',
      )
      btn.type = 'button'
      btn.addEventListener('click', () => {
        setLlm({ mode: value })
        render()
      })
      llmControl.append(btn)
    }

    const otherRows = [
      customRow('Theme', ThemeMenuButton()),
      customRow('Default rule mode', modeControl),
      customRow('Model', llmControl),
      toggleRow('Check for updates', state.other.checkForUpdates, (v) => {
        setOtherPrefs({ checkForUpdates: v })
        render()
      }),
      toggleRow('Keep detailed logs', state.other.keepDetailedLogs, (v) => {
        setOtherPrefs({ keepDetailedLogs: v })
        render()
      }),
      toggleRow('Share anonymous usage data', state.other.shareUsageData, (v) => {
        setOtherPrefs({ shareUsageData: v })
        render()
      }),
    ]

    if (state.llm.mode === 'cloud') {
      otherRows.splice(
        3,
        0,
        inputRow('Provider', state.llm.provider, (v) => {
          setLlm({ provider: v })
          render()
        }),
        inputRow(
          'API key',
          state.llm.apiKey,
          (v) => {
            setLlm({ apiKey: v })
            render()
          },
          true,
        ),
      )
    } else {
      otherRows.splice(
        3,
        0,
        inputRow('Local model path', state.llm.localModelPath, (v) => {
          setLlm({ localModelPath: v })
          render()
        }),
      )
    }

    body.append(
      SectionBlock({
        icon: icons.adjustments,
        tone: 'indigo',
        title: 'Others',
        rows: otherRows,
      }),
    )

    page.append(body)
  }

  render()
  return page
}

function aboutPill(
  svg: string | null,
  label: string,
  tone = '',
  statusDot = false,
) {
  const pill = el('span', `settings-about-pill${tone ? ` ${tone}` : ''}`)
  if (statusDot) {
    pill.append(el('span', 'settings-about-pill-dot'))
  } else if (svg) {
    const icon = el('span', 'settings-about-pill-icon')
    icon.innerHTML = svg
    pill.append(icon)
  }
  pill.append(el('span', undefined, [label]))
  return pill
}

function platformInfo() {
  const ua = navigator.userAgent
  if (ua.includes('Mac')) return { label: 'macOS', icon: icons.apple }
  if (ua.includes('Windows')) return { label: 'Windows', icon: icons.laptop }
  if (ua.includes('Linux')) return { label: 'Linux', icon: icons.laptop }
  return { label: 'Desktop', icon: icons.laptop }
}

function formatProvider(provider?: string) {
  const id = (provider || 'openai').toLowerCase()
  if (id === 'openai') return 'OpenAI'
  if (id === 'anthropic') return 'Anthropic'
  return provider || 'OpenAI'
}

function processCopy(status: ReturnType<typeof getState>['daemonStatus']) {
  if (status === 'running') return { label: 'Running', tone: 'running' as const }
  if (status === 'idle') return { label: 'Idle', tone: 'idle' as const }
  if (status === 'crashed') return { label: 'Crashed', tone: 'crashed' as const }
  return { label: 'Stopped', tone: 'stopped' as const }
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function toggleRow(
  label: string,
  value: boolean,
  onChange: (value: boolean) => void,
) {
  const row = ListRow()
  row.append(el('span', 'settings-row-label', [label]))

  const toggle = button(`settings-toggle${value ? ' on' : ''}`)
  toggle.type = 'button'
  toggle.setAttribute('role', 'switch')
  toggle.setAttribute('aria-checked', String(value))
  toggle.setAttribute('aria-label', label)
  toggle.append(el('span', 'settings-toggle-knob'))
  toggle.addEventListener('click', () => onChange(!value))

  row.append(toggle)
  return row
}

function valueRow(label: string, value: string, actions: HTMLElement[] = []) {
  const row = ListRow()
  const left = el('div', 'settings-row-copy')
  left.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'settings-row-meta', [value]),
  )
  const right = el('div', 'settings-row-actions')
  for (const action of actions) right.append(action)
  row.append(left, right)
  return row
}

function customRow(label: string, control: HTMLElement) {
  const row = ListRow()
  row.append(el('span', 'settings-row-label', [label]), control)
  return row
}

function inputRow(
  label: string,
  value: string,
  onChange: (value: string) => void,
  secret = false,
) {
  const row = ListRow({ className: 'settings-row-input' })
  row.append(el('span', 'settings-row-label', [label]))
  const input = el('input', 'settings-inline-input') as HTMLInputElement
  input.type = secret ? 'password' : 'text'
  input.value = value
  input.placeholder = label
  input.addEventListener('change', () => onChange(input.value))
  row.append(input)
  return row
}

function textBtn(label: string, onClick: () => void, ghost = false) {
  const btn = button(
    `btn ${ghost ? 'btn-ghost' : 'btn-primary'} btn-compact`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}
