import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ScanResultSchema } from '@claudemodz/schema'

import { publishRegistry } from '../src/publish'
import { scanOf } from './fixtures/scans'

const SHA = '0123456789abcdef0123456789abcdef01234567'
const yamlOf = (slug: string) => `slug: ${slug}
displayName: ${slug}
summary: A test listing.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/${slug}
  ref: main
  sha: ${SHA}
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: workflow
submittedBy: snagrecha
`

describe('publishRegistry', () => {
  it('writes generated scans and the marketplace, and removes stale scans', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claudemodz-pub-'))
    await mkdir(join(root, 'registry/listings'), { recursive: true })
    await mkdir(join(root, 'registry/generated'), { recursive: true })
    await writeFile(join(root, 'registry/listings/alpha.yaml'), yamlOf('alpha'))
    await writeFile(join(root, 'registry/listings/beta.yaml'), yamlOf('beta'))
    await writeFile(join(root, 'registry/generated/gone.json'), JSON.stringify(scanOf({ slug: 'gone' })))
    await writeFile(join(root, 'registry/generated/beta.json'), JSON.stringify(scanOf({ slug: 'beta', risk: 'standard', permissions: [] })))

    const outcome = await publishRegistry(root, ['alpha', 'gone'], {
      fetch: async () => ({ ok: true, dir: '/x' }),
      scan: async (_dir, slug, sha) => scanOf({ slug, sha }),
    })

    expect(outcome).toEqual({ written: ['alpha'], removed: ['gone'] })
    expect(existsSync(join(root, 'registry/generated/gone.json'))).toBe(false)
    const alpha = ScanResultSchema.parse(JSON.parse(await readFile(join(root, 'registry/generated/alpha.json'), 'utf8')))
    expect(alpha.slug).toBe('alpha')
    const market = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual(['alpha', 'beta'])
  })

  it('a listing whose source cannot be fetched is left out of the marketplace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claudemodz-pub-'))
    await mkdir(join(root, 'registry/listings'), { recursive: true })
    await writeFile(join(root, 'registry/listings/alpha.yaml'), yamlOf('alpha'))
    const outcome = await publishRegistry(root, 'all', {
      fetch: async () => ({ ok: false, error: 'commit not found' }),
      scan: async (_dir, slug, sha) => scanOf({ slug, sha }),
    })
    expect(outcome.written).toEqual([])
    const market = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    expect(market.plugins).toEqual([])
  })
})
