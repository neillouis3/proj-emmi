import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import {
  getPreference,
  onThemeChange,
  setTheme,
  type ThemePreference,
} from '@/lib/theme'

export const THEME_OPTIONS: FieldOption[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const THEME_ICONS: Record<ThemePreference, string> = {
  system: icons.laptop,
  light: icons.sun,
  dark: icons.moon,
}

export type FieldOption = { value: string; label: string }

export type FilterControl =
  | { type: 'search'; placeholder: string; value: string; onChange: (v: string) => void }
  | {
      type: 'select'
      label: string
      value: string
      options: FieldOption[]
      onChange: (v: string) => void
    }

// — Buttons —

export function Btn(opts: {
  label: string
  variant?: 'primary' | 'ghost'
  compact?: boolean
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  const parts = ['btn']
  if (opts.variant === 'primary') parts.push('btn-primary')
  if (opts.variant === 'ghost') parts.push('btn-ghost')
  if (opts.compact !== false) parts.push('btn-compact')
  if (opts.className) parts.push(opts.className)
  const btn = button(parts.join(' '), opts.label)
  if (opts.disabled) btn.disabled = true
  btn.addEventListener('click', opts.onClick)
  return btn
}

export function IconBtn(opts: {
  svg: string
  label: string
  className?: string
  tone?: 'approve' | 'reject'
  icon?: boolean
  disabled?: boolean
  onClick: (e: MouseEvent) => void
}) {
  const parts = ['btn']
  if (opts.icon !== false) parts.push('btn-icon')
  if (opts.tone) parts.push(`tone-${opts.tone}`)
  if (opts.className) parts.push(opts.className)
  const btn = button(parts.join(' '))
  btn.title = opts.label
  btn.setAttribute('aria-label', opts.label)
  btn.innerHTML = opts.svg
  if (opts.disabled) btn.disabled = true
  btn.addEventListener('click', opts.onClick)
  return btn
}

// — Text fields —

export type TextFieldOptions = {
  value?: string
  placeholder?: string
  multiline?: boolean
  className?: string
  onChange: (value: string) => void
}

export function TextField(opts: TextFieldOptions) {
  const wrap = el(
    'div',
    `field-input${opts.multiline ? ' is-multiline' : ''} ${opts.className ?? ''}`.trim(),
  )
  const input = opts.multiline
    ? (el('textarea', 'field-input-control field-input-textarea') as HTMLTextAreaElement)
    : (el('input', 'field-input-control') as HTMLInputElement)
  if (!opts.multiline) (input as HTMLInputElement).type = 'text'
  input.placeholder = opts.placeholder ?? ''
  input.value = opts.value ?? ''
  input.spellcheck = false
  input.autocomplete = 'off'
  input.addEventListener('input', () => opts.onChange(input.value))
  wrap.append(input)

  return Object.assign(wrap, {
    input,
    get value() {
      return input.value
    },
    set value(next: string) {
      input.value = next
    },
    focus() {
      input.focus()
    },
  })
}

export function SearchField(opts: {
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const wrap = el('div', 'search-field')
  const icon = el('span', 'search-field-icon')
  icon.innerHTML = icons.search
  icon.setAttribute('aria-hidden', 'true')

  const input = el('input', 'search-field-input') as HTMLInputElement
  input.type = 'search'
  input.placeholder = opts.placeholder
  input.value = opts.value
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('spellcheck', 'false')

  const clear = el('button', 'search-field-clear') as HTMLButtonElement
  clear.type = 'button'
  clear.title = 'Clear'
  clear.setAttribute('aria-label', 'Clear search')
  clear.innerHTML = icons.x
  clear.hidden = !opts.value

  const sync = (value: string) => {
    clear.hidden = !value
    opts.onChange(value)
  }

  input.addEventListener('input', () => sync(input.value))
  clear.addEventListener('click', () => {
    input.value = ''
    input.focus()
    sync('')
  })

  wrap.append(icon, input, clear)
  return wrap
}

export function SelectField(opts: {
  label: string
  value: string
  options: FieldOption[]
  onChange: (v: string) => void
}) {
  const wrap = el('div', 'filter-select-wrap')
  const current = opts.options.find((option) => option.value === opts.value) ?? opts.options[0]

  const trigger = button('filter-select-field')
  trigger.setAttribute('aria-label', opts.label)
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')

  const valueEl = el('span', 'filter-select-value', [current?.label ?? ''])
  const chevron = el('span', 'filter-select-chevron')
  chevron.innerHTML = icons.chevronUpDown
  chevron.setAttribute('aria-hidden', 'true')
  trigger.append(valueEl, chevron)

  const menu = el('div', 'filter-select-menu')
  menu.hidden = true
  menu.setAttribute('role', 'listbox')

  const close = () => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    trigger.classList.remove('open')
  }

  const open = () => {
    document.querySelectorAll('.filter-select-menu:not([hidden])').forEach((node) => {
      const parent = node.parentElement
      parent?.querySelector('.filter-select-field')?.classList.remove('open')
      parent?.querySelector('.filter-select-field')?.setAttribute('aria-expanded', 'false')
      ;(node as HTMLElement).hidden = true
    })

    menu.replaceChildren(
      ...opts.options.map((option) => {
        const active = option.value === opts.value
        const item = button(`filter-select-item${active ? ' active' : ''}`)
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(active))
        item.innerHTML = `<span>${option.label}</span>`
        item.addEventListener('click', (event) => {
          event.stopPropagation()
          close()
          if (option.value !== opts.value) opts.onChange(option.value)
        })
        return item
      }),
    )

    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    trigger.classList.add('open')
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    if (menu.hidden) open()
    else close()
  })

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target as Node)) close()
  })

  wrap.append(trigger, menu)
  return wrap
}

