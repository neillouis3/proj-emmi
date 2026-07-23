import { el, button } from '@/lib/dom'
import { PageToolbar, createTabs } from '@/components/shared/layout'
import {
  Btn,
  FieldRow,
  SelectField,
  TextField,
} from '@/components/shared/controls'
import { KeybindField } from '@/components/shared/KeybindField'
import { RuleStepList } from '@/components/shared/RuleStepList'
import {
  clearEditingAutomation,
  createAutomation,
  getState,
  loadAutomationForEdit,
  navigate,
  saveAutomation,
  showBlocking,
} from '@/app/store'
import { blankRuleSteps } from '@/lib/rules'
import { fetchRecipe, fetchRecipes, type RecipeSummary } from '@/lib/daemonClient'
import { normalizeStep } from '@/lib/stepOps'
import type { Automation, AutomationStep, AutomationTrigger, RunMode } from '@/types/domain'
import { formatRunMode, RUN_MODES } from '@/lib/runMode'

export function AutomationNew() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body create-page create-page-automation')
  const editingId = getState().editingAutomationId ?? undefined
  body.append(
    AutomationForm({
      automationId: editingId,
      onDone: () => {
        clearEditingAutomation()
        navigate('automations')
      },
    }),
  )
  page.append(body)
  return page
}

function AutomationForm(opts: { automationId?: string; onDone: () => void }) {
  const isEdit = !!opts.automationId
  if (isEdit && opts.automationId) {
    const cached = getState().automations.find((a) => a.id === opts.automationId)
    if (!cached) {
      const empty = el('div')
      queueMicrotask(opts.onDone)
      return empty
    }
    const wrap = el('div', 'auto-create-page')
    wrap.append(el('p', 'auto-create-loading', ['Loading automation…']))
    void loadAutomationForEdit(opts.automationId).then((fresh) => {
      if (!fresh) {
        opts.onDone()
        return
      }
      wrap.replaceChildren(buildAutomationFormInner(fresh, opts))
    })
    return wrap
  }

  return buildAutomationFormInner(undefined, opts)
}

