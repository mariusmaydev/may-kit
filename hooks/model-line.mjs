#!/usr/bin/env node
// may-kit Stop hook — enforces the model line of CLAUDE.md §3.
//
// When the turn that just ended changed files (Edit, Write, MultiEdit, NotebookEdit) and none of its
// answers carries a "**Model:**" or "**Next:**" line, the hook blocks the stop once and asks Claude to
// add the line. Text rules alone held in about two thirds of the sessions (transcript count 2026-11-08).
//
// A turn starts after the last "stop_hook_summary" entry of the transcript (Claude Code writes one at
// the end of every turn while any Stop hook is configured, and this hook is one), else at the top.
// Subagents end with SubagentStop, not Stop, so their edits never trigger it. `stop_hook_active`
// (the stop was already blocked once) lets the turn end, so the hook can never loop.
//
// Registered in ~/.claude/settings.json by set-user-settings.cjs (install.ps1).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Paths that are no implementation: auto memory, plan-mode plans, scratchpad and temp files.
const IGNORED_PATH = /\/\.claude\/(projects|plans)\/|\/appdata\/local\/temp\/|^\/tmp\//
const MARKER = /\*\*(Model|Next):\*\*/
// Unescaped, this sequence can only be a real top-level key pair: inside a JSON string the quotes are escaped.
const BOUNDARY = '"type":"system","subtype":"stop_hook_summary"'
const TAIL_BYTES = 8 * 1024 * 1024

export const REASON =
  'may-kit, CLAUDE.md §3: this turn changed files, but no answer of it carries the model line. ' +
  'Add it now as one line, nothing else, and do not redo any work: ' +
  '"**Model:** <model> <effort> fits, because <criterion>." — or, if a switch is worthwhile, the "**Next:**" hint. ' +
  'From now on the line comes before the first change.'

/** The JSON lines of the current turn: everything after the last turn-end entry. */
export function turnLines(text) {
  const at = text.lastIndexOf(BOUNDARY)
  const from = at < 0 ? 0 : text.indexOf('\n', at) + 1
  return from <= 0 && at >= 0 ? [] : text.slice(from).split('\n').filter(Boolean)
}

/** Whether the turn changed files without any answer carrying the model line. */
export function missingModelLine(lines) {
  let edited = false
  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue // a line still being written
    }
    if (entry.type !== 'assistant' || entry.isSidechain) continue
    const content = entry.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type === 'text' && MARKER.test(block.text ?? '')) return false
      if (block.type === 'tool_use' && EDIT_TOOLS.has(block.name)) {
        const p = String(block.input?.file_path ?? block.input?.notebook_path ?? '').replace(/\\/g, '/').toLowerCase()
        if (!IGNORED_PATH.test(p)) edited = true
      }
    }
  }
  return edited
}

/** The transcript's text, from the tail when that already holds the turn boundary. */
function readTranscript(file) {
  const size = fs.statSync(file).size
  if (size <= TAIL_BYTES) return fs.readFileSync(file, 'utf8')
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(TAIL_BYTES)
    fs.readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES)
    const tail = buf.toString('utf8')
    // Cut the first, probably partial line; fall back to the whole file when the tail has no boundary.
    return tail.includes(BOUNDARY) ? tail.slice(tail.indexOf('\n') + 1) : fs.readFileSync(file, 'utf8')
  } finally {
    fs.closeSync(fd)
  }
}

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const hook = JSON.parse(input || '{}')
  if (hook.stop_hook_active || !hook.transcript_path || !fs.existsSync(hook.transcript_path)) return
  let missing = missingModelLine(turnLines(readTranscript(hook.transcript_path)))
  if (missing) {
    // The last answer may still be on its way to the file: look once more before blocking.
    await new Promise(r => setTimeout(r, 400))
    missing = missingModelLine(turnLines(readTranscript(hook.transcript_path)))
  }
  if (missing) process.stdout.write(JSON.stringify({ decision: 'block', reason: REASON }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  // Never break a session over this hook: any failure lets the turn end.
  main().catch(() => {})
}
