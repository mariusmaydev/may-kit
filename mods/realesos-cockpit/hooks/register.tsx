import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register } from 'claude-code'

import type { Hinweis } from '../types'

// realesos-cockpit — two buttons above the prompt: "Review" and "Komprimieren".
// They follow the last answer (CLAUDE.md §3a/§5): the step that is due is
// highlighted, a press runs it at once (nothing goes through the prompt box). For the review that is
// the order "Review starten" with the commits from the "Commits:" line of a
// REVIEW-EMPFEHLUNG (CLAUDE.md §5: a subagent reviews exactly those commits, the
// session fixes the findings). Without commits the button does nothing: an
// untargeted /code-review would review the parallel sessions' files too.

// The state scan needs string literals here, not a constant.
const hinweis = atom({ plugin: 'realesos-cockpit', key: 'hinweis' } as const, null, { shape: 'hinweis-2' })

type Dollar = CoreEngineInterface

/** The "Review starten" order for a REVIEW-EMPFEHLUNG, only when it names commits. */
export function reviewAus(antwort: string): string | null {
  if (!/REVIEW-EMPFEHLUNG/.test(antwort) || !/Opus-Review empfohlen:\s*Ja/i.test(antwort)) return null
  const zeile = antwort.match(/Commits:\s*([^\n]*)/)?.[1] ?? ''
  const shas = zeile.match(/\b[0-9a-f]{7,40}\b/g) ?? []
  if (shas.length === 0) return null
  const m = antwort.match(/Modell\s*\/\s*Effort:\s*(Opus|Sonnet)\s*\/\s*(low|medium|high|xhigh)\b/i)
  const modell = m?.[1] ?? 'Opus'
  const effort = (m?.[2] ?? 'high').toLowerCase()
  return `Review starten: Commits ${shas.join(' ')}, Subagent ${modell}/${effort}. Befunde in deinen Dateien beheben, testen, committen.`
}

/** Whether a submitted prompt starts the review. */
export const startetReview = (text: string, befehl?: string) =>
  befehl === 'code-review' || /^\s*Review starten\b/i.test(text)

/** The `/compact …` line of a compact hint (a line of its own, as §3a prescribes), or null. */
export function compactAus(antwort: string): string | null {
  if (!/Jetzt komprimieren|\*\*Weiter:\*\*/.test(antwort)) return null
  return antwort.match(/^[ \t]*(\/compact\b[^\n]*)$/m)?.[1]?.trim() ?? null
}

/** Next state after an answer; `alt` is the state before it. */
export function nachAntwort(alt: Hinweis | null, antwort: string): Hinweis | null {
  const review = reviewAus(antwort)
  const compact = compactAus(antwort)
  // A review recommendation always comes first, even if the same answer also offers /compact.
  if (review) return { phase: 'review', reviewBefehl: review, compactBefehl: compact, reviewErledigt: false }
  if (compact) {
    if (alt?.phase === 'review') return { ...alt, compactBefehl: compact }
    const erledigt = alt?.phase === 'review-laeuft' || alt?.reviewErledigt === true
    return { phase: 'compact', reviewBefehl: alt?.reviewBefehl ?? null, compactBefehl: compact, reviewErledigt: erledigt }
  }
  return alt
}

async function letzteAntwort($: Dollar): Promise<string> {
  const msgs = await $.session.messages()
  if (!Array.isArray(msgs)) return ''
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m && m.role === 'assistant' && m.text.trim()) return m.text
  }
  return ''
}

/** The instructions of a `/compact …` line, what `$.session.compact` takes; undefined when there are none. */
export function compactAnweisung(befehl: string | null): string | undefined {
  const rest = (befehl ?? '').replace(/^\s*\/compact\b/, '').trim()
  return rest || undefined
}

// Review: the order goes out as the person's own prompt, nothing lands in the prompt box.
async function reviewSenden($: Dollar, befehl: string) {
  await update($, hinweis, (alt): Hinweis | null => (alt ? { ...alt, phase: 'review-laeuft' } : alt)).catch(() => undefined)
  await $.prompt.submit({ text: befehl, asUser: true }).catch(() => $.ui.toast('Review ließ sich nicht starten'))
}

// Compact: straight through the engine, as /compact does; it refuses while a turn runs.
async function komprimieren($: Dollar, befehl: string | null) {
  $.ui.toast('Komprimiere …')
  try {
    const r = await $.session.compact({ instructions: compactAnweisung(befehl) })
    if ('skip' in r && r.skip) return $.ui.toast(`Nicht komprimiert: ${r.skip}`)
    await update($, hinweis, () => null)
  } catch {
    $.ui.toast('Claude arbeitet noch, danach nochmal')
  }
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (startetReview(e.text, e.command?.name)) {
      await update($, hinweis, (alt): Hinweis | null => (alt && alt.phase === 'review' ? { ...alt, phase: 'review-laeuft' } : alt)).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const alt = await read($, hinweis)
        const neu = nachAntwort(alt, await letzteAntwort($))
        if (JSON.stringify(neu) !== JSON.stringify(alt)) await update($, hinweis, () => neu)
      } catch {
        // reading the transcript failed: keep the buttons as they were
      }
    }
    return next(e)
  })

  // Compacting (by hand or automatically) starts over.
  on('session.compact', async ($, e, next) => {
    if (e.trigger !== 'precompute' && e.agentId === undefined) await update($, hinweis, () => null).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Never name a variable `h`: JSX compiles to the global `h`, a local one shadows it.
    const stand = await read($, hinweis)
    const { Box, Text, Button } = $.ui.resolve(e)

    const reviewDran = stand?.phase === 'review'
    const reviewLaeuft = stand?.phase === 'review-laeuft'
    const reviewErledigt = stand?.reviewErledigt === true
    const compactDran = stand?.phase === 'compact'
    const reviewBefehl = stand?.reviewBefehl ?? null
    const compactBefehl = stand?.compactBefehl ?? null

    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        <Button
          key="review"
          label="Review"
          onPress={() => (reviewBefehl ? void reviewSenden($, reviewBefehl) : $.ui.toast('Kein Review empfohlen'))}
        >
          <Text color={reviewDran ? 'claude' : reviewErledigt ? 'success' : 'subtle'} bold={reviewDran}>
            {reviewErledigt ? '✓ Review' : reviewLaeuft ? 'Review läuft' : 'Review'}
          </Text>
        </Button>
        <Text color="subtle">→</Text>
        <Button
          key="compact"
          label="Komprimieren"
          onPress={() => (reviewDran ? $.ui.toast('Erst das Review') : void komprimieren($, compactBefehl))}
        >
          <Text color={compactDran ? 'claude' : 'subtle'} bold={compactDran}>Komprimieren</Text>
        </Button>
      </Box>
    )
  })
}