function buildAutomationFormInner(
  existing: Automation | undefined,
  opts: { automationId?: string; onDone: () => void },
) {
  const isEdit = !!opts.automationId
  const state = getState()
  const wrap = el('div', 'auto-create-page')

  const name = TextField({
    value: existing?.name ?? '',
    placeholder: 'Name',
    className: 'auto-create-name',
    onChange: () => {},
  })

  const initialDescription = existing?.description ?? ''

  const description = TextField({
    value: initialDescription,
    placeholder: 'What does this automation do?',
    multiline: true,
    className: 'auto-create-description',
    onChange: () => {},
  })

  let triggerValue: AutomationTrigger = existing?.trigger ?? 'manual'
  let keybindValue: string | null = existing?.keybind ?? null
  let cronValue = existing?.schedule?.cron?.trim() || '0 9 * * 1-5'
  let watchPaths: string[] = existing?.watch?.paths?.length
    ? [...existing.watch.paths]
    : ['~/Downloads']
  let watchDebounceMs = existing?.watch?.debounceMs ?? 1500
  let active = existing?.active ?? true
  let modeValue: RunMode = existing?.defaultMode ?? 'review'
  let steps: AutomationStep[] = existing
    ? existing.steps.map(normalizeStep)
    : blankRuleSteps().map(normalizeStep)

  const cronPresets = [
    { cron: '0 9 * * 1-5', label: 'Weekdays 9am' },
    { cron: '0 8 * * *', label: 'Daily 8am' },
    { cron: '0 9 * * 1', label: 'Mondays 9am' },
    { cron: '*/15 * * * *', label: 'Every 15m' },
    { cron: '0 * * * *', label: 'Hourly' },
  ]

  const keybindSuggestions = [
    { value: 'CommandOrControl+Shift+D', label: '⌘⇧D' },
    { value: 'CommandOrControl+Shift+E', label: '⌘⇧E' },
    { value: 'CommandOrControl+Shift+G', label: '⌘⇧G' },
  ]

  const watchQuickPaths = ['~/Desktop', '~/Downloads', '~/Documents']

  const starterHost = el('div', 'auto-create-starter')
  let recipes: RecipeSummary[] = []
  let selectedStarter = 'blank'

  const paintStarter = () => {
    const chips = el('div', 'rule-create-chips')
    const blankChip = button(
      `rule-create-chip${selectedStarter === 'blank' ? ' active' : ''}`,
      'Blank',
    )
    blankChip.type = 'button'
    blankChip.addEventListener('click', () => {
      selectedStarter = 'blank'
      steps = blankRuleSteps().map(normalizeStep)
      stepList.setSteps(steps)
      paintStarter()
    })
    chips.append(blankChip)
    for (const recipe of recipes) {
      const chip = button(
        `rule-create-chip${selectedStarter === recipe.id ? ' active' : ''}`,
        recipe.name,
      )
      chip.type = 'button'
      chip.title = recipe.description || recipe.triggerSummary
      chip.addEventListener('click', () => hydrateFromRecipe(recipe))
      chips.append(chip)
    }
    starterHost.replaceChildren(
      chips,
      el('p', 'muted auto-create-hint', [
        'Start blank or from a curated recipe — edit anything before you create it.',
      ]),
    )
  }

  const hydrateFromRecipe = (summary: RecipeSummary) => {
    selectedStarter = summary.id
    paintStarter()
    void (async () => {
      let recipe: Automation
      try {
        recipe = await fetchRecipe(summary.id)
      } catch {
        return
      }
      name.value = recipe.name ?? ''
      description.value = recipe.description ?? ''
      triggerValue = recipe.trigger ?? 'manual'
      if (recipe.schedule?.cron) {
        cronValue = recipe.schedule.cron
        cronField.value = cronValue
      }
      if (recipe.watch?.paths?.length) {
        watchPaths = [...recipe.watch.paths]
        if (typeof recipe.watch.debounceMs === 'number') {
          watchDebounceMs = recipe.watch.debounceMs
        }
      }
      keybindValue = recipe.keybind ?? null
      modeValue = recipe.defaultMode ?? 'review'
      // Installed copies start paused — the user opts in after reviewing.
      active = false
      activeToggle.classList.toggle('on', active)
      steps = recipe.steps.map(normalizeStep)
      mountTrigger()
      syncTriggerHosts()
      remountKeybind()
      paintWatchPaths()
      modeSeg.refresh()
      stepList.setSteps(steps)
    })()
  }

  const triggerHost = el('div', 'auto-create-picker')
  const keybindHost = el('div', 'auto-create-keybind')
  const scheduleHost = el('div', 'auto-create-schedule')
  const watchHost = el('div', 'auto-create-watch')

  const syncTriggerHosts = () => {
    // Keybind is optional for any trigger; required UI emphasis when trigger=keybind
    keybindHost.hidden = false
    scheduleHost.hidden = triggerValue !== 'schedule'
    watchHost.hidden = triggerValue !== 'watch'
  }

  const mountTrigger = () => {
    triggerHost.replaceChildren(
      SelectField({
        label: 'Trigger',
        value: triggerValue,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'keybind', label: 'Keybind' },
          { value: 'schedule', label: 'Schedule' },
          { value: 'watch', label: 'Folder watch' },
          { value: 'cli', label: 'CLI' },
        ],
        onChange: (v) => {
          triggerValue = v as AutomationTrigger
          syncTriggerHosts()
          mountTrigger()
          paintKeybindExtras()
        },
      }),
    )
  }

  const remountKeybind = () => {
    keybindHost.replaceChildren(
      KeybindField({
        value: keybindValue,
        automations: state.automations,
        ignoreId: existing?.id,
        disabled: !state.keybinds.enabled,
        onChange: (v) => {
          keybindValue = v
        },
      }),
      keybindExtras,
    )
    paintKeybindExtras()
  }

  const keybindExtras = el('div', 'auto-create-keybind-extras')
  const paintKeybindExtras = () => {
    keybindExtras.replaceChildren()
    if (!state.keybinds.enabled) {
      const hint = el('p', 'muted auto-create-hint')
      const link = button('automation-detail-link', 'Open Keybinds')
      link.type = 'button'
      link.addEventListener('click', () => navigate('keybinds'))
      hint.append(
        document.createTextNode('Shortcuts are off. '),
        link,
        document.createTextNode(' to turn them on.'),
      )
      keybindExtras.append(hint)
    } else {
      keybindExtras.append(
        el('p', 'muted auto-create-hint', [
          triggerValue === 'keybind'
            ? 'Required — capture a shortcut or tap a suggestion.'
            : 'Optional — run this automation from the keyboard anytime.',
        ]),
      )
    }
    const chips = el('div', 'rule-create-chips')
    for (const sug of keybindSuggestions) {
      const chip = button(
        `rule-create-chip${keybindValue === sug.value ? ' active' : ''}`,
        sug.label,
      )
      chip.type = 'button'
      chip.title = sug.value
      chip.addEventListener('click', () => {
        keybindValue = sug.value
        remountKeybind()
      })
      chips.append(chip)
    }
    keybindExtras.append(chips)
  }

  const cronField = TextField({
    value: cronValue,
    placeholder: '0 9 * * 1-5',
    className: 'auto-create-cron',
    onChange: (v) => {
      cronValue = v
    },
  })
  const cronPresetsRow = el('div', 'rule-create-chips auto-create-cron-presets')
  for (const preset of cronPresets) {
    const chip = button('rule-create-chip', preset.label)
    chip.type = 'button'
    chip.addEventListener('click', () => {
      cronValue = preset.cron
      cronField.value = preset.cron
    })
    cronPresetsRow.append(chip)
  }
  scheduleHost.append(
    FieldRow({
      label: 'Cron',
      control: cronField,
      className: 'auto-create-field',
    }),
    cronPresetsRow,
    el('p', 'muted auto-create-hint', [
      'Example: weekdays at 9am opens your morning tabs without opening Emmi.',
    ]),
  )

  const paintWatchPaths = () => {
    watchHost.replaceChildren()
    watchHost.append(el('div', 'shell-perm-label', ['Folders']))
    const chips = el('div', 'rule-create-chips')
    for (const folder of watchPaths) {
      const chip = button('rule-create-chip', folder)
      chip.type = 'button'
      chip.title = 'Remove folder'
      chip.addEventListener('click', () => {
        watchPaths = watchPaths.filter((p) => p !== folder)
        paintWatchPaths()
      })
      chips.append(chip)
    }
    watchHost.append(chips)

    const quick = el('div', 'rule-create-chips')
    for (const folder of watchQuickPaths) {
      if (watchPaths.includes(folder)) continue
      const chip = button('rule-create-chip', folder.replace('~/', ''))
      chip.type = 'button'
      chip.title = `Watch ${folder}`
      chip.addEventListener('click', () => {
        watchPaths = [...watchPaths, folder]
        paintWatchPaths()
      })
      quick.append(chip)
    }
    if (quick.childNodes.length) {
      watchHost.append(el('div', 'shell-perm-label', ['Quick add']))
      watchHost.append(quick)
    }

    const addFolder = Btn({
      label: 'Add folder',
      variant: 'ghost',
      className: 'btn-compact',
      onClick: () => {
        void (async () => {
          const picked = await window.emmi?.pickPath?.({
            kind: 'folder',
            title: 'Watch folder',
          })
          if (typeof picked !== 'string' || !picked) return
          if (watchPaths.includes(picked)) return
          watchPaths = [...watchPaths, picked]
          paintWatchPaths()
        })()
      },
    })
    watchHost.append(addFolder)
    watchHost.append(
      el('p', 'muted auto-create-hint', [
        'Fires when files are added or changed — not when they leave (so moves won’t loop).',
      ]),
    )
  }
  paintWatchPaths()

  mountTrigger()
  syncTriggerHosts()
  remountKeybind()

  let stepList: ReturnType<typeof RuleStepList>

  const modeSeg = createTabs({
    getValue: () => modeValue,
    variant: 'segment',
    options: RUN_MODES.map((m) => ({ value: m, label: formatRunMode(m) })),
    onChange: (v) => {
      modeValue = v as RunMode
      modeSeg.refresh()
    },
  })

  const activeToggle = button(`settings-toggle${active ? ' on' : ''}`)
  activeToggle.type = 'button'
  activeToggle.setAttribute('aria-label', 'Start active')
  activeToggle.append(el('span', 'settings-toggle-knob'))
  activeToggle.addEventListener('click', () => {
    active = !active
    activeToggle.classList.toggle('on', active)
  })

  let saving = false
  const submit = Btn({
    label: isEdit ? 'Save' : 'Create',
    variant: 'primary',
    onClick: () => {
      void (async () => {
        if (saving) return
        // Snapshot from the real inputs immediately — don't let async work read stale UI.
        const nameText = name.input.value.trim()
        const descriptionText = description.input.value.trim()
        if (!nameText) {
          name.focus()
          return
        }
        if (triggerValue === 'keybind' && !keybindValue) {
          keybindHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return
        }
        if (triggerValue === 'schedule' && !cronValue.trim()) {
          scheduleHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return
        }
        if (triggerValue === 'watch' && !watchPaths.length) {
          watchHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return
        }
        const cleaned = stepList.getSteps()
        if (!cleaned.length) return

        const payload = {
          name: nameText,
          description: descriptionText,
          trigger: triggerValue,
          defaultMode: modeValue,
          steps: cleaned,
          keybind: keybindValue,
          keybindEnabled: existing?.keybindEnabled ?? true,
          active,
          schedule:
            triggerValue === 'schedule'
              ? { cron: cronValue.trim() }
              : null,
          watch:
            triggerValue === 'watch'
              ? { paths: [...watchPaths], debounceMs: watchDebounceMs }
              : null,
        }
        saving = true
        submit.disabled = true

        try {
          const ok =
            isEdit && opts.automationId
              ? await saveAutomation(opts.automationId, payload)
              : await createAutomation(payload)
          if (ok) {
            opts.onDone()
            return
          }
          showBlocking({
            id: `save-failed-${Date.now()}`,
            kind: 'action-failed',
            title: 'Could not save',
            body: 'Emmi could not write this automation. Check that the daemon is running and try again.',
            primaryLabel: 'OK',
            secondaryLabel: 'Dismiss',
            connectorId: 'fs',
          })
        } finally {
          saving = false
          submit.disabled = false
        }
      })()
    },
  })

  wrap.append(
    PageToolbar({
      leading: [name],
      actions: [
        Btn({ label: 'Cancel', variant: 'ghost', onClick: opts.onDone }),
        submit,
      ],
    }),
    FieldRow({
      label: 'Description',
      control: description,
      className: 'auto-create-field auto-create-description-row',
    }),
  )

  if (!isEdit) {
    wrap.append(
      el('div', 'auto-create-section-label', ['Start from']),
      starterHost,
    )
    paintStarter()
    void (async () => {
      try {
        recipes = await fetchRecipes()
      } catch {
        recipes = []
      }
      paintStarter()
    })()
  }

  wrap.append(
    el('div', 'auto-create-grid', [
      FieldRow({ label: 'Trigger', control: triggerHost }),
      FieldRow({ label: 'Mode', control: modeSeg.root }),
    ]),
    keybindHost,
    scheduleHost,
    watchHost,
    el('div', 'auto-create-active-row', [
      el('span', 'auto-create-active-label', ['Start active']),
      activeToggle,
    ]),
    el('div', 'auto-create-section-label', ['Steps']),
  )

  stepList = RuleStepList({
    steps,
    onChange: (next) => {
      steps = next
      if (!isEdit) {
        selectedStarter = 'blank'
        paintStarter()
      }
    },
  })
  wrap.append(stepList)

  queueMicrotask(() => name.focus())
  return wrap
}
