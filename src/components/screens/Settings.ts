import { el, button } from '@/lib/dom'
import { ListRow, SectionBlock } from '@/components/shared/SectionBlock'
import { SelectField } from '@/components/shared/FilterBar'
import { icons } from '@/lib/icons'
import { getPreference, setTheme, type ThemePreference } from '@/lib/theme'
import {
  getState,
  navigate,
  restartDaemon,
  setDaemonStatus,
  setDefaultRuleMode,
  setGeneralPrefs,
  setAppearancePrefs,
  setLlm,
  setNotificationPrefs,
  setOtherPrefs,
  setAutomationPrefs,
  setKeybindPrefs,
} from '@/app/store'

export function Settings() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body settings-page')

  const render = () => {
    const state = getState()
    const process = processCopy(state.daemonStatus)

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
      el('span', 'settings-about-version', ['0.2.0']),
    )
    copy.append(
      title,
      el('div', 'settings-about-tagline', [
        'Local automation for your menu bar',
      ]),
    )
    head.append(logo, copy)

    if (state.daemonStatus === 'crashed' || state.daemonStatus === 'stopped') {
      const restart = button('btn btn-ghost btn-compact', 'Restart')
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
          toggleRow(
            'Confirm before quitting',
            state.general.confirmBeforeQuit,
            (v) => {
              setGeneralPrefs({ confirmBeforeQuit: v })
              render()
            },
          ),
          toggleRow(
            'Show title in menu bar',
            state.general.showMenuBarTitle,
            (v) => {
              setGeneralPrefs({ showMenuBarTitle: v })
              render()
            },
          ),
          toggleRow('Show in Dock', state.general.showInDock, (v) => {
            setGeneralPrefs({ showInDock: v })
            render()
          }),
        ],
      }),
    )

    const themeControl = SelectField({
      label: 'Theme',
      value: getPreference(),
      options: [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      onChange: (v) => {
        setTheme(v as ThemePreference)
        render()
      },
    })
    themeControl.classList.add('settings-select')

    body.append(
      SectionBlock({
        icon: icons.pencil,
        tone: 'purple',
        title: 'Appearance',
        rows: [
          customRow('Theme', themeControl),
          toggleRow(
            'Reduce Transparency',
            state.appearance.reduceTransparency,
            (v) => {
              setAppearancePrefs({ reduceTransparency: v })
              render()
            },
          ),
          toggleRow('Reduce motion', state.appearance.reduceMotion, (v) => {
            setAppearancePrefs({ reduceMotion: v })
            render()
          }),
          linkRow('Manage appearance', 'Colors & typography', () =>
            navigate('appearance'),
          ),
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
          toggleRow(
            'Notify on successful runs',
            state.notifications.notifyOnSuccess,
            (v) => {
              setNotificationPrefs({ notifyOnSuccess: v })
              render()
            },
          ),
          toggleRow(
            'Quiet hours (10pm–8am)',
            state.notifications.quietHoursEnabled,
            (v) => {
              setNotificationPrefs({ quietHoursEnabled: v })
              render()
            },
          ),
        ],
      }),
    )

    const autoPromoteControl = SelectField({
      label: 'Auto-promote after',
      value: String(state.automationsPrefs.autoPromoteAfter),
      options: [
        { value: '0', label: 'Never' },
        { value: '3', label: '3 approvals' },
        { value: '5', label: '5 approvals' },
        { value: '10', label: '10 approvals' },
      ],
      onChange: (v) => {
        setAutomationPrefs({ autoPromoteAfter: Number(v) })
        render()
      },
    })
    autoPromoteControl.classList.add('settings-select')

    const concurrentControl = SelectField({
      label: 'Max concurrent runs',
      value: String(state.automationsPrefs.maxConcurrentRuns),
      options: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '5', label: '5' },
      ],
      onChange: (v) => {
        setAutomationPrefs({ maxConcurrentRuns: Number(v) })
        render()
      },
    })
    concurrentControl.classList.add('settings-select')

    body.append(
      SectionBlock({
        icon: icons.bolt,
        tone: 'orange',
        title: 'Automations',
        rows: [
          toggleRow(
            'Confirm destructive actions',
            state.automationsPrefs.confirmDestructiveActions,
            (v) => {
              setAutomationPrefs({ confirmDestructiveActions: v })
              render()
            },
          ),
          toggleRow(
            'Require review for deletes',
            state.automationsPrefs.requireReviewForDeletes,
            (v) => {
              setAutomationPrefs({ requireReviewForDeletes: v })
              render()
            },
          ),
          toggleRow(
            'Pause when Mac is asleep',
            state.automationsPrefs.pauseWhenAsleep,
            (v) => {
              setAutomationPrefs({ pauseWhenAsleep: v })
              render()
            },
          ),
          toggleRow(
            'Pause on battery power',
            state.automationsPrefs.pauseOnBattery,
            (v) => {
              setAutomationPrefs({ pauseOnBattery: v })
              render()
            },
          ),
          customRow('Auto-promote rules', autoPromoteControl),
          customRow('Max concurrent runs', concurrentControl),
          linkRow(
            'Path variables',
            state.pathVariables.length
              ? `${state.pathVariables.length} defined`
              : 'None defined',
            () => navigate('path-variables'),
          ),
        ],
      }),
    )

    const assignedCount = state.automations.filter((a) => a.keybind).length
    body.append(
      SectionBlock({
        icon: icons.key,
        tone: 'indigo',
        title: 'Keybinds',
        rows: [
          toggleRow('Enable keybinds', state.keybinds.enabled, (v) => {
            setKeybindPrefs({ enabled: v })
            render()
          }),
          toggleRow(
            'Only while focused',
            state.keybinds.appFocusedOnly,
            (v) => {
              setKeybindPrefs({ appFocusedOnly: v })
              render()
            },
          ),
          linkRow(
            'Manage keybinds',
            assignedCount
              ? `${assignedCount} assigned`
              : 'None assigned',
            () => navigate('keybinds'),
          ),
        ],
      }),
    )

    const modeControl = SelectField({
      label: 'Default rule mode',
      value: state.defaultRuleMode,
      options: [
        { value: 'review', label: 'Review' },
        { value: 'ask', label: 'Ask' },
      ],
      onChange: (v) => {
        setDefaultRuleMode(v as 'review' | 'ask')
        render()
      },
    })
    modeControl.classList.add('settings-select')

    const llmControl = SelectField({
      label: 'Model',
      value: state.llm.mode,
      options: [
        { value: 'cloud', label: 'Cloud' },
        { value: 'local', label: 'Local' },
      ],
      onChange: (v) => {
        setLlm({ mode: v as 'cloud' | 'local' })
        render()
      },
    })
    llmControl.classList.add('settings-select')

    const clearLogsControl = SelectField({
      label: 'Clear logs after',
      value: String(state.other.clearLogsAfterDays),
      options: [
        { value: '0', label: 'Never' },
        { value: '7', label: '7 days' },
        { value: '30', label: '30 days' },
        { value: '90', label: '90 days' },
      ],
      onChange: (v) => {
        setOtherPrefs({ clearLogsAfterDays: Number(v) })
        render()
      },
    })
    clearLogsControl.classList.add('settings-select')

    body.append(
      SectionBlock({
        icon: icons.adjustments,
        tone: 'gray',
        title: 'Others',
        rows: [
          toggleRow('Check for updates', state.other.checkForUpdates, (v) => {
            setOtherPrefs({ checkForUpdates: v })
            render()
          }),
          toggleRow(
            'Share anonymous usage data',
            state.other.shareUsageData,
            (v) => {
              setOtherPrefs({ shareUsageData: v })
              render()
            },
          ),
        ],
      }),
    )

    body.append(
      SectionBlock({
        icon: icons.shield,
        tone: 'green',
        title: 'Privacy & data',
        rows: [
          toggleRow(
            'Allow cloud connectors',
            state.other.allowCloudConnectors,
            (v) => {
              setOtherPrefs({ allowCloudConnectors: v })
              render()
            },
          ),
          customRow('Auto-clear logs', clearLogsControl),
          valueRow('Local data', 'Rules, logs, and preferences', [
            textBtn(
              'Export',
              () => {
                const blob = new Blob([JSON.stringify(getState(), null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'emmi-data.json'
                a.click()
                URL.revokeObjectURL(url)
              },
              true,
            ),
            textBtn(
              'Reset',
              () => {
                localStorage.clear()
                location.reload()
              },
              true,
            ),
          ]),
        ],
      }),
    )

    const advancedRows = [
      valueRow('Background process', statusLabel(state.daemonStatus), [
        textBtn('Restart', () => {
          restartDaemon()
          render()
        }, true),
        textBtn(
          'Stop',
          () => {
            setDaemonStatus('stopped')
            render()
          },
          true,
        ),
      ]),
      customRow('Default rule mode', modeControl),
      customRow('Model', llmControl),
      toggleRow('Keep detailed logs', state.other.keepDetailedLogs, (v) => {
        setOtherPrefs({ keepDetailedLogs: v })
        render()
      }),
      toggleRow('Verbose daemon logs', state.other.verboseDaemonLogs, (v) => {
        setOtherPrefs({ verboseDaemonLogs: v })
        render()
      }),
      toggleRow(
        'Show experimental connectors',
        state.other.showExperimentalConnectors,
        (v) => {
          setOtherPrefs({ showExperimentalConnectors: v })
          render()
        },
      ),
    ]

    if (state.llm.mode === 'cloud') {
      advancedRows.splice(
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
      advancedRows.splice(
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
        icon: icons.cpu,
        tone: 'purple',
        title: 'Advanced',
        rows: advancedRows,
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

function linkRow(label: string, meta: string, onClick: () => void) {
  const row = button('settings-row settings-row-button')
  row.type = 'button'
  const left = el('div', 'settings-row-copy')
  left.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'settings-row-meta', [meta]),
  )
  const chevron = el('span', 'settings-row-chevron')
  chevron.innerHTML = icons.chevronRight
  row.append(left, chevron)
  row.addEventListener('click', onClick)
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
