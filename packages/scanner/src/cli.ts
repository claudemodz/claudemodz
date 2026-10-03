import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { parseListing, ScanResultSchema, type ScanResult } from '@claudemodz/schema'

import { changedSlugsOf, checkListings, summarize } from './check'
import { readContents } from './contents'
import { githubApi } from './github'
import { review, type WorkflowRun } from './review'
import { renderComment } from './comment'
import { validateEntries } from './market-validate'
import { run } from './proc'
import { publishRegistry } from './publish'
import { scanPlugin } from './scan'
import { fetchSource } from './source'
import { claudeVersion, runPluginTests } from './validate'

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

/** Local preview of the review for contributors: no GitHub, no plugin tests. */
async function check(base: string, out: string): Promise<number> {
  const slugs = changedSlugsOf(await changedFiles(base))
  const results = await checkListings(root, slugs, {
    ...(await scanner(false)),
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
    validateEntry: async (listing, scan) => (await validateEntries([{ listing, scan }])).get(listing.slug) ?? [],
  })
  const summary = summarize(results)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'comment.md'), renderComment(results))
  await writeFile(join(out, 'summary.json'), `${JSON.stringify(summary)}\n`)
  console.log(renderComment(results))
  return summary.failed ? 1 : 0
}

async function publish(force: boolean): Promise<number> {
  const outcome = await publishRegistry(root, { force, claudeCodeVersion: await claudeVersion() }, await scanner(false))
  console.log(`published: wrote ${outcome.written.join(', ') || 'nothing'}; removed ${outcome.removed.join(', ') || 'nothing'}`)
  for (const failure of outcome.failed) console.error(`::error::${failure.slug}: ${failure.error} (kept its previous version)`)
  return outcome.failed.length > 0 ? 1 : 0
}

/** Untrusted (pr-check): runs each changed listing's plugin tests with a scrubbed environment. */
async function tests(base: string, out: string): Promise<number> {
  const work = await mkdtemp(join(tmpdir(), 'claudemodz-tests-'))
  const counts: Record<string, { passed: number; failed: number }> = {}
  for (const slug of changedSlugsOf(await changedFiles(base))) {
    const text = await readFile(join(root, `registry/listings/${slug}.yaml`), 'utf8').catch(() => null)
    const parsed = text === null ? null : parseListing(text, `${slug}.yaml`)
    if (!parsed?.ok) continue
    const fetched = await fetchSource(parsed.listing.source, work)
    if (!fetched.ok || !(await readContents(fetched.dir)).hasTests) continue
    const result = await runPluginTests(fetched.dir)
    if (result !== null) counts[slug] = result
  }
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'tests.json'), `${JSON.stringify(counts)}\n`)
  console.log(JSON.stringify(counts))
  return 0
}

/** Trusted (review workflow, main's code): reviews the pull request a pr-check run belongs to. */
async function runReview(runFile: string, testsFile: string | undefined): Promise<number> {
  const repo = process.env.REPO
  const token = process.env.GH_TOKEN
  if (!repo || !token) throw new Error('REPO and GH_TOKEN are required')
  const run = JSON.parse(await readFile(runFile, 'utf8')) as WorkflowRun
  let testResults: unknown = null
  if (testsFile) {
    try {
      testResults = JSON.parse(await readFile(testsFile, 'utf8'))
    } catch {
      testResults = null
    }
  }
  const { fetch: fetchListing, scan } = await scanner(false)
  const outcome = await review({
    mainRoot: root,
    run,
    testResults,
    api: githubApi(repo, token),
    deps: {
      fetch: fetchListing,
      scan,
      licenseOf,
      validateEntry: async (listing, result) => (await validateEntries([{ listing, scan: result }])).get(listing.slug) ?? [],
    },
  })
  console.log(outcome === null ? 'no pull request matches this run' : `PR #${outcome.pr}: ${outcome.state}`)
  return 0
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      out: { type: 'string', default: 'check-results' },
      all: { type: 'boolean', default: false },
      run: { type: 'string' },
      tests: { type: 'string' },
    },
  })
  const command = positionals[0]
  if (command === 'check' && values.base) return check(values.base, values.out ?? 'check-results')
  if (command === 'publish') return publish(values.all ?? false)
  if (command === 'tests' && values.base) return tests(values.base, values.out ?? 'test-results')
  if (command === 'review' && values.run) return runReview(values.run, values.tests)
  console.error('usage: scanner check --base <ref> [--out <dir>] | tests --base <ref> [--out <dir>] | review --run <event.json> [--tests <tests.json>] | publish [--all]')
  return 2
}

main().then(
  code => process.exit(code),
  error => {
    console.error(error)
    process.exit(1)
  },
)
