import { expect, test } from 'claude-code/testing'

import {
  compactAnweisung,
  compactAus,
  komprimieren,
  modellAus,
  modellWechseln,
  modusAus,
  modusBefehl,
  nachAntwort,
  reviewAus,
  startetRelease,
  startetReview,
  umsetzBefehl,
  wahlNachAntwort,
} from '../hooks/register'

const REVIEW = [
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
  '**Jetzt komprimieren:** E12.c fertig, Stand im Plan.',
  '',
  '```',
  '/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G',
  '```',
].join('\n')

test('the review order names exactly the commits, model and effort of the block', async () => {
  expect(reviewAus(REVIEW)).toBe(
    'Review starten: Commits 3f2a1b9 7c0d4e2, Subagent Opus/xhigh. Befunde in deinen Dateien beheben, testen, committen.',
  )
})

test('a review without commits gives no order (it would review other sessions)', async () => {
  expect(reviewAus(REVIEW.replace(' 3f2a1b9 7c0d4e2', ''))).toBe(null)
  expect(reviewAus('Kein Review nötig.')).toBe(null)
})

test('the order and /code-review both count as starting the review', async () => {
  expect(startetReview('Review starten: Commits 3f2a1b9, Subagent Opus/high.')).toBe(true)
  expect(startetReview('', 'code-review')).toBe(true)
  expect(startetReview('Wie war das Review?')).toBe(false)
})

test('the compact command is the /compact line, inline mentions do not count', async () => {
  expect(compactAus(COMPACT)).toBe('/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G')
  expect(compactAus('Nimm später `/compact`, wenn alles fertig ist.')).toBe(null)
})

test('review first, even when the same answer offers /compact', async () => {
  const h = nachAntwort(null, `${REVIEW}\n\n${COMPACT}`)
  expect(h?.phase).toBe('review')
  expect(h?.compactBefehl).toBe('/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G')
})

test('after the review ran, a compact hint makes compact due with review ticked', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: '/code-review xhigh 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  const h = nachAntwort(laeuft, COMPACT)
  expect(h?.phase).toBe('compact')
  expect(h?.reviewErledigt).toBe(true)
})

test('the result table of a running review ticks it off, even without a compact hint', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: 'Review starten: Commits 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  const h = nachAntwort(laeuft, '| Befund | Ergebnis |\n|---|---|\n| 1 | behoben |')
  expect(h?.phase).toBe('compact')
  expect(h?.reviewErledigt).toBe(true)
  // the same table without a running review changes nothing
  expect(nachAntwort(null, '| Befund | Ergebnis |')).toBe(null)
})

