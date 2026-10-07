import { describe, expect, it } from 'vitest'
import { parseProject, PRESETS } from '../src/config'
import { encodeProject, decodeProject } from '../src/share'
import { initialState, reduceEvent, rowsFor, toggleItem } from '../src/runtime.js'

const project = () =>
  parseProject({
    version: 1,
    name: 'My workspace',
    slug: 'my-workspace',
    density: 'comfortable',
    widgets: [
      { id: 'activity', kind: 'status', title: 'Session', accent: 'mint' },
      { id: 'usage', kind: 'context', title: 'Context', accent: 'amber', showCost: true },
      { id: 'tasks', kind: 'checklist', title: 'Ship it', accent: 'sky', items: ['Write tests', 'Review changes'] },
    ],
  })

describe('project boundary', () => {
  it('accepts all shipped presets', () => {
    for (const p of PRESETS) expect(parseProject(p.project).widgets.length).toBeGreaterThan(0)
  })
  it('rejects duplicate widget identities', () => {
    const p = project()
    p.widgets[1]!.id = 'activity'
    expect(() => parseProject(p)).toThrow()
  })
  it.each(['../escape', '--flag', 'with space', 'UPPER'])('rejects unsafe slugs: %s', (slug) => {
    expect(() => parseProject({ ...project(), slug })).toThrow()
  })
  it('rejects controls, oversized projects and unknown configuration keys', () => {
    expect(() => parseProject({ ...project(), name: 'Hi\u001b[31m' })).toThrow()
    expect(() => parseProject({ ...project(), version: 2 })).toThrow()
    expect(() => parseProject({ ...project(), code: 'doThings()' })).toThrow()
    expect(() =>
      parseProject({
        ...project(),
        widgets: Array.from({ length: 7 }, (_, n) => ({ ...project().widgets[0], id: 'a' + n })),
      }),
    ).toThrow()
  })
  it('rejects empty and oversized checklist entries', () => {
    const p = project()
    const w = p.widgets[2]!
    if (w.kind !== 'checklist') throw Error()
    w.items = ['']
    expect(() => parseProject(p)).toThrow()
    w.items = ['x'.repeat(81)]
    expect(() => parseProject(p)).toThrow()
  })
})
describe('portable projects', () => {
  it('round trips Unicode and code-like text without interpreting it', () => {
    const p = project()
    p.name = 'Studio café ✨'
    p.widgets[0]!.title = '${alert(1)} <script>'
    expect(decodeProject(encodeProject(p))).toEqual(p)
  })
  it('rejects malformed, oversized and unrelated fragments', () => {
    for (const value of ['', '#other=abc', '#studio=!!!', '#studio=' + 'a'.repeat(30000)])
      expect(() => decodeProject(value)).toThrow()
  })
})
describe('shared rendering model', () => {
  it('shows unknown context until an actual measurement arrives', () => {
    const p = project()
    const s = initialState(p)
    expect(
      rowsFor(p, s, false)
        .find((r) => r.id === 'usage')!
        .lines.join(' '),
    ).toContain('Awaiting measurement')
    const measured = reduceEvent(s, { type: 'measure', percent: 37, cost: 1.25 })
    expect(
      rowsFor(p, measured, false)
        .find((r) => r.id === 'usage')!
        .lines.join(' '),
    ).toContain('37%')
    expect(
      rowsFor(p, measured, false)
        .find((r) => r.id === 'usage')!
        .lines.join(' '),
    ).toContain('$1.25')
  })
  it('resets missing context after compaction and rejects invalid measurements', () => {
    const p = project()
    let s = reduceEvent(initialState(p), { type: 'measure', percent: 72, cost: 1 })
    s = reduceEvent(s, { type: 'measure', percent: undefined, cost: undefined })
    expect(s.percent).toBeNull()
    expect(s.cost).toBeNull()
    s = reduceEvent(s, { type: 'measure', percent: Infinity, cost: -10 })
    expect(s.percent).toBeNull()
    expect(s.cost).toBeNull()
  })
  it('late completion cannot overwrite the active turn or count twice', () => {
    let s = initialState(project())
    s = reduceEvent(s, { type: 'start', turnId: 'old' })
    s = reduceEvent(s, { type: 'start', turnId: 'new' })
    s = reduceEvent(s, { type: 'complete', turnId: 'old', reason: 'answer' })
    expect(s.turnId).toBe('new')
    expect(s.completed).toBe(0)
    s = reduceEvent(s, { type: 'complete', turnId: 'new', reason: 'answer' })
    expect(s.completed).toBe(1)
    s = reduceEvent(s, { type: 'complete', turnId: 'new', reason: 'answer' })
    expect(s.completed).toBe(1)
  })
  it('interrupted and failed turns do not count as completed', () => {
    for (const reason of ['aborted', 'error']) {
      let s = reduceEvent(initialState(project()), { type: 'start', turnId: 'a' })
      s = reduceEvent(s, { type: 'complete', turnId: 'a', reason })
      expect(s.completed).toBe(0)
      expect(s.phase).not.toBe('finished')
    }
  })
  it('keeps checklist completion attached to identity through reordering', () => {
    const p = project()
    const s = toggleItem(initialState(p), 'tasks', 0)
    p.widgets.reverse()
    expect(rowsFor(p, s, false).find((r) => r.id === 'tasks')!.lines).toEqual([
      '1/2 complete',
      '[x] Write tests',
      '[ ] Review changes',
    ])
    expect(toggleItem(s, 'tasks', 0).checked.tasks).toEqual([false, false])
    expect(toggleItem(s, 'missing', 0)).toEqual(s)
    expect(toggleItem(s, 'tasks', 100)).toEqual(s)
  })
  it('a live working flag overrides an idle state on reload', () => {
    const p = project()
    expect(rowsFor(p, initialState(p), true).find((r) => r.id === 'activity')!.lines[0]).toBe('Working')
  })
})

describe('actual row budgets', () => {
  it('counts checklist rows and context meter rows when choosing a layout', async () => {
    const { layoutFor } = await import('../src/runtime.js')
    const p = project()
    const s = initialState(p)
    expect(layoutFor(p, s, 100, 9)).toBe('full')
    expect(layoutFor(p, s, 100, 7)).toBe('compact')
    const long = parseProject({
      ...p,
      widgets: [
        { id: 'long', kind: 'checklist', title: 'Tasks', accent: 'sky', items: ['1', '2', '3', '4', '5', '6'] },
      ],
    })
    expect(layoutFor(long, initialState(long), 100, 3)).toBe('compact')
    expect(layoutFor(long, initialState(long), 100, 7)).toBe('full')
  })
})
