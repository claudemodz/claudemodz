import config from './config.js'
import { initialState, reduceEvent, rowsFor, toggleItem, layoutFor, meterFor } from './runtime.js'

function refresh($) {
  $.ui.invalidate('ui.render')
}

export function register(on) {
  let state = initialState(config)
  let interactive = false
  const summary = () =>
    rowsFor(config, state)
      .map((row) => `${row.title}: ${row.lines.join(' · ')}`)
      .join('\n')
  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive && (e.surface === 'terminal' || e.surface === 'desktop')
    state = initialState(config)
    await $.command.register({
      name: config.slug,
      description: `${config.name}: show status or manage your checklist`,
      argumentHint: '[status | hide | show | check N | reset]',
      immediate: true,
    })
    return next(e)
  })
  on('session.end', ($, e, next) => {
    state = initialState(config)
    return next(e)
  })
  on('turn.start', ($, e, next) => {
    state = reduceEvent(state, { type: 'start', turnId: e.turnId })
    refresh($)
    return next(e)
  })
  on('turn.complete', ($, e, next) => {
    state = reduceEvent(state, { type: 'complete', turnId: e.turnId, reason: e.reason })
    refresh($)
    return next(e)
  })
  on('session.measure', ($, e, next) => {
    state = reduceEvent(state, { type: 'measure', percent: e.context.percent, cost: e.cost?.usd })
    refresh($)
    return next(e)
  })
  on('command.run', { command: config.slug }, ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide') state = { ...state, hidden: true }
    else if (arg === 'show') state = { ...state, hidden: false }
    else if (arg === 'reset') state = { ...state, checked: initialState(config).checked }
    else if (/^check [1-9][0-9]*$/.test(arg)) {
      let index = Number(arg.slice(6)) - 1
      let found = false
      for (const w of config.widgets) {
        if (w.kind !== 'checklist') continue
        if (index < w.items.length) {
          state = toggleItem(state, w.id, index)
          found = true
          break
        }
        index -= w.items.length
      }
      if (!found) return { text: 'No checklist item with that number.' }
    } else if (arg !== '' && arg !== 'status')
      return {
        text: `/${config.slug} status | hide | show | check N | reset. Item numbers follow checklist order, starting at 1.`,
      }
    refresh($)
    return { text: arg === 'hide' ? 'Workspace hidden.' : arg === 'show' ? 'Workspace visible.' : summary() }
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const existing = await next(e)
    if (
      !interactive ||
      state.hidden ||
      e.props.hasSurvey ||
      e.props.view.agentId !== undefined ||
      e.props.maxRows < 1 ||
      e.props.bodyColumns < 20 ||
      (e.surface !== 'terminal' && e.surface !== 'desktop')
    )
      return existing
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = rowsFor(config, state, e.props.isWorking)
    const layout = layoutFor(config, state, e.props.bodyColumns, e.props.maxRows - (existing ? 1 : 0))
    if (layout === 'hidden') return existing
    if (layout === 'compact')
      return Box({
        flexDirection: 'column',
        children: [
          existing,
          Text({ wrap: 'truncate', children: rows.map((row) => `${row.title}: ${row.lines[0]}`).join('  ·  ') }),
        ],
      })
    const widgets = rows.map((row) => {
      const w = config.widgets.find((item) => item.id === row.id)
      const heading = Text({
        bold: true,
        color: row.color,
        wrap: 'truncate',
        children: `${row.title}  ${row.lines[0]}`,
      })
      const children = [heading]
      if (w.kind === 'context' && state.percent !== null)
        children.push(Text({ color: row.color, wrap: 'truncate', children: meterFor(state.percent) }))
      if (w.kind === 'checklist')
        w.items.forEach((item, i) =>
          children.push(
            Button({
              key: `${w.id}-${i}`,
              label: `${state.checked[w.id]?.[i] ? '[x]' : '[ ]'} ${item}`,
              onPress: () => {
                state = toggleItem(state, w.id, i)
                refresh($)
              },
            }),
          ),
        )
      else
        row.lines.slice(1).forEach((line) => children.push(Text({ dimColor: true, wrap: 'truncate', children: line })))
      return Box({ key: row.id, flexDirection: 'column', children })
    })
    return Box({ flexDirection: 'column', children: [existing, ...widgets] })
  })
}
