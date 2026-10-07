import { describe, expect, it } from 'vitest'
import { parseProject, makeWidget } from '../src/config'
import { initialState, reduceEvent, rowsFor, layoutFor } from '../src/runtime.js'
import { decodeProject, encodeProject } from '../src/share'
const project = () =>
  parseProject({
    version: 1,
    name: 'Session insights',
    slug: 'session-insights',
    density: 'comfortable',
    widgets: [
      { id: 'note', kind: 'note', title: 'Keep in mind', accent: 'sky', text: 'Ship the smallest useful change.' },
      { id: 'budget', kind: 'budget', title: 'Session budget', accent: 'amber', targetUsd: 5 },
      { id: 'tokens', kind: 'tokens', title: 'Token usage', accent: 'violet' },
      { id: 'timing', kind: 'timing', title: 'Turn timing', accent: 'mint' },
    ],
  })
describe('new widget configuration', () => {
  it('round-trips all new types and creates valid defaults', () => {
    const p = project()
    expect(decodeProject(encodeProject(p))).toEqual(p)
    for (const kind of ['note', 'budget', 'tokens', 'timing'] as const)
      expect(parseProject({ ...p, widgets: [makeWidget(kind, kind)] }).widgets[0]!.kind).toBe(kind)
  })
  it('rejects invalid notes and budget targets', () => {
    const p = project()
    for (const text of ['', 'x'.repeat(161), 'bad\u001btext'])
      expect(() => parseProject({ ...p, widgets: [{ ...p.widgets[0], text }] })).toThrow()
    for (const targetUsd of [0, -1, Infinity, NaN, 10001])
      expect(() => parseProject({ ...p, widgets: [{ ...p.widgets[1], targetUsd }] })).toThrow()
  })
})
describe('new widget data', () => {
  it('renders notes literally and keeps absent measurements unknown', () => {
    const p = project(),
      rows = rowsFor(p, initialState(p))
    expect(rows[0]!.lines).toEqual(['Ship the smallest useful change.'])
    expect(rows[1]!.lines.join(' ')).toContain('Cost unavailable')
    expect(rows[2]!.lines.join(' ')).toContain('Awaiting measurement')
    expect(rows[3]!.lines.join(' ')).toContain('No turn timed yet')
  })
  it('uses actual token counts and distinguishes zero from invalid or absent data', () => {
    const p = project()
    let s = reduceEvent(initialState(p), { type: 'measure', tokens: 84000, window: 200000, cost: 0 })
    expect(rowsFor(p, s)[2]!.lines).toEqual(['84,000 tokens in context', '200,000 token window'])
    expect(rowsFor(p, s)[1]!.lines).toEqual(['$0.00 of $5.00', '$5.00 remaining · advisory only'])
    s = reduceEvent(s, { type: 'measure', tokens: 0, window: 200000 })
    expect(rowsFor(p, s)[2]!.lines[0]).toBe('0 tokens in context')
    s = reduceEvent(s, { type: 'measure', tokens: -1, window: Infinity })
    expect(s.tokens).toBeNull()
    expect(s.contextWindow).toBeNull()
    expect(s.cost).toBeNull()
  })
  it('reports exceeded budgets without negative remaining amounts', () => {
    const p = project(),
      s = reduceEvent(initialState(p), { type: 'measure', cost: 6.25 })
    expect(rowsFor(p, s)[1]!.lines).toEqual(['$6.25 of $5.00', '$1.25 over target · advisory only'])
  })
  it('times only matching main turns once, including interruptions', () => {
    const p = project()
    let s = reduceEvent(initialState(p), { type: 'start', turnId: 'main' })
    s = reduceEvent(s, { type: 'complete', turnId: 'child', reason: 'answer', durationMs: 999999 })
    expect(s.totalDurationMs).toBe(0)
    s = reduceEvent(s, { type: 'complete', turnId: 'main', reason: 'answer', durationMs: 12500 })
    s = reduceEvent(s, { type: 'complete', turnId: 'main', reason: 'answer', durationMs: 12500 })
    expect(rowsFor(p, s)[3]!.lines).toEqual(['Last turn: 12.5s', '1 timed turn · 12.5s total'])
    s = reduceEvent(s, { type: 'start', turnId: 'next' })
    s = reduceEvent(s, { type: 'complete', turnId: 'next', reason: 'aborted', durationMs: 60000 })
    expect(rowsFor(p, s)[3]!.lines).toEqual(['Last turn: 1m 0s', '2 timed turns · 1m 12s total'])
    expect(s.completed).toBe(1)
    expect(initialState(p).totalDurationMs).toBe(0)
  })
  it('does not invent timing when a duration is missing or invalid', () => {
    const p = project()
    for (const durationMs of [undefined, NaN, Infinity, -1]) {
      let s = reduceEvent(initialState(p), { type: 'start', turnId: 'x' })
      s = reduceEvent(s, { type: 'complete', turnId: 'x', reason: 'answer', durationMs })
      expect(s.lastDurationMs).toBeNull()
      expect(s.timedTurns).toBe(0)
    }
  })
  it('counts actual rows in layout selection', () => {
    const p = project(),
      s = initialState(p)
    expect(layoutFor(p, s, 100, 7)).toBe('full')
    expect(layoutFor(p, s, 100, 6)).toBe('compact')
    expect(layoutFor(p, s, 30, 7)).toBe('compact')
  })
})
