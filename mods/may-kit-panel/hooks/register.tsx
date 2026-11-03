import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, ElementConstructor, Register, RenderChildren, SvgProps } from 'claude-code'

import type { Hinweis, Modellwahl, Vorher } from '../types'

// may-kit-panel — buttons above the prompt: "Modell", "Review" and "Komprimieren" (plus Live and ⚡).
// "Modell" follows a "**Weiter:**" hint (CLAUDE.md §3): a press runs the /compact the hint puts
// first, then /model and /effort, and sends the order to carry out the task.
// They follow the last answer (CLAUDE.md §3a/§5): the step that is due is drawn
// as the surface's primary button, a press runs it at once. For the review that
// is the order "Review starten" with the commits from the "Commits:" line of a
// REVIEW-EMPFEHLUNG (CLAUDE.md §5: a subagent reviews exactly those commits, the
// session fixes the findings). Without commits the button does nothing: an
// untargeted /code-review would review the parallel sessions' files too.
// While a review or a compaction runs, a spinner stands in for the button.

// The state scan needs string literals here, not a constant.
const hinweis = atom({ plugin: 'may-kit-panel', key: 'hinweis' } as const, null, { shape: 'hinweis-2' })
const komprimiert = atom({ plugin: 'may-kit-panel', key: 'komprimiert' } as const, false)
const modellwahl = atom({ plugin: 'may-kit-panel', key: 'modellwahl' } as const, null)
const vorher = atom({ plugin: 'may-kit-panel', key: 'vorher' } as const, null)
// The repo's working mode (`.claude/arbeitsmodus`, CLAUDE.md "Arbeitsmodus"), null where the repo has none.
const modus = atom({ plugin: 'may-kit-panel', key: 'modus' } as const, null)
// Whether the repo has the release script, and whether a release the Live button sent still runs.
const hatRelease = atom({ plugin: 'may-kit-panel', key: 'hatRelease' } as const, false)
const releaseLaeuft = atom({ plugin: 'may-kit-panel', key: 'releaseLaeuft' } as const, false)
// Whether the "?" button has the explanations open beneath the row (VS Code draws no hover).
const hilfe = atom({ plugin: 'may-kit-panel', key: 'hilfe' } as const, false)

type Dollar = CoreEngineInterface

// Set from the press until the action has handed over (review: the prompt accepted; compact: the
// compaction finished). A second press inside that window would send a second review order or a
// second /compact; the stored state only redraws after the press, so it cannot guard this.
// A module variable on purpose (a reload starts it over), and it lapses after SPERRE_MS: a
// compaction or command that never comes back must not lock the buttons for good.
const SPERRE_MS = 30_000
// A double click's second press, for the tick-off on the spinner; longer, it would block the
// way out exactly when an action hangs.
const DOPPELKLICK_MS = 1_500
type Sperre = { art: 'review' | 'compact' | 'release' | 'modus' | 'modell' | 'zurueck'; seit: number }
let unterwegs: Sperre | null = null
/** The action still handing over, or null once none is or the lock has lapsed. */
const sperre = () => (unterwegs && Date.now() - unterwegs.seit < SPERRE_MS ? unterwegs.art : null)
/** Whether a press on this action's spinner is the second press of the click that started it. */
const doppelklick = (art: Sperre['art']) => unterwegs?.art === art && Date.now() - unterwegs.seit < DOPPELKLICK_MS
const sperren = (art: Sperre['art']): Sperre => (unterwegs = { art, seit: Date.now() })
/** Frees the lock only if it is still this action's: a late finally must not free a newer one. */
const freigeben = (s: Sperre) => {
  if (unterwegs === s) unterwegs = null
}
const schonUnterwegs = (art: Sperre['art']) =>
  ({
    review: 'Das Review wird schon gestartet',
    compact: 'Es wird schon komprimiert',
    release: 'Der Release wird schon gestartet',
    modus: 'Der Modus wird schon umgestellt',
    modell: 'Das Modell wird schon gewechselt',
    zurueck: 'Das Modell wird schon zurückgestellt',
  })[art]

/** A short name for a model id or alias: `claude-opus-5-5` → `Opus`. */
export function modellKurz(modell: string): string {
  const m = modell.match(/opus|sonnet|haiku|fable/i)?.[0]
  return m ? m[0].toUpperCase() + m.slice(1).toLowerCase() : modell
}

