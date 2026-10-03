import { describe, expect, it } from 'vitest'

import type { Listing } from '@claudemodz/schema'

import { buildMarketplace } from '../src/marketplace'
import { scanOf } from './fixtures/scans'

const SHA = '0123456789abcdef0123456789abcdef01234567'

function listingOf(overrides: Partial<Listing> = {}): Listing {
  return {
    slug: 'ci-pane',
    displayName: 'CI Pane',
    summary: 'Live PR checks beside the transcript.',
    source: { type: 'git-subdir', repo: 'claudemodz/mods', path: 'plugins/ci-pane', ref: 'main', sha: SHA },
    authors: [{ github: 'snagrecha' }],
    maintainers: ['snagrecha'],
    license: 'MIT',
    category: 'git-ci',
    tags: ['github'],
    media: [],
    submittedBy: 'snagrecha',
    ...overrides,
  }
}

describe('buildMarketplace', () => {
  it('writes the claudemodz header', () => {
    const market = buildMarketplace([])
    expect(market.name).toBe('claudemodz')
    expect(market.owner).toEqual({ name: 'claudemodz', url: 'https://claudemodz.com' })
    expect(market.forceRemoveDeletedPlugins).toBe(true)
    expect(market.plugins).toEqual([])
  })

  it('maps a git-subdir listing to a pinned entry', () => {
    const market = buildMarketplace([{ slug: 'ci-pane', listing: listingOf(), scan: scanOf() }])
    expect(market.plugins).toEqual([
      {
        name: 'ci-pane',
        displayName: 'CI Pane',
        description: 'Live PR checks beside the transcript.',
        category: 'git-ci',
        tags: ['github'],
        source: { source: 'git-subdir', url: 'claudemodz/mods', path: 'plugins/ci-pane', ref: 'main', sha: SHA },
        metadata: { claudemodz: { url: 'https://claudemodz.com/m/ci-pane', risk: 'elevated' } },
      },
    ])
  })

  it('maps a github listing', () => {
    const listing = listingOf({ slug: 'whole-repo', source: { type: 'github', repo: 'acme/whole-repo', ref: 'v1', sha: SHA } })
    const [entry] = buildMarketplace([{ slug: 'whole-repo', listing, scan: scanOf({ slug: 'whole-repo' }) }]).plugins
    expect(entry?.source).toEqual({ source: 'github', repo: 'acme/whole-repo', ref: 'v1', sha: SHA })
  })

  it('leaves out listings without a passing scan, and sorts by slug', () => {
    const market = buildMarketplace([
      { slug: 'zeta', listing: listingOf({ slug: 'zeta' }), scan: scanOf({ slug: 'zeta' }) },
      { slug: 'alpha', listing: listingOf({ slug: 'alpha' }), scan: scanOf({ slug: 'alpha' }) },
      { slug: 'broken', listing: listingOf({ slug: 'broken' }), scan: scanOf({ slug: 'broken', validator: { success: false, errors: ['x'], warnings: [] } }) },
      { slug: 'unscanned', listing: listingOf({ slug: 'unscanned' }), scan: null },
    ])
    expect(market.plugins.map(p => p.name)).toEqual(['alpha', 'zeta'])
  })

  it('keeps the previously published entry when the new scan failed, is missing, or is for another sha', () => {
    const previous = buildMarketplace([
      { slug: 'failed', listing: listingOf({ slug: 'failed' }), scan: scanOf({ slug: 'failed' }) },
      { slug: 'stale', listing: listingOf({ slug: 'stale' }), scan: scanOf({ slug: 'stale' }) },
      { slug: 'unreadable', listing: listingOf({ slug: 'unreadable' }), scan: scanOf({ slug: 'unreadable' }) },
      { slug: 'deleted', listing: listingOf({ slug: 'deleted' }), scan: scanOf({ slug: 'deleted' }) },
    ])
    const newSha = 'f'.repeat(40)
    const moved = (slug: string) => listingOf({ slug, source: { type: 'git-subdir', repo: 'claudemodz/mods', path: `plugins/${slug}`, ref: 'main', sha: newSha } })
    const market = buildMarketplace(
      [
        { slug: 'failed', listing: moved('failed'), scan: scanOf({ slug: 'failed', sha: newSha, validator: { success: false, errors: ['x'], warnings: [] } }) },
        { slug: 'stale', listing: moved('stale'), scan: scanOf({ slug: 'stale' }) },
        { slug: 'unreadable', listing: null, scan: null },
      ],
      previous,
    )
    expect(market.plugins.map(p => [p.name, p.source.sha])).toEqual([
      ['failed', SHA],
      ['stale', SHA],
      ['unreadable', SHA],
    ])
  })
})
