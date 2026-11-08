import { expect, test } from 'claude-code/testing'

import {
  antwortDerRunde,
  compactAnweisung,
  compactAus,
  komprimieren,
  modellAus,
  modellWechseln,
  modusAus,
  modusBefehl,
  nachAntwort,
  releaseBefehl,
  reviewAus,
  schwerlastAusAus,
  schwerlastUmschalten,
  spracheAus,
  startetRelease,
  startetReview,
  umsetzBefehl,
  wahlNachAntwort,
} from '../hooks/register'

const REVIEW = [
  'Done: E12.c on dev.',
  '```',
  'REVIEW RECOMMENDATION',
  '- Opus review recommended: Yes',
  '- Model / Effort: Opus / xhigh',
  '- Reasoning: Art. 18',
  '- Commits: 3f2a1b9 7c0d4e2',
  '```',
].join('\n')

// The markers before 2026-11-03 (German): answers from old transcripts and projects still use them.
const REVIEW_DE = [
  'Fertig: E12.c auf Dev.',
  '```',
  'REVIEW-EMPFEHLUNG',
  '- Opus-Review empfohlen: Ja',
  '- Modell / Effort: Opus / xhigh',
  '- Begründung: Art. 18',
  '- Commits: 3f2a1b9 7c0d4e2',
  '```',
].join('\n')

const COMPACT = [
  '**Compact now:** E12.c done, state in the plan.',
  '',
  '```',
  '/compact Continue e-mail: E12.d; basis docs/plans/x.md §G',
  '```',
].join('\n')

const COMPACT_DE = [
  '**Jetzt komprimieren:** E12.c fertig, Stand im Plan.',
  '',
  '```',
  '/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G',
  '```',
].join('\n')

const ORDER_EN = 'Start review: commits 3f2a1b9 7c0d4e2, subagent Opus/xhigh. Fix findings in your files, test, commit.'
const ORDER_DE = 'Review starten: Commits 3f2a1b9 7c0d4e2, Subagent Opus/xhigh. Befunde in deinen Dateien beheben, testen, committen.'

test('the panel speaks German only when the language setting says so', async () => {
  for (const wert of ['german', 'German', 'deutsch', 'de', 'de-DE']) expect(spracheAus(wert)).toBe('de')
  for (const wert of ['english', 'czech', 'french', '', undefined, null, 7]) expect(spracheAus(wert)).toBe('en')
})

test('the review order names exactly the commits, model and effort of the block, in the panel language', async () => {
  expect(reviewAus(REVIEW)).toBe(ORDER_EN)
  expect(reviewAus(REVIEW, 'de')).toBe(ORDER_DE)
  // the former German block is still read; the order goes out in the panel language
  expect(reviewAus(REVIEW_DE)).toBe(ORDER_EN)
  expect(reviewAus(REVIEW_DE, 'de')).toBe(ORDER_DE)
})

// 2026-11-08: the Stop hook model-line.mjs blocked the turn after the recommendation, the model
// added a lone model line, and the Review button read only that line ("no review").
test('a model line the Stop hook asked for does not hide the review of the same turn', async () => {
  const MODELLZEILE = '**Model:** Opus xhigh fits, because the design decisions were made during the implementation.'
  const ru = (role: 'user' | 'assistant', text: string, toolResults?: unknown[]) => ({ role, text, toolResults })
  const runde = [
    ru('user', 'Build the new area kind.'),
    ru('assistant', 'Reading the code first.'),
    ru('user', '', [{ tool_use_id: 't1', text: 'ok' }]),
    ru('assistant', REVIEW),
    ru('user', 'Stop hook feedback:\nmay-kit, CLAUDE.md §3: this turn changed files, but no answer of it carries the model line.'),
    ru('assistant', MODELLZEILE),
  ]
  expect(antwortDerRunde(runde)).toBe(REVIEW)
  expect(reviewAus(antwortDerRunde(runde))).toBe(ORDER_EN)
  // the hook's text alone marks it, should the engine word the feedback differently
  runde[4] = ru('user', 'may-kit, CLAUDE.md §3: this turn changed files, but no answer of it carries the model line.')
  expect(antwortDerRunde(runde)).toBe(REVIEW)
  // a review result table after a forced model line still counts as the review's report
  const bericht = '| Finding | Result |\n|---|---|\n| H1 | fixed |'
  expect(antwortDerRunde([ru('user', 'Start review'), ru('assistant', bericht), ru('assistant', MODELLZEILE)])).toBe(bericht)
})

