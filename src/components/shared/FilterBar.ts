import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'

export type FilterControl =
  | { type: 'search'; placeholder: string; value: string; onChange: (v: string) => void }
  | {
      type: 'select'
      label: string
      value: string
      options: { value: string; label: string }[]
      onChange: (v: string) => void
    }

export function FilterBar(controls: FilterControl[]) {
  const bar = el('div', 'filter-bar')

  for (const control of controls) {
    if (control.type === 'search') {
      bar.append(SearchField(control))
      continue
    }
    bar.append(SelectField(control))
  }

  return bar
}

function SearchField(control: {
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
  input.placeholder = control.placeholder
  input.value = control.value
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('spellcheck', 'false')

  const clear = el('button', 'search-field-clear') as HTMLButtonElement
  clear.type = 'button'
  clear.title = 'Clear'
  clear.setAttribute('aria-label', 'Clear search')
  clear.innerHTML = icons.x
  clear.hidden = !control.value

  const sync = (value: string) => {
    clear.hidden = !value
    control.onChange(value)
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

export function SelectField(control: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const wrap = el('div', 'filter-select-wrap')
  const current =
    control.options.find((option) => option.value === control.value) ??
    control.options[0]

  const trigger = button('filter-select-field')
  trigger.type = 'button'
  trigger.setAttribute('aria-label', control.label)
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
    document
      .querySelectorAll('.filter-select-menu:not([hidden])')
      .forEach((node) => {
        const parent = node.parentElement
        parent?.querySelector('.filter-select-field')?.classList.remove('open')
        parent
          ?.querySelector('.filter-select-field')
          ?.setAttribute('aria-expanded', 'false')
        ;(node as HTMLElement).hidden = true
      })

    menu.replaceChildren(
      ...control.options.map((option) => {
        const active = option.value === control.value
        const item = button(
          `filter-select-item${active ? ' active' : ''}`,
        )
        item.type = 'button'
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(active))
        item.innerHTML = `<span>${option.label}</span>`
        item.addEventListener('click', (event) => {
          event.stopPropagation()
          close()
          if (option.value !== control.value) control.onChange(option.value)
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
