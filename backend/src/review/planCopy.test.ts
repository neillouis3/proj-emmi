import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  humanizePlan,
  humanizePlanLine,
  planLooksUndoable,
  trustNoteForPending,
} from './planCopy.js'

test('humanizePlanLine maps browser and control flow', () => {
  assert.equal(humanizePlanLine('chrome.browse(...)'), 'Open a URL in Chrome')
  assert.equal(
    humanizePlanLine('text = chrome.pageText(...)'),
    'Read page text in Chrome → text',
  )
  assert.equal(humanizePlanLine('retry 3, 800ms'), 'Retry up to 3 times (800ms apart)')
  assert.equal(humanizePlanLine('if (...)'), 'If a condition matches')
  assert.equal(humanizePlanLine('write(...)'), 'Save text to a file')
})

test('planLooksUndoable distinguishes moves vs browser', () => {
  assert.equal(planLooksUndoable(['move(...)', 'log(...)'], ['a.pdf']), true)
  assert.equal(
    planLooksUndoable(['chrome.browse(...)', 'chrome.click(...)'], []),
    false,
  )
})

test('trustNoteForPending is calm for grants', () => {
  const note = trustNoteForPending({
    connectorId: 'chrome',
    undoable: false,
    grantKind: 'chrome',
  })
  assert.match(String(note), /disconnect anytime/i)
})

test('humanizePlan trims', () => {
  const lines = humanizePlan(
    ['chrome.wait(...)', 'chrome.query(...)', 'write(...)'],
    2,
  )
  assert.equal(lines.length, 2)
})