test('a review of an earlier turn is not read again once the person asked something new', async () => {
  const runde = [ru2('user', 'Build it.'), ru2('assistant', REVIEW), ru2('user', 'And now the colours?'), ru2('assistant', 'The colours are done.')]
  expect(antwortDerRunde(runde)).toBe('The colours are done.')
  // a turn without any text falls back to the answer before it, as before
  expect(antwortDerRunde([ru2('user', 'Build it.'), ru2('assistant', 'Done.'), ru2('user', 'Go on.'), ru2('assistant', '')])).toBe('Done.')
  expect(antwortDerRunde([])).toBe('')
})
const ru2 = (role: 'user' | 'assistant', text: string) => ({ role, text })

test('a review without commits gives no order (it would review other sessions)', async () => {
  expect(reviewAus(REVIEW.replace(' 3f2a1b9 7c0d4e2', ''))).toBe(null)
  expect(reviewAus(REVIEW_DE.replace(' 3f2a1b9 7c0d4e2', ''))).toBe(null)
  expect(reviewAus('No review needed.')).toBe(null)
})

test('the order and /code-review both count as starting the review, in either language', async () => {
  expect(startetReview('Start review: commits 3f2a1b9, subagent Opus/high.')).toBe(true)
  expect(startetReview('Review starten: Commits 3f2a1b9, Subagent Opus/high.')).toBe(true)
  expect(startetReview('', 'code-review')).toBe(true)
  expect(startetReview('How was the review?')).toBe(false)
  expect(startetReview('Wie war das Review?')).toBe(false)
})

test('the compact command is the /compact line, inline mentions do not count', async () => {
  expect(compactAus(COMPACT)).toBe('/compact Continue e-mail: E12.d; basis docs/plans/x.md §G')
  expect(compactAus(COMPACT_DE)).toBe('/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G')
  expect(compactAus('Use `/compact` later, when everything is done.')).toBe(null)
})

test('review first, even when the same answer offers /compact', async () => {
  const h = nachAntwort(null, `${REVIEW}\n\n${COMPACT}`)
  expect(h?.phase).toBe('review')
  expect(h?.compactBefehl).toBe('/compact Continue e-mail: E12.d; basis docs/plans/x.md §G')
})

test('after the review ran, a compact hint makes compact due with review ticked', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: '/code-review xhigh 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  for (const hinweis of [COMPACT, COMPACT_DE]) {
    const h = nachAntwort(laeuft, hinweis)
    expect(h?.phase).toBe('compact')
    expect(h?.reviewErledigt).toBe(true)
  }
})

test('the result table of a running review ticks it off, even without a compact hint', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: 'Start review: commits 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  for (const tabelle of ['| Finding | Result |\n|---|---|\n| 1 | fixed |', '| Befund | Ergebnis |\n|---|---|\n| 1 | behoben |']) {
    const h = nachAntwort(laeuft, tabelle)
    expect(h?.phase).toBe('compact')
    expect(h?.reviewErledigt).toBe(true)
  }
  // the same table without a running review changes nothing
  expect(nachAntwort(null, '| Finding | Result |')).toBe(null)
})

// 2026-11-03: the review ended without a result table (no such commit) and the spinner stayed.
test('a running review ends when no subagent works any more, even without a result table', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: 'Start review: commits 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  const antwort = 'I did not start a review, because the commit does not exist.'
  // the reviewer still runs in the background: keep the spinner
  expect(nachAntwort(laeuft, 'The review is running.', true)).toEqual(laeuft)
  // nothing runs any more: the row goes neutral, no tick
  expect(nachAntwort(laeuft, antwort, false)).toBe(null)
})

