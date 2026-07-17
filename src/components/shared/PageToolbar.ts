import { el } from '@/lib/dom'

/** Top row for filters (left) and primary actions (right). */
export function PageToolbar(opts: {
  leading?: HTMLElement[]
  actions?: HTMLElement[]
}) {
  const bar = el('div', 'page-toolbar')
  if (opts.leading?.length) {
    const left = el('div', 'page-toolbar-leading')
    left.append(...opts.leading)
    bar.append(left)
  }
  if (opts.actions?.length) {
    const right = el('div', 'page-toolbar-actions')
    right.append(...opts.actions)
    bar.append(right)
  }
  return bar
}
