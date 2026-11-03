import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, ElementConstructor, Register, SvgProps } from 'claude-code'

import type { Hinweis } from '../types'

// cockpit — two buttons above the prompt: "Review" and "Komprimieren".
// They follow the last answer (CLAUDE.md §3a/§5): the step that is due is drawn
// as the surface's primary button, a press runs it at once. For the review that
// is the order "Review starten" with the commits from the "Commits:" line of a
// REVIEW-EMPFEHLUNG (CLAUDE.md §5: a subagent reviews exactly those commits, the
// session fixes the findings). Without commits the button does nothing: an
// untargeted /code-review would review the parallel sessions' files too.
// While a review or a compaction runs, a spinner stands in for the button.

// The state scan needs string literals here, not a constant.
const hinweis = atom({ plugin: 'cockpit', key: 'hinweis' } as const, null, { shape: 'hinweis-2' })
const komprimiert = atom({ plugin: 'cockpit', key: 'komprimiert' } as const, false)

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

/** The instructions of a `/compact …` line, what `$.session.compact` takes; undefined when there are none. */
export function compactAnweisung(befehl: string | null): string | undefined {
  const rest = (befehl ?? '').replace(/^\s*\/compact\b/, '').trim()
  return rest || undefined
}

/** Whether an answer reports the review's result (the table "Befund | Ergebnis", §5 step 3). */
const meldetReview = (antwort: string) => /\|\s*Befund\s*\|\s*Ergebnis\s*\|/.test(antwort)

