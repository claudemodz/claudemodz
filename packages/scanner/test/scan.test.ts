import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanPlugin } from '../src/scan'

const hasClaude = spawnSync('claude', ['--version']).status === 0
const fixture = (name: string) => join(import.meta.dirname, 'fixtures', 'plugins', name)
const meta = (slug: string) => ({ slug, sha: 'a'.repeat(40), now: new Date('2026-10-03T12:00:00Z'), claudeCodeVersion: '2.1.288', withTests: false })

describe.runIf(hasClaude)('scanPlugin (real claude plugin validate)', () => {
  it('standard: reads files through a helper', async () => {
    const scan = await scanPlugin(fixture('standard'), meta('standard'))
    expect(scan.mod).toEqual({ events: ['session.start'], calls: ['fs.read'], envReads: [] })
    expect(scan.permissions).toEqual(['reads-files'])
    expect(scan.risk).toBe('standard')
    expect(scan.validator.success).toBe(true)
    expect(scan.scannedAt).toBe('2026-10-03T12:00:00.000Z')
  })

  it('elevated: processes, secrets and a pane', async () => {
    const scan = await scanPlugin(fixture('elevated'), meta('elevated'))
    expect(scan.mod?.envReads).toEqual(['GITHUB_TOKEN'])
    expect(scan.permissions).toEqual(['runs-processes', 'reads-secrets', 'draws-ui'])
    expect(scan.risk).toBe('elevated')
  })

  it('failing: validator errors are kept and nothing is inferred', async () => {
    const scan = await scanPlugin(fixture('failing'), meta('failing'))
    expect(scan.validator.success).toBe(false)
    expect(scan.validator.errors.join('\n')).toMatch(/node:child_process/)
  })

  it('mixed: no mod, external code is elevated', async () => {
    const scan = await scanPlugin(fixture('mixed'), meta('mixed'))
    expect(scan.mod).toBeNull()
    expect(scan.contains).toEqual(['skill', 'agent', 'command', 'settings-hook', 'mcp'])
    expect(scan.permissions).toEqual(['external-code'])
    expect(scan.risk).toBe('elevated')
  })

  it('skill-only: standard with nothing to report', async () => {
    const scan = await scanPlugin(fixture('skill-only'), meta('skill-only'))
    expect(scan.mod).toBeNull()
    expect(scan.permissions).toEqual([])
    expect(scan.risk).toBe('standard')
  })

  it('monitor-default: monitors and LSP servers are external code', async () => {
    const scan = await scanPlugin(fixture('monitor-default'), meta('monitor-default'))
    expect(scan.validator.success).toBe(true)
    expect(scan.permissions).toEqual(['external-code'])
    expect(scan.risk).toBe('elevated')
  })
})
