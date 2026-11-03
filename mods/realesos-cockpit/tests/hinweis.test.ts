import { expect, test } from 'claude-code/testing'

import { compactAus, nachAntwort, reviewAus } from '../hooks/register'

const REVIEW = [
  'Fertig: E12.c auf Dev.',
  '```',
  'REVIEW-EMPFEHLUNG',
  '- Opus-Review empfohlen: Ja',
  '- Modell / Effort: Opus / xhigh',
  '- Begründung: Art. 18',
  '- Befehl: /code-review xhigh 3f2a1b9 7c0d4e2',
  '```',
].join('\n')

const COMPACT = [
  '**Jetzt komprimieren:** E12.c fertig, Stand im Plan.',
  '',
  '```',
  '/compact Weiter E-Mail: E12.d; Grundlage docs/plans/x.md §G',
  '```',
].join('\n')

test('the review command is the Befehl line with its commits', async () => {
  expect(reviewAus(REVIEW)).toBe('/code-review xhigh 3f2a1b9 7c0d4e2')
})

test('a review without commit target gives no command (it would review other sessions)', async () => {
  expect(reviewAus(REVIEW.replace(' 3f2a1b9 7c0d4e2', ''))).toBe(null)
  expect(reviewAus('Kein Review nötig.')).toBe(null)
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

test('a compact hint while the review is still open keeps review due', async () => {
  const offen = { phase: 'review' as const, reviewBefehl: '/code-review high 3f2a1b9', compactBefehl: null, reviewErledigt: false }
  expect(nachAntwort(offen, COMPACT)?.phase).toBe('review')
})

test('an answer without a hint leaves the state as it was', async () => {
  expect(nachAntwort(null, 'Alles erledigt.')).toBe(null)
})
