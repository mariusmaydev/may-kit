import { expect, test } from 'claude-code/testing'

// Draws the button row on every surface. Guards against a render hook that
// throws (2026-11-03: a local variable `h` shadowed the JSX factory).
const BAND = {
  plugin: 'cockpit',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 } },
} as const

const ORDER = 'Review starten: Commits 3f2a1b9, Subagent Opus/high. Befunde in deinen Dateien beheben, testen, committen.'

test('the row shows Review and Komprimieren, on every surface', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'review' }))?.props.label).toBe('Review')
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('Komprimieren')
    await ui.unmount()
  }
})

// Review finding 2026-11-03: a press while a turn ran queued the order and two presses sent it twice.
test('a press while Claude works sends nothing; once idle, one press sends the order and shows the spinner', async ($, on) => {
  const gesendet: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    gesendet.push(e.text)
    return { text: e.text }
  })
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  // The plugin's state, held beneath it in memory, seeded with a recommended review.
  const mem = new Map<string, { value: unknown; version: number }>([
    // stored under the atom's shape tag, as the mod writes it
    ['hinweis', { value: { shape: 'hinweis-2', value: { phase: 'review', reviewBefehl: ORDER, compactBefehl: null, reviewErledigt: false } }, version: 1 }],
    ['komprimiert', { value: false, version: 1 }],
  ])
  // A seeded key answers until the mod first writes it; from then on the test host's memory does.
  on('state.get', (_, e, next) => (mem.has(e.key) ? ({ value: mem.get(e.key) } as never) : next(e)))
  on('state.set', (_, e, next) => {
    mem.delete(e.key)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const busy = await $.ui.mount({ ...BAND, surface: 'vscode', props: { ...BAND.props, isWorking: true } })
  expect((await busy.find({ key: 'review' }))?.props.variant).toBe('primary')
  await busy.press({ key: 'review' })
  expect(gesendet).toEqual([])
  expect(toasts.join()).toContain('Claude arbeitet noch')
  await busy.unmount()

  const idle = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await idle.press({ key: 'review' })
  expect(gesendet).toEqual([ORDER])
  await idle.unmount()

  // Drawn afresh (the seeded read did not subscribe): the spinner stands in for the button.
  const danach = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await danach.find({ key: 'review' }))?.props.label).toBe('Review läuft')
  // 2026-11-03 the indicator hung after a reload; a press on it ticks the review off by hand.
  await danach.press({ key: 'review' })
  await danach.unmount()
  const abgehakt = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await abgehakt.find({ key: 'review' }))?.props.label).toBe('✓ Review')
  expect((await abgehakt.find({ key: 'compact' }))?.props.variant).toBe('primary')
  await abgehakt.unmount()
})
