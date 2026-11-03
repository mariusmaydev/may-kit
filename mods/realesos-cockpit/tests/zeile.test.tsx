import { expect, test } from 'claude-code/testing'

// Draws the button row on every surface. Guards against a render hook that
// throws (2026-11-03: a local variable `h` shadowed the JSX factory).
const BAND = {
  plugin: 'realesos-cockpit',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 } },
} as const

test('the row shows Review and Komprimieren, on every surface', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Review/ }))?.text).toBe('Review')
    expect((await ui.find({ type: 'Text', text: /Komprimieren/ }))?.text).toBe('Komprimieren')
    await ui.unmount()
  }
})
