/**
 * The two buttons above the prompt: review first, then compact (CLAUDE.md §3a/§5).
 * `review` — a review was recommended; `review-laeuft` — the review order was sent;
 * `compact` — the last answer asks to compact (or the review reported its findings).
 */
export type Hinweis = {
  phase: 'review' | 'review-laeuft' | 'compact'
  reviewBefehl: string | null
  compactBefehl: string | null
  reviewErledigt: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'may-kit-panel': {
      hinweis: Shaped<Hinweis | null>
      /** True while a compaction runs: the row shows a spinner instead of the button. */
      komprimiert: boolean
      /** The repo's working mode from `.claude/arbeitsmodus`; null where the repo has none. */
      modus: 'schnell' | 'sorgfaeltig' | null
      /** Whether the repo has `scripts/merge.ps1`: only then the row shows the Live button. */
      hatRelease: boolean
      /** True while a release the Live button (or a typed order) started still runs. */
      releaseLaeuft: boolean
      /** Whether the "?" button has the explanations open beneath the row. */
      hilfe: boolean
    }
  }
}
