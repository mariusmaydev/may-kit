import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, ElementConstructor, Register, RenderChildren, SvgProps } from 'claude-code'

import type { Hinweis, Modellwahl, Sprache, Vorher } from '../types'

// may-kit-panel — buttons above the prompt: "Model + Effort", "Review" and "Compact" (plus Live and ⚡).
// "Model + Effort" follows a "**Next:**" hint (CLAUDE.md §3): a press runs the /compact the hint puts
// first, then /model and /effort, and sends the order to carry out the task.
// "Compact", pressed right after a "**Compact now:**" hint, sends the order to go on once compacted.
// They follow the last answer (CLAUDE.md §3a/§5): the step that is due is drawn
// as the surface's primary button, a press runs it at once. For the review that
// is the order "Start review" with the commits from the "Commits:" line of a
// REVIEW RECOMMENDATION (CLAUDE.md §5: a subagent reviews exactly those commits, the
// session fixes the findings). Without commits the button does nothing: an
// untargeted /code-review would review the parallel sessions' files too.
// While a review or a compaction runs, a spinner stands in for the button.
//
// Language: the markers Claude writes are English and stay verbatim in every answer language; the
// former German markers ("**Weiter:**", "REVIEW-EMPFEHLUNG", …) are still recognised. The panel's
// own texts and the orders it sends follow the `language` setting (German → "de", else "en").

// The state scan needs string literals here, not a constant.
const hinweis = atom({ plugin: 'may-kit-panel', key: 'hinweis' } as const, null, { shape: 'hinweis-2' })
const komprimiert = atom({ plugin: 'may-kit-panel', key: 'komprimiert' } as const, false)
const modellwahl = atom({ plugin: 'may-kit-panel', key: 'modellwahl' } as const, null)
const vorher = atom({ plugin: 'may-kit-panel', key: 'vorher' } as const, null)
// The repo's working mode (`.claude/working-mode`, CLAUDE.md §5), null where the repo has none.
const modus = atom({ plugin: 'may-kit-panel', key: 'modus' } as const, null)
// Whether the repo has the release script, and whether a release the Live button sent still runs.
const hatRelease = atom({ plugin: 'may-kit-panel', key: 'hatRelease' } as const, false)
// Whether the repo has the session-lock hook (`.claude/hooks/sperren.mjs`), and whether this machine's
// override file `.claude/sperren.local` switches its heavy-load lock ("schwerlast") off.
const hatSperren = atom({ plugin: 'may-kit-panel', key: 'hatSperren' } as const, false)
const schwerlastAus = atom({ plugin: 'may-kit-panel', key: 'schwerlastAus' } as const, false)
const releaseLaeuft = atom({ plugin: 'may-kit-panel', key: 'releaseLaeuft' } as const, false)
// Whether the "?" button has the explanations open beneath the row (VS Code draws no hover).
const hilfe = atom({ plugin: 'may-kit-panel', key: 'hilfe' } as const, false)
// The language of the panel's texts and orders, read from the `language` setting.
const sprache = atom({ plugin: 'may-kit-panel', key: 'sprache' } as const, 'en')

type Dollar = CoreEngineInterface

/** The panel language for the value of the `language` setting: German → "de", anything else or unset → "en". */
export const spracheAus = (wert: unknown): Sprache =>
  typeof wert === 'string' && /^(german|deutsch|de)\b/i.test(wert.trim()) ? 'de' : 'en'

/** A model's display name in the orders and labels. */
const modellName = (m: Modellwahl['modell']) => (m === 'opus' ? 'Opus' : 'Sonnet')

// The panel's own texts and the orders it sends, per language. The German side is the wording the
// panel always had; German orders stay character-identical, because projects' CLAUDE.md files
// refer to them ("Review starten", "Release nach production", "Modus schnell").
const DE = {
  modell: 'Modell + Effort',
  zurueck: 'Zurück',
  review: 'Review',
  compact: 'Komprimieren',
  live: 'Live',
  reviewLaeuft: 'Review läuft',
  compactLaeuft: 'Komprimiere',
  liveLaeuft: 'Live läuft',
  hilfeZu: '? schließen',
  unterwegs: {
    review: 'Das Review wird schon gestartet',
    compact: 'Es wird schon komprimiert',
    release: 'Der Release wird schon gestartet',
    modus: 'Der Modus wird schon umgestellt',
    modell: 'Das Modell wird schon gewechselt',
    zurueck: 'Das Modell wird schon zurückgestellt',
  },
  arbeitet: 'Claude arbeitet noch, danach nochmal',
  keinReview: 'Kein Review empfohlen',
  keinWechsel: 'Kein Modellwechsel empfohlen',
  nichtsZurueck: 'Nichts zurückzustellen',
  reviewLaeuftNoch: 'Das Review läuft noch',
  reviewErledigt: 'Review als erledigt markiert',
  nichtGesendet: (g: string) => `Nicht gesendet: ${g}`,
  reviewNichtGestartet: (g: string) => `Review nicht gestartet: ${g}`,
  nichtKomprimiert: (g: string) => `Nicht komprimiert: ${g}`,
  effortNichtGesetzt: (effort: string) => `Effort nicht gesetzt: ${effort} bitte per /config`,
  nichtGewechselt: (g: string) => `Modell nicht gewechselt: ${g}`,
  zurueckAuf: (name: string) => `Zurück auf ${name}`,
  nichtZurueckgestellt: (g: string) => `Nicht zurückgestellt: ${g}`,
  // the orders the panel sends
  umsetzen: (plan: string | null, modell: string, effort: string) => `Umsetzen${plan ? ` nach Plan ${plan}` : ''} (jetzt ${modell} ${effort}).`,
  reviewStarten: (shas: string, modell: string, effort: string) =>
    `Review starten: Commits ${shas}, Subagent ${modell}/${effort}. Befunde in deinen Dateien beheben, testen, committen.`,
  weiter: 'Komprimiert. Weiter mit dem nächsten Abschnitt.',
  release: 'Release nach production',
  modusSchnell: 'Modus schnell',
  modusSorgfaeltig: 'Modus sorgfältig',
  tipp: {
    modellMit: (name: string, compactOffen: boolean, plan: string | null) =>
      `Wechselt auf ${name}${compactOffen ? ' (vorher komprimieren)' : ''} und schickt den Auftrag zur Umsetzung${plan ? ` nach ${plan}` : ''}.`,
    modellOhne: 'Stellt Modell und Effort nach dem letzten „Weiter:“-Hinweis um: /compact (falls genannt), /model, /effort, dann der Auftrag zur Umsetzung.',
    zurueck: (vorher: string | null) => `Stellt Modell und Effort zurück auf ${vorher ?? 'den Stand vor dem ersten Wechsel'}. Schickt keinen Auftrag.`,
    reviewLaeuft: 'Das Review läuft. Ein Klick hakt es von Hand ab.',
    review: 'Schickt „Review starten“ mit den Commits der letzten REVIEW-EMPFEHLUNG: ein Subagent prüft, die Session behebt, testet und committet.',
    compactLaeuft: 'Komprimiert gerade. Ein Klick setzt die Anzeige zurück.',
    compact:
      'Komprimiert den Chat sofort, mit der Anweisung aus dem letzten /compact-Hinweis (sonst ohne). Direkt nach einem solchen Hinweis geht die Arbeit danach von selbst weiter.',
    liveLaeuft: 'Der Release läuft. Ein Klick setzt die Anzeige zurück.',
    live: 'Schickt „Release nach production“ sofort ab: Schema und Functions auf Prod, danach merge.ps1 -Production.',
    blitzAn: 'Schnellmodus an: jede fertige Änderung geht ungefragt und ungeprüft nach Production, für alle Sessions. Klick schaltet aus.',
    blitzAus:
      'Schnellmodus aus (sorgfältig). Klick schaltet ein: dann geht jede fertige Änderung ungefragt und ungeprüft nach Production, für alle Sessions.',
    schwerAn:
      'Schwerlast-Sperre aus, nur auf diesem Rechner (.claude/sperren.local): Typprüfung und volle Tests laufen ohne Warten auf andere Sessions. Klick schaltet die Sperre wieder ein.',
    schwerAus:
      'Schwerlast-Sperre an: Typprüfung und volle Tests laufen nur eine Session zugleich. Klick schaltet sie auf diesem Rechner aus (.claude/sperren.local), sinnvoll bei viel Arbeitsspeicher.',
  },
  schwerToastAus: 'Schwerlast-Sperre aus (nur dieser Rechner)',
  schwerToastAn: 'Schwerlast-Sperre an',
  schwerNichtGeschrieben: (g: string) => `Schwerlast-Sperre nicht umgestellt: ${g}`,
  updateFertig: (n: number, betreff: string) => `may-kit aktualisiert (${n} ${n === 1 ? 'Commit' : 'Commits'}): ${betreff}. Neue Chats nutzen es.`,
  updateInstallerSelbst: 'may-kit wurde geändert: Installer bitte selbst laufen lassen (INSTALL.md).',
  updateInstallerFehler: (g: string) => `may-kit gezogen, der Installer meldet: ${g}`,
  updateWartet: (grund: string) => `may-kit-Update wartet: ${grund}`,
  updateGrund: {
    branch: (b: string) => `der Klon steht auf ${b}, nicht auf main`,
    aenderungen: 'lokale Änderungen im Klon',
    voraus: 'eigene Commits im Klon, noch nicht gepusht',
    pull: (g: string) => `git pull fehlgeschlagen (${g})`,
  },
  hilfeUpdate: 'Updates: Das Panel prüft einmal am Tag auf GitHub und installiert neue Versionen selbst. Neue Chats nutzen sie.',
}

