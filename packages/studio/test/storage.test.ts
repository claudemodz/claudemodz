import { describe, expect, it } from 'vitest'
import { loadProject, STORAGE_KEY } from '../../../apps/studio/src/storage'
import { PRESETS } from '../src/config'
import { encodeProject } from '../src/share'
const saved = PRESETS[1]!.project
const storage = { getItem: (key: string) => (key === STORAGE_KEY ? JSON.stringify(saved) : null) }
describe('project recovery', () => {
  it('loads a saved project when navigating to an ordinary page anchor', () => {
    expect(loadProject(storage, '#workspace').project).toEqual(saved)
  })
  it('preserves the saved project as undo history when opening a remix', () => {
    const boot = loadProject(storage, encodeProject(PRESETS[0]!.project))
    expect(boot.previous).toEqual(saved)
    expect(boot.source).toBe('remix')
  })
  it('keeps saved work visible when a shared link is malformed', () => {
    const boot = loadProject(storage, '#studio=!!!')
    expect(boot.project).toEqual(saved)
    expect(boot.notice).toContain('could not')
  })
  it('opens a shared project even if local storage is unavailable', () => {
    expect(
      loadProject(
        {
          getItem: () => {
            throw Error('blocked')
          },
        },
        encodeProject(saved),
      ).project,
    ).toEqual(saved)
  })
  it('reports broken saved data and opens a usable starter', () => {
    const boot = loadProject({ getItem: () => '{broken' }, '')
    expect(boot.project.widgets.length).toBeGreaterThan(0)
    expect(boot.notice).toContain('could not')
  })
})
