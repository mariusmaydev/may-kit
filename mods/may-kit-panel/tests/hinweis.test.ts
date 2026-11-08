import { expect, test } from 'claude-code/testing'

import {
  aktualisieren,
  antwortDerRunde,
  compactAnweisung,
  compactAus,
  installerPruefen,
  kitFinden,
  kontextZeile,
  meldung,
  komprimieren,
  modellAus,
  nachBefehl,
  updateEntscheidung,
  updateFaellig,
  UPDATE_ABSTAND_MS,
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

// 2026-11-08: the line beside each prompt names model and effort, so Claude can tell "stays" from a switch.
test('the prompt line names the running model and effort, or only the rule', () => {
  const regel = 'A turn that changes files starts with the **Model:** line (CLAUDE.md §3). Same model → carry on, no **Next:**.'
  expect(kontextZeile({ modell: 'claude-opus-5-5', effort: 'high' })).toBe(`may-kit: running Opus high. ${regel}`)
  expect(kontextZeile({ modell: 'sonnet', effort: null })).toBe(`may-kit: running Sonnet. ${regel}`)
  expect(kontextZeile(null)).toBe(`may-kit: ${regel}`)
})

test('/model and /effort update what the line names; other arguments change nothing', () => {
  const opusHigh = { modell: 'claude-opus-5-5', effort: 'high' }
  expect(nachBefehl(opusHigh, 'effort', 'xhigh')).toEqual({ modell: 'claude-opus-5-5', effort: 'xhigh' })
  expect(nachBefehl(opusHigh, 'effort', 'auto')).toEqual({ modell: 'claude-opus-5-5', effort: null })
  expect(nachBefehl(opusHigh, 'effort', '')).toBe(opusHigh)
  expect(nachBefehl(opusHigh, 'model', 'sonnet')).toEqual({ modell: 'sonnet', effort: 'high' })
  expect(nachBefehl(opusHigh, 'model', '')).toBe(opusHigh)
  expect(nachBefehl(null, 'model', 'Opus')).toEqual({ modell: 'opus', effort: null })
  expect(nachBefehl(null, 'effort', 'high')).toBe(null)
})

test('the daily check is due after a day, never before, and when the clock went back', () => {
  const jetzt = 1_800_000_000_000
  expect(updateFaellig(undefined, jetzt)).toBe(true)
  expect(updateFaellig({ at: 'gestern' }, jetzt)).toBe(true)
  expect(updateFaellig({ at: jetzt - 60 * 60 * 1000 }, jetzt)).toBe(false)
  expect(updateFaellig({ at: jetzt - UPDATE_ABSTAND_MS }, jetzt)).toBe(true)
  expect(updateFaellig({ at: jetzt + 2 * 60 * 60 * 1000 }, jetzt)).toBe(true)
})

test('only a clean main with nothing of its own ahead is pulled', () => {
  const lage = { branch: 'main', sauber: true, voraus: 0, zurueck: 2 }
  expect(updateEntscheidung(lage)).toBe('ziehen')
  expect(updateEntscheidung({ ...lage, zurueck: 0 })).toBe('aktuell')
  expect(updateEntscheidung({ ...lage, zurueck: 0, voraus: 3, sauber: false })).toBe('aktuell')
  expect(updateEntscheidung({ ...lage, branch: 'feature' })).toEqual({ grund: 'branch' })
  expect(updateEntscheidung({ ...lage, sauber: false })).toEqual({ grund: 'aenderungen' })
  expect(updateEntscheidung({ ...lage, voraus: 1 })).toEqual({ grund: 'voraus' })
})

test('an error toast shows git\'s fatal line or the message a PowerShell throw puts first', () => {
  expect(meldung('hint: Diverging branches can\'t be fast-forwarded\nfatal: Not possible to fast-forward, aborting.\n')).toBe(
    'fatal: Not possible to fast-forward, aborting.',
  )
  expect(meldung('Could not read settings.json\nIn C:\\kit\\install.ps1:70 Zeichen:5\n+ throw "x"\n    + FullyQualifiedErrorId : x\n')).toBe(
    'Could not read settings.json',
  )
  expect(meldung('')).toBe('')
})

type Antwort = { exitCode: number; stdout?: string; stderr?: string }
const JETZT = 1_800_000_000_000
const GIT: Record<string, Antwort> = {
  'git rev-parse --show-toplevel': { exitCode: 0, stdout: 'C:/kit\n' },
  'git ls-files': { exitCode: 0, stdout: 'install.ps1\nset-user-settings.cjs\n' },
  'git fetch': { exitCode: 0 },
  'git rev-list': { exitCode: 0, stdout: '0\t2\n' },
  'git rev-parse --abbrev-ref': { exitCode: 0, stdout: 'main\n' },
  'git status': { exitCode: 0, stdout: '' },
  'git log': { exitCode: 0, stdout: 'feat: neu\n' },
  'git merge': { exitCode: 0 },
  'git rev-parse HEAD:install.ps1': { exitCode: 0, stdout: 'aaa\r\nbbb\n' },
  'git ls-tree': { exitCode: 0, stdout: 'mods/may-kit-panel\n' },
  'powershell.exe': { exitCode: 0 },
}

/**
 * A `$` with store, clock, process and toast in memory. `fremd`: another session claims the key during
 * the pause; `wurf`: process.run rejects (a start failure or a timeout).
 */
function updateAttrappe(abweichend: Record<string, Antwort> = {}, opts: { store?: Record<string, unknown>; fremd?: boolean; wurf?: boolean; root?: string } = {}) {
  const antworten = { ...GIT, ...abweichend }
  const aufrufe: string[] = []
  const umgebung: unknown[] = []
  const toasts: string[] = []
  const speicher = new Map<string, unknown>(Object.entries(opts.store ?? {}))
  let letzterKey = ''
  const $ = {
    store: {
      get: (k: string) => Promise.resolve(speicher.get(k)),
      set: (k: string, v: unknown) => ((letzterKey = k), speicher.set(k, v), Promise.resolve()),
    },
    session: { id: () => Promise.resolve('s1') },
    clock: { sleep: () => (opts.fremd ? speicher.set(letzterKey, { von: 'andere' }) : undefined, Promise.resolve()) },
    plugin: { name: 'may-kit-panel', root: opts.root ?? 'C:\\kit\\mods\\may-kit-panel' },
    process: {
      run: (argv: readonly string[], init?: { env?: unknown }) => {
        if (opts.wurf) return Promise.reject(new Error('timed out'))
        // "-C <dir>" dropped and the installer path shortened, so the calls read as commands
        const teile: string[] = []
        for (let i = 0; i < argv.length; i++) {
          const a = argv[i] ?? ''
          if (a === '-C') i++
          else teile.push(a.endsWith('install.ps1') && a.includes('/') ? 'install.ps1' : a)
        }
        const zeile = teile.join(' ')
        aufrufe.push(zeile)
        umgebung.push(init?.env)
        const r = Object.entries(antworten)
          .sort(([a], [b]) => b.length - a.length)
          .find(([k]) => zeile.startsWith(k))?.[1] ?? { exitCode: 0 }
        return Promise.resolve({ exitCode: r.exitCode, stdout: r.stdout ?? '', stderr: r.stderr ?? '' })
      },
    },
    ui: { toast: (t: string) => void toasts.push(t) },
  }
  return { $: $ as unknown as Parameters<typeof aktualisieren>[0], aufrufe, umgebung, toasts, speicher }
}

test('the daily update fast-forwards a clean main without a second fetch and names what came in', async () => {
  const a = updateAttrappe()
  expect(await aktualisieren(a.$, 'C:/kit', 'en', JETZT, 0)).toBe('aktualisiert')
  expect(a.aufrufe.filter(z => z.startsWith('git fetch'))).toHaveLength(1)
  expect(a.aufrufe).toContain('git merge --ff-only --quiet @{u}')
  expect(a.aufrufe.some(z => z.startsWith('git pull'))).toBe(false)
  expect(a.toasts).toEqual(['may-kit updated (2 commits): feat: neu. New chats use it.'])
  expect((a.speicher.get('updateGeprueft') as { at: number }).at).toBe(JETZT)
  // git never asks for credentials in the background
  expect(a.umgebung[0]).toEqual({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })
  // an hour later nothing is due: no process starts, no toast
  const b = updateAttrappe({}, { store: { updateGeprueft: { at: JETZT - 60 * 60 * 1000, von: 'x' } } })
  expect(await aktualisieren(b.$, 'C:/kit', 'en', JETZT, 0)).toBe('nicht-faellig')
  expect(b.aufrufe).toEqual([])
  expect(b.toasts).toEqual([])
})

test('local changes, another branch, own commits or a failed merge leave the clone alone with one toast', async () => {
  const fall = async (abweichend: Record<string, Antwort>, erwartet: string, toast: string) => {
    const a = updateAttrappe(abweichend)
    expect(await aktualisieren(a.$, 'C:/kit', 'en', JETZT, 0)).toBe(erwartet)
    expect(a.toasts).toEqual([toast])
    if (erwartet !== 'pull-fehler') expect(a.aufrufe.some(z => z.startsWith('git merge'))).toBe(false)
  }
  await fall({ 'git status': { exitCode: 0, stdout: ' M CLAUDE.md\n' } }, 'aenderungen', 'may-kit update waiting: local changes in the clone')
  await fall({ 'git rev-parse --abbrev-ref': { exitCode: 0, stdout: 'feature\n' } }, 'branch', 'may-kit update waiting: the clone is on feature, not on main')
  await fall({ 'git rev-list': { exitCode: 0, stdout: '1\t2\n' } }, 'voraus', 'may-kit update waiting: commits of its own in the clone, not pushed yet')
  await fall(
    { 'git merge': { exitCode: 128, stderr: 'hint: see git help\nfatal: Not possible to fast-forward, aborting.' } },
    'pull-fehler',
    'may-kit update waiting: git pull failed (fatal: Not possible to fast-forward, aborting.)',
  )
})

test('offline, no upstream, unreadable git output, a failing process or a parallel merge: silent', async () => {
  const still = async (abweichend: Record<string, Antwort>, erwartet: string, opts: { wurf?: boolean } = {}) => {
    const a = updateAttrappe(abweichend, opts)
    expect(await aktualisieren(a.$, 'C:/kit', 'en', JETZT, 0)).toBe(erwartet)
    expect(a.toasts).toEqual([])
    expect(a.aufrufe.some(z => z.startsWith('git merge')) && erwartet !== 'andere-session').toBe(false)
    return a
  }
  const offline = await still({ 'git fetch': { exitCode: 128, stderr: 'Could not resolve host' } }, 'offline')
  // the claim stands: the next try comes the next day, not with every turn
  expect((offline.speicher.get('updateGeprueft') as { at: number }).at).toBe(JETZT)
  await still({ 'git rev-list': { exitCode: 128, stderr: 'no upstream' } }, 'kein-upstream')
  await still({ 'git rev-list': { exitCode: 0, stdout: 'kaputt\n' } }, 'kein-upstream')
  await still({ 'git status': { exitCode: 128 } }, 'kein-upstream')
  await still({}, 'offline', { wurf: true })
  await still({ 'git merge': { exitCode: 128, stderr: "fatal: Unable to create 'C:/kit/.git/index.lock': File exists." } }, 'andere-session')
  const fremd = updateAttrappe({}, { fremd: true })
  expect(await aktualisieren(fremd.$, 'C:/kit', 'en', JETZT, 5)).toBe('andere-session')
  expect(fremd.aufrufe).toEqual([])
})

test('only the clone that holds the plugin under mods/ and tracks the installer is updated', async () => {
  expect(await kitFinden(updateAttrappe().$)).toBe('C:/kit')
  // a copy of the mod inside another repo (dotfiles): not ours
  expect(await kitFinden(updateAttrappe({}, { root: 'C:\\dotfiles\\claude\\may-kit-panel' }).$)).toBe(null)
  expect(await kitFinden(updateAttrappe({ 'git rev-parse --show-toplevel': { exitCode: 0, stdout: 'C:/dotfiles\n' } }).$)).toBe(null)
  expect(await kitFinden(updateAttrappe({ 'git ls-files': { exitCode: 1 } }).$)).toBe(null)
  expect(await kitFinden(updateAttrappe({ 'git rev-parse --show-toplevel': { exitCode: 128 } }).$)).toBe(null)
  expect(await kitFinden(updateAttrappe({}, { wurf: true }).$)).toBe(null)
})

test('the installer runs whenever its state differs from the last successful run, not only after a pull', async () => {
  // first check on a machine: nothing stored, the installer runs once and its state is kept
  const erst = updateAttrappe()
  expect(await installerPruefen(erst.$, 'C:/kit', 'en', JETZT, 0)).toBe('installiert')
  expect(erst.aufrufe).toContain('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File install.ps1')
  const stand = erst.speicher.get('installiert') as { stand: string; ok: boolean }
  expect(stand).toEqual({ stand: 'aaa\nbbb\nmods/may-kit-panel', ok: true, at: JETZT })
  // the same state again: nothing runs
  const wieder = updateAttrappe({}, { store: { installiert: stand } })
  expect(await installerPruefen(wieder.$, 'C:/kit', 'en', JETZT, 0)).toBe('aktuell')
  expect(wieder.aufrufe.some(z => z.startsWith('powershell'))).toBe(false)
  // a pulled installer (by hand or by the panel) changes the blob: it runs again
  const neu = updateAttrappe({ 'git rev-parse HEAD:install.ps1': { exitCode: 0, stdout: 'ccc\nbbb\n' } }, { store: { installiert: stand } })
  expect(await installerPruefen(neu.$, 'C:/kit', 'en', JETZT, 0)).toBe('installiert')
})

test('a failed installer run is toasted and retried the next day, not at every start', async () => {
  const kaputt = updateAttrappe({ 'powershell.exe': { exitCode: 1, stderr: 'Could not read settings.json\n+ throw "x"\n' } })
  expect(await installerPruefen(kaputt.$, 'C:/kit', 'en', JETZT, 0)).toBe('installer-fehler')
  expect(kaputt.toasts).toEqual(['may-kit pulled, the installer reports: Could not read settings.json'])
  const versuch = kaputt.speicher.get('installiert') as Record<string, unknown>
  expect(versuch.ok).toBe(false)
  const gleichTag = updateAttrappe({ 'powershell.exe': { exitCode: 1 } }, { store: { installiert: versuch } })
  expect(await installerPruefen(gleichTag.$, 'C:/kit', 'en', JETZT + 60_000, 0)).toBe('aktuell')
  const naechsterTag = updateAttrappe({}, { store: { installiert: versuch } })
  expect(await installerPruefen(naechsterTag.$, 'C:/kit', 'en', JETZT + 25 * 60 * 60 * 1000, 0)).toBe('installiert')
  // elsewhere than Windows a toast asks for it, once per state
  const linux = updateAttrappe()
  expect(await installerPruefen(linux.$, '/home/u/may-kit', 'en', JETZT, 0)).toBe('selbst')
  expect(linux.toasts).toEqual(['may-kit changed: please run the installer yourself (INSTALL.md).'])
  expect(linux.aufrufe.some(z => z.startsWith('powershell'))).toBe(false)
})
