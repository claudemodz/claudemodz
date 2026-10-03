import { mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fetchSource } from '../src/source'
import { commitFixtureRepo, commitOnSideBranch } from './helpers/git'

const work = () => mkdtemp(join(tmpdir(), 'claudemodz-work-'))

describe('fetchSource', () => {
  it('fetches a git-subdir plugin at its sha', async () => {
    const { url, sha } = await commitFixtureRepo(['standard', 'mixed'])
    const fetched = await fetchSource({ type: 'git-subdir', repo: 'acme/mods', path: 'plugins/mixed', ref: 'main', sha }, await work(), () => url)
    expect(fetched.ok).toBe(true)
    if (fetched.ok) expect(existsSync(join(fetched.dir, '.claude-plugin', 'plugin.json'))).toBe(true)
  })

  it('fetches a whole-repo plugin', async () => {
    const { url, sha } = await commitFixtureRepo(['standard'])
    const fetched = await fetchSource({ type: 'github', repo: 'acme/standard', ref: 'main', sha }, await work(), () => url)
    expect(fetched.ok && existsSync(join(fetched.dir, 'hooks', 'register.js'))).toBe(true)
  })

  it('reports a sha that does not exist, without throwing', async () => {
    const { url } = await commitFixtureRepo(['standard'])
    const missing = 'f'.repeat(40)
    const fetched = await fetchSource({ type: 'github', repo: 'acme/standard', ref: 'main', sha: missing }, await work(), () => url)
    expect(fetched).toEqual({ ok: false, error: expect.stringContaining(`commit ${missing} not found in acme/standard`) })
  })

  it('reports a path with no plugin', async () => {
    const { url, sha } = await commitFixtureRepo(['standard', 'mixed'])
    const fetched = await fetchSource({ type: 'git-subdir', repo: 'acme/mods', path: 'plugins/nope', ref: 'main', sha }, await work(), () => url)
    expect(fetched).toEqual({ ok: false, error: 'no plugin at plugins/nope in acme/mods' })
  })

  it('rejects a sha that is not on the listing\'s ref (e.g. pushed only to a fork or a side branch)', async () => {
    const { url } = await commitFixtureRepo(['standard'])
    const side = await commitOnSideBranch(url)
    const fetched = await fetchSource({ type: 'github', repo: 'acme/standard', ref: 'main', sha: side }, await work(), () => url)
    expect(fetched).toEqual({ ok: false, error: `commit ${side} is not on main in acme/standard` })
  })

  it('reports a ref that does not exist', async () => {
    const { url, sha } = await commitFixtureRepo(['standard'])
    const fetched = await fetchSource({ type: 'github', repo: 'acme/standard', ref: 'nope', sha }, await work(), () => url)
    expect(fetched).toEqual({ ok: false, error: expect.stringContaining('ref nope not found in acme/standard') })
  })
})
