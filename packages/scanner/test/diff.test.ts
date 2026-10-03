import { describe, expect, it } from 'vitest'

import { diffScans, externalKeys } from '../src/diff'
import { scanOf } from './fixtures/scans'

describe('diffScans', () => {
  it('a new elevated listing needs review', () => {
    expect(diffScans(null, scanOf()).needsReview).toBe(true)
  })

  it('a new standard listing does not', () => {
    expect(diffScans(null, scanOf({ permissions: ['draws-ui'], risk: 'standard' })).needsReview).toBe(false)
  })

  it('an update with the same permissions does not', () => {
    const diff = diffScans(scanOf(), scanOf({ sha: 'f'.repeat(40) }))
    expect(diff.needsReview).toBe(false)
    expect(diff.addedPermissions).toEqual([])
  })

  it('an update that adds a risky permission needs review and lists what changed', () => {
    const after = scanOf({
      mod: { events: ['session.start', 'ui.render'], calls: ['http.fetch', 'process.run', 'ui.open'], envReads: [] },
      permissions: ['runs-processes', 'network', 'draws-ui'],
    })
    const diff = diffScans(scanOf(), after)
    expect(diff.addedCalls).toEqual(['http.fetch'])
    expect(diff.addedPermissions).toEqual(['network'])
    expect(diff.needsReview).toBe(true)
  })

  it('an update that adds an MCP server needs review', () => {
    const after = scanOf({
      external: { settingsHooks: [], mcpServers: [{ name: 'x', command: 'npx x', url: null }] },
      permissions: ['runs-processes', 'draws-ui', 'external-code'],
    })
    const diff = diffScans(scanOf(), after)
    expect(diff.addedExternal).toEqual(['MCP server x: npx x'])
    expect(diff.needsReview).toBe(true)
  })

  it('removing permissions never needs review', () => {
    const diff = diffScans(scanOf(), scanOf({ permissions: ['draws-ui'], risk: 'standard' }))
    expect(diff.removedPermissions).toEqual(['runs-processes'])
    expect(diff.needsReview).toBe(false)
  })
})

describe('externalKeys', () => {
  it('describes settings hooks and MCP servers', () => {
    const scan = scanOf({
      external: {
        settingsHooks: [{ event: 'PostToolUse', command: 'npx prettier' }],
        mcpServers: [{ name: 'docs', command: null, url: 'https://mcp.example.com' }],
      },
    })
    expect(externalKeys(scan)).toEqual(['settings hook PostToolUse: npx prettier', 'MCP server docs: https://mcp.example.com'])
  })
})