test('a compact hint while the review is still open keeps review due', async () => {
  const offen = { phase: 'review' as const, reviewBefehl: '/code-review high 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  expect(nachAntwort(offen, COMPACT)?.phase).toBe('review')
})

test('the compact button passes only the instructions after /compact', async () => {
  expect(compactAnweisung('/compact Continue e-mail: E12.d')).toBe('Continue e-mail: E12.d')
  expect(compactAnweisung('/compact ')).toBe(undefined)
  expect(compactAnweisung(null)).toBe(undefined)
})

test('an answer without a hint leaves the state as it was', async () => {
  expect(nachAntwort(null, 'All done.')).toBe(null)
})

// Review 2026-11-03 (H2, N1): the test engine has no SDK session, so the fallback is driven
// through a stand-in for `$` holding just what komprimieren calls.
function attrappe(fehler: string, runFehler?: string) {
  const befehle: unknown[] = []
  const toasts: string[] = []
  const $ = {
    session: { compact: () => Promise.reject(new Error(fehler)) },
    command: {
      run: (a: unknown) => (befehle.push(a), runFehler ? Promise.reject(new Error(runFehler)) : Promise.resolve({ text: '' })),
    },
    ui: { toast: (t: string) => void toasts.push(t) },
  }
  return { $: $ as unknown as Parameters<typeof komprimieren>[0], befehle, toasts }
}

test('a headless refusal runs /compact as a command, with the instructions', async () => {
  const a = attrappe('Compaction is not available in a headless (-p / SDK) session')
  await komprimieren(a.$, '/compact Continue with E12.d')
  expect(a.befehle).toEqual([{ command: 'compact', args: 'Continue with E12.d' }])
  expect(a.toasts).toEqual([])
})

test('any other error, even one naming the SDK, is reported, not retried', async () => {
  const a = attrappe('@anthropic-ai/sdk: 529 overloaded')
  await komprimieren(a.$, null)
  expect(a.befehle).toEqual([])
  expect(a.toasts).toEqual(['Not compacted: @anthropic-ai/sdk: 529 overloaded'])
  // the same report in the panel's German
  const de = attrappe('@anthropic-ai/sdk: 529 overloaded')
  await komprimieren(de.$, null, undefined, 'de')
  expect(de.toasts).toEqual(['Nicht komprimiert: @anthropic-ai/sdk: 529 overloaded'])
})

test('a refused /compact command is reported', async () => {
  const a = attrappe('not available in a headless (-p / SDK) session', 'unknown command')
  await komprimieren(a.$, null)
  expect(a.befehle).toEqual([{ command: 'compact', args: '' }])
  expect(a.toasts).toEqual(['Not compacted: unknown command'])
})

test('the mode file: only "fast" (or the former "schnell") is fast, anything else careful', async () => {
  expect(modusAus(`fast${String.fromCharCode(10)}`)).toBe('schnell')
  expect(modusAus('schnell')).toBe('schnell')
  expect(modusAus('careful')).toBe('sorgfaeltig')
  expect(modusAus('sorgfaeltig')).toBe('sorgfaeltig')
  expect(modusAus('Fast')).toBe('sorgfaeltig')
  expect(modusAus('Schnell')).toBe('sorgfaeltig')
})

// Projects' CLAUDE.md files name the German orders: with `language: german` they stay as they were.
test('the orders the panel sends follow the panel language; the German ones are unchanged', async () => {
  expect(modusBefehl('schnell')).toBe('Mode careful')
  expect(modusBefehl('sorgfaeltig')).toBe('Mode fast')
  expect(modusBefehl('schnell', 'de')).toBe('Modus sorgfältig')
  expect(modusBefehl('sorgfaeltig', 'de')).toBe('Modus schnell')
  expect(releaseBefehl()).toBe('Release to production')
  expect(releaseBefehl('de')).toBe('Release nach production')
})

const WEITER = [
  '**Next:** first `/compact`, then `/model` → Sonnet, Effort high. The plan is binding.',
  'Plan: `docs/plans/2026-11-03-x.md` · then Opus review',
  '',
  '```',
  '/compact Implement stage 4; basis docs/plans/2026-11-03-x.md §3',
  '```',
].join('\n')

const WEITER_DE = [
  '**Weiter:** erst `/compact`, dann `/model` → Sonnet, Effort high. Plan ist bindend.',
  'Plan: `docs/plans/2026-11-03-x.md` · danach Opus-Review',
  '',
  '```',
  '/compact Etappe 4 umsetzen; Grundlage docs/plans/2026-11-03-x.md §3',
  '```',
].join('\n')

test('a Next hint gives model, effort, its compaction and the plan', async () => {
  expect(modellAus(WEITER)).toEqual({
    modell: 'sonnet',
    effort: 'high',
    compactBefehl: '/compact Implement stage 4; basis docs/plans/2026-11-03-x.md §3',
    compactOffen: true,
    plan: 'docs/plans/2026-11-03-x.md',
  })
  expect(modellAus('**Next:** `/model` → Opus, Effort xhigh. Cause unclear.')).toEqual({
    modell: 'opus',
    effort: 'xhigh',
    compactBefehl: null,
    compactOffen: false,
    plan: null,
  })
})

test('the former Weiter hint is read the same way', async () => {
  expect(modellAus(WEITER_DE)).toEqual({
    modell: 'sonnet',
    effort: 'high',
    compactBefehl: '/compact Etappe 4 umsetzen; Grundlage docs/plans/2026-11-03-x.md §3',
    compactOffen: true,
    plan: 'docs/plans/2026-11-03-x.md',
  })
})

test('staying on the model, or a compact-only hint, is no switch', async () => {
  expect(modellAus('**Model:** Opus xhigh fits, because the cause is unclear.')).toBe(null)
  expect(modellAus('**Modell:** Opus xhigh passt, weil die Ursache unklar ist.')).toBe(null)
  expect(modellAus(COMPACT)).toBe(null)
})

// After the switch's compaction the same hint is read again: it must not compact a second time.
test('the same hint read again keeps the stored switch, a new hint replaces it', async () => {
  const erledigt = { ...modellAus(WEITER)!, compactOffen: false }
  expect(wahlNachAntwort(erledigt, WEITER)).toBe(erledigt)
  expect(wahlNachAntwort(erledigt, 'All clear.')).toBe(erledigt)
  expect(wahlNachAntwort(erledigt, '**Next:** `/model` → Opus, Effort xhigh.')?.modell).toBe('opus')
})

function wechselAttrappe(opts: { mitEffort: boolean; compactSkip?: string }) {
  const schritte: unknown[] = []
  const toasts: string[] = []
  const $ = {
    session: {
      compact: (a: unknown) => (schritte.push({ compact: a }), Promise.resolve(opts.compactSkip ? { skip: opts.compactSkip } : {})),
    },
    command: {
      run: (a: unknown) => (schritte.push(a), Promise.resolve({ text: '' })),
      list: () => Promise.resolve(opts.mitEffort ? [{ name: 'model' }, { name: 'effort' }] : [{ name: 'model' }]),
    },
    prompt: { submit: (a: { text: string }) => (schritte.push({ submit: a.text }), Promise.resolve({})) },
    state: { update: () => Promise.resolve(), read: () => Promise.resolve(null) },
    ui: { toast: (t: string) => void toasts.push(t) },
  }
  return { $: $ as unknown as Parameters<typeof modellWechseln>[0], schritte, toasts }
}

test('the switch compacts first, then sets model and effort, then sends the order', async () => {
  const a = wechselAttrappe({ mitEffort: true })
  const wahl = modellAus(WEITER)!
  await modellWechseln(a.$, wahl)
  expect(a.schritte).toEqual([
    { compact: { instructions: 'Implement stage 4; basis docs/plans/2026-11-03-x.md §3' } },
    { command: 'model', args: 'sonnet' },
    { command: 'effort', args: 'high' },
    { submit: umsetzBefehl(wahl) },
  ])
  expect(umsetzBefehl(wahl)).toBe('Implement per plan docs/plans/2026-11-03-x.md (now Sonnet high).')
  expect(umsetzBefehl(wahl, 'de')).toBe('Umsetzen nach Plan docs/plans/2026-11-03-x.md (jetzt Sonnet high).')
  expect(umsetzBefehl({ ...wahl, plan: null })).toBe('Implement (now Sonnet high).')
})

test('a skipped compaction stops the switch: nothing runs on the wrong model', async () => {
  const a = wechselAttrappe({ mitEffort: true, compactSkip: 'nothing to compact' })
  await modellWechseln(a.$, modellAus(WEITER)!)
  expect(a.schritte).toHaveLength(1)
  expect(a.toasts).toEqual(['Not compacted: nothing to compact'])
})

test('without an /effort command the effort is named, the switch goes on', async () => {
  const a = wechselAttrappe({ mitEffort: false })
  await modellWechseln(a.$, { ...modellAus(WEITER)!, compactOffen: false })
  expect(a.schritte).toEqual([{ command: 'model', args: 'sonnet' }, { submit: 'Implement per plan docs/plans/2026-11-03-x.md (now Sonnet high).' }])
  expect(a.toasts).toEqual(['Effort not set: high, please use /config'])
  // in German the order and the report are what the panel always sent
  const de = wechselAttrappe({ mitEffort: false })
  await modellWechseln(de.$, { ...modellAus(WEITER)!, compactOffen: false }, undefined, undefined, 'de')
  expect(de.schritte).toEqual([{ command: 'model', args: 'sonnet' }, { submit: 'Umsetzen nach Plan docs/plans/2026-11-03-x.md (jetzt Sonnet high).' }])
  expect(de.toasts).toEqual(['Effort nicht gesetzt: high bitte per /config'])
})

test('a typed or sent release order counts as a release start, in either language', async () => {
  expect(startetRelease('Release to production')).toBe(true)
  expect(startetRelease('Release nach production')).toBe(true)
  expect(startetRelease('When does the release to production come?')).toBe(false)
  expect(startetRelease('Wann kommt der Release nach production?')).toBe(false)
})

// The heavy-load button rewrites `.claude/sperren.local` (per machine, never tracked): only the
// "schwerlast" entry and an "aus" line change, other areas and lines stay.
test('the override file: reading whether the heavy-load lock is off', () => {
  expect(schwerlastAusAus('')).toBe(false)
  expect(schwerlastAusAus('ohne: pakete\n')).toBe(false)
  expect(schwerlastAusAus('ohne: schwerlast\n')).toBe(true)
  expect(schwerlastAusAus('ohne: pakete, schwerlast')).toBe(true)
  expect(schwerlastAusAus('aus\n')).toBe(true)
  expect(schwerlastAusAus('ohne: schwerlast-extra')).toBe(false)
})

test('the override file: the button switches only schwerlast', () => {
  expect(schwerlastUmschalten('')).toBe('ohne: schwerlast\n')
  expect(schwerlastUmschalten('ohne: schwerlast\n')).toBe('')
  expect(schwerlastUmschalten('ohne: pakete\n')).toBe('ohne: pakete, schwerlast\n')
  expect(schwerlastUmschalten('ohne: pakete, schwerlast\n')).toBe('ohne: pakete\n')
  expect(schwerlastUmschalten('# Haupt-PC\nohne: schwerlast\n')).toBe('# Haupt-PC\n')
  // "aus" switched every area off: the button ends that and keeps the listed areas as they were
  expect(schwerlastUmschalten('aus\n')).toBe('')
  expect(schwerlastUmschalten('aus\nohne: pakete\n')).toBe('ohne: pakete\n')
  // pressing twice returns to the start
  expect(schwerlastUmschalten(schwerlastUmschalten('ohne: pakete\n'))).toBe('ohne: pakete\n')
  expect(schwerlastUmschalten('ohne: pakete\r\n')).toBe('ohne: pakete, schwerlast\n')
})