// 2026-11-03: the review ended without a result table (no such commit) and the spinner stayed.
test('a running review ends when no subagent works any more, even without a result table', async () => {
  const laeuft = { phase: 'review-laeuft' as const, reviewBefehl: 'Review starten: Commits 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  const antwort = 'Ich habe kein Review gestartet, weil es den Commit nicht gibt.'
  // the reviewer still runs in the background: keep the spinner
  expect(nachAntwort(laeuft, 'Das Review läuft gerade.', true)).toEqual(laeuft)
  // nothing runs any more: the row goes neutral, no tick
  expect(nachAntwort(laeuft, antwort, false)).toBe(null)
})

test('a compact hint while the review is still open keeps review due', async () => {
  const offen = { phase: 'review' as const, reviewBefehl: '/code-review high 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  expect(nachAntwort(offen, COMPACT)?.phase).toBe('review')
})

test('the compact button passes only the instructions after /compact', async () => {
  expect(compactAnweisung('/compact Weiter E-Mail: E12.d')).toBe('Weiter E-Mail: E12.d')
  expect(compactAnweisung('/compact ')).toBe(undefined)
  expect(compactAnweisung(null)).toBe(undefined)
})

test('an answer without a hint leaves the state as it was', async () => {
  expect(nachAntwort(null, 'Alles erledigt.')).toBe(null)
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
  await komprimieren(a.$, '/compact Weiter mit E12.d')
  expect(a.befehle).toEqual([{ command: 'compact', args: 'Weiter mit E12.d' }])
  expect(a.toasts).toEqual([])
})

test('any other error, even one naming the SDK, is reported, not retried', async () => {
  const a = attrappe('@anthropic-ai/sdk: 529 overloaded')
  await komprimieren(a.$, null)
  expect(a.befehle).toEqual([])
  expect(a.toasts).toEqual(['Nicht komprimiert: @anthropic-ai/sdk: 529 overloaded'])
})

test('a refused /compact command is reported', async () => {
  const a = attrappe('not available in a headless (-p / SDK) session', 'unknown command')
  await komprimieren(a.$, null)
  expect(a.befehle).toEqual([{ command: 'compact', args: '' }])
  expect(a.toasts).toEqual(['Nicht komprimiert: unknown command'])
})

test('the mode file: only "schnell" is fast, anything else careful (CLAUDE.md)', async () => {
  expect(modusAus(`schnell${String.fromCharCode(10)}`)).toBe('schnell')
  expect(modusAus('sorgfaeltig')).toBe('sorgfaeltig')
  expect(modusAus('Schnell')).toBe('sorgfaeltig')
  expect(modusBefehl('schnell')).toBe('Modus sorgfältig')
  expect(modusBefehl('sorgfaeltig')).toBe('Modus schnell')
})

const WEITER = [
  '**Weiter:** erst `/compact`, dann `/model` → Sonnet, Effort high. Plan ist bindend.',
  'Plan: `docs/plans/2026-11-03-x.md` · danach Opus-Review',
  '',
  '```',
  '/compact Etappe 4 umsetzen; Grundlage docs/plans/2026-11-03-x.md §3',
  '```',
].join('\n')

test('a Weiter hint gives model, effort, its compaction and the plan', async () => {
  expect(modellAus(WEITER)).toEqual({
    modell: 'sonnet',
    effort: 'high',
    compactBefehl: '/compact Etappe 4 umsetzen; Grundlage docs/plans/2026-11-03-x.md §3',
    compactOffen: true,
    plan: 'docs/plans/2026-11-03-x.md',
  })
  expect(modellAus('**Weiter:** `/model` → Opus, Effort xhigh. Ursache unklar.')).toEqual({
    modell: 'opus',
    effort: 'xhigh',
    compactBefehl: null,
    compactOffen: false,
    plan: null,
  })
})

test('staying on the model, or a compact-only hint, is no switch', async () => {
  expect(modellAus('**Modell:** Opus xhigh passt, weil die Ursache unklar ist.')).toBe(null)
  expect(modellAus(COMPACT)).toBe(null)
})

// After the switch's compaction the same hint is read again: it must not compact a second time.
test('the same hint read again keeps the stored switch, a new hint replaces it', async () => {
  const erledigt = { ...modellAus(WEITER)!, compactOffen: false }
  expect(wahlNachAntwort(erledigt, WEITER)).toBe(erledigt)
  expect(wahlNachAntwort(erledigt, 'Alles klar.')).toBe(erledigt)
  expect(wahlNachAntwort(erledigt, '**Weiter:** `/model` → Opus, Effort xhigh.')?.modell).toBe('opus')
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
    { compact: { instructions: 'Etappe 4 umsetzen; Grundlage docs/plans/2026-11-03-x.md §3' } },
    { command: 'model', args: 'sonnet' },
    { command: 'effort', args: 'high' },
    { submit: umsetzBefehl(wahl) },
  ])
  expect(umsetzBefehl(wahl)).toBe('Umsetzen nach Plan docs/plans/2026-11-03-x.md (jetzt Sonnet high).')
})

test('a skipped compaction stops the switch: nothing runs on the wrong model', async () => {
  const a = wechselAttrappe({ mitEffort: true, compactSkip: 'nothing to compact' })
  await modellWechseln(a.$, modellAus(WEITER)!)
  expect(a.schritte).toHaveLength(1)
  expect(a.toasts).toEqual(['Nicht komprimiert: nothing to compact'])
})

test('without an /effort command the effort is named, the switch goes on', async () => {
  const a = wechselAttrappe({ mitEffort: false })
  await modellWechseln(a.$, { ...modellAus(WEITER)!, compactOffen: false })
  expect(a.schritte).toEqual([{ command: 'model', args: 'sonnet' }, { submit: 'Umsetzen nach Plan docs/plans/2026-11-03-x.md (jetzt Sonnet high).' }])
  expect(a.toasts).toEqual(['Effort nicht gesetzt: high bitte per /config'])
})

test('a typed or sent release order counts as a release start', async () => {
  expect(startetRelease('Release nach production')).toBe(true)
  expect(startetRelease('Wann kommt der Release nach production?')).toBe(false)
})

