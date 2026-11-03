import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register } from 'claude-code'

import type { Hinweis } from '../types'

// realesos-cockpit — two buttons above the prompt: "Review" and "Komprimieren".
// They follow the last answer (CLAUDE.md §3a/§5): the step that is due is
// highlighted, a press puts its command into the prompt box. The review command
// is taken from the "Befehl:" line of a REVIEW-EMPFEHLUNG, which names this
// session's own commits; without it the button does nothing, because an
// untargeted /code-review would also review the parallel sessions' files.

// The state scan needs string literals here, not a constant.
const hinweis = atom({ plugin: 'realesos-cockpit', key: 'hinweis' } as const, null, { shape: 'hinweis-2' })

type Dollar = CoreEngineInterface

/** The `/code-review …` command of a REVIEW-EMPFEHLUNG, only when it names commits. */
export function reviewAus(antwort: string): string | null {
  if (!/REVIEW-EMPFEHLUNG/.test(antwort) || !/Opus-Review empfohlen:\s*Ja/i.test(antwort)) return null
  const befehl = antwort.match(/Befehl:\s*`?(\/code-review\b[^`\n]*)`?/)?.[1]?.trim()
  // A target is required: at least one short SHA after the optional effort.
  return befehl && /\b[0-9a-f]{7,40}\b/.test(befehl) ? befehl : null
}

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

const eintragen = ($: Dollar, text: string) => void $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.command?.name === 'code-review') {
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
          onPress={() => (reviewBefehl ? eintragen($, reviewBefehl) : $.ui.toast('Kein Review empfohlen'))}
        >
          <Text color={reviewDran ? 'claude' : reviewErledigt ? 'success' : 'subtle'} bold={reviewDran}>
            {reviewErledigt ? '✓ Review' : reviewLaeuft ? 'Review läuft' : 'Review'}
          </Text>
        </Button>
        <Text color="subtle">→</Text>
        <Button
          key="compact"
          label="Komprimieren"
          onPress={() => (reviewDran ? $.ui.toast('Erst das Review') : eintragen($, compactBefehl ?? '/compact '))}
        >
          <Text color={compactDran ? 'claude' : 'subtle'} bold={compactDran}>Komprimieren</Text>
        </Button>
      </Box>
    )
  })
}
