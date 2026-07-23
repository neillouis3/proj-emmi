type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'number'
  | 'fn'
  | 'type'
  | 'variable'
  | 'constant'
  | 'prop'
  | 'punctuation'

const KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'of',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'yield',
])

const CONSTANTS = new Set(['true', 'false', 'null', 'undefined'])

function isIdentStart(ch: string) {
  return /[A-Za-z_$]/.test(ch)
}

function isIdentPart(ch: string) {
  return /[\w$]/.test(ch)
}

function isPascalCase(word: string) {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(word)
}

function peekWord(code: string, i: number) {
  if (!isIdentStart(code[i] ?? '')) return null
  let j = i + 1
  while (j < code.length && isIdentPart(code[j] ?? '')) j++
  return { word: code.slice(i, j), end: j }
}

function nextNonSpace(code: string, i: number) {
  let j = i
  while (j < code.length && /\s/.test(code[j] ?? '')) j++
  return j
}

function prevNonSpace(code: string, i: number) {
  let j = i - 1
  while (j >= 0 && /\s/.test(code[j] ?? '')) j--
  return j
}

function tokenKindForIdent(
  word: string,
  code: string,
  start: number,
  end: number,
): TokenKind {
  if (KEYWORDS.has(word)) return 'keyword'
  if (CONSTANTS.has(word)) return 'constant'
  if (isPascalCase(word)) return 'type'
  if (code[prevNonSpace(code, start)] === '.') return 'prop'
  if (code[nextNonSpace(code, end)] === '(') return 'fn'
  return 'variable'
}

export function tokenizeJs(code: string): { kind: TokenKind; text: string }[] {
  const out: { kind: TokenKind; text: string }[] = []
  let i = 0

  while (i < code.length) {
    const ch = code[i]!
    const next = code[i + 1]

    if (ch === '/' && next === '/') {
      let j = i + 2
      while (j < code.length && code[j] !== '\n') j++
      out.push({ kind: 'comment', text: code.slice(i, j) })
      i = j
      continue
    }

    if (ch === '/' && next === '*') {
      let j = i + 2
      while (j < code.length && !(code[j] === '*' && code[j + 1] === '/')) j++
      j = Math.min(code.length, j + 2)
      out.push({ kind: 'comment', text: code.slice(i, j) })
      i = j
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === ch) {
          j++
          break
        }
        j++
      }
      out.push({ kind: 'string', text: code.slice(i, j) })
      i = j
      continue
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1
      while (j < code.length && /[0-9._xXa-fA-Fn]/.test(code[j] ?? '')) j++
      out.push({ kind: 'number', text: code.slice(i, j) })
      i = j
      continue
    }

    const ident = peekWord(code, i)
    if (ident) {
      out.push({
        kind: tokenKindForIdent(ident.word, code, i, ident.end),
        text: ident.word,
      })
      i = ident.end
      continue
    }

    if (/[{}()[\];,.:=<>+\-*/%!&|^~?]/.test(ch)) {
      out.push({ kind: 'punctuation', text: ch })
      i++
      continue
    }

    out.push({ kind: 'plain', text: ch })
    i++
  }

  return out
}

function appendComment(parent: HTMLElement, text: string) {
  const re = /(@\w+)|({[^}]+})/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > last) {
      const span = document.createElement('span')
      span.className = 'hl-comment'
      span.textContent = text.slice(last, match.index)
      parent.append(span)
    }
    const span = document.createElement('span')
    span.className = match[1] ? 'hl-tag' : 'hl-type'
    span.textContent = match[0]
    parent.append(span)
    last = match.index + match[0].length
  }
  if (last < text.length) {
    const span = document.createElement('span')
    span.className = 'hl-comment'
    span.textContent = text.slice(last)
    parent.append(span)
  }
}

export function appendHighlightedJs(parent: HTMLElement, source: string) {
  parent.replaceChildren()
  for (const token of tokenizeJs(source)) {
    if (token.kind === 'plain') {
      parent.append(document.createTextNode(token.text))
      continue
    }
    if (token.kind === 'comment') {
      appendComment(parent, token.text)
      continue
    }
    const span = document.createElement('span')
    span.className = `hl-${token.kind}`
    span.textContent = token.text
    parent.append(span)
  }
}