const EN: typeof DE = {
  modell: 'Model + Effort',
  zurueck: 'Back',
  review: 'Review',
  compact: 'Compact',
  live: 'Live',
  reviewLaeuft: 'Review running',
  compactLaeuft: 'Compacting',
  liveLaeuft: 'Live running',
  hilfeZu: '? close',
  unterwegs: {
    review: 'The review is already starting',
    compact: 'Already compacting',
    release: 'The release is already starting',
    modus: 'The mode is already being switched',
    modell: 'The model is already being switched',
    zurueck: 'The model is already being restored',
  },
  arbeitet: 'Claude is still working, try again afterwards',
  keinReview: 'No review recommended',
  keinWechsel: 'No model switch recommended',
  nichtsZurueck: 'Nothing to restore',
  reviewLaeuftNoch: 'The review is still running',
  reviewErledigt: 'Review marked as done',
  nichtGesendet: (g: string) => `Not sent: ${g}`,
  reviewNichtGestartet: (g: string) => `Review not started: ${g}`,
  nichtKomprimiert: (g: string) => `Not compacted: ${g}`,
  effortNichtGesetzt: (effort: string) => `Effort not set: ${effort}, please use /config`,
  nichtGewechselt: (g: string) => `Model not switched: ${g}`,
  zurueckAuf: (name: string) => `Back to ${name}`,
  nichtZurueckgestellt: (g: string) => `Not restored: ${g}`,
  umsetzen: (plan: string | null, modell: string, effort: string) => `Implement${plan ? ` per plan ${plan}` : ''} (now ${modell} ${effort}).`,
  reviewStarten: (shas: string, modell: string, effort: string) =>
    `Start review: commits ${shas}, subagent ${modell}/${effort}. Fix findings in your files, test, commit.`,
  weiter: 'Compacted. Continue with the next section.',
  release: 'Release to production',
  modusSchnell: 'Mode fast',
  modusSorgfaeltig: 'Mode careful',
  tipp: {
    modellMit: (name: string, compactOffen: boolean, plan: string | null) =>
      `Switches to ${name}${compactOffen ? ' (compacting first)' : ''} and sends the order to carry out the task${plan ? ` per ${plan}` : ''}.`,
    modellOhne: 'Switches model and effort after the last “Next:” hint: /compact (if named), /model, /effort, then the order to carry out the task.',
    zurueck: (vorher: string | null) => `Restores model and effort to ${vorher ?? 'the state before the first switch'}. Sends no order.`,
    reviewLaeuft: 'The review is running. A click ticks it off by hand.',
    review: 'Sends “Start review” with the commits of the last REVIEW RECOMMENDATION: a subagent reviews, the session fixes, tests and commits.',
    compactLaeuft: 'Compacting now. A click resets the indicator.',
    compact:
      'Compacts the chat at once, with the instructions from the last /compact hint (none otherwise). Right after such a hint the work then goes on by itself.',
    liveLaeuft: 'The release is running. A click resets the indicator.',
    live: 'Sends “Release to production” at once; the project’s CLAUDE.md defines what that means.',
    blitzAn: 'Fast mode on: every finished change goes to production unasked and unchecked, for all sessions. Click switches it off.',
    blitzAus: 'Fast mode off (careful). Click switches it on: every finished change then goes to production unasked and unchecked, for all sessions.',
    schwerAn:
      'Heavy-load lock off, on this machine only (.claude/sperren.local): type check and full tests run without waiting for other sessions. Click switches the lock back on.',
    schwerAus:
      'Heavy-load lock on: type check and full tests run one session at a time. Click switches it off on this machine (.claude/sperren.local), sensible with plenty of memory.',
  },
  schwerToastAus: 'Heavy-load lock off (this machine only)',
  schwerToastAn: 'Heavy-load lock on',
  schwerNichtGeschrieben: (g: string) => `Heavy-load lock not switched: ${g}`,
  updateFertig: (n: number, betreff: string) => `may-kit updated (${n} ${n === 1 ? 'commit' : 'commits'}): ${betreff}. New chats use it.`,
  updateInstallerSelbst: 'may-kit changed: please run the installer yourself (INSTALL.md).',
  updateInstallerFehler: (g: string) => `may-kit pulled, the installer reports: ${g}`,
  updateWartet: (grund: string) => `may-kit update waiting: ${grund}`,
  updateGrund: {
    branch: (b: string) => `the clone is on ${b}, not on main`,
    aenderungen: 'local changes in the clone',
    voraus: 'commits of its own in the clone, not pushed yet',
    pull: (g: string) => `git pull failed (${g})`,
  },
  hilfeUpdate: 'Updates: once a day the panel checks GitHub and installs new versions by itself. New chats use them.',
}

