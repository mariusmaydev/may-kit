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
    'realesos-cockpit': {
      hinweis: Shaped<Hinweis | null>
      /** True while a compaction runs: the row shows a spinner instead of the button. */
      komprimiert: boolean
    }
  }
}
