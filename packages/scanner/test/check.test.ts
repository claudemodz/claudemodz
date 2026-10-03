import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Listing, ScanResult } from '@claudemodz/schema'

import { changedSlugsOf, checkListings, summarize, type CheckDeps } from '../src/check'
import { scanOf } from './fixtures/scans'

const SHA = '0123456789abcdef0123456789abcdef01234567'

function yamlOf(slug: string, extra = '', repoPath = `plugins/${slug}`): string {
  return `slug: ${slug}
displayName: ${slug}
summary: A test listing.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: ${repoPath}
  ref: main
  sha: ${SHA}
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: workflow
submittedBy: snagrecha
${extra}`
}

async function registry(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'claudemodz-reg-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

function depsOf(overrides: Partial<CheckDeps> = {}, scan: Partial<ScanResult> = {}): CheckDeps {
  return {
    fetch: async () => ({ ok: true, dir: '/tmp/plugin' }),
    scan: async (_dir, slug, sha) => scanOf({ slug, sha, permissions: ['reads-files'], risk: 'standard', ...scan }),
    baseScanOf: async () => null,
    baseListingOf: async () => null,
    licenseOf: async () => 'MIT',
    ...overrides,
  }
}

describe('changedSlugsOf', () => {
  it('reads slugs from listing and media paths', () => {
    expect(
      changedSlugsOf(['registry/listings/a.yaml', 'registry/media/b/demo.gif', 'README.md', 'registry/listings/a.yaml']),
    ).toEqual(['a', 'b'])
  })
})

describe('checkListings', () => {
  it('passes a valid standard listing', async () => {
    const root = await registry({ 'registry/listings/standup.yaml': yamlOf('standup') })
    const [result] = await checkListings(root, ['standup'], depsOf())
    expect(result?.errors).toEqual([])
    expect(result?.scan?.risk).toBe('standard')
    expect(summarize([result!])).toEqual({ failed: false, needsReview: false })
  })

  it('a deleted listing is a removal', async () => {
    const root = await registry({})
    const [result] = await checkListings(root, ['gone'], depsOf())
    expect(result).toMatchObject({ slug: 'gone', removed: true, errors: [] })
  })

  it('reports schema errors and does not fetch', async () => {
    let fetched = false
    const root = await registry({ 'registry/listings/bad.yaml': yamlOf('bad').replace('category: workflow', 'catgory: workflow') })
    const [result] = await checkListings(root, ['bad'], depsOf({ fetch: async () => ((fetched = true), { ok: true, dir: '' }) }))
    expect(result?.errors.join('\n')).toMatch(/catgory/)
    expect(fetched).toBe(false)
  })

  it('reports an unreachable sha for that listing and still checks the others', async () => {
    const root = await registry({
      'registry/listings/one.yaml': yamlOf('one'),
      'registry/listings/two.yaml': yamlOf('two'),
    })
    const results = await checkListings(
      root,
      ['one', 'two'],
      depsOf({ fetch: async source => (source.type === 'git-subdir' && source.path === 'plugins/one' ? { ok: false, error: `commit ${SHA} not found in claudemodz/mods: fatal` } : { ok: true, dir: '/x' }) }),
    )
    expect(results[0]?.errors).toEqual([`commit ${SHA} not found in claudemodz/mods: fatal`])
    expect(results[1]?.errors).toEqual([])
  })

  it('a validator failure blocks the listing', async () => {
    const root = await registry({ 'registry/listings/bad-code.yaml': yamlOf('bad-code') })
    const [result] = await checkListings(root, ['bad-code'], depsOf({}, { validator: { success: false, errors: ['modules../register.js: cannot import "node:child_process"'], warnings: [] } }))
    expect(result?.errors).toEqual(['claude plugin validate: modules../register.js: cannot import "node:child_process"'])
  })

  it('requires the license to match the repository', async () => {
    const root = await registry({ 'registry/listings/lic.yaml': yamlOf('lic') })
    const [result] = await checkListings(root, ['lic'], depsOf({ licenseOf: async () => 'Apache-2.0' }))
    expect(result?.errors).toEqual(['license: the listing says MIT but the repository is Apache-2.0'])
  })

  it('falls back to plugin.json when the repository has no license', async () => {
    const root = await registry({ 'registry/listings/lic2.yaml': yamlOf('lic2') })
    const ok = await checkListings(root, ['lic2'], depsOf({ licenseOf: async () => null }))
    expect(ok[0]?.errors).toEqual([])
    const none = await checkListings(root, ['lic2'], depsOf({ licenseOf: async () => null }, { plugin: { name: 'x', version: null, description: null, license: null } }))
    expect(none[0]?.errors).toEqual(['license: no license found in the repository or plugin.json'])
  })

  it('a mod that draws UI needs media, and media must exist and fit the limits', async () => {
    const drawn = { permissions: ['draws-ui' as const], risk: 'standard' as const }
    const noMedia = await registry({ 'registry/listings/ui.yaml': yamlOf('ui') })
    expect((await checkListings(noMedia, ['ui'], depsOf({}, drawn)))[0]?.errors).toEqual([
      'media: mods that draw in the interface need at least one screenshot or GIF',
    ])

    const missingFile = await registry({ 'registry/listings/ui.yaml': yamlOf('ui', 'media:\n  - file: demo.gif\n    alt: demo\n') })
    expect((await checkListings(missingFile, ['ui'], depsOf({}, drawn)))[0]?.errors).toEqual([
      'media: registry/media/ui/demo.gif is missing',
    ])

    const tooBig = await registry({
      'registry/listings/ui.yaml': yamlOf('ui', 'media:\n  - file: demo.gif\n    alt: demo\n'),
      'registry/media/ui/demo.gif': Buffer.alloc(5 * 1024 * 1024 + 1),
    })
    expect((await checkListings(tooBig, ['ui'], depsOf({}, drawn)))[0]?.errors).toEqual([
      'media: registry/media/ui/demo.gif is larger than 5 MB',
    ])
  })

  it('failing plugin tests are a warning, not a block', async () => {
    const root = await registry({ 'registry/listings/t.yaml': yamlOf('t') })
    const [result] = await checkListings(root, ['t'], depsOf({}, { tests: { passed: 3, failed: 1 } }))
    expect(result?.errors).toEqual([])
    expect(result?.warnings).toEqual(['plugin tests failed: 1 of 4'])
  })

  it('an update that adds a risky permission needs review', async () => {
    const root = await registry({ 'registry/listings/up.yaml': yamlOf('up') })
    const before = scanOf({ slug: 'up', permissions: ['reads-files'], risk: 'standard' })
    const results = await checkListings(
      root,
      ['up'],
      depsOf({ baseScanOf: async () => before }, { permissions: ['reads-files', 'network'], risk: 'elevated' }),
    )
    expect(results[0]?.diff?.addedPermissions).toEqual(['network'])
    expect(summarize(results)).toEqual({ failed: false, needsReview: true })
  })

  it('rejects renaming a listing (delete + add for the same source)', async () => {
    const root = await registry({ 'registry/listings/new-name.yaml': yamlOf('new-name', '', 'plugins/old-name') })
    const oldListing = { source: { type: 'git-subdir', repo: 'claudemodz/mods', path: 'plugins/old-name', ref: 'main', sha: SHA } } as Listing
    const results = await checkListings(
      root,
      ['new-name', 'old-name'],
      depsOf({ baseListingOf: async slug => (slug === 'old-name' ? oldListing : null) }),
    )
    const added = results.find(r => r.slug === 'new-name')
    expect(added?.errors).toEqual([
      'slug: renaming old-name to new-name would uninstall it for everyone who has it; keep the old slug and change displayName instead',
    ])
  })

  it('rejects a remote MCP bundle, which escapes the pinned commit', async () => {
    const root = await registry({ 'registry/listings/remote.yaml': yamlOf('remote') })
    const external = { settingsHooks: [], mcpServers: [], lspServers: [], monitors: [], bundles: [], remoteBundles: ['https://example.com/server.mcpb'] }
    const [result] = await checkListings(root, ['remote'], depsOf({}, { external, permissions: ['external-code'], risk: 'elevated' }))
    expect(result?.errors).toEqual([
      "mcpServers: the remote bundle https://example.com/server.mcpb isn't pinned to the listing's commit; ship the bundle in the repository instead",
    ])
  })
})
