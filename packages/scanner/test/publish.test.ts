import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ScanResultSchema, type ScanResult } from '@claudemodz/schema'

import { publishRegistry, type PublishDeps } from '../src/publish'
import { scanOf } from './fixtures/scans'

const OLD = '0123456789abcdef0123456789abcdef01234567'
const NEW = 'fedcba9876543210fedcba9876543210fedcba98'
const VERSION = '2.1.288'

const yamlOf = (slug: string, sha = OLD) => `slug: ${slug}
displayName: ${slug}
summary: A test listing.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/${slug}
  ref: main
  sha: ${sha}
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: workflow
submittedBy: snagrecha
`

async function registry(listings: Record<string, string>, generated: Record<string, ScanResult> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'claudemodz-pub-'))
  await mkdir(join(root, 'registry/listings'), { recursive: true })
  await mkdir(join(root, 'registry/generated'), { recursive: true })
  for (const [slug, text] of Object.entries(listings)) await writeFile(join(root, `registry/listings/${slug}.yaml`), text)
  for (const [slug, scan] of Object.entries(generated)) await writeFile(join(root, `registry/generated/${slug}.json`), JSON.stringify(scan))
  return root
}

function depsOf(overrides: Partial<PublishDeps> = {}): PublishDeps & { scanned: string[] } {
  const scanned: string[] = []
  return {
    scanned,
    fetch: async () => ({ ok: true, dir: '/x' }),
    scan: async (_dir, slug, sha) => {
      scanned.push(slug)
      return scanOf({ slug, sha, claudeCodeVersion: VERSION })
    },
    ...overrides,
  }
}

const readJson = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
const pluginShas = async (root: string) =>
  (await readJson(root, '.claude-plugin/marketplace.json')).plugins.map((p: { name: string; source: { sha: string } }) => [p.name, p.source.sha])

describe('publishRegistry', () => {
  it('rescans only listings whose scan is missing, for another sha, or from another Claude Code version', async () => {
    const root = await registry(
      { current: yamlOf('current'), moved: yamlOf('moved', NEW), fresh: yamlOf('fresh'), old: yamlOf('old') },
      {
        current: scanOf({ slug: 'current', sha: OLD, claudeCodeVersion: VERSION }),
        moved: scanOf({ slug: 'moved', sha: OLD, claudeCodeVersion: VERSION }),
        old: scanOf({ slug: 'old', sha: OLD, claudeCodeVersion: '2.1.200' }),
      },
    )
    const deps = depsOf()
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, deps)
    expect(deps.scanned.sort()).toEqual(['fresh', 'moved', 'old'])
    expect(outcome).toEqual({ written: ['fresh', 'moved', 'old'], removed: [], failed: [] })
    expect(await pluginShas(root)).toEqual([['current', OLD], ['fresh', OLD], ['moved', NEW], ['old', OLD]])
  })

  it('force rescans everything', async () => {
    const root = await registry({ a: yamlOf('a') }, { a: scanOf({ slug: 'a', sha: OLD, claudeCodeVersion: VERSION }) })
    const deps = depsOf()
    await publishRegistry(root, { force: true, claudeCodeVersion: VERSION }, deps)
    expect(deps.scanned).toEqual(['a'])
  })

  it('a fetch failure on an update keeps the previous scan and marketplace entry, and reports it', async () => {
    const root = await registry({ a: yamlOf('a') }, { a: scanOf({ slug: 'a', sha: OLD, claudeCodeVersion: VERSION }) })
    await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    await writeFile(join(root, 'registry/listings/a.yaml'), yamlOf('a', NEW))
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf({ fetch: async () => ({ ok: false, error: 'network down' }) }))
    expect(outcome.failed).toEqual([{ slug: 'a', error: 'network down' }])
    expect(ScanResultSchema.parse(await readJson(root, 'registry/generated/a.json')).sha).toBe(OLD)
    expect(await pluginShas(root)).toEqual([['a', OLD]])
  })

  it('a scan that fails validation on an update keeps the previous version', async () => {
    const root = await registry({ a: yamlOf('a') }, { a: scanOf({ slug: 'a', sha: OLD, claudeCodeVersion: VERSION }) })
    await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    await writeFile(join(root, 'registry/listings/a.yaml'), yamlOf('a', NEW))
    const failing = depsOf({
      scan: async (_dir, slug, sha) => scanOf({ slug, sha, claudeCodeVersion: VERSION, validator: { success: false, errors: ['boom'], warnings: [] } }),
    })
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, failing)
    expect(outcome.failed).toEqual([{ slug: 'a', error: 'claude plugin validate: boom' }])
    expect(await pluginShas(root)).toEqual([['a', OLD]])
  })

  it('a listing that no longer parses keeps its published entry and is reported', async () => {
    const root = await registry({ a: yamlOf('a') }, { a: scanOf({ slug: 'a', sha: OLD, claudeCodeVersion: VERSION }) })
    await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    await writeFile(join(root, 'registry/listings/a.yaml'), yamlOf('a').replace('category: workflow', 'catgory: workflow'))
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    expect(outcome.failed.map(f => f.slug)).toEqual(['a'])
    expect(await pluginShas(root)).toEqual([['a', OLD]])
  })

  it('only a deleted listing file removes a plugin', async () => {
    const root = await registry({ a: yamlOf('a'), b: yamlOf('b') })
    await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    await writeFile(join(root, 'registry/listings/b.yaml'), '')
    const { rm } = await import('node:fs/promises')
    await rm(join(root, 'registry/listings/b.yaml'))
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf())
    expect(outcome.removed).toEqual(['b'])
    expect(existsSync(join(root, 'registry/generated/b.json'))).toBe(false)
    expect(await pluginShas(root)).toEqual([['a', OLD]])
  })

  it('a new listing that cannot be fetched is not added, and is reported', async () => {
    const root = await registry({ a: yamlOf('a') })
    const outcome = await publishRegistry(root, { force: false, claudeCodeVersion: VERSION }, depsOf({ fetch: async () => ({ ok: false, error: 'commit not found' }) }))
    expect(outcome.failed).toEqual([{ slug: 'a', error: 'commit not found' }])
    expect(await pluginShas(root)).toEqual([])
  })
})
