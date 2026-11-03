/**
 * The two buttons above the prompt: review first, then compact (CLAUDE.md §3a/§5).
 * `review` — a review was recommended; `review-laeuft` — /code-review was started;
 * `compact` — the last answer asks to compact.
 */
export type Hinweis = {
  phase: 'review' | 'review-laeuft' | 'compact'
  reviewBefehl: string | null
  compactBefehl: string | null
  reviewErledigt: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'realesos-cockpit': { hinweis: Shaped<Hinweis | null> }
  }
}
