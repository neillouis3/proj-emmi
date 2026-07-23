import type { Arg, Statement } from './ast.js'

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, col ${column})`)
    this.name = 'ParseError'
  }
}

type Tok =
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'punct'; value: string }
  | { kind: 'eof' }

function tokenize(source: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  const n = source.length

  const peek = () => source[i]
  const advance = () => source[i++]

  while (i < n) {
    const c = peek()
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance()
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && peek() !== '\n') advance()
      continue
    }
    if (c === '"' || c === "'") {
      const quote = advance()!
      let value = ''
      while (i < n && peek() !== quote) {
        if (peek() === '\\') {
          advance()
          const esc = advance()
          if (esc === 'n') value += '\n'
          else if (esc === 't') value += '\t'
          else if (esc) value += esc
        } else {
          value += advance()
        }
      }
      if (peek() !== quote) throw new ParseError('Unterminated string', 1, i)
      advance()
      tokens.push({ kind: 'string', value })
      continue
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let raw = ''
      if (c === '-') raw += advance()
      while (i < n && ((peek()! >= '0' && peek()! <= '9') || peek() === '.')) {
        raw += advance()
      }
      tokens.push({ kind: 'number', value: Number(raw) })
      continue
    }
    if (/[A-Za-z_]/.test(c!)) {
      let value = ''
      while (i < n && /[A-Za-z0-9_.]/.test(peek()!)) value += advance()
      tokens.push({ kind: 'ident', value })
      continue
    }
    if ('(){},:='.includes(c!)) {
      tokens.push({ kind: 'punct', value: advance()! })
      continue
    }
    throw new ParseError(`Unexpected character “${c}”`, 1, i + 1)
  }
  tokens.push({ kind: 'eof' })
  return tokens
}

class Parser {
  private pos = 0
  constructor(private tokens: Tok[]) {}

  private at() {
    return this.tokens[this.pos] ?? { kind: 'eof' as const }
  }

  private eat(kind?: Tok['kind'], value?: string): Tok {
    const t = this.at()
    if (kind && t.kind !== kind) {
      throw new ParseError(`Expected ${kind}, got ${t.kind}`, 1, this.pos)
    }
    if (value !== undefined && (t.kind === 'punct' || t.kind === 'ident') && t.value !== value) {
      throw new ParseError(`Expected “${value}”`, 1, this.pos)
    }
    this.pos += 1
    return t
  }

  private matchPunct(value: string) {
    const t = this.at()
    if (t.kind === 'punct' && t.value === value) {
      this.pos += 1
      return true
    }
    return false
  }

  private matchIdent(value: string) {
    const t = this.at()
    if (t.kind === 'ident' && t.value === value) {
      this.pos += 1
      return true
    }
    return false
  }

  parseStatements(): Statement[] {
    const out: Statement[] = []
    while (this.at().kind !== 'eof') {
      out.push(this.parseStatement())
    }
    return out
  }

  private parseBlock(): Statement[] {
    this.eat('punct', '{')
    const body: Statement[] = []
    while (!(this.at().kind === 'punct' && (this.at() as { value: string }).value === '}')) {
      if (this.at().kind === 'eof') {
        throw new ParseError('Unterminated block', 1, this.pos)
      }
      body.push(this.parseStatement())
    }
    this.eat('punct', '}')
    return body
  }

  private parseStatement(): Statement {
    const t = this.at()
    if (t.kind === 'ident' && t.value === 'if') {
      this.eat('ident', 'if')
      const condition = this.parseArg()
      const body = this.parseBlock()
      let elseBody: Statement[] | undefined
      if (this.matchIdent('else')) {
        elseBody = this.parseBlock()
      }
      return { type: 'if', condition, body, elseBody }
    }
    if (t.kind === 'ident' && t.value === 'for') {
      this.eat('ident', 'for')
      const itemTok = this.eat('ident')
      if (itemTok.kind !== 'ident') {
        throw new ParseError('Expected loop variable', 1, this.pos)
      }
      this.eat('ident', 'in')
      const list = this.parseArg()
      const body = this.parseBlock()
      return { type: 'for', item: itemTok.value, list, body }
    }
    if (t.kind === 'ident' && t.value === 'try') {
      this.eat('ident', 'try')
      const body = this.parseBlock()
      this.eat('ident', 'catch')
      const catchBody = this.parseBlock()
      return { type: 'try', body, catchBody }
    }
    if (t.kind === 'ident' && t.value === 'retry') {
      this.eat('ident', 'retry')
      const timesTok = this.eat('number')
      if (timesTok.kind !== 'number') {
        throw new ParseError('Expected retry count', 1, this.pos)
      }
      let delayMs = 500
      if (this.matchPunct(',')) {
        const delayTok = this.eat('number')
        if (delayTok.kind !== 'number') {
          throw new ParseError('Expected retry delay ms', 1, this.pos)
        }
        delayMs = Math.max(0, Number(delayTok.value) || 0)
      }
      const times = Math.max(1, Math.min(20, Math.floor(Number(timesTok.value) || 1)))
      const body = this.parseBlock()
      return { type: 'retry', times, delayMs, body }
    }
    if (t.kind === 'ident' && t.value === 'let') {
      this.eat('ident', 'let')
      const outputTok = this.eat('ident')
      if (outputTok.kind !== 'ident') throw new ParseError('Expected name after let', 1, this.pos)
      this.eat('punct', '=')
      const call = this.parseCall()
      return { type: 'assign', output: outputTok.value, fn: call.fn, args: call.args }
    }
    const call = this.parseCall()
    return { type: 'call', fn: call.fn, args: call.args }
  }

  private parseCall(): { fn: string; args: Arg[] } {
    const nameTok = this.eat('ident')
    if (nameTok.kind !== 'ident') throw new ParseError('Expected function name', 1, this.pos)
    this.eat('punct', '(')
    const args: Arg[] = []
    if (!this.matchPunct(')')) {
      args.push(this.parseArg())
      while (this.matchPunct(',')) {
        args.push(this.parseArg())
      }
      this.eat('punct', ')')
    }
    return { fn: nameTok.value, args }
  }

  private parseArg(): Arg {
    const t = this.at()
    if (t.kind === 'string') {
      this.pos += 1
      return { type: 'literal', value: t.value }
    }
    if (t.kind === 'number') {
      this.pos += 1
      return { type: 'literal', value: t.value }
    }
    if (t.kind === 'ident') {
      if (t.value === 'true') {
        this.pos += 1
        return { type: 'literal', value: true }
      }
      if (t.value === 'false') {
        this.pos += 1
        return { type: 'literal', value: false }
      }
      if (t.value === 'null') {
        this.pos += 1
        return { type: 'literal', value: null }
      }
      this.pos += 1
      return { type: 'var', name: t.value }
    }
    if (t.kind === 'punct' && t.value === '{') {
      return { type: 'literal', value: this.parseObject() }
    }
    throw new ParseError('Expected argument', 1, this.pos)
  }

  private parseObject(): Record<string, unknown> {
    this.eat('punct', '{')
    const obj: Record<string, unknown> = {}
    if (this.matchPunct('}')) return obj
    for (;;) {
      const keyTok = this.at()
      let key: string
      if (keyTok.kind === 'ident') {
        key = keyTok.value
        this.pos += 1
      } else if (keyTok.kind === 'string') {
        key = keyTok.value
        this.pos += 1
      } else {
        throw new ParseError('Expected object key', 1, this.pos)
      }
      this.eat('punct', ':')
      const valueArg = this.parseArg()
      if (valueArg.type !== 'literal') {
        throw new ParseError('Object values must be literals', 1, this.pos)
      }
      obj[key] = valueArg.value
      if (this.matchPunct(',')) {
        if (this.matchPunct('}')) break
        continue
      }
      this.eat('punct', '}')
      break
    }
    return obj
  }
}

/** Parse an automation script into statements. */
export function parseScript(source: string): Statement[] {
  const cleaned = source
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('//')
      if (cut === -1) return line
      let inStr: string | null = null
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (inStr) {
          if (c === '\\') {
            i += 1
            continue
          }
          if (c === inStr) inStr = null
          continue
        }
        if (c === '"' || c === "'") {
          inStr = c
          continue
        }
        if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
      }
      return line
    })
    .join('\n')

  const tokens = tokenize(cleaned)
  return new Parser(tokens).parseStatements()
}
