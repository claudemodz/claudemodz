import { describe, expect, it } from 'vitest'

import { COMMENT_MARKER, renderComment } from '../src/comment'
import { diffScans } from '../src/diff'
import { scanOf } from './fixtures/scans'

describe('renderComment', () => {
  it('starts with the marker and summarizes a new elevated listing', () => {
    const scan = scanOf()
    const text = renderComment([
      { slug: 'ci-pane', file: 'registry/listings/ci-pane.yaml', removed: false, errors: [], warnings: [], scan, diff: diffScans(null, scan) },
    ])
    expect(text.startsWith(COMMENT_MARKER)).toBe(true)
    expect(text).toContain('### ci-pane')
    expect(text).toContain('Runs programs on your machine')
    expect(text).toContain('Draws in the Claude Code interface')
    expect(text).toContain('needs a maintainer to add the `permissions-approved` label')
    expect(text).toContain('Tests: 18 passed, 0 failed')
  })

  it('shows errors, warnings and the permission diff for an update', () => {
    const before = scanOf()
    const after = scanOf({
      mod: { events: ['session.start', 'ui.render'], calls: ['http.fetch', 'process.run', 'ui.open'], envReads: ['GITHUB_TOKEN'] },
      permissions: ['runs-processes', 'network', 'draws-ui'],
    })
    const text = renderComment([
      {
        slug: 'ci-pane',
        file: 'registry/listings/ci-pane.yaml',
        removed: false,
        errors: ['license: listing says MIT but the repository is Apache-2.0'],
        warnings: ['plugin tests failed: 1 of 18'],
        scan: after,
        diff: diffScans(before, after),
      },
    ])
    expect(text).toContain('❌ license: listing says MIT but the repository is Apache-2.0')
    expect(text).toContain('⚠️ plugin tests failed: 1 of 18')
    expect(text).toContain('**Added:** Makes network requests')
    expect(text).toContain('`http.fetch`')
    expect(text).toContain('Reads environment variables: `GITHUB_TOKEN`')
  })

  it('notes removals', () => {
    const text = renderComment([
      { slug: 'old-mod', file: 'registry/listings/old-mod.yaml', removed: true, errors: [], warnings: [], scan: null, diff: null },
    ])
    expect(text).toContain('### old-mod')
    expect(text).toContain('Removed from the marketplace')
  })

  it('keeps plugin-supplied text from breaking out of code spans or pinging people', () => {
    const scan = scanOf({
      external: {
        settingsHooks: [{ event: 'PostToolUse', command: 'x` <!-- hidden' }],
        mcpServers: [],
        lspServers: [],
        monitors: [],
        bundles: [],
        remoteBundles: [],
      },
      permissions: ['external-code'],
    })
    const text = renderComment([
      {
        slug: 'sneaky',
        file: 'registry/listings/sneaky.yaml',
        removed: false,
        errors: ['claude plugin validate: cannot import "<!-- @alice"'],
        warnings: [],
        scan,
        diff: null,
      },
    ])
    expect(text).toContain('``x` <!-- hidden``')
    const outsideCode = text.slice(COMMENT_MARKER.length).replace(/(`+)[\s\S]*?\1/g, '')
    expect(outsideCode).not.toMatch(/(^|[^\\])<!--/m)
    expect(text).not.toContain('@alice')
  })
})
