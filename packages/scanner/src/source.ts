import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'

import type { ListingSource } from '@claudemodz/schema'

import { run } from './proc'

export type FetchedSource = { ok: true; dir: string } | { ok: false; error: string }

const githubUrl = (repo: string) => `https://github.com/${repo}.git`

/**
 * Fetches the listing's pinned commit and checks it is on `ref` in the named repository — so a
 * commit pushed only to a fork, or force-pushed away, is rejected — then returns the plugin directory.
 */
export async function fetchSource(source: ListingSource, workDir: string, urlOf: (repo: string) => string = githubUrl): Promise<FetchedSource> {
  const dir = await mkdtemp(join(workDir, 'src-'))
  const git = (...args: string[]) => run('git', args, { cwd: dir, timeoutMs: 180_000 })
  const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''
  await git('init', '-q')
  await git('remote', 'add', 'origin', urlOf(source.repo))

  const refFetch = await git('fetch', '-q', '--filter=blob:none', 'origin', source.ref)
  if (refFetch.code !== 0) return { ok: false, error: `ref ${source.ref} not found in ${source.repo}: ${firstLine(refFetch.stderr)}` }
  const refHead = (await git('rev-parse', 'FETCH_HEAD')).stdout.trim()

  const hasCommit = (await git('cat-file', '-e', `${source.sha}^{commit}`)).code === 0
  if (!hasCommit) {
    const shaFetch = await git('fetch', '-q', '--depth', '1', 'origin', source.sha)
    if (shaFetch.code !== 0) return { ok: false, error: `commit ${source.sha} not found in ${source.repo}: ${firstLine(shaFetch.stderr)}` }
  }
  if ((await git('merge-base', '--is-ancestor', source.sha, refHead)).code !== 0) {
    return { ok: false, error: `commit ${source.sha} is not on ${source.ref} in ${source.repo}` }
  }

  const checkout = await git('-c', 'advice.detachedHead=false', 'checkout', '-q', source.sha)
  if (checkout.code !== 0) return { ok: false, error: `could not check out ${source.sha}: ${firstLine(checkout.stderr)}` }
  const pluginDir = source.type === 'git-subdir' ? join(dir, source.path) : dir
  if (!existsSync(join(pluginDir, '.claude-plugin', 'plugin.json'))) {
    const where = source.type === 'git-subdir' ? `${source.path} in ${source.repo}` : `the root of ${source.repo}`
    return { ok: false, error: `no plugin at ${where}` }
  }
  return { ok: true, dir: pluginDir }
}