/** The model switch of a "**Weiter:**" hint (CLAUDE.md §3), or null when the answer has none. */
export function modellAus(antwort: string): Modellwahl | null {
  const zeile = antwort.match(/\*\*Weiter:\*\*([^\n]*)/)?.[1]
  if (!zeile) return null
  const m = zeile.match(/\/model`?\s*(?:→|->)\s*(Opus|Sonnet)\b/i)
  if (!m) return null
  const e = zeile.match(/Effort\s+(low|medium|high|xhigh)\b/i)
  const compactBefehl = /\/compact\b/.test(zeile) ? compactAus(antwort) ?? '/compact' : null
  const plan = antwort.match(/^[ \t]*Plan:\s*`?([^`\s·]+)`?/m)?.[1] ?? null
  return {
    modell: m[1].toLowerCase() as Modellwahl['modell'],
    effort: (e?.[1]?.toLowerCase() ?? 'high') as Modellwahl['effort'],
    compactBefehl,
    compactOffen: compactBefehl !== null,
    plan,
  }
}

/** The order sent once the model is switched: carry out the task, by the plan when there is one. */
export const umsetzBefehl = (w: Modellwahl) =>
  `Umsetzen${w.plan ? ` nach Plan ${w.plan}` : ''} (jetzt ${w.modell === 'opus' ? 'Opus' : 'Sonnet'} ${w.effort}).`

/**
 * Next pending switch after an answer. The same hint read again (a turn after its compaction)
 * keeps the stored one: its compaction already ran and must not run a second time.
 */
export function wahlNachAntwort(alt: Modellwahl | null, antwort: string): Modellwahl | null {
  const neu = modellAus(antwort)
  if (!neu) return alt
  if (alt && alt.modell === neu.modell && alt.effort === neu.effort && alt.compactBefehl === neu.compactBefehl && alt.plan === neu.plan) return alt
  return neu
}

/** Whether a submitted prompt keeps a pending model switch: the steps of the switch itself. */
const gehoertZumWechsel = (befehl?: string) => befehl === 'compact' || befehl === 'model' || befehl === 'effort'

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

/** The order the Live button sends: the release procedure of the repo's CLAUDE.md. */
export const RELEASE_BEFEHL = 'Release nach production'

/** Whether a submitted prompt starts a release to production. */
export const startetRelease = (text: string) => /^\s*Release nach production\b/i.test(text)

/** The mode in `.claude/arbeitsmodus`; anything but `schnell` counts as `sorgfaeltig` (CLAUDE.md). */
export const modusAus = (text: string): 'schnell' | 'sorgfaeltig' => (text.trim() === 'schnell' ? 'schnell' : 'sorgfaeltig')

/** The order the lightning button sends to switch the mode (CLAUDE.md: the session writes and commits it). */
export const modusBefehl = (jetzt: 'schnell' | 'sorgfaeltig' | null) => (jetzt === 'schnell' ? 'Modus sorgfältig' : 'Modus schnell')

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

/**
 * Next state after an answer; `alt` is the state before it. `agentenLaufen`: a subagent of the
 * main loop is still at work (the review's reviewer runs in the background past the turn).
 */
export function nachAntwort(alt: Hinweis | null, antwort: string, agentenLaufen = false): Hinweis | null {
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
  // 2026-11-03: a review that ended without a result table (refused, no commits found, answered
  // otherwise) kept the spinner for good. With no subagent left at work, nothing runs any more:
  // the row goes neutral rather than claiming a finished review.
  if (laeuft && !agentenLaufen) return null
  return alt
}

/** Reads the repo's mode and release script into the atoms; at session start and after each turn. */
async function umgebungLesen($: Dollar) {
  const m = await $.fs.read('.claude/arbeitsmodus').then(t => modusAus(String(t)), () => null)
  const r = await $.fs.exists('scripts/merge.ps1').catch(() => false)
  if ((await read($, modus)) !== m) await update($, modus, () => m).catch(() => undefined)
  if ((await read($, hatRelease)) !== r) await update($, hatRelease, () => r).catch(() => undefined)
}

// Live and lightning: the order goes out as the person's own prompt, like the review's. The
// session runs it by the repo's CLAUDE.md (release procedure, mode switch with commit).
async function befehlSenden($: Dollar, text: string, s: Sperre, istRelease = false) {
  try {
    if (istRelease) await update($, releaseLaeuft, () => true).catch(() => undefined)
    const r = await $.prompt.submit({ text, asUser: true })
    if (r.drop !== undefined) {
      if (istRelease) await update($, releaseLaeuft, () => false).catch(() => undefined)
      $.ui.toast(`Nicht gesendet: ${r.drop}`)
    }
  } catch (err) {
    if (istRelease) await update($, releaseLaeuft, () => false).catch(() => undefined)
    $.ui.toast(`Nicht gesendet: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    freigeben(s)
  }
}

/** Whether a subagent the main loop started is still at work. */
async function agentenLaufen($: Dollar): Promise<boolean> {
  const agenten = await $.agent.list().catch(() => [])
  return agenten.some(a => a.parentId === undefined && (a.status === 'pending' || a.status === 'running' || a.status === 'waiting'))
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
async function reviewSenden($: Dollar, stand: Hinweis, befehl: string, s: Sperre) {
  try {
    await reviewAbschicken($, stand, befehl)
  } finally {
    freigeben(s)
  }
}

async function reviewAbschicken($: Dollar, stand: Hinweis, befehl: string) {
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
export async function komprimieren($: Dollar, befehl: string | null, s?: Sperre) {
  try {
    await verdichten($, befehl)
  } finally {
    if (s) freigeben(s)
  }
}

/** Compacts; true when the compaction ran (a skip or a failure is toasted). */
async function verdichten($: Dollar, befehl: string | null): Promise<boolean> {
  try {
    const r = await $.session.compact({ instructions: compactAnweisung(befehl) })
    if (r.skip !== undefined) $.ui.toast(`Nicht komprimiert: ${r.skip}`)
    return r.skip === undefined
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err)
    // The VS Code extension runs an SDK session: there compaction only runs as a /compact prompt
    // inside a turn ("not available in a headless (-p / SDK) session"). Run /compact as the
    // person would type it ($.prompt.submit refuses a text starting with "/").
    // Matched on "headless" alone: "SDK" also stands in API errors (@anthropic-ai/sdk), which a
    // second attempt would only hide.
    if (/headless/i.test(grund)) {
      return $.command
        .run({ command: 'compact', args: compactAnweisung(befehl) ?? '' })
        .then(
          () => true,
          (e2: unknown) => ($.ui.toast(`Nicht komprimiert: ${e2 instanceof Error ? e2.message : String(e2)}`), false),
        )
    }
    $.ui.toast(`Nicht komprimiert: ${grund}`)
    return false
  }
}

// Model: the steps the hint names, in its order (CLAUDE.md §3a: compact first, so the stronger
// model still writes the summary), each as the person would type it. A step that fails stops the
// rest: carrying out the task on the wrong model is what the button exists to prevent.
export async function modellWechseln($: Dollar, wahl: Modellwahl, s?: Sperre, aktuell?: Vorher | null) {
  try {
    await vorherMerken($, aktuell === undefined ? await aktuellLesen($) : aktuell)
    if (wahl.compactOffen && !(await verdichten($, wahl.compactBefehl))) return
    await $.command.run({ command: 'model', args: wahl.modell })
    const befehle = await $.command.list().catch(() => [])
    if (befehle.some(c => c.name === 'effort')) await $.command.run({ command: 'effort', args: wahl.effort })
    else $.ui.toast(`Effort nicht gesetzt: ${wahl.effort} bitte per /config`)
    await update($, modellwahl, () => null).catch(() => undefined)
    const r = await $.prompt.submit({ text: umsetzBefehl(wahl), asUser: true })
    if (r.drop !== undefined) $.ui.toast(`Nicht gesendet: ${r.drop}`)
  } catch (err) {
    $.ui.toast(`Modell nicht gewechselt: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (s) freigeben(s)
  }
}

// The model and effort of the main loop's last request (turn.step): what actually ran. The merged
// settings are no stand-in for it, as a project's effortLevel hides the one /effort wrote. A module
// variable: a reload starts it over, and until the next request the settings answer.
let zuletzt: Vorher | null = null

/** What the session runs on now: the last request's, else /model and the effort setting; null if unreadable. */
async function aktuellLesen($: Dollar): Promise<Vorher | null> {
  if (zuletzt) return zuletzt
  try {
    const modell = await $.session.model()
    const effort = await $.settings.read({ key: 'effortLevel' }).catch(() => undefined)
    return { modell, effort: typeof effort === 'string' ? effort : null }
  } catch {
    return null
  }
}

// Only the first switch saves: after Sonnet high → Sonnet medium, "zurück" still means the
// model the person had before the switches, not the one in between.
async function vorherMerken($: Dollar, aktuell: Vorher | null) {
  if (!aktuell) return
  try {
    if ((await read($, vorher)) === null) await update($, vorher, () => aktuell)
  } catch {
    // not saved: the reset button just stays away
  }
}

/** Back to the model and effort from before the first switch; sends no order. */
export async function modellZuruecksetzen($: Dollar, v: Vorher, s?: Sperre) {
  try {
    await $.command.run({ command: 'model', args: v.modell })
    const befehle = await $.command.list().catch(() => [])
    if (v.effort && befehle.some(c => c.name === 'effort')) await $.command.run({ command: 'effort', args: v.effort })
    await update($, vorher, () => null).catch(() => undefined)
    $.ui.toast(`Zurück auf ${modellKurz(v.modell)}${v.effort ? ` ${v.effort}` : ''}`)
  } catch (err) {
    $.ui.toast(`Nicht zurückgestellt: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (s) freigeben(s)
  }
}

// The lightning: U+03DF (koppa), a text glyph shaped like a bolt. A Button holds only text, so
// no SVG icon; and U+26A1 draws as an emoji, which the person does not want.
const BLITZ = 'ϟ'

// A small turning arc, grey at half strength so it reads on light and dark themes.
const SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16">' +
  '<circle cx="8" cy="8" r="6" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="2"/>' +
  '<path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round">' +
  '<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/>' +
  '</path></svg>'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    void umgebungLesen($).catch(() => undefined)
    return r
  })

  // Only watches the request go out (model, effort) and passes the stream through untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) zuletzt = { modell: e.model, effort: typeof e.effort === 'string' ? e.effort : null }
    return yield* next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (startetRelease(e.text)) await update($, releaseLaeuft, () => true).catch(() => undefined)
    // the person answered otherwise (or the switch's own order went out): the hint is spent
    if (!gehoertZumWechsel(e.command?.name)) await update($, modellwahl, () => null).catch(() => undefined)
    if (startetReview(e.text, e.command?.name)) {
      await update($, hinweis, (alt): Hinweis | null => (alt && alt.phase === 'review' ? { ...alt, phase: 'review-laeuft' } : alt)).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const alt = await read($, hinweis)
        const laufen = await agentenLaufen($)
        const antwort = await letzteAntwort($)
        const neu = nachAntwort(alt, antwort, alt?.phase === 'review-laeuft' && laufen)
        const wahlAlt = await read($, modellwahl)
        const wahlNeu = wahlNachAntwort(wahlAlt, antwort)
        if (wahlNeu !== wahlAlt) await update($, modellwahl, () => wahlNeu).catch(() => undefined)
        // a release runs within its turn (merge script, deploys); once no subagent works on, it is done
        if (!laufen && (await read($, releaseLaeuft))) await update($, releaseLaeuft, () => false).catch(() => undefined)
        await umgebungLesen($).catch(() => undefined)
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
      if (r.skip === undefined) {
        await update($, hinweis, () => null).catch(() => undefined)
        // the switch's compaction is done (by its button or by hand); model and effort remain
        await update($, modellwahl, (w): Modellwahl | null => (w ? { ...w, compactOffen: false } : w)).catch(() => undefined)
      }
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
    const modusJetzt = await read($, modus)
    const mitRelease = await read($, hatRelease)
    const laeuftRelease = await read($, releaseLaeuft)
    const schnell = modusJetzt === 'schnell'
    const hilfeOffen = await read($, hilfe)
    const wahl = await read($, modellwahl)
    const zurueckZu = await read($, vorher)
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

    // Spinner plus the running action's name as a plain button: pressed, it clears the indicator
    // by hand, the way out when the end never got reported (a reload, a process that died).
    const laedt = (key: 'review' | 'compact' | 'live', text: string, onPress: () => void) => (
      <Box key={`${key}-laeuft`} flexDirection="row" alignItems="center" columnGap={1}>
        {Svg ? <Svg source={SPINNER} alt="" width={12} height={12} /> : <Text dimColor>◌</Text>}
        <Button key={key} label={text} plain dimColor onPress={onPress} />
      </Box>
    )

    // Nothing stored (a reload or rename lost it, or the answer came before the mod loaded):
    // the press reads the last answer itself, so the buttons never depend on what was stored.
    const reviewDruecken = async () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      const s = sperren('review')
      const jetzt = stand && reviewBefehl ? stand : nachAntwort(null, await letzteAntwort($).catch(() => ''))
      if (!jetzt?.reviewBefehl || jetzt.phase !== 'review') {
        freigeben(s)
        return $.ui.toast('Kein Review empfohlen')
      }
      void reviewSenden($, jetzt, jetzt.reviewBefehl, s) // not awaited, as with compacting below
    }
    // A double click's second press lands here once the row redrew (the spinner keeps the
    // button's key): right after the start it is that press, not a tick-off.
    const reviewAbhaken = () => {
      if (doppelklick('review')) return
      void update($, hinweis, (alt): Hinweis | null => (alt ? { ...alt, phase: 'compact', reviewErledigt: true } : alt)).catch(() => undefined)
      $.ui.toast('Review als erledigt markiert')
    }
    // Always compacts at once (the person's choice, 2026-11-03): with the instructions of the
    // stored hint, else of the last answer's /compact line, else with none.
    const compactDruecken = async () => {
      if (reviewDran) return $.ui.toast('Erst das Review')
      if (reviewLaeuft) return $.ui.toast('Das Review läuft noch')
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      const s = sperren('compact')
      const befehl = compactBefehl ?? compactAus(await letzteAntwort($).catch(() => ''))
      // Not awaited: a press has 10 s, a compaction takes longer (2026-11-03 "ui.press hook
      // skipped: ran past its 10s budget"). The engine lets work a press leaves running finish.
      void komprimieren($, befehl, s)
    }

    // As with the review: nothing stored, the press reads the last answer itself.
    const modellDruecken = async () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      const s = sperren('modell')
      const jetzt = wahl ?? modellAus(await letzteAntwort($).catch(() => ''))
      if (!jetzt) {
        freigeben(s)
        return $.ui.toast('Kein Modellwechsel empfohlen')
      }
      void modellWechseln($, jetzt, s) // not awaited: a compaction runs past the press's 10 s
    }
    const modellName = wahl ? `${wahl.modell === 'opus' ? 'Opus' : 'Sonnet'} ${wahl.effort}` : null
    const vorherName = zurueckZu ? `${modellKurz(zurueckZu.modell)}${zurueckZu.effort ? ` ${zurueckZu.effort}` : ''}` : null
    const zurueckDruecken = () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      if (!zurueckZu) return $.ui.toast('Nichts zurückzustellen')
      void modellZuruecksetzen($, zurueckZu, sperren('zurueck'))
    }

    const liveDruecken = () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      void befehlSenden($, RELEASE_BEFEHL, sperren('release'), true)
    }
    const releaseAbhaken = () => {
      if (doppelklick('release')) return
      void update($, releaseLaeuft, () => false).catch(() => undefined)
    }
    const blitzDruecken = () => {
      if (arbeitet) return $.ui.toast('Claude arbeitet noch, danach nochmal')
      const r = sperre()
      if (r) return $.ui.toast(schonUnterwegs(r))
      void befehlSenden($, modusBefehl(modusJetzt), sperren('modus'))
    }

    // Hover help: each button sits in a Box of its hover group; the matching text, drawn hidden
    // right of the row, shows while the pointer rests on the button (no hook runs, BoxHoverProps).
    const tipps: Array<[string, string]> = [
      [
        'modell',
        wahl
          ? `Wechselt auf ${modellName}${wahl.compactOffen ? ' (vorher komprimieren)' : ''} und schickt den Auftrag zur Umsetzung${wahl.plan ? ` nach ${wahl.plan}` : ''}.`
          : 'Stellt Modell und Effort nach dem letzten „Weiter:“-Hinweis um: /compact (falls genannt), /model, /effort, dann der Auftrag zur Umsetzung.',
      ],
      ['zurueck', `Stellt Modell und Effort zurück auf ${vorherName ?? 'den Stand vor dem ersten Wechsel'}. Schickt keinen Auftrag.`],
      [
        'review',
        reviewLaeuft
          ? 'Das Review läuft. Ein Klick hakt es von Hand ab.'
          : 'Schickt „Review starten“ mit den Commits der letzten REVIEW-EMPFEHLUNG: ein Subagent prüft, die Session behebt, testet und committet.',
      ],
      [
        'compact',
        laeuftCompact
          ? 'Komprimiert gerade. Ein Klick setzt die Anzeige zurück.'
          : 'Komprimiert den Chat sofort, mit der Anweisung aus dem letzten /compact-Hinweis (sonst ohne).',
      ],
      [
        'live',
        laeuftRelease
          ? 'Der Release läuft. Ein Klick setzt die Anzeige zurück.'
          : 'Schickt „Release nach production“ sofort ab: Schema und Functions auf Prod, danach merge.ps1 -Production.',
      ],
      [
        'blitz',
        schnell
          ? 'Schnellmodus an: jede fertige Änderung geht ungefragt und ungeprüft nach Production, für alle Sessions. Klick schaltet aus.'
          : 'Schnellmodus aus (sorgfältig). Klick schaltet ein: dann geht jede fertige Änderung ungefragt und ungeprüft nach Production, für alle Sessions.',
      ],
    ]
    // The same texts as a list beneath the row, for the buttons drawn now; "?" opens and closes it.
    const namen: Record<string, string> = {
      modell: 'Modell + Effort',
      zurueck: 'Zurück',
      review: 'Review',
      compact: 'Komprimieren',
      live: 'Live',
      blitz: BLITZ,
    }
    const sichtbar = tipps.filter(
      ([id]) => (id !== 'live' || mitRelease) && (id !== 'blitz' || modusJetzt !== null) && (id !== 'zurueck' || zurueckZu !== null),
    )
    const hilfeUmschalten = () => {
      void update($, hilfe, offen => !offen).catch(() => undefined)
    }

    const mitTipp = (id: string, inhalt: RenderChildren) => (
      <Box key={`tipp-${id}`} hover={{ scope: `may-kit-panel-${id}` }}>
        {inhalt}
      </Box>
    )

    const compactAbhaken = () => {
      if (doppelklick('compact')) return
      void update($, komprimiert, () => false).catch(() => undefined)
    }

    return (
      <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {modusJetzt !== null
          ? mitTipp(
              'blitz',
              // Only the glyph, no label (the person's wish, 2026-11-03: a label draws as a long button).
              // Grey: careful mode. Yellow: fast mode, every finished change goes to production unasked.
              <Button key="blitz" plain onPress={blitzDruecken}>
                {schnell ? <Text color="warning">{BLITZ}</Text> : <Text dimColor>{BLITZ}</Text>}
              </Button>,
            )
          : null}
        {mitTipp(
          'modell',
          <Button
            key="modell"
            label={modellName ? `→ ${modellName}` : 'Modell + Effort'}
            variant={wahl ? 'primary' : 'secondary'}
            dimColor={!wahl}
            onPress={modellDruecken}
          />,
        )}
        {zurueckZu ? mitTipp('zurueck', <Button key="zurueck" label={`↺ ${vorherName}`} variant="secondary" onPress={zurueckDruecken} />) : null}
        {mitTipp(
          'review',
          reviewLaeuft ? (
            laedt('review', 'Review läuft', reviewAbhaken)
          ) : (
            <Button
              key="review"
              label={reviewErledigt ? '✓ Review' : 'Review'}
              variant={reviewDran ? 'primary' : 'secondary'}
              dimColor={!reviewDran}
              onPress={reviewDruecken}
            />
          ),
        )}
        {mitTipp(
          'compact',
          laeuftCompact ? (
            laedt('compact', 'Komprimiere', compactAbhaken)
          ) : (
            <Button
              key="compact"
              label="Komprimieren"
              variant={compactDran ? 'primary' : 'secondary'}
              dimColor={!compactDran || reviewLaeuft}
              onPress={compactDruecken}
            />
          ),
        )}
        {mitRelease
          ? mitTipp(
              'live',
              laeuftRelease ? (
                laedt('live', 'Live läuft', releaseAbhaken)
              ) : (
                <Button key="live" label="Live" variant="secondary" dimColor onPress={liveDruecken} />
              ),
            )
          : null}
        <Button key="hilfe" label={hilfeOffen ? '? schließen' : '?'} variant="secondary" dimColor onPress={hilfeUmschalten} />
        {tipps.map(([id, text]) => (
          <Box key={`tipptext-${id}`} display="none" hover={{ display: 'flex', scope: `may-kit-panel-${id}` }}>
            <Text dimColor>{text}</Text>
          </Box>
        ))}
      </Box>
      {hilfeOffen
        ? sichtbar.map(([id, text]) => (
            <Box key={`hilfe-${id}`}>
              <Text dimColor wrap="wrap">
                {namen[id]}: {text}
              </Text>
            </Box>
          ))
        : null}
      </Box>
    )
  })
}