const TEXTE: Record<Sprache, typeof DE> = { de: DE, en: EN }

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

/** A short name for a model id or alias: `claude-opus-5-5` → `Opus`. */
export function modellKurz(modell: string): string {
  const m = modell.match(/opus|sonnet|haiku|fable/i)?.[0]
  return m ? m[0].toUpperCase() + m.slice(1).toLowerCase() : modell
}

/** The model switch of a "**Next:**" hint (CLAUDE.md §3; the former "**Weiter:**" counts too), or null when the answer has none. */
export function modellAus(antwort: string): Modellwahl | null {
  const zeile = antwort.match(/\*\*(?:Weiter|Next):\*\*([^\n]*)/)?.[1]
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
export const umsetzBefehl = (w: Modellwahl, sprache: Sprache = 'en') => TEXTE[sprache].umsetzen(w.plan, modellName(w.modell), w.effort)

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

/** The "Start review" order for a REVIEW RECOMMENDATION (or the former REVIEW-EMPFEHLUNG), only when it names commits. */
export function reviewAus(antwort: string, sprache: Sprache = 'en'): string | null {
  if (!/REVIEW RECOMMENDATION|REVIEW-EMPFEHLUNG/.test(antwort) || !/(?:Opus review recommended|Opus-Review empfohlen):\s*(?:Yes|Ja)/i.test(antwort)) return null
  const zeile = antwort.match(/Commits:\s*([^\n]*)/)?.[1] ?? ''
  const shas = zeile.match(/\b[0-9a-f]{7,40}\b/g) ?? []
  if (shas.length === 0) return null
  const m = antwort.match(/(?:Model|Modell)\s*\/\s*Effort:\s*(Opus|Sonnet)\s*\/\s*(low|medium|high|xhigh)\b/i)
  const modell = m?.[1] ?? 'Opus'
  const effort = (m?.[2] ?? 'high').toLowerCase()
  return TEXTE[sprache].reviewStarten(shas.join(' '), modell, effort)
}

/** The order the Live button sends: the release procedure of the repo's CLAUDE.md. */
export const releaseBefehl = (sprache: Sprache = 'en') => TEXTE[sprache].release

/** Whether a submitted prompt starts a release to production (in either panel language). */
export const startetRelease = (text: string) => /^\s*(?:Release nach production|Release to production)\b/i.test(text)

/** The mode in `.claude/working-mode` (or the former `.claude/arbeitsmodus`); anything but `fast`/`schnell` counts as careful. */
export const modusAus = (text: string): 'schnell' | 'sorgfaeltig' => (['schnell', 'fast'].includes(text.trim()) ? 'schnell' : 'sorgfaeltig')

/** The order the lightning button sends to switch the mode (CLAUDE.md: the session writes and commits it). */
export const modusBefehl = (jetzt: 'schnell' | 'sorgfaeltig' | null, sprache: Sprache = 'en') =>
  jetzt === 'schnell' ? TEXTE[sprache].modusSorgfaeltig : TEXTE[sprache].modusSchnell

/** The areas listed in the "ohne:" line of a lock switch file (`.claude/sperren` or `.claude/sperren.local`). */
const ohneListe = (text: string): string[] => ((text.match(/^[ \t]*ohne:[ \t]*(.*)$/im) || [])[1] || '').split(/[\s,]+/).filter(Boolean)

/** Whether the machine's override file switches the heavy-load lock off: first word "aus", or "schwerlast" in its "ohne:" line. */
export const schwerlastAusAus = (text: string): boolean => /^\s*aus\b/i.test(text) || ohneListe(text).includes('schwerlast')

/**
 * The override file's text after the heavy-load button was pressed. Only "schwerlast" (and an "aus"
 * line, which switches every area off) is touched; other areas in "ohne:" and other lines stay.
 */
export function schwerlastUmschalten(text: string): string {
  const warAus = schwerlastAusAus(text)
  const zeilen = text.split(/\r?\n/).filter(z => !/^\s*aus\b/i.test(z))
  const liste = ohneListe(zeilen.join('\n')).filter(b => b !== 'schwerlast')
  if (!warAus) liste.push('schwerlast')
  const uebrig = zeilen.filter(z => z.trim() !== '' && !/^[ \t]*ohne:/i.test(z))
  const aus = liste.length > 0 ? [`ohne: ${liste.join(', ')}`] : []
  const alle = [...uebrig, ...aus]
  return alle.length > 0 ? `${alle.join('\n')}\n` : ''
}

/** Whether a submitted prompt starts the review (in either panel language). */
export const startetReview = (text: string, befehl?: string) =>
  befehl === 'code-review' || /^\s*(?:Review starten|Start review)\b/i.test(text)

/** The `/compact …` line of a compact hint (a line of its own, as §3a prescribes), or null. */
export function compactAus(antwort: string): string | null {
  if (!/Compact now|Jetzt komprimieren|\*\*(?:Weiter|Next):\*\*/.test(antwort)) return null
  return antwort.match(/^[ \t]*(\/compact\b[^\n]*)$/m)?.[1]?.trim() ?? null
}

/** The instructions of a `/compact …` line, what `$.session.compact` takes; undefined when there are none. */
export function compactAnweisung(befehl: string | null): string | undefined {
  const rest = (befehl ?? '').replace(/^\s*\/compact\b/, '').trim()
  return rest || undefined
}

/**
 * Whether the Compact button sends the order to go on once its compaction stands (2026-11-10: the
 * person had to write "compacted" by hand each time). Only when the last answer itself carries the
 * compact hint: a hint from turns ago names a goal the conversation has left behind. And never while
 * a model switch is pending: going on is then the "Model + Effort" button's part, on the right model.
 */
export const gehtWeiter = (antwort: string, wechselOffen: boolean) =>
  compactAus(antwort) !== null && !wechselOffen && modellAus(antwort) === null

/** The order the Compact button sends after its compaction. */
export const weiterBefehl = (sprache: Sprache = 'en') => TEXTE[sprache].weiter

/** Whether an answer reports the review's result (the table "Finding | Result", or "Befund | Ergebnis", §5 step 3). */
const meldetReview = (antwort: string) => /\|\s*(?:Finding|Befund)\s*\|\s*(?:Result|Ergebnis)\s*\|/.test(antwort)

/**
 * Next state after an answer; `alt` is the state before it. `agentenLaufen`: a subagent of the
 * main loop is still at work (the review's reviewer runs in the background past the turn).
 * `sprache` is the language of the review order a recommendation turns into.
 */
export function nachAntwort(alt: Hinweis | null, antwort: string, agentenLaufen = false, sprache: Sprache = 'en'): Hinweis | null {
  const review = reviewAus(antwort, sprache)
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

/** Reads the panel language, the repo's mode and its release script into the atoms; at session start and after each turn. */
async function umgebungLesen($: Dollar) {
  // A read by key answers the key's value; a host that answers the whole settings object (the test
  // kit does) is read the same way.
  const sp = await $.settings.read({ key: 'language' }).then(
    wert => spracheAus(typeof wert === 'object' && wert !== null ? (wert as { language?: unknown }).language : wert),
    () => 'en' as Sprache,
  )
  // `.claude/working-mode` first; projects that predate it keep `.claude/arbeitsmodus`
  const m = await $.fs
    .read('.claude/working-mode')
    .then(
      t => modusAus(String(t)),
      () => $.fs.read('.claude/arbeitsmodus').then(t => modusAus(String(t)), () => null),
    )
  const r = await $.fs.exists('scripts/merge.ps1').catch(() => false)
  const hs = await $.fs.exists('.claude/hooks/sperren.mjs').catch(() => false)
  const sa = await $.fs.read('.claude/sperren.local').then(t => schwerlastAusAus(String(t)), () => false)
  if ((await read($, hatSperren)) !== hs) await update($, hatSperren, () => hs).catch(() => undefined)
  if ((await read($, schwerlastAus)) !== sa) await update($, schwerlastAus, () => sa).catch(() => undefined)
  if ((await read($, sprache)) !== sp) await update($, sprache, () => sp).catch(() => undefined)
  if ((await read($, modus)) !== m) await update($, modus, () => m).catch(() => undefined)
  if ((await read($, hatRelease)) !== r) await update($, hatRelease, () => r).catch(() => undefined)
}

// Live and lightning: the order goes out as the person's own prompt, like the review's. The
// session runs it by the repo's CLAUDE.md (release procedure, mode switch with commit).
async function befehlSenden($: Dollar, text: string, s: Sperre, istRelease = false, spr: Sprache = 'en') {
  const t = TEXTE[spr]
  try {
    if (istRelease) await update($, releaseLaeuft, () => true).catch(() => undefined)
    const r = await $.prompt.submit({ text, asUser: true })
    if (r.drop !== undefined) {
      if (istRelease) await update($, releaseLaeuft, () => false).catch(() => undefined)
      $.ui.toast(t.nichtGesendet(r.drop))
    }
  } catch (err) {
    if (istRelease) await update($, releaseLaeuft, () => false).catch(() => undefined)
    $.ui.toast(t.nichtGesendet(err instanceof Error ? err.message : String(err)))
  } finally {
    freigeben(s)
  }
}

/** Whether a subagent the main loop started is still at work. */
async function agentenLaufen($: Dollar): Promise<boolean> {
  const agenten = await $.agent.list().catch(() => [])
  return agenten.some(a => a.parentId === undefined && (a.status === 'pending' || a.status === 'running' || a.status === 'waiting'))
}

/** Whether an answer carries something the row acts on: a review recommendation, a compact or switch hint, a review's result table. */
const traegtHinweis = (text: string) =>
  /REVIEW RECOMMENDATION|REVIEW-EMPFEHLUNG|Compact now|Jetzt komprimieren|\*\*(?:Weiter|Next):\*\*/.test(text) || meldetReview(text)

/** Feedback of a blocking Stop hook (may-kit's own model-line.mjs did this until it was removed), handed to the model as a user message: part of the turn, no prompt. */
const istHookRueckmeldung = (text: string) => /^\s*Stop hook feedback:|may-kit, CLAUDE\.md §3:/.test(text)

/**
 * The answer the row reads: within the last turn the newest assistant message that carries a hint,
 * else the turn's newest text; a turn without any text falls back to the newest text before it.
 * The turn reaches back to the person's last prompt; tool results and hook feedback lie inside it.
 * 2026-11-08: the Stop hook model-line.mjs made the model add a lone "**Model:**" line after the
 * REVIEW RECOMMENDATION. Read alone, that last message hid the recommendation, and the Review
 * button had nothing to send.
 */
export function antwortDerRunde(msgs: readonly { role: string; text: string; toolResults?: readonly unknown[] }[]): string {
  let i = msgs.length - 1
  let neueste = ''
  for (; i >= 0; i--) {
    const m = msgs[i]
    if (!m) continue
    if (m.role === 'user') {
      if (m.toolResults?.length || !m.text.trim() || istHookRueckmeldung(m.text)) continue
      break
    }
    if (m.role !== 'assistant' || !m.text.trim()) continue
    if (traegtHinweis(m.text)) return m.text
    if (!neueste) neueste = m.text
  }
  if (neueste) return neueste
  for (; i >= 0; i--) {
    const m = msgs[i]
    if (m && m.role === 'assistant' && m.text.trim()) return m.text
  }
  return ''
}

async function letzteAntwort($: Dollar): Promise<string> {
  const msgs = await $.session.messages()
  return Array.isArray(msgs) ? antwortDerRunde(msgs) : ''
}

const zurueck = ($: Dollar, alt: Hinweis | null) => update($, hinweis, () => alt).catch(() => undefined)

// Review: the order goes out as the person's own prompt, nothing lands in the prompt box.
// The state flips first so the spinner shows at once, and flips back if the prompt is refused.
async function reviewSenden($: Dollar, stand: Hinweis, befehl: string, s: Sperre, spr: Sprache = 'en') {
  try {
    await reviewAbschicken($, stand, befehl, spr)
  } finally {
    freigeben(s)
  }
}

async function reviewAbschicken($: Dollar, stand: Hinweis, befehl: string, spr: Sprache) {
  const t = TEXTE[spr]
  await update($, hinweis, (): Hinweis => ({ ...stand, phase: 'review-laeuft' })).catch(() => undefined)
  try {
    const r = await $.prompt.submit({ text: befehl, asUser: true })
    if (r.drop !== undefined) {
      await zurueck($, stand)
      $.ui.toast(t.reviewNichtGestartet(r.drop))
    }
  } catch (err) {
    await zurueck($, stand)
    $.ui.toast(t.reviewNichtGestartet(err instanceof Error ? err.message : String(err)))
  }
}

// Compact: straight through the engine, as /compact does. The session.compact hook
// below shows the spinner and clears the hint once the compaction stands. With `weiter` the order
// to go on follows a compaction that ran (see gehtWeiter); a skipped or failed one sends nothing.
export async function komprimieren($: Dollar, befehl: string | null, s?: Sperre, spr: Sprache = 'en', weiter = false) {
  const t = TEXTE[spr]
  try {
    if (!(await verdichten($, befehl, spr)) || !weiter) return
    const r = await $.prompt.submit({ text: t.weiter, asUser: true })
    if (r.drop !== undefined) $.ui.toast(t.nichtGesendet(r.drop))
  } catch (err) {
    $.ui.toast(t.nichtGesendet(err instanceof Error ? err.message : String(err)))
  } finally {
    if (s) freigeben(s)
  }
}

/** Compacts; true when the compaction ran (a skip or a failure is toasted). */
async function verdichten($: Dollar, befehl: string | null, spr: Sprache): Promise<boolean> {
  const t = TEXTE[spr]
  try {
    const r = await $.session.compact({ instructions: compactAnweisung(befehl) })
    if (r.skip !== undefined) $.ui.toast(t.nichtKomprimiert(r.skip))
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
          (e2: unknown) => ($.ui.toast(t.nichtKomprimiert(e2 instanceof Error ? e2.message : String(e2))), false),
        )
    }
    $.ui.toast(t.nichtKomprimiert(grund))
    return false
  }
}

