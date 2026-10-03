import { describe, expect, it } from 'vitest'

import { permissionsOf, riskOf } from '../src/permissions'

const none = { events: [], calls: [], hasExternal: false }

describe('permissionsOf', () => {
  it('no-attribution: an attribution hook and no calls needs nothing', () => {
    expect(permissionsOf({ ...none, events: ['attribution.text'] })).toEqual([])
  })

  it('model-router: turn.step rewrites the session; ui calls draw', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['agent.spawn', 'command.run', 'session.start', 'turn.step', 'ui.render'],
        calls: ['command.register', 'ui.invalidate'],
      }),
    ).toEqual(['rewrites-session', 'draws-ui'])
  })

  it('ci-pane: process.run runs processes', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['command.run', 'session.start', 'ui.render'],
        calls: ['clock.every', 'command.register', 'process.run', 'ui.open', 'ui.toast'],
      }),
    ).toEqual(['runs-processes', 'draws-ui'])
  })

  it('standup: reads files and the conversation, spends usage', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['command.run', 'prompt.submit', 'session.start', 'tool.call', 'turn.complete'],
        calls: ['clock.now', 'command.register', 'fs.read', 'model.complete', 'session.cwd', 'store.get'],
      }),
    ).toEqual(['reads-files', 'spends-usage', 'reads-conversation'])
  })

  it('maps the risky categories', () => {
    expect(
      permissionsOf({
        events: ['tool.check', 'plugin.register', 'fs.read', 'prompt.section'],
        calls: ['fs.write', 'http.fetch', 'env.get', 'prompt.submit'],
        hasExternal: true,
      }),
    ).toEqual([
      'writes-files',
      'network',
      'reads-secrets',
      'acts-for-you',
      'rewrites-session',
      'controls-other-mods',
      'external-code',
    ])
  })
})

describe('riskOf', () => {
  it('is elevated when any risky permission is present', () => {
    expect(riskOf(['reads-files', 'draws-ui'])).toBe('standard')
    expect(riskOf(['draws-ui', 'runs-processes'])).toBe('elevated')
    expect(riskOf([])).toBe('standard')
  })
})
