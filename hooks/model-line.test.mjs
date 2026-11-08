// Run: node --test hooks/model-line.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { missingModelLine, turnLines } from './model-line.mjs'

const user = text => JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text }] } })
const say = text => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const edit = (file_path, name = 'Edit') =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path } }] } })
const turnEnd = JSON.stringify({ parentUuid: 'x', isSidechain: false, type: 'system', subtype: 'stop_hook_summary' })
const check = (...lines) => missingModelLine(turnLines(lines.join('\n') + '\n'))

test('edit without model line is missing', () => {
  assert.equal(check(user('fix it'), edit('C:\\repo\\src\\a.ts'), say('Fixed.')), true)
})

test('model line or Next hint anywhere in the turn satisfies', () => {
  assert.equal(check(user('fix'), say('**Model:** Opus xhigh fits, because …'), edit('/repo/a.ts'), say('Fixed.')), false)
  assert.equal(check(user('fix'), edit('/repo/a.ts'), say('**Next:** `/model` → Sonnet, Effort high.')), false)
})

test('translated marker does not count', () => {
  assert.equal(check(user('fix'), say('**Modell:** Opus passt'), edit('/repo/a.ts')), true)
})

test('only the current turn counts', () => {
  assert.equal(check(user('a'), say('**Model:** Opus xhigh fits'), edit('/r/a.ts'), turnEnd, user('b'), edit('/r/b.ts')), true)
  assert.equal(check(user('a'), edit('/r/a.ts'), turnEnd, user('b'), say('Only an answer.')), false)
})

test('memory, plans, temp and subagent edits are ignored', () => {
  assert.equal(check(user('a'), edit('C:\\Users\\x\\.claude\\projects\\p\\memory\\m.md', 'Write')), false)
  assert.equal(check(user('a'), edit('/home/x/.claude/plans/p.md', 'Write')), false)
  assert.equal(check(user('a'), edit('C:\\Users\\x\\AppData\\Local\\Temp\\claude\\s\\scratch.txt', 'Write')), false)
  const side = JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/r/a.ts' } }] } })
  assert.equal(check(user('a'), side), false)
})

test('boundary text inside a tool result is not a turn end', () => {
  const result = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: '"type":"system","subtype":"stop_hook_summary"' }] } })
  assert.equal(check(user('a'), say('**Model:** Opus xhigh fits'), result, edit('/r/a.ts')), false)
})

test('hook process blocks once and never loops', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-line-'))
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, [user('fix'), edit('/r/a.ts'), say('Fixed.')].join('\n') + '\n')
  const script = fileURLToPath(new URL('./model-line.mjs', import.meta.url))
  const run = active =>
    spawnSync(process.execPath, [script], { input: JSON.stringify({ transcript_path: transcript, stop_hook_active: active }), encoding: 'utf8' })
  assert.equal(JSON.parse(run(false).stdout).decision, 'block')
  assert.equal(run(true).stdout, '')
  fs.rmSync(dir, { recursive: true })
})