// Model: the steps the hint names, in its order (CLAUDE.md §3a: compact first, so the stronger
// model still writes the summary), each as the person would type it. A step that fails stops the
// rest: carrying out the task on the wrong model is what the button exists to prevent.
export async function modellWechseln($: Dollar, wahl: Modellwahl, s?: Sperre, aktuell?: Vorher | null, spr: Sprache = 'en') {
  const t = TEXTE[spr]
  try {
    const vorWechsel = aktuell === undefined ? await aktuellLesen($) : aktuell
    await vorherMerken($, vorWechsel)
    if (wahl.compactOffen && !(await verdichten($, wahl.compactBefehl, spr))) return
    await $.command.run({ command: 'model', args: wahl.modell })
    zuletzt = nachBefehl(zuletzt ?? vorWechsel, 'model', wahl.modell)
    const befehle = await $.command.list().catch(() => [])
    if (befehle.some(c => c.name === 'effort')) {
      await $.command.run({ command: 'effort', args: wahl.effort })
      zuletzt = nachBefehl(zuletzt, 'effort', wahl.effort)
    } else $.ui.toast(t.effortNichtGesetzt(wahl.effort))
    await update($, modellwahl, () => null).catch(() => undefined)
    const r = await $.prompt.submit({ text: umsetzBefehl(wahl, spr), asUser: true })
    if (r.drop !== undefined) $.ui.toast(t.nichtGesendet(r.drop))
  } catch (err) {
    $.ui.toast(t.nichtGewechselt(err instanceof Error ? err.message : String(err)))
  } finally {
    if (s) freigeben(s)
  }
}

