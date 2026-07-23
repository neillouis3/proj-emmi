import { el } from '@/lib/dom'
import { appendHighlightedJs } from '@/lib/highlightJs'

type CodeBlockOpts = {
  code?: string
  placeholder?: string
  className?: string
}

export function CodeBlock(opts: CodeBlockOpts) {
  const wrap = el('pre', `code-block${opts.className ? ` ${opts.className}` : ''}`)
  const code = el('code', 'code-block-inner')

  if (opts.code) {
    appendHighlightedJs(code, opts.code)
  } else {
    code.className = 'code-block-inner code-block-placeholder'
    code.textContent = opts.placeholder ?? ''
  }

  wrap.append(code)
  return wrap
}
