import { el, button } from '@/lib/dom'
import { PathField, TextField } from '@/components/shared/controls'
import type { RouteRow } from '@/types/domain'

export type RouteTableValue = {
  routes: RouteRow[]
  fallback: string
}

type RouteTableFieldOpts = {
  value: RouteTableValue
  onChange: (value: RouteTableValue) => void
}

/** Editable match → destination table for an fs.route step. */
export function RouteTableField(opts: RouteTableFieldOpts) {
  const root = el('div', 'route-table')
  let value: RouteTableValue = {
    routes: opts.value.routes.map((r) => ({ ...r })),
    fallback: opts.value.fallback,
  }

  const emit = () => opts.onChange({
    routes: value.routes.map((r) => ({ ...r })),
    fallback: value.fallback,
  })

  const paint = () => {
    root.replaceChildren()

    const head = el('div', 'route-table-head')
    head.append(
      el('span', 'route-table-col-label', ['Key']),
      el('span', 'route-table-col-label', ['Value']),
      el('span', 'route-table-col-actions'),
    )
    root.append(head)

    const body = el('div', 'route-table-body')
    value.routes.forEach((row, index) => {
      body.append(rowEl(row, index))
    })
    root.append(body)

    const add = button('btn btn-ghost btn-compact route-table-add', 'Add row')
    add.type = 'button'
    add.addEventListener('click', () => {
      value = {
        ...value,
        routes: [...value.routes, { match: '', dest: '' }],
      }
      emit()
      paint()
    })
    root.append(add)

    const fallback = el('div', 'route-table-fallback')
    fallback.append(
      el('span', 'route-table-fallback-label', ['Fallback →']),
      PathField({
        value: value.fallback,
        placeholder: '~/Desktop/Other',
        kind: 'folder',
        title: 'Fallback folder',
        onChange: (dest) => {
          value = { ...value, fallback: dest }
          emit()
        },
      }),
    )
    root.append(fallback)
  }

  const rowEl = (row: RouteRow, index: number) => {
    const line = el('div', 'route-table-row')

    const match = TextField({
      value: row.match,
      placeholder: 'png, jpg',
      className: 'route-table-match',
      onChange: (next) => {
        value.routes[index] = { ...value.routes[index], match: next }
        emit()
      },
    })

    const dest = PathField({
      value: row.dest,
      placeholder: '~/Pictures',
      kind: 'folder',
      title: 'Destination folder',
      onChange: (next) => {
        value.routes[index] = { ...value.routes[index], dest: next }
        emit()
      },
    })

    const remove = button('btn btn-icon btn-ghost route-table-remove')
    remove.textContent = '×'
    remove.type = 'button'
    remove.title = 'Remove row'
    remove.setAttribute('aria-label', 'Remove row')
    remove.disabled = value.routes.length <= 1
    remove.addEventListener('click', () => {
      if (value.routes.length <= 1) return
      value = {
        ...value,
        routes: value.routes.filter((_, i) => i !== index),
      }
      emit()
      paint()
    })

    line.append(match, dest, remove)
    return line
  }

  paint()
  return root
}
