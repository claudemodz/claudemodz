import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'

import type { ListingSource } from '@claudemodz/schema'

import { run } from './proc'

export type FetchedSource = { ok: true; dir: string } | { ok: false; error: string }

const githubUrl = (repo: string) => `https://github.com/${repo}.git`

/** Fetches exactly the listing's pinned commit (depth 1) and returns the plugin directory. */
export async function fetchSource(source: ListingSource, workDir: string, urlOf: (repo: string) => string = githubUrl): Promise<FetchedSource> {
  const dir = await mkdtemp(join(workDir, 'src-'))
  const git = (...args: string[]) => run('git', args, { cwd: dir, timeoutMs: 180_000 })
  await git('init', '-q')
  await git('remote', 'add', 'origin', urlOf(source.repo))
  const fetched = await git('fetch', '-q', '--depth', '1', 'origin', source.sha)
  if (fetched.code !== 0) {
    const reason = fetched.stderr.trim().split('\n')[0] ?? ''
    return { ok: false, error: `commit ${source.sha} not found in ${source.repo}: ${reason}` }
  }
  const checkout = await git('-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD')
  if (checkout.code !== 0) return { ok: false, error: `could not check out ${source.sha}: ${checkout.stderr.trim()}` }
  const pluginDir = source.type === 'git-subdir' ? join(dir, source.path) : dir
  if (!existsSync(join(pluginDir, '.claude-plugin', 'plugin.json'))) {
    const where = source.type === 'git-subdir' ? `${source.path} in ${source.repo}` : `the root of ${source.repo}`
    return { ok: false, error: `no plugin at ${where}` }
  }
  return { ok: true, dir: pluginDir }
}
