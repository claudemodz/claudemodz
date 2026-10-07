import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { PRESETS, parseProjectJson } from '../src/config'
import { pluginArchive } from '../src/archive'

const runtime = await readFile(new URL('../src/runtime.js', import.meta.url), 'utf8')
const register = await readFile(new URL('../src/register.js', import.meta.url), 'utf8')

describe('downloadable plugin archive', () => {
  it('extracts into one installable folder with the exact edited project and executable source', () => {
    const project = structuredClone(PRESETS[0]!.project)
    project.name = 'My 日本語 workspace'
    project.slug = 'my-workspace'
    project.widgets.reverse()
    project.widgets[0]!.title = 'Ship <carefully>'
    const files = unzipSync(pluginArchive(project, runtime, register))
    expect(Object.keys(files).sort()).toEqual([
      'my-workspace/.claude-plugin/plugin.json',
      'my-workspace/LICENSE',
      'my-workspace/README.md',
      'my-workspace/hooks/config.js',
      'my-workspace/hooks/hooks.json',
      'my-workspace/hooks/register.js',
      'my-workspace/hooks/runtime.js',
      'my-workspace/studio.json',
    ])
    expect(parseProjectJson(strFromU8(files['my-workspace/studio.json']!))).toEqual(project)
    expect(JSON.parse(strFromU8(files['my-workspace/.claude-plugin/plugin.json']!)).name).toBe('my-workspace')
    expect(strFromU8(files['my-workspace/hooks/register.js']!)).toBe(register)
    expect(strFromU8(files['my-workspace/hooks/runtime.js']!)).toBe(runtime)
  })
})
