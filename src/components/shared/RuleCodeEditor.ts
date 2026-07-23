import { el } from '@/lib/dom'

type RuleCodeEditorOpts = {
  value?: string
  placeholder?: string
  ariaLabel?: string
}

export type RuleCodeEditor = HTMLDivElement & {
  editor: HTMLTextAreaElement
  getValue(): string
  setValue(next: string): void
  focus(): void
}

export function RuleCodeEditor(opts: RuleCodeEditorOpts = {}): RuleCodeEditor {
  const shell = el('div', 'rule-code rule-create-editor-shell')
  const editor = el('textarea', 'rule-code-editor') as HTMLTextAreaElement
  editor.spellcheck = false
  editor.autocomplete = 'off'
  editor.autocapitalize = 'off'
  editor.wrap = 'off'
  editor.value = opts.value ?? ''
  editor.setAttribute('aria-label', opts.ariaLabel ?? 'Rule source code')
  if (opts.placeholder) editor.placeholder = opts.placeholder
  shell.append(editor)

  return Object.assign(shell, {
    editor,
    getValue() {
      return editor.value
    },
    setValue(next: string) {
      editor.value = next
    },
    focus() {
      editor.focus()
    },
  })
}
