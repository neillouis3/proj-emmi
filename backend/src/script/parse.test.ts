import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseScript } from './parse.js'
import { paramsOf, runScript, type NativeFn } from './run.js'

const EXAMPLE = `
let ext = detect("png", desktopFiles)
let dest = lookup(ext, table)
move(currentFile, dest)
`

test('parses the three-line detect/lookup/move example', () => {
  const statements = parseScript(EXAMPLE)
  assert.equal(statements.length, 3)

  assert.deepEqual(statements[0], {
    type: 'assign',
    output: 'ext',
    fn: 'detect',
    args: [
      { type: 'literal', value: 'png' },
      { type: 'var', name: 'desktopFiles' },
    ],
  })

  assert.deepEqual(statements[1], {
    type: 'assign',
    output: 'dest',
    fn: 'lookup',
    args: [
      { type: 'var', name: 'ext' },
      { type: 'var', name: 'table' },
    ],
  })

  assert.deepEqual(statements[2], {
    type: 'call',
    fn: 'move',
    args: [
      { type: 'var', name: 'currentFile' },
      { type: 'var', name: 'dest' },
    ],
  })
})

test('parses object-literal table args', () => {
  const statements = parseScript(
    `let dest = lookup(ext, { png: "~/Pictures", pdf: "~/Documents", default: "~/Desktop/Other" })`,
  )
  assert.equal(statements.length, 1)
  assert.equal(statements[0].type, 'assign')
  const table = statements[0].args[1]
  assert.equal(table.type, 'literal')
  assert.deepEqual(table.value, {
    png: '~/Pictures',
    pdf: '~/Documents',
    default: '~/Desktop/Other',
  })
})

test('paramsOf reads names from function signature', () => {
  function detect(type: string, list: string[]) {
    return list
  }
  assert.deepEqual(paramsOf(detect as NativeFn), ['type', 'list'])
})

test('runScript resolves vars and assigns outputs', async () => {
  const moved: unknown[] = []
  const registry = new Map<string, NativeFn>([
    // Example uses detect as "extension probe" for the script demo.
    [
      'detect',
      (type, list) => {
        const hit = (list as string[]).some((f) => f.endsWith(`.${type}`) || f.endsWith(String(type)))
        return hit ? String(type) : null
      },
    ],
    [
      'lookup',
      (value, table) => {
        const t = table as Record<string, string>
        return t[String(value)] ?? t.default ?? null
      },
    ],
    [
      'move',
      (input, output) => {
        moved.push([input, output])
        return output
      },
    ],
  ])

  const scope = await runScript(parseScript(EXAMPLE), registry, {
    desktopFiles: ['a.png', 'b.pdf', 'c.png'],
    table: { png: '~/Pictures', default: '~/Desktop/Other' },
    currentFile: 'a.png',
  })

  assert.equal(scope.ext, 'png')
  assert.equal(scope.dest, '~/Pictures')
  assert.deepEqual(moved, [['a.png', '~/Pictures']])
})

test('parses if / else / for / try', () => {
  const statements = parseScript(`
if ready {
  log("yes")
} else {
  log("no")
}
for file in files {
  move(file, dest)
}
try {
  chrome.click("#go")
} catch {
  log("failed")
}
`)
  assert.equal(statements.length, 3)
  assert.equal(statements[0].type, 'if')
  assert.equal(statements[1].type, 'for')
  assert.equal(statements[2].type, 'try')
})

test('runScript if and for', async () => {
  const logs: string[] = []
  const registry = new Map<string, NativeFn>([
    ['log', (msg) => {
      logs.push(String(msg))
      return msg
    }],
  ])
  await runScript(
    parseScript(`
if flag {
  log("on")
} else {
  log("off")
}
for x in items {
  log(x)
}
`),
    registry,
    { flag: true, items: ['a', 'b'] },
  )
  assert.deepEqual(logs, ['on', 'a', 'b'])
})

test('parses and runs retry with backoff', async () => {
  const statements = parseScript(`
retry 3, 10 {
  flaky()
}
`)
  assert.equal(statements[0].type, 'retry')
  if (statements[0].type !== 'retry') return
  assert.equal(statements[0].times, 3)
  assert.equal(statements[0].delayMs, 10)

  let n = 0
  const registry = new Map<string, NativeFn>([
    [
      'flaky',
      () => {
        n += 1
        if (n < 3) throw new Error('not yet')
        return 'ok'
      },
    ],
  ])
  const scope = await runScript(statements, registry, {})
  assert.equal(n, 3)
  assert.equal(scope.__attempt, 3)
})
