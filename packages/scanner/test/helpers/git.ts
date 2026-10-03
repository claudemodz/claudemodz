import { cp, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run } from '../../src/proc'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'plugins')

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await run('git', args, { cwd })
  if (result.code !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

/** A temp git repo holding fixture plugins (at the root when one is given without a subdir). */
export async function commitFixtureRepo(pluginNames: string[], subdir?: string): Promise<{ url: string; sha: string }> {
  const repo = await mkdtemp(join(tmpdir(), 'claudemodz-repo-'))
  await git(repo, 'init', '-q', '-b', 'main')
  await git(repo, 'config', 'user.email', 'fixture@example.com')
  await git(repo, 'config', 'user.name', 'fixture')
  await git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
  await git(repo, 'config', 'uploadpack.allowFilter', 'true')
  for (const name of pluginNames) {
    const target = subdir === undefined && pluginNames.length === 1 ? repo : join(repo, subdir ?? 'plugins', name)
    await cp(join(FIXTURES, name), target, { recursive: true })
  }
  await git(repo, 'add', '-A')
  await git(repo, 'commit', '-q', '-m', 'fixture')
  return { url: `file://${repo}`, sha: await git(repo, 'rev-parse', 'HEAD') }
}

/** Adds a commit on a branch other than main and returns its sha (main is left where it was). */
export async function commitOnSideBranch(url: string): Promise<string> {
  const repo = url.replace(/^file:\/\//, '')
  await git(repo, 'checkout', '-q', '-b', 'side')
  await git(repo, 'commit', '-q', '--allow-empty', '-m', 'not on main')
  const sha = await git(repo, 'rev-parse', 'HEAD')
  await git(repo, 'checkout', '-q', 'main')
  return sha
}
