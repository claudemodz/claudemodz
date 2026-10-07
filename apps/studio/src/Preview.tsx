import { ACCENTS, type Project } from '../../../packages/studio/src/config'
import {
  initialState,
  reduceEvent,
  rowsFor,
  toggleItem,
  layoutFor,
  type State,
} from '../../../packages/studio/src/runtime.js'
import { Icon } from './icons'
export type Scenario = 'ready' | 'working' | 'finished' | 'error'
export function scenarioState(project: Project, scenario: Scenario): State {
  let state = initialState(project)
  if (scenario !== 'ready') {
    state = reduceEvent(state, { type: 'measure', percent: 42, cost: 0.18 })
    state = reduceEvent(state, { type: 'start', turnId: 'preview' })
    if (scenario !== 'working')
      state = reduceEvent(state, {
        type: 'complete',
        turnId: 'preview',
        reason: scenario === 'finished' ? 'answer' : 'error',
      })
  }
  return state
}
export function Preview({
  project,
  scenario,
  narrow,
  selected,
  onSelect,
  checked,
  onCheck,
}: {
  project: Project
  scenario: Scenario
  narrow: boolean
  selected: string
  onSelect: (id: string) => void
  checked: State['checked']
  onCheck: (checks: State['checked']) => void
}) {
  const state = scenarioState(project, scenario)
  for (const widget of project.widgets)
    if (widget.kind === 'checklist')
      state.checked[widget.id] = widget.items.map((_, i) => checked[widget.id]?.[i] || false)
  const rows = rowsFor(project, state, scenario === 'working')
  const compact = layoutFor(project, state, narrow ? 40 : 100, 40) === 'compact'
  return (
    <div className={`terminal-window ${narrow ? 'narrow' : ''}`}>
      <div className="terminal-chrome">
        <span className="traffic">
          <i />
          <i />
          <i />
        </span>
        <span>claude — ~/your-next-idea</span>
        <Icon name="terminal" size={14} />
      </div>
      <div className="terminal-content">
        <div className="claude-greeting">
          <div className="pixel-claude" aria-hidden="true">
            ▐▛███▜▌
            <br />
            ▝▜█████▛▘
            <br /> ▘▘ ▝▝
          </div>
          <div>
            <b>Claude Code</b>
            <span>Your ideas. Your workspace.</span>
          </div>
        </div>
        <div className="sample-prompt">
          <span>❯</span> Let's build something worth sharing.
        </div>
        <div className="sample-response">
          <span className="response-dot">●</span>
          <div>
            {scenario === 'ready'
              ? "I'm ready. What would you like to make?"
              : scenario === 'working'
                ? 'Working through the details. Your workspace keeps the useful bits in view.'
                : scenario === 'finished'
                  ? 'This turn is finished. Take a look at the changes before you ship.'
                  : 'This turn hit a snag. Check the transcript for details.'}
          </div>
        </div>
        <div className="sample-code">
          <span className="line-no">01</span>
          <span className="code-green">+ </span>
          <span className="code-muted">a small idea, made real.</span>
          <br />
          <span className="line-no">02</span>
          <span className="code-green">+ </span>
          <span className="code-muted">a workspace that feels like you.</span>
        </div>
        <div className="band-divider">
          <span>YOUR WORKSPACE</span>
          <span>{compact ? 'COMPACT' : 'ABOVE PROMPT'}</span>
        </div>
        {compact ? (
          <div className="compact-summary" title={rows.map((r) => `${r.title}: ${r.lines[0]}`).join('  ·  ')}>
            {rows.map((r) => `${r.title}: ${r.lines[0]}`).join('  ·  ')}
          </div>
        ) : (
          <div className="widget-preview">
            {rows.map((row) => {
              const widget = project.widgets.find((w) => w.id === row.id)!
              return (
                <section
                  key={row.id}
                  className={`preview-widget ${selected === row.id ? 'selected' : ''}`}
                  style={{ '--widget-accent': row.color } as React.CSSProperties}
                  onClick={() => onSelect(row.id)}
                  aria-label={`${row.title} preview`}
                >
                  <button
                    className="preview-widget-heading"
                    onClick={() => onSelect(row.id)}
                    aria-label={`Select ${row.title}`}
                  >
                    <span>
                      <Icon name={row.kind} size={15} />
                      <b>{row.title || 'Untitled widget'}</b>
                    </span>
                    <span className="widget-summary">
                      {row.kind === 'context' && state.percent !== null
                        ? `${state.percent}%`
                        : row.kind === 'checklist'
                          ? row.lines[0]
                          : ''}
                    </span>
                  </button>
                  {row.kind === 'context' ? (
                    <>
                      <div className="meter" aria-label={row.lines[0]}>
                        {Array.from({ length: 25 }, (_, i) => (
                          <i
                            key={i}
                            className={state.percent !== null && i < Math.round(state.percent / 4) ? 'filled' : ''}
                          />
                        ))}
                      </div>
                      <div className="meter-detail">
                        <span>{row.lines[0]}</span>
                        {!compact && <span>{state.percent === null ? '—' : `${100 - state.percent}% left`}</span>}
                      </div>
                      {!compact && widget.kind === 'context' && widget.showCost && (
                        <p className="widget-detail">{row.lines[2]}</p>
                      )}
                    </>
                  ) : row.kind === 'status' ? (
                    <>
                      <div className={`session-state ${scenario}`}>
                        <span className="status-dot" />
                        {row.lines[0]}
                      </div>
                      {!compact && <p className="widget-detail">{row.lines[1]}</p>}
                    </>
                  ) : !compact && widget.kind === 'checklist' ? (
                    <div className="preview-checks">
                      {widget.items.map((item, i) => (
                        <button
                          key={i}
                          className={state.checked[row.id]?.[i] ? 'done' : ''}
                          onClick={(e) => {
                            e.stopPropagation()
                            onCheck(toggleItem(state, row.id, i).checked)
                          }}
                          aria-pressed={state.checked[row.id]?.[i] || false}
                        >
                          <span className="checkbox">
                            {state.checked[row.id]?.[i] && <Icon name="check" size={12} />}
                          </span>
                          {item || 'New item'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="compact-check">{row.lines[0]}</span>
                  )}
                </section>
              )
            })}
          </div>
        )}
        <div className="terminal-input">
          <span>❯</span>
          <span className="cursor" />
          <span className="input-placeholder">Your next move…</span>
        </div>
        <div className="terminal-foot">
          <span>? for shortcuts</span>
          <span>/{project.slug || 'my-workspace'}</span>
        </div>
      </div>
    </div>
  )
}
