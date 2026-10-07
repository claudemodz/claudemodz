// Shared by Studio's browser preview and its exported hook module. No browser or host APIs.
export const COLORS = { mint: '#94dbba', amber: '#efac77', sky: '#92c9ed', rose: '#e8a1b0', violet: '#baa6ed' }
export function initialState(project) {
  return {
    turnId: null,
    phase: 'ready',
    completed: 0,
    percent: null,
    cost: null,
    tokens: null,
    contextWindow: null,
    lastDurationMs: null,
    totalDurationMs: 0,
    timedTurns: 0,
    hidden: false,
    checked: Object.fromEntries(
      project.widgets.filter((w) => w.kind === 'checklist').map((w) => [w.id, w.items.map(() => false)]),
    ),
  }
}
export function reduceEvent(state, event) {
  if (event.type === 'start') return { ...state, turnId: event.turnId, phase: 'working' }
  if (event.type === 'complete') {
    if (state.turnId !== event.turnId) return state
    const duration = Number.isFinite(event.durationMs) && event.durationMs >= 0 ? event.durationMs : null
    return {
      ...state,
      turnId: null,
      phase: event.reason === 'answer' ? 'finished' : event.reason === 'aborted' ? 'interrupted' : 'error',
      completed: state.completed + (event.reason === 'answer' ? 1 : 0),
      lastDurationMs: duration,
      totalDurationMs: state.totalDurationMs + (duration ?? 0),
      timedTurns: state.timedTurns + (duration === null ? 0 : 1),
    }
  }
  if (event.type === 'measure')
    return {
      ...state,
      percent:
        Number.isFinite(event.percent) && event.percent >= 0 && event.percent <= 100 ? Math.round(event.percent) : null,
      cost: Number.isFinite(event.cost) && event.cost >= 0 ? event.cost : null,
      tokens: Number.isSafeInteger(event.tokens) && event.tokens >= 0 ? event.tokens : null,
      contextWindow: Number.isSafeInteger(event.window) && event.window > 0 ? event.window : null,
    }
  return state
}
export function toggleItem(state, id, index) {
  const checked = state.checked[id]
  if (!checked || !Number.isInteger(index) || index < 0 || index >= checked.length) return state
  return { ...state, checked: { ...state.checked, [id]: checked.map((v, i) => (i === index ? !v : v)) } }
}
export function rowsFor(project, state, working = false) {
  return project.widgets.map((widget) => {
    const base = { id: widget.id, title: widget.title, color: COLORS[widget.accent], kind: widget.kind, lines: [] }
    if (widget.kind === 'note') return { ...base, lines: [widget.text] }
    if (widget.kind === 'budget') {
      if (!Number.isFinite(widget.targetUsd) || widget.targetUsd < 0.01)
        return { ...base, lines: ['Set a budget target', 'Enter a positive amount in USD'] }
      if (state.cost === null)
        return { ...base, lines: ['Cost unavailable', `$${widget.targetUsd.toFixed(2)} target · advisory only`] }
      const delta = widget.targetUsd - state.cost
      return {
        ...base,
        lines: [
          `$${state.cost.toFixed(2)} of $${widget.targetUsd.toFixed(2)}`,
          `$${Math.abs(delta).toFixed(2)} ${delta < 0 ? 'over target' : 'remaining'} · advisory only`,
        ],
      }
    }
    if (widget.kind === 'tokens')
      return {
        ...base,
        lines: [
          state.tokens === null ? 'Awaiting measurement' : `${formatCount(state.tokens)} tokens in context`,
          state.contextWindow === null ? 'Window size unavailable' : `${formatCount(state.contextWindow)} token window`,
        ],
      }
    if (widget.kind === 'timing')
      return {
        ...base,
        lines: [
          state.lastDurationMs === null ? 'No turn timed yet' : `Last turn: ${formatDuration(state.lastDurationMs)}`,
          state.timedTurns === 0
            ? 'Updates when a turn ends'
            : `${state.timedTurns} timed ${state.timedTurns === 1 ? 'turn' : 'turns'} · ${formatDuration(state.totalDurationMs)} total`,
        ],
      }
    if (widget.kind === 'status') {
      const phase = working ? 'working' : state.phase
      const labels = {
        ready: 'Ready when you are',
        working: 'Working',
        finished: 'Turn finished',
        interrupted: 'Interrupted',
        error: 'Turn ended with an error',
      }
      return {
        ...base,
        lines: [
          labels[phase] || labels.ready,
          `${state.completed} ${state.completed === 1 ? 'turn' : 'turns'} completed`,
        ],
      }
    }
    if (widget.kind === 'context') {
      const percent = state.percent
      const main = percent === null ? 'Awaiting measurement' : `${percent}% context used`
      const detail =
        percent === null ? 'Updates after a model response' : `${Math.max(0, 100 - percent)}% of the window remaining`
      const cost = widget.showCost
        ? state.cost === null
          ? 'Cost unavailable'
          : `$${state.cost.toFixed(2)} reported session cost`
        : null
      return { ...base, lines: cost ? [main, detail, cost] : [main, detail] }
    }
    const checked = state.checked[widget.id] || []
    return {
      ...base,
      lines: [
        `${widget.items.filter((_, i) => checked[i]).length}/${widget.items.length} complete`,
        ...widget.items.map((item, i) => `${checked[i] ? '[x]' : '[ ]'} ${item}`),
      ],
    }
  })
}

function formatCount(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function formatDuration(ms) {
  if (ms < 1000) return `${Math.floor(ms)}ms`
  if (ms < 60000) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`
}

export function meterFor(percent) {
  if (percent === null) return ''
  const count = Math.round(percent / 4)
  return '▰'.repeat(count) + '▱'.repeat(25 - count)
}
export function layoutFor(project, state, columns, maxRows) {
  if (columns < 20 || maxRows < 1) return 'hidden'
  const needed = rowsFor(project, state).reduce(
    (total, row) => total + row.lines.length + (row.kind === 'context' && state.percent !== null ? 1 : 0),
    0,
  )
  return project.density === 'compact' || columns < 50 || maxRows < needed ? 'compact' : 'full'
}
