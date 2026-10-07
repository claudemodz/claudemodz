// Shared by Studio's browser preview and its exported hook module. No browser or host APIs.
export const COLORS = { mint: '#94dbba', amber: '#efac77', sky: '#92c9ed', rose: '#e8a1b0', violet: '#baa6ed' }
export function initialState(project) {
  return {
    turnId: null,
    phase: 'ready',
    completed: 0,
    percent: null,
    cost: null,
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
    return {
      ...state,
      turnId: null,
      phase: event.reason === 'answer' ? 'finished' : event.reason === 'aborted' ? 'interrupted' : 'error',
      completed: state.completed + (event.reason === 'answer' ? 1 : 0),
    }
  }
  if (event.type === 'measure')
    return {
      ...state,
      percent:
        Number.isFinite(event.percent) && event.percent >= 0 && event.percent <= 100 ? Math.round(event.percent) : null,
      cost: Number.isFinite(event.cost) && event.cost >= 0 ? event.cost : null,
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
