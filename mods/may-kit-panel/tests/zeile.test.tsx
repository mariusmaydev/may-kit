import { expect, test } from 'claude-code/testing'

// Draws the button row on every surface. Guards against a render hook that
// throws (2026-11-03: a local variable `h` shadowed the JSX factory).
const BAND = {
  plugin: 'may-kit-panel',
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

// Review 2026-11-03 (M1/M2): two quick presses, before the row redraws, start one action only.
test('two quick presses on Review send the order once', async ($, on) => {
  const gesendet: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    gesendet.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  const mem = new Map<string, { value: unknown; version: number }>([
    ['hinweis', { value: { shape: 'hinweis-2', value: { phase: 'review', reviewBefehl: ORDER, compactBefehl: null, reviewErledigt: false } }, version: 1 }],
  ])
  on('state.get', (_, e, next) => (mem.has(e.key) ? ({ value: mem.get(e.key) } as never) : next(e)))
  on('state.set', (_, e, next) => {
    mem.delete(e.key)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await Promise.all([ui.press({ key: 'review' }), ui.press({ key: 'review' })])
  expect(gesendet).toEqual([ORDER])
  await ui.unmount()
})

// Review 2026-11-03 (M1): two quick presses on Komprimieren compact once.
test('two quick presses on Komprimieren compact once', async ($, on) => {
  let verdichtet = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.compact', (_, e, next) => {
    verdichtet++
    return next(e)
  })
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await Promise.all([ui.press({ key: 'compact' }), ui.press({ key: 'compact' })])
  expect(verdichtet).toBe(1)
  // the lock turned the second press away, not a redraw onto the spinner
  expect(toasts.join()).toContain('Es wird schon komprimiert')
  await ui.unmount()
})

// Review 2026-11-03 (80f9314, M3): a double click's second press that lands on the spinner after
// the redraw does not tick the review off while the order is still being handed over.
test('a second press on the spinner right after the start keeps the review running', async ($, on) => {
  let freigeben = () => {}
  const tor = new Promise<void>(r => (freigeben = r))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', async (_, e) => {
    await tor
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  const mem = new Map<string, { value: unknown; version: number }>([
    ['hinweis', { value: { shape: 'hinweis-2', value: { phase: 'review', reviewBefehl: ORDER, compactBefehl: null, reviewErledigt: false } }, version: 1 }],
  ])
  on('state.get', (_, e, next) => (mem.has(e.key) ? ({ value: mem.get(e.key) } as never) : next(e)))
  on('state.set', (_, e, next) => {
    mem.delete(e.key)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const vorher = await $.ui.mount({ ...BAND, surface: 'vscode' })
  const erster = vorher.press({ key: 'review' }) // held at the gate: the order is still handing over
  await new Promise(r => setTimeout(r, 20))
  // drawn afresh as a second instance, as a redraw would (the first one is still pressed)
  const spinner = await $.ui.mount({ ...BAND, requestId: 'above-prompt-2', surface: 'vscode' })
  expect((await spinner.find({ key: 'review' }))?.props.label).toBe('Review läuft')
  await spinner.press({ key: 'review' })
  await spinner.unmount()
  const danach = await $.ui.mount({ ...BAND, requestId: 'above-prompt-3', surface: 'vscode' })
  expect((await danach.find({ key: 'review' }))?.props.label).toBe('Review läuft')
  await danach.unmount()
  freigeben()
  await erster
  await vorher.unmount()
})

// 2026-11-03: Live sends the release order, the lightning switches the repo's mode.
test('Live sends the release order; the lightning shows the mode and switches it', async ($, on) => {
  const gesendet: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    gesendet.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  // The repo as the mod reads it: careful mode, release script present. The engine hands the
  // hooks the path resolved against the working directory.
  const pfad = (p: string) => p.split(String.fromCharCode(92)).join('/')
  on('fs.read', (_, e, next) => (pfad(e.path).endsWith('/.claude/arbeitsmodus') ? ({ value: 'sorgfaeltig' } as never) : next(e)))
  on('fs.exists', (_, e, next) => (pfad(e.path).endsWith('/scripts/merge.ps1') ? ({ value: true } as never) : next(e)))
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  await new Promise(r => setTimeout(r, 20)) // session.start reads the repo without holding the start
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  // only the emoji; careful mode draws it dim, not highlighted
  const blitz = await ui.find({ key: 'blitz' })
  expect(blitz?.props.label).toBe('⚡')
  expect(blitz?.props.variant).toBe('secondary')
  await ui.press({ key: 'blitz' })
  await ui.press({ key: 'live' })
  expect(gesendet).toEqual(['Modus schnell', 'Release nach production'])
  await ui.unmount()
})

// 2026-11-03: the switch saves the model from before it; "↺" restores that one, the first switch's.
test('a switch saves the model before it, and the reset button restores it', async ($, on) => {
  const befehle: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] }) as never)
  on('command.run', (_, e) => (befehle.push(`/${e.command} ${e.args}`), { text: '' }))
  // what the session runs on: Opus first, Sonnet after the first switch (the test host has no
  // settings and no requests, so the effort stays unknown here)
  let modell = 'claude-opus-5-5'
  on('session.model', () => ({ value: modell }) as never)
  const wahl = { modell: 'sonnet', effort: 'high', compactBefehl: null, compactOffen: false, plan: null }
  const mem = new Map<string, { value: unknown; version: number }>([['modellwahl', { value: wahl, version: 1 }]])
  on('state.get', (_, e, next) => (mem.has(e.key) ? ({ value: mem.get(e.key) } as never) : next(e)))
  on('state.set', (_, e, next) => {
    mem.delete(e.key)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const vorWechsel = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await vorWechsel.find({ key: 'modell' }))?.props.label).toBe('→ Sonnet high')
  expect(await vorWechsel.find({ key: 'zurueck' })).toBe(undefined)
  await vorWechsel.press({ key: 'modell' })
  await vorWechsel.unmount()
  await new Promise(r => setTimeout(r, 20))
  expect(befehle).toEqual(['/model sonnet', '/effort high'])

  // a second switch keeps the first one's "vorher"
  modell = 'claude-sonnet-5-5'
  mem.set('modellwahl', { value: { ...wahl, effort: 'medium' }, version: 2 })
  const zweiter = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await zweiter.press({ key: 'modell' })
  await zweiter.unmount()
  await new Promise(r => setTimeout(r, 20))

  const mit = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await mit.find({ key: 'zurueck' }))?.props.label).toBe('↺ Opus')
  await mit.press({ key: 'zurueck' })
  await mit.unmount()
  await new Promise(r => setTimeout(r, 20))
  // no effort known: only the model goes back
  expect(befehle.slice(-1)).toEqual(['/model claude-opus-5-5'])

  const danach = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect(await danach.find({ key: 'zurueck' })).toBe(undefined)
  await danach.unmount()
})

