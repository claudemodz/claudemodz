import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PRESETS, parseProject } from '../src/config'
import { pluginFiles } from '../src/export'

const runtime = await readFile(new URL('../src/runtime.js', import.meta.url), 'utf8')
const register = await readFile(new URL('../src/register.js', import.meta.url), 'utf8').catch(() => '')
describe('plugin export', () => {
  it('exports a self-contained plugin with a round-trippable project', () => {
    const project = PRESETS[0]!.project
    const files = pluginFiles(project, runtime, register)
    expect(JSON.parse(files['.claude-plugin/plugin.json']!).name).toBe('mission-control')
    expect(JSON.parse(files['hooks/hooks.json']!)).toEqual({ modules: ['./register.js'] })
    expect(parseProject(JSON.parse(files['studio.json']!))).toEqual(project)
    expect(files['hooks/runtime.js']).toBe(runtime)
    expect(Object.keys(files).every((p) => !p.includes('..') && !p.startsWith('/'))).toBe(true)
  })
  it('serialized configuration executes only as data, including hostile strings', async () => {
    const project = structuredClone(PRESETS[0]!.project)
    project.widgets[0]!.title = '\"; throw Error(123); //'
    const files = pluginFiles(project, runtime, register)
    const mod = await import('data:text/javascript;base64,' + Buffer.from(files['hooks/config.js']!).toString('base64'))
    expect(mod.default).toEqual(project)
  })
  it('rejects invalid projects instead of exporting corrupted plugin metadata', () => {
    expect(() => pluginFiles({ ...PRESETS[0]!.project, slug: '../../escape' }, runtime, register)).toThrow()
  })
})
