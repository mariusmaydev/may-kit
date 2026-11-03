import { expect, test } from 'claude-code/testing'

import { compactAnweisung, compactAus, komprimieren, nachAntwort, reviewAus, startetReview } from '../hooks/register'

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
