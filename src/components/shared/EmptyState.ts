import { el, button } from '@/lib/dom'

export function EmptyState(opts: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  const wrap = el('div', 'empty-state')
  wrap.append(el('h2', 'empty-title', [opts.title]), el('p', 'empty-body', [opts.body]))
  if (opts.actionLabel && opts.onAction) {
    const btn = button('btn btn-ghost btn-compact', opts.actionLabel)
    btn.addEventListener('click', opts.onAction)
    wrap.append(btn)
  }
  return wrap
}
