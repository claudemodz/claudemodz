import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import type { Listing } from '@claudemodz/schema'

import { validateEntries } from '../src/market-validate'
import { scanOf } from './fixtures/scans'

const hasClaude = spawnSync('claude', ['--version']).status === 0
const SHA = '0123456789abcdef0123456789abcdef01234567'

const listingOf = (slug: string): Listing => ({
  slug,
  displayName: slug,
  summary: 'A test listing.',
  source: { type: 'git-subdir', repo: 'claudemodz/mods', path: `plugins/${slug}`, ref: 'main', sha: SHA },
  authors: [{ github: 'snagrecha' }],
  maintainers: ['snagrecha'],
  license: 'MIT',
  category: 'workflow',
  tags: [],
  media: [],
  submittedBy: 'snagrecha',
})

describe.runIf(hasClaude)('validateEntries (real claude plugin validate)', () => {
  it('accepts an ordinary slug', async () => {
    expect(await validateEntries([{ listing: listingOf('ci-pane'), scan: scanOf({ slug: 'ci-pane', sha: SHA }) }])).toEqual(new Map())
  })

  it('reports a slug Claude Code reserves', async () => {
    const errors = await validateEntries([{ listing: listingOf('claude-tools'), scan: scanOf({ slug: 'claude-tools', sha: SHA }) }])
    expect(errors.get('claude-tools')?.join('\n')).toMatch(/reserved/)
  })
})