/** Next state after an answer; `alt` is the state before it. */
export function nachAntwort(alt: Hinweis | null, antwort: string): Hinweis | null {
  const review = reviewAus(antwort)
  const compact = compactAus(antwort)
  // A review recommendation always comes first, even if the same answer also offers /compact.
  if (review) return { phase: 'review', reviewBefehl: review, compactBefehl: compact, reviewErledigt: false }
  const laeuft = alt?.phase === 'review-laeuft'
  if (compact || (laeuft && meldetReview(antwort))) {
    if (alt?.phase === 'review') return { ...alt, compactBefehl: compact ?? alt.compactBefehl }
    const erledigt = laeuft || alt?.reviewErledigt === true
    return { phase: 'compact', reviewBefehl: alt?.reviewBefehl ?? null, compactBefehl: compact ?? alt?.compactBefehl ?? null, reviewErledigt: erledigt }
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

const zurueck = ($: Dollar, alt: Hinweis | null) => update($, hinweis, () => alt).catch(() => undefined)

// Review: the order goes out as the person's own prompt, nothing lands in the prompt box.
// The state flips first so the spinner shows at once, and flips back if the prompt is refused.
async function reviewSenden($: Dollar, stand: Hinweis, befehl: string) {
  await update($, hinweis, (): Hinweis => ({ ...stand, phase: 'review-laeuft' })).catch(() => undefined)
  try {
    const r = await $.prompt.submit({ text: befehl, asUser: true })
    if (r.drop !== undefined) {
      await zurueck($, stand)
      $.ui.toast(`Review nicht gestartet: ${r.drop}`)
    }
  } catch (err) {
    await zurueck($, stand)
    $.ui.toast(`Review nicht gestartet: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Compact: straight through the engine, as /compact does. The session.compact hook
// below shows the spinner and clears the hint once the compaction stands.
async function komprimieren($: Dollar, befehl: string | null) {
  try {
    const r = await $.session.compact({ instructions: compactAnweisung(befehl) })
    if (r.skip !== undefined) $.ui.toast(`Nicht komprimiert: ${r.skip}`)
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err)
    // The VS Code extension runs an SDK session: there compaction only runs as a /compact prompt
    // inside a turn ("not available in a headless (-p / SDK) session"). Run /compact as the
    // person would type it ($.prompt.submit refuses a text starting with "/").
    if (/headless|SDK/i.test(grund)) {
      await $.command
        .run({ command: 'compact', args: compactAnweisung(befehl) ?? '' })
        .catch((e2: unknown) => $.ui.toast(`Nicht komprimiert: ${e2 instanceof Error ? e2.message : String(e2)}`))
      return
    }
    $.ui.toast(`Nicht komprimiert: ${grund}`)
  }
}

// A small turning arc, grey at half strength so it reads on light and dark themes.
const SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16">' +
  '<circle cx="8" cy="8" r="6" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="2"/>' +
  '<path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round">' +
  '<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/>' +
  '</path></svg>'

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

  // Any compaction (button, /compact, automatic): spinner while it runs; a compaction
  // that stands starts the row over, a skipped or failed one leaves the hint as it was.
  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId !== undefined) return next(e)
    await update($, komprimiert, () => true).catch(() => undefined)
    try {
      const r = await next(e)
      if (r.skip === undefined) await update($, hinweis, () => null).catch(() => undefined)
      return r
    } finally {
      await update($, komprimiert, () => false).catch(() => undefined)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Never name a variable `h`: JSX compiles to the global `h`, a local one shadows it.
    const stand = await read($, hinweis)
    const laeuftCompact = await read($, komprimiert)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? (els.Svg as ElementConstructor<SvgProps>) : undefined
    const arbeitet = e.props.isWorking

    const reviewDran = stand?.phase === 'review'
    const reviewLaeuft = stand?.phase === 'review-laeuft'
    const reviewErledigt = stand?.reviewErledigt === true
    const compactDran = stand?.phase === 'compact'
    const reviewBefehl = stand?.reviewBefehl ?? null
    const compactBefehl = stand?.compactBefehl ?? null

    const laedt = (key: string, text: string) => (
      <Box key={key} flexDirection="row" alignItems="center" columnGap={1}>
        {Svg ? <Svg source={SPINNER} alt="" width={12} height={12} /> : <Text dimColor>◌</Text>}
        <Text dimColor>{text}</Text>
      </Box>
    )

    // Nothing stored (a reload or rename lost it, or the answer came before the mod loaded):
    // the press reads the last answer itself, so the buttons never depend on what was stored.
    const reviewDruecken = async () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const jetzt = stand && reviewBefehl ? stand : nachAntwort(null, await letzteAntwort($).catch(() => ''))
      if (!jetzt?.reviewBefehl || jetzt.phase !== 'review') return $.ui.toast('Kein Review empfohlen')
      await reviewSenden($, jetzt, jetzt.reviewBefehl)
    }
    const reviewAbhaken = () => {
      void update($, hinweis, (alt): Hinweis | null => (alt ? { ...alt, phase: 'compact', reviewErledigt: true } : alt)).catch(() => undefined)
      $.ui.toast('Review als erledigt markiert')
    }
    // Always compacts at once (the person's choice, 2026-11-03): with the instructions of the
    // stored hint, else of the last answer's /compact line, else with none.
    const compactDruecken = async () => {
      if (reviewDran) return $.ui.toast('Erst das Review')
      if (reviewLaeuft) return $.ui.toast('Das Review läuft noch')
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const befehl = compactBefehl ?? compactAus(await letzteAntwort($).catch(() => ''))
      await komprimieren($, befehl)
    }

    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {reviewLaeuft ? (
          // The spinner's text is a plain button: pressed, it ticks the review off by hand,
          // the way out when no answer reported the result (or one came before a reload).
          <Box key="review-laeuft" flexDirection="row" alignItems="center" columnGap={1}>
            {Svg ? <Svg source={SPINNER} alt="" width={12} height={12} /> : <Text dimColor>◌</Text>}
            <Button key="review" label="Review läuft" plain dimColor onPress={reviewAbhaken} />
          </Box>
        ) : (
          <Button
            key="review"
            label={reviewErledigt ? '✓ Review' : 'Review'}
            variant={reviewDran ? 'primary' : 'secondary'}
            dimColor={!reviewDran}
            onPress={reviewDruecken}
          />
        )}
        {laeuftCompact ? (
          laedt('compact-laeuft', 'Komprimiere')
        ) : (
          <Button
            key="compact"
            label="Komprimieren"
            variant={compactDran ? 'primary' : 'secondary'}
            dimColor={!compactDran || reviewLaeuft}
            onPress={compactDruecken}
          />
        )}
      </Box>
    )
  })
}