export function PathField(opts: {
  value?: string
  placeholder?: string
  className?: string
  kind?: 'file' | 'folder'
  title?: string
  filters?: { name: string; extensions: string[] }[]
  formatPicked?: (path: string) => string
  onChange: (value: string) => void
}) {
  const wrap = el('div', `path-field ${opts.className ?? ''}`.trim())
  const shell = el('div', 'field-input path-field-shell')
  const input = el('input', 'field-input-control path-field-input') as HTMLInputElement
  input.type = 'text'
  input.placeholder = opts.placeholder ?? '~/Documents'
  input.value = opts.value ?? ''
  input.spellcheck = false
  input.autocomplete = 'off'

  const browse = Btn({
    label: 'Browse',
    variant: 'ghost',
    className: 'path-field-browse',
    onClick: () => {
      void (async () => {
        const picked = await window.emmi?.pickPath?.({
          kind: opts.kind ?? 'folder',
          title: opts.title,
          filters: opts.filters,
        })
        if (typeof picked !== 'string' || !picked) return
        input.value = opts.formatPicked ? opts.formatPicked(picked) : picked
        emit()
      })()
    },
  })

  const emit = () => opts.onChange(input.value)
  input.addEventListener('input', emit)
  input.addEventListener('change', emit)

  shell.append(input)
  wrap.append(shell, browse)

  return Object.assign(wrap, {
    get value() {
      return input.value
    },
    set value(next: string) {
      input.value = next
    },
    focus() {
      input.focus()
    },
    input,
  })
}

export function FieldRow(opts: {
  label: string
  control: HTMLElement
  className?: string
  labelClass?: string
}) {
  const wrap = el('div', opts.className ?? 'auto-create-field')
  wrap.append(
    el('span', opts.labelClass ?? 'auto-create-field-label', [opts.label]),
    opts.control,
  )
  return wrap
}

export function FilterBar(controls: FilterControl[]) {
  const bar = el('div', 'filter-bar')
  for (const control of controls) {
    if (control.type === 'search') bar.append(SearchField(control))
    else bar.append(SelectField(control))
  }
  return bar
}

/** Shared theme picker — same SelectField used in Settings and the sidebar. */
export function ThemeField(opts?: { className?: string; onChange?: () => void }) {
  const root = el('div', 'theme-field')
  if (opts?.className) {
    for (const part of opts.className.split(/\s+/).filter(Boolean)) {
      root.classList.add(part)
    }
  }

  const paint = () => {
    root.replaceChildren(
      SelectField({
        label: 'Theme',
        value: getPreference(),
        options: THEME_OPTIONS,
        onChange: (v) => {
          setTheme(v as ThemePreference)
          opts?.onChange?.()
        },
      }),
    )
  }

  paint()
  onThemeChange(paint)
  return root
}

function closeOpenSelectMenus(except?: HTMLElement) {
  document.querySelectorAll('.filter-select-menu:not([hidden])').forEach((node) => {
    const parent = node.parentElement
    if (except && parent === except) return
    parent?.querySelector('.filter-select-field, .theme-icon-btn')?.classList.remove('open')
    parent
      ?.querySelector('.filter-select-field, .theme-icon-btn')
      ?.setAttribute('aria-expanded', 'false')
    ;(node as HTMLElement).hidden = true
  })
}

/** Sidebar theme control — icon trigger, same menu options as ThemeField. */
export function ThemeIconButton(opts?: { onChange?: () => void }) {
  const wrap = el('div', 'theme-icon-wrap')
  const trigger = button('icon-btn theme-icon-btn')
  trigger.setAttribute('aria-label', 'Theme')
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')

  const menu = el('div', 'filter-select-menu')
  menu.hidden = true
  menu.setAttribute('role', 'listbox')

  const close = () => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    trigger.classList.remove('open')
  }

  const paintTrigger = () => {
    const preference = getPreference()
    trigger.innerHTML = THEME_ICONS[preference] ?? THEME_ICONS.system
    const label = THEME_OPTIONS.find((o) => o.value === preference)?.label ?? 'System'
    trigger.title = `Theme: ${label}`
  }

  const open = () => {
    closeOpenSelectMenus(wrap)
    const preference = getPreference()
    menu.replaceChildren(
      ...THEME_OPTIONS.map((option) => {
        const active = option.value === preference
        const item = button(`filter-select-item${active ? ' active' : ''}`)
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(active))
        item.innerHTML = `<span>${option.label}</span>`
        item.addEventListener('click', (event) => {
          event.stopPropagation()
          close()
          if (option.value !== preference) {
            setTheme(option.value as ThemePreference)
            opts?.onChange?.()
          }
        })
        return item
      }),
    )
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    trigger.classList.add('open')
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    if (menu.hidden) open()
    else close()
  })

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target as Node)) close()
  })

  onThemeChange(() => {
    paintTrigger()
    if (!menu.hidden) open()
  })

  paintTrigger()
  wrap.append(trigger, menu)
  return wrap
}
