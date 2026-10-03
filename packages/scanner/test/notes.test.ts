import { describe, expect, it } from 'vitest'

import { parseNotes, splitTopLevel } from '../src/notes'

describe('splitTopLevel', () => {
  it('keeps commas inside braces and parentheses', () => {
    expect(splitTopLevel('a, b{x=1,2}, $.c (via f, g), d')).toEqual(['a', 'b{x=1,2}', '$.c (via f, g)', 'd'])
  })
})

describe('parseNotes', () => {
  it('reads events with matchers stripped', () => {
    const notes = parseNotes([
      './register.ts hooks: session.start, agent.spawn, turn.step, ui.render{component=Spinner}, command.run{command=router}',
      './register.ts calls: $.command.register, $.ui.invalidate',
    ])
    expect(notes.events).toEqual(['agent.spawn', 'command.run', 'session.start', 'turn.step', 'ui.render'])
    expect(notes.calls).toEqual(['command.register', 'ui.invalidate'])
  })

  it('reads "nothing on $" as no calls', () => {
    expect(parseNotes(['./register.ts calls: nothing on $']).calls).toEqual([])
  })

  it('strips (via …) annotations and dedupes', () => {
    const notes = parseNotes([
      './register.ts calls: $.clock.every, $.process.run (via fetchStatus, rerunFailed), $.ui.toast (via refresh), $.ui.toast',
    ])
    expect(notes.calls).toEqual(['clock.every', 'process.run', 'ui.toast'])
  })

  it('reads environment variable reads and ignores "env writes: nothing"', () => {
    const notes = parseNotes(['./register.js env writes: nothing', './register.js env reads: GITHUB_TOKEN, HOME'])
    expect(notes.envReads).toEqual(['GITHUB_TOKEN', 'HOME'])
    expect(notes.other).toEqual([])
  })

  it('keeps unknown kinds and env writes in other, without throwing', () => {
    const notes = parseNotes([
      './register.js env writes: DEBUG',
      './register.js state: count',
      'something unexpected',
    ])
    expect(notes.other).toEqual([
      './register.js env writes: DEBUG',
      './register.js state: count',
      'something unexpected',
    ])
  })

  it('aggregates several modules', () => {
    const notes = parseNotes([
      './a.ts hooks: tool.call{tool=Bash}',
      './a.ts calls: nothing on $',
      './b.ts hooks: tool.call, ui.render{component=Pane}',
      './b.ts calls: $.ui.open',
    ])
    expect(notes.events).toEqual(['tool.call', 'ui.render'])
    expect(notes.calls).toEqual(['ui.open'])
  })
})
