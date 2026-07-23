import { el, button } from '@/lib/dom'
import { EmptyState } from '@/components/shared/layout'
import { PathField } from '@/components/shared/controls'
import { icons } from '@/lib/icons'
import {
  createPathVariable,
  deletePathVariable,
  getState,
  updatePathVariable,
} from '@/app/store'
import type { PathVariable } from '@/types/domain'

export function PathVariables() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body path-vars-page')

  const render = () => {
    const state = getState()
    page.replaceChildren()
    body.replaceChildren()

    const head = el('div', 'path-vars-head')
    head.append(
      el('div', 'path-vars-title', ['Path variables']),
      el('p', 'path-vars-copy', [
        'Give folders short names. Anywhere a path appears, Emmi shows the name instead.',
      ]),
    )
    body.append(head)

    const add = button('btn btn-ghost btn-compact path-vars-add', 'Add variable')
    add.type = 'button'
    add.addEventListener('click', () => {
      createPathVariable({ name: '', path: '~/' })
      render()
      const inputs = body.querySelectorAll<HTMLInputElement>('.path-vars-name')
      inputs[inputs.length - 1]?.focus()
    })

    if (!state.pathVariables.length) {
      body.append(
        EmptyState({
          title: 'No path variables',
          body: 'Add a name and folder path to keep long paths out of the UI.',
          actionLabel: 'Add variable',
          onAction: () => {
            createPathVariable({ name: '', path: '~/' })
            render()
          },
        }),
      )
      page.append(body)
      return
    }

    const list = el('div', 'path-vars-list')
    const cols = el('div', 'path-vars-cols')
    cols.append(
      el('span', 'path-vars-col', ['Name']),
      el('span', 'path-vars-col', ['Path']),
      el('span', 'path-vars-col path-vars-col-action', ['']),
    )
    list.append(cols)

    for (const variable of state.pathVariables) {
      list.append(variableRow(variable, render))
    }

    body.append(list, add)
    page.append(body)
  }

  render()
  return page
}

function variableRow(variable: PathVariable, refresh: () => void) {
  const row = el('div', 'path-vars-row')

  const name = el('input', 'panel-input path-vars-name') as HTMLInputElement
  name.type = 'text'
  name.placeholder = 'Pictures'
  name.value = variable.name
  name.spellcheck = false
  name.addEventListener('input', () => {
    updatePathVariable(variable.id, { name: name.value })
  })

  const path = PathField({
    value: variable.path,
    placeholder: '~/Pictures',
    className: 'path-vars-path',
    kind: 'folder',
    title: 'Choose folder',
    onChange: (value) => updatePathVariable(variable.id, { path: value }),
  })

  const remove = button('btn btn-icon path-vars-remove')
  remove.type = 'button'
  remove.title = 'Remove'
  remove.setAttribute('aria-label', 'Remove variable')
  remove.innerHTML = icons.x
  remove.addEventListener('click', () => {
    deletePathVariable(variable.id)
    refresh()
  })

  row.append(name, path, remove)
  return row
}
