import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { parseListing, ScanResultSchema, type ScanResult } from '@claudemodz/schema'

import { changedSlugsOf, checkListings, summarize } from './check'
import { renderComment } from './comment'
import { run } from './proc'
import { publishRegistry } from './publish'
import { scanPlugin } from './scan'
import { fetchSource } from './source'
import { claudeVersion } from './validate'

const root = process.cwd()

async function gitShow(ref: string, path: string): Promise<string | null> {
  const result = await run('git', ['show', `${ref}:${path}`], { cwd: root })
  return result.code === 0 ? result.stdout : null
}

async function changedFiles(base: string): Promise<string[]> {
  const result = await run('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'registry/listings', 'registry/media'], { cwd: root })
  if (result.code !== 0) throw new Error(`git diff failed: ${result.stderr}`)
  return result.stdout.split('\n').filter(Boolean)
}

async function licenseOf(repo: string): Promise<string | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(`https://api.github.com/repos/${repo}/license`, { headers })
  if (!response.ok) return null
  const body = (await response.json()) as { license?: { spdx_id?: string } }
  return body.license?.spdx_id ?? null
}

async function scanner(withTests: boolean) {
  const work = await mkdtemp(join(tmpdir(), 'claudemodz-'))
  const version = await claudeVersion()
  return {
    fetch: (source: Parameters<typeof fetchSource>[0]) => fetchSource(source, work),
    scan: (dir: string, slug: string, sha: string): Promise<ScanResult> =>
      scanPlugin(dir, { slug, sha, now: new Date(), claudeCodeVersion: version, withTests }),
  }
}

async function check(base: string, out: string): Promise<number> {
  const slugs = changedSlugsOf(await changedFiles(base))
  const results = await checkListings(root, slugs, {
    ...(await scanner(true)),
    baseScanOf: async slug => {
      const text = await gitShow(base, `registry/generated/${slug}.json`)
      const parsed = text === null ? null : ScanResultSchema.safeParse(JSON.parse(text))
      return parsed?.success ? parsed.data : null
    },
    baseListingOf: async slug => {
      const text = await gitShow(base, `registry/listings/${slug}.yaml`)
      const parsed = text === null ? null : parseListing(text, `${slug}.yaml`)
      return parsed?.ok ? parsed.listing : null
    },
    licenseOf,
  })
  const summary = summarize(results)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'comment.md'), renderComment(results))
  await writeFile(join(out, 'summary.json'), `${JSON.stringify(summary)}\n`)
  console.log(renderComment(results))
  return summary.failed ? 1 : 0
}

async function publish(base: string | undefined, all: boolean): Promise<number> {
  const isAll = all || base === undefined || /^0+$/.test(base)
  const slugs = isAll ? 'all' : changedSlugsOf(await changedFiles(base))
  const outcome = await publishRegistry(root, slugs, await scanner(false))
  console.log(`published: wrote ${outcome.written.join(', ') || 'nothing'}; removed ${outcome.removed.join(', ') || 'nothing'}`)
  return 0
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { base: { type: 'string' }, out: { type: 'string', default: 'check-results' }, all: { type: 'boolean', default: false } },
  })
  const command = positionals[0]
  if (command === 'check' && values.base) return check(values.base, values.out ?? 'check-results')
  if (command === 'publish') return publish(values.base, values.all ?? false)
  console.error('usage: scanner check --base <ref> [--out <dir>] | scanner publish (--base <sha> | --all)')
  return 2
}

main().then(
  code => process.exit(code),
  error => {
    console.error(error)
    process.exit(1)
  },
)