// The model and effort of the main loop's last request (turn.step): what actually ran. The merged
// settings are no stand-in for it, as a project's effortLevel hides the one /effort wrote. A module
// variable: a reload starts it over, and until the next request the settings answer.
let zuletzt: Vorher | null = null

/**
 * What runs after a /model or /effort (typed, or run by the switch buttons): the prompt line must name
 * it before the next request reports it. An argument that names no model or effort changes nothing.
 */
export function nachBefehl(basis: Vorher | null, befehl: 'model' | 'effort', args: string): Vorher | null {
  const wert = args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (befehl === 'model') return /opus|sonnet|haiku|fable/.test(wert) ? { modell: wert, effort: basis?.effort ?? null } : basis
  if (!basis) return basis
  if (wert === 'auto') return { ...basis, effort: null }
  return /^(?:low|medium|high|xhigh|max)$/.test(wert) ? { ...basis, effort: wert } : basis
}

// Built-in commands that run locally and start no model turn: they get no prompt line.
const LOKALE_BEFEHLE = new Set([
  'add-dir', 'agents', 'clear', 'compact', 'config', 'context', 'cost', 'doctor', 'effort', 'exit', 'export', 'fast',
  'help', 'hooks', 'ide', 'login', 'logout', 'mcp', 'memory', 'model', 'permissions', 'plugin', 'plugins', 'quit',
  'resume', 'rewind', 'status', 'statusline', 'theme', 'usage', 'vim',
])

/**
 * Model and effort for the prompt line. The model live, as /model shows it: the VS Code dropdown,
 * /model without arguments or a fallback model leave `zuletzt` behind, and a line naming a model the
 * system prompt contradicts would cause exactly the wrong stop it exists to prevent. The effort from
 * the last request while that ran on the same model, else the setting.
 */
async function laufendLesen($: Dollar): Promise<Vorher | null> {
  const live = await $.session.model().catch(() => '')
  const modell = /opus|sonnet|haiku|fable/i.test(live) ? live : (zuletzt?.modell ?? live)
  if (!modell) return null
  const gleich = zuletzt !== null && modellKurz(zuletzt.modell) === modellKurz(modell)
  const effort = (gleich ? zuletzt?.effort : null) ?? (await $.settings.read({ key: 'effortLevel' }).then(w => (typeof w === 'string' ? w : null), () => null))
  return { modell, effort }
}

/**
 * The line the panel puts beside each prompt, unseen by the person (CLAUDE.md §3 "Compare before you
 * recommend"): the system prompt names the model, but nothing names the effort, and a guessed one made
 * Claude stop with "**Next:**" for nothing. About 30 tokens, behind the prompt: no extra request, the
 * prompt cache stays.
 */
export function kontextZeile(aktuell: Vorher | null): string {
  const lauf = aktuell ? `running ${modellKurz(aktuell.modell)}${aktuell.effort ? ` ${aktuell.effort}` : ''}. ` : ''
  return `may-kit: ${lauf}A turn that changes files starts with the **Model:** line (CLAUDE.md §3). Same model → carry on, no **Next:**.`
}

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

// Only the first switch saves: after Sonnet high → Sonnet medium, "back" still means the
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
export async function modellZuruecksetzen($: Dollar, v: Vorher, s?: Sperre, spr: Sprache = 'en') {
  const t = TEXTE[spr]
  try {
    await $.command.run({ command: 'model', args: v.modell })
    zuletzt = nachBefehl(zuletzt ?? v, 'model', v.modell)
    const befehle = await $.command.list().catch(() => [])
    if (v.effort && befehle.some(c => c.name === 'effort')) {
      await $.command.run({ command: 'effort', args: v.effort })
      zuletzt = nachBefehl(zuletzt, 'effort', v.effort)
    }
    await update($, vorher, () => null).catch(() => undefined)
    $.ui.toast(t.zurueckAuf(`${modellKurz(v.modell)}${v.effort ? ` ${v.effort}` : ''}`))
  } catch (err) {
    $.ui.toast(t.nichtZurueckgestellt(err instanceof Error ? err.message : String(err)))
  } finally {
    if (s) freigeben(s)
  }
}