test('the reset button restores model and effort as saved', async ($, on) => {
  const befehle: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] }) as never)
  on('command.run', (_, e) => (befehle.push(`/${e.command} ${e.args}`), { text: '' }))
  const mem = new Map<string, { value: unknown; version: number }>([['vorher', { value: { modell: 'claude-opus-5-5', effort: 'xhigh' }, version: 1 }]])
  on('state.get', (_, e, next) => (mem.has(e.key) ? ({ value: mem.get(e.key) } as never) : next(e)))
  on('state.set', (_, e, next) => {
    mem.delete(e.key)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect((await ui.find({ key: 'zurueck' }))?.props.label).toBe('↺ Opus xhigh')
  await ui.press({ key: 'zurueck' })
  await ui.unmount()
  await new Promise(r => setTimeout(r, 20))
  expect(befehle).toEqual(['/model claude-opus-5-5', '/effort xhigh'])
})

// 2026-11-03: VS Code draws no hover, so "?" opens the explanations beneath the row.
test('"?" opens the explanations beneath the row and closes them again', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  const zu = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect(await zu.find({ key: 'hilfe-review' })).toBe(undefined)
  await zu.press({ key: 'hilfe' })
  await zu.unmount()
  const offen = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect(await offen.find({ key: 'hilfe-review' })).not.toBe(undefined)
  expect(await offen.find({ key: 'hilfe-compact' })).not.toBe(undefined)
  await offen.press({ key: 'hilfe' })
  await offen.unmount()
  const wieder = await $.ui.mount({ ...BAND, surface: 'vscode' })
  expect(await wieder.find({ key: 'hilfe-review' })).toBe(undefined)
  await wieder.unmount()
})