// The mode button: the bolt emoji (the person's choice, 2026-11-03). A Button holds only text, so
// no SVG icon; a bolt-shaped glyph (U+03DF) and a word were tried and dropped.
const BLITZ = '⚡'
// The heavy-load button (weightlifter). Highlighted: this machine runs without the lock.
const SCHWER = '🏋'

// A small turning arc, grey at half strength so it reads on light and dark themes.
const SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16">' +
  '<circle cx="8" cy="8" r="6" fill="none" stroke="#888" stroke-opacity="0.3" stroke-width="2"/>' +
  '<path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round">' +
  '<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/>' +
  '</path></svg>'

// ---------- Daily update (2026-11-08) ----------
// Once a day the panel brings the may-kit clone it was loaded from up to date: git and the installer,
// run by the panel itself — no prompt, no model, so no tokens. Only a clean `main` with nothing of
// its own ahead is pulled; anything else is left alone with a toast. Running chats keep the old
// state: mod, CLAUDE.md and style load at session start.

const UPDATE_KEY = 'updateGeprueft'
export const UPDATE_ABSTAND_MS = 24 * 60 * 60 * 1000

/** Whether the daily check is due: never checked, a day passed, or the clock went back. */
export function updateFaellig(letzte: unknown, jetzt: number): boolean {
  const at = typeof letzte === 'object' && letzte !== null ? (letzte as { at?: unknown }).at : undefined
  if (typeof at !== 'number' || !Number.isFinite(at)) return true
  return jetzt - at >= UPDATE_ABSTAND_MS || at - jetzt > 60_000
}

export type UpdateLage = { branch: string; sauber: boolean; voraus: number; zurueck: number }
export type UpdateGrund = { grund: 'branch' | 'aenderungen' | 'voraus' }

/** What becomes of the clone: nothing new, pull, or leave it with a reason. */
export function updateEntscheidung(l: UpdateLage): 'aktuell' | 'ziehen' | UpdateGrund {
  if (l.zurueck <= 0) return 'aktuell'
  if (l.branch !== 'main') return { grund: 'branch' }
  if (!l.sauber) return { grund: 'aenderungen' }
  if (l.voraus > 0) return { grund: 'voraus' }
  return 'ziehen'
}

/**
 * The line of a git or installer error worth a toast: git's "fatal:"/"error:" line (hints come before
 * it), else the first line — a PowerShell `throw` puts its message first and its "+ …" noise after.
 */
export function meldung(text: string): string {
  const zeilen = text.split(/\r?\n/).map(z => z.trim()).filter(Boolean)
  return zeilen.find(z => /^(?:fatal|error):/i.test(z)) ?? zeilen[0] ?? ''
}

// Git never asks: a background session must not open a login window or wait on a console prompt.
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }

type Lauf = (argv: string[], timeoutMs?: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/** Runs a command; a start failure or a timeout reads as exit -1 with its message, never as a rejection. */
const laeufer = ($: Dollar): Lauf => (argv, timeoutMs = 30_000) =>
  $.process
    .run(argv, { timeoutMs, env: GIT_ENV })
    .catch((e: unknown) => ({ exitCode: -1, stdout: '', stderr: e instanceof Error ? e.message : String(e) }))

const pfad = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * The may-kit clone the panel was loaded from, or null. Only a repo that holds the plugin under
 * `mods/` and tracks the installer counts: a copy of the mod inside another repo (dotfiles, a vendored
 * folder) must never be pulled, nor its install.ps1 run.
 */
export async function kitFinden($: Dollar, lauf: Lauf = laeufer($)): Promise<string | null> {
  const top = await lauf(['git', '-C', $.plugin.root, 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return null
  const repo = top.stdout.trim()
  if (!repo || !pfad($.plugin.root).startsWith(`${pfad(repo)}/mods/`)) return null
  const kit = await lauf(['git', '-C', repo, 'ls-files', '--error-unmatch', 'install.ps1', 'set-user-settings.cjs'])
  return kit.exitCode === 0 ? repo : null
}

/** Claims `key` for this session: write, wait, read back; false when another session wrote last. */
async function beanspruchen($: Dollar, key: string, wert: Record<string, unknown>, pause: number): Promise<boolean> {
  const ich = { ...wert, von: `${await $.session.id().catch(() => '')}-${Math.random()}` }
  await $.store.set(key, ich)
  if (pause > 0) await $.clock.sleep(pause)
  const stand = (await $.store.get(key).catch(() => undefined)) as { von?: unknown } | undefined
  return stand?.von === ich.von
}

/**
 * The daily network part: fetch, and fast-forward a clean `main` with nothing of its own ahead.
 * `jetzt` and `pause` are parameters for the tests; resolves to what happened (the person sees only
 * the toast). One fetch, then `merge --ff-only @{u}`: no second contact with the remote, so count and
 * subject in the toast are what came in, and the person's pull.rebase setting plays no part.
 */
export async function aktualisieren($: Dollar, repo: string, spr: Sprache = 'en', jetzt = Date.now(), pause = 2000, lauf: Lauf = laeufer($)): Promise<string> {
  const t = TEXTE[spr]
  if (!updateFaellig(await $.store.get(UPDATE_KEY).catch(() => undefined), jetzt)) return 'nicht-faellig'
  // Claimed before git runs: offline, the next try comes the next day, not with every turn. The store
  // gives no promise across processes; two sessions that both go on are harmless (see the merge).
  if (!(await beanspruchen($, UPDATE_KEY, { at: jetzt }, pause))) return 'andere-session'
  const git = (args: string[], timeoutMs?: number) => lauf(['git', '-C', repo, ...args], timeoutMs)

  if ((await git(['fetch', '--quiet', 'origin'], 60_000)).exitCode !== 0) return 'offline'
  const zaehlung = await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])
  const [voraus, zurueck] = zaehlung.stdout.trim().split(/\s+/).map(Number)
  if (zaehlung.exitCode !== 0 || !Number.isInteger(voraus) || !Number.isInteger(zurueck)) return 'kein-upstream'
  const kopf = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = await git(['status', '--porcelain', '--untracked-files=no'])
  if (kopf.exitCode !== 0 || status.exitCode !== 0) return 'kein-upstream'
  const branch = kopf.stdout.trim()
  const was = updateEntscheidung({ branch, sauber: status.stdout.trim() === '', voraus: voraus!, zurueck: zurueck! })
  if (was === 'aktuell') return 'aktuell'
  if (was !== 'ziehen') {
    const g = t.updateGrund
    $.ui.toast(t.updateWartet(was.grund === 'branch' ? g.branch(branch) : g[was.grund]))
    return was.grund
  }

  const betreff = (await git(['log', '-1', '--format=%s', '@{u}'])).stdout.trim()
  const merge = await git(['merge', '--ff-only', '--quiet', '@{u}'], 120_000)
  if (merge.exitCode !== 0) {
    // a second session merging at the same moment holds the index: it does the update
    if (/index\.lock/.test(merge.stderr)) return 'andere-session'
    $.ui.toast(t.updateWartet(t.updateGrund.pull(meldung(merge.stderr || merge.stdout))))
    return 'pull-fehler'
  }
  // At once after the merge: where the mod folder is watched, the new files reload this module about a
  // quarter second later, and what still awaits here may not run. The installer is no part of this:
  // installerPruefen catches it, after a reload in its session.start.
  $.ui.toast(t.updateFertig(zurueck!, betreff))
  return 'aktualisiert'
}

const INSTALL_KEY = 'installiert'

/**
 * Runs the installer whenever the clone's installer state differs from the last successful run: the
 * blobs of install.ps1 and set-user-settings.cjs plus the list of mods. State, not the diff of one
 * pull: a failed or interrupted run, a reload, or a pull by hand is caught at the next session start.
 * Local git only, no network. A failed run is retried at most once a day; elsewhere than Windows the
 * installer needs paths the panel does not know, so a toast asks for it, once per state.
 */
export async function installerPruefen($: Dollar, repo: string, spr: Sprache = 'en', jetzt = Date.now(), pause = 2000, lauf: Lauf = laeufer($)): Promise<string> {
  const t = TEXTE[spr]
  const git = (args: string[]) => lauf(['git', '-C', repo, ...args])
  const blobs = await git(['rev-parse', 'HEAD:install.ps1', 'HEAD:set-user-settings.cjs'])
  const mods = await git(['ls-tree', '-d', '--name-only', 'HEAD', 'mods/'])
  if (blobs.exitCode !== 0 || mods.exitCode !== 0) return 'unlesbar'
  const stand = `${blobs.stdout.trim()}\n${mods.stdout.trim()}`.replace(/\r/g, '')
  const alt = (await $.store.get(INSTALL_KEY).catch(() => undefined)) as { stand?: unknown; ok?: unknown; at?: unknown } | undefined
  if (alt?.stand === stand && (alt.ok === true || (typeof alt.at === 'number' && jetzt - alt.at < UPDATE_ABSTAND_MS))) return 'aktuell'
  if (!(await beanspruchen($, INSTALL_KEY, { stand, ok: false, at: jetzt }, pause))) return 'andere-session'
  if (!/^[A-Za-z]:[\\/]/.test(repo)) {
    $.ui.toast(t.updateInstallerSelbst)
    await $.store.set(INSTALL_KEY, { stand, ok: true, at: jetzt })
    return 'selbst'
  }
  const inst = await lauf(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${repo}/install.ps1`], 120_000)
  if (inst.exitCode !== 0) {
    $.ui.toast(t.updateInstallerFehler(meldung(inst.stderr || inst.stdout)))
    return 'installer-fehler'
  }
  await $.store.set(INSTALL_KEY, { stand, ok: true, at: jetzt })
  return 'installiert'
}

/**
 * The upkeep: the daily update, then (at session start, or right after an update) the installer
 * check. After a turn only the daily update is asked, one store read when nothing is due.
 */
async function pflegen($: Dollar, spr: Sprache, sitzungsstart: boolean) {
  if (!sitzungsstart && !updateFaellig(await $.store.get(UPDATE_KEY).catch(() => undefined), Date.now())) return
  const repo = await kitFinden($)
  if (!repo) return
  const r = await aktualisieren($, repo, spr)
  if (sitzungsstart || r === 'aktualisiert') await installerPruefen($, repo, spr)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    void umgebungLesen($)
      .catch(() => undefined)
      .then(async () => pflegen($, await read($, sprache), true))
      .catch(() => undefined)
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
    const befehl = e.command?.name
    if (befehl === 'model' || befehl === 'effort') {
      const basis = zuletzt ?? (await aktuellLesen($))
      zuletzt = nachBefehl(basis, befehl, e.command?.args ?? '') ?? zuletzt
    }
    // The engine's own message (a notification) and a local built-in command get no line: no model
    // turn of the person's begins with them. Skills and prompt commands (/code-review, …) do.
    if ((befehl && LOKALE_BEFEHLE.has(befehl)) || e.isMeta) return next(e)
    const zeile = kontextZeile(await laufendLesen($).catch(() => null))
    return next({ ...e, context: [...(e.context ?? []), zeile] })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        // the language first: the review order a recommendation turns into is worded in it
        await umgebungLesen($).catch(() => undefined)
        const spr = await read($, sprache)
        // the daily update: one store read when nothing is due; not awaited, git may take a while
        void pflegen($, spr, false).catch(() => undefined)
        const alt = await read($, hinweis)
        const laufen = await agentenLaufen($)
        const antwort = await letzteAntwort($)
        const neu = nachAntwort(alt, antwort, alt?.phase === 'review-laeuft' && laufen, spr)
        const wahlAlt = await read($, modellwahl)
        const wahlNeu = wahlNachAntwort(wahlAlt, antwort)
        if (wahlNeu !== wahlAlt) await update($, modellwahl, () => wahlNeu).catch(() => undefined)
        // a release runs within its turn (merge script, deploys); once no subagent works on, it is done
        if (!laufen && (await read($, releaseLaeuft))) await update($, releaseLaeuft, () => false).catch(() => undefined)
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
    const spr = await read($, sprache)
    const t = TEXTE[spr]
    const stand = await read($, hinweis)
    const laeuftCompact = await read($, komprimiert)
    const modusJetzt = await read($, modus)
    const mitRelease = await read($, hatRelease)
    const laeuftRelease = await read($, releaseLaeuft)
    const schnell = modusJetzt === 'schnell'
    const mitSperren = await read($, hatSperren)
    const schwerOhne = await read($, schwerlastAus)
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
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      const s = sperren('review')
      const jetzt = stand && reviewBefehl ? stand : nachAntwort(null, await letzteAntwort($).catch(() => ''), false, spr)
      if (!jetzt?.reviewBefehl || jetzt.phase !== 'review') {
        freigeben(s)
        return $.ui.toast(t.keinReview)
      }
      void reviewSenden($, jetzt, jetzt.reviewBefehl, s, spr) // not awaited, as with compacting below
    }
    // A double click's second press lands here once the row redrew (the spinner keeps the
    // button's key): right after the start it is that press, not a tick-off.
    const reviewAbhaken = () => {
      if (doppelklick('review')) return
      void update($, hinweis, (alt): Hinweis | null => (alt ? { ...alt, phase: 'compact', reviewErledigt: true } : alt)).catch(() => undefined)
      $.ui.toast(t.reviewErledigt)
    }
    // Always compacts at once (the person's choice, 2026-11-03): with the instructions of the
    // stored hint, else of the last answer's /compact line, else with none. A review that is
    // merely due does not stand in the way (the person may skip it); a running one does, as the
    // reviewer's commits and findings would be compacted away under it.
    const compactDruecken = async () => {
      if (reviewLaeuft) return $.ui.toast(t.reviewLaeuftNoch)
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      const s = sperren('compact')
      const antwort = await letzteAntwort($).catch(() => '')
      const befehl = compactBefehl ?? compactAus(antwort)
      // Not awaited: a press has 10 s, a compaction takes longer (2026-11-03 "ui.press hook
      // skipped: ran past its 10s budget"). The engine lets work a press leaves running finish.
      void komprimieren($, befehl, s, spr, gehtWeiter(antwort, wahl !== null))
    }

    // As with the review: nothing stored, the press reads the last answer itself.
    const modellDruecken = async () => {
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      const s = sperren('modell')
      const jetzt = wahl ?? modellAus(await letzteAntwort($).catch(() => ''))
      if (!jetzt) {
        freigeben(s)
        return $.ui.toast(t.keinWechsel)
      }
      void modellWechseln($, jetzt, s, undefined, spr) // not awaited: a compaction runs past the press's 10 s
    }
    const wahlName = wahl ? `${modellName(wahl.modell)} ${wahl.effort}` : null
    const vorherName = zurueckZu ? `${modellKurz(zurueckZu.modell)}${zurueckZu.effort ? ` ${zurueckZu.effort}` : ''}` : null
    const zurueckDruecken = () => {
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      if (!zurueckZu) return $.ui.toast(t.nichtsZurueck)
      void modellZuruecksetzen($, zurueckZu, sperren('zurueck'), spr)
    }

    const liveDruecken = () => {
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      void befehlSenden($, releaseBefehl(spr), sperren('release'), true, spr)
    }
    const releaseAbhaken = () => {
      if (doppelklick('release')) return
      void update($, releaseLaeuft, () => false).catch(() => undefined)
    }
    const blitzDruecken = () => {
      if (arbeitet) return $.ui.toast(t.arbeitet)
      const r = sperre()
      if (r) return $.ui.toast(t.unterwegs[r])
      void befehlSenden($, modusBefehl(modusJetzt, spr), sperren('modus'), false, spr)
    }

    // Unlike the other buttons nothing goes through the session: the press rewrites this machine's
    // untracked `.claude/sperren.local` itself; the lock hook reads it afresh with every command.
    const schwerDruecken = async () => {
      try {
        const alt = await $.fs.read('.claude/sperren.local').then(String, () => '')
        const neu = schwerlastUmschalten(alt)
        await $.fs.write('.claude/sperren.local', neu)
        const aus = schwerlastAusAus(neu)
        await update($, schwerlastAus, () => aus).catch(() => undefined)
        $.ui.toast(aus ? t.schwerToastAus : t.schwerToastAn)
      } catch (err) {
        $.ui.toast(t.schwerNichtGeschrieben(err instanceof Error ? err.message : String(err)))
      }
    }

    // Hover help: each button sits in a Box of its hover group; the matching text, drawn hidden
    // right of the row, shows while the pointer rests on the button (no hook runs, BoxHoverProps).
    const tipps: Array<[string, string]> = [
      ['modell', wahl && wahlName ? t.tipp.modellMit(wahlName, wahl.compactOffen, wahl.plan) : t.tipp.modellOhne],
      ['zurueck', t.tipp.zurueck(vorherName)],
      ['review', reviewLaeuft ? t.tipp.reviewLaeuft : t.tipp.review],
      ['compact', laeuftCompact ? t.tipp.compactLaeuft : t.tipp.compact],
      ['live', laeuftRelease ? t.tipp.liveLaeuft : t.tipp.live],
      ['blitz', schnell ? t.tipp.blitzAn : t.tipp.blitzAus],
      ['schwer', schwerOhne ? t.tipp.schwerAn : t.tipp.schwerAus],
    ]
    // The same texts as a list beneath the row, for the buttons drawn now; "?" opens and closes it.
    const namen: Record<string, string> = {
      modell: t.modell,
      zurueck: t.zurueck,
      review: t.review,
      compact: t.compact,
      live: t.live,
      blitz: BLITZ,
      schwer: SCHWER,
    }
    const sichtbar = tipps.filter(
      ([id]) =>
        (id !== 'live' || mitRelease) &&
        (id !== 'blitz' || modusJetzt !== null) &&
        (id !== 'schwer' || mitSperren) &&
        (id !== 'zurueck' || zurueckZu !== null),
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
        {mitTipp(
          'modell',
          <Button
            key="modell"
            label={wahlName ? `→ ${wahlName}` : t.modell}
            variant={wahl ? 'primary' : 'secondary'}
            dimColor={!wahl}
            onPress={modellDruecken}
          />,
        )}
        {zurueckZu ? mitTipp('zurueck', <Button key="zurueck" label={`↺ ${vorherName}`} variant="secondary" onPress={zurueckDruecken} />) : null}
        {mitTipp(
          'review',
          reviewLaeuft ? (
            laedt('review', t.reviewLaeuft, reviewAbhaken)
          ) : (
            <Button
              key="review"
              label={reviewErledigt ? `✓ ${t.review}` : t.review}
              variant={reviewDran ? 'primary' : 'secondary'}
              dimColor={!reviewDran}
              onPress={reviewDruecken}
            />
          ),
        )}
        {mitTipp(
          'compact',
          laeuftCompact ? (
            laedt('compact', t.compactLaeuft, compactAbhaken)
          ) : (
            <Button
              key="compact"
              label={t.compact}
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
                laedt('live', t.liveLaeuft, releaseAbhaken)
              ) : (
                <Button key="live" label={t.live} variant="secondary" dimColor onPress={liveDruecken} />
              ),
            )
          : null}
        {modusJetzt !== null
          ? mitTipp(
              'blitz',
              // Right beside "?" (the person, 2026-11-03). Only the emoji, no "an"/"aus": the label
              // drew as a long button. An emoji keeps its own colour, so the button's state says the
              // mode: highlighted is fast mode (every finished change goes to production unasked),
              // dim is careful mode.
              <Button key="blitz" label={BLITZ} variant={schnell ? 'primary' : 'secondary'} dimColor={!schnell} onPress={blitzDruecken} />,
            )
          : null}
        {mitSperren
          ? mitTipp(
              'schwer',
              <Button key="schwer" label={SCHWER} variant={schwerOhne ? 'primary' : 'secondary'} dimColor={!schwerOhne} onPress={schwerDruecken} />,
            )
          : null}
        <Button key="hilfe" label={hilfeOffen ? t.hilfeZu : '?'} variant="secondary" dimColor onPress={hilfeUmschalten} />
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
      {hilfeOffen ? (
        <Box key="hilfe-update">
          <Text dimColor wrap="wrap">
            {t.hilfeUpdate}
          </Text>
        </Box>
      ) : null}
      </Box>
    )
  })
}
