import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { parseListing, ScanResultSchema } from '@claudemodz/schema'

import { changedSlugsOf, checkListings, scopeErrors, summarize, type CheckDeps, type CheckSummary } from './check'
import { COMMENT_MARKER, plainText, renderComment } from './comment'

/** The fields of `github.event.workflow_run` the review reads. */
export type WorkflowRun = {
  head_sha: string
  head_branch: string
  head_repository: { full_name: string; owner: { login: string } }
  pull_requests?: { number: number; head: { sha: string } }[]
}

export type PullRef = { number: number; headSha: string; headRepo: string }
export type PullFile = { filename: string; status: string; previousFilename?: string }
export type Review = { state: string; commitId: string; authorAssociation: string }

export type GitHubApi = {
  openPulls(headOwner: string, headBranch: string): Promise<PullRef[]>
  pullFiles(pr: number): Promise<PullFile[]>
  fileAt(repo: string, path: string, sha: string): Promise<Buffer | null>
  reviews(pr: number): Promise<Review[]>
  comments(pr: number): Promise<{ id: number; login: string; body: string }[]>
  upsertComment(pr: number, existingId: number | null, body: string): Promise<void>
  setLabel(pr: number, name: string, present: boolean): Promise<void>
  setStatus(sha: string, state: 'success' | 'failure', description: string): Promise<void>
}

export const BOT_LOGIN = 'github-actions[bot]'
export const REVIEW_LABEL = 'needs-permission-review'
const MAINTAINER_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR']
const LISTING_PATH = /^registry\/(listings|media)\//

/** The pull request a pr-check run belongs to — only one whose head is exactly the run's head commit. */
export async function resolvePr(run: WorkflowRun, api: GitHubApi): Promise<PullRef | null> {
  const own = (run.pull_requests ?? []).find(pr => pr.head.sha === run.head_sha)
  if (own) return { number: own.number, headSha: run.head_sha, headRepo: run.head_repository.full_name }
  const candidates = await api.openPulls(run.head_repository.owner.login, run.head_branch)
  return candidates.find(pr => pr.headSha === run.head_sha && pr.headRepo === run.head_repository.full_name) ?? null
}

export function findBotComment(comments: readonly { id: number; login: string; body: string }[]): number | null {
  return comments.find(c => c.login === BOT_LOGIN && c.body.startsWith(COMMENT_MARKER))?.id ?? null
}

/** A maintainer approved this exact commit (a later push needs a new approval). */
export function hasCurrentApproval(reviews: readonly Review[], headSha: string): boolean {
  return reviews.some(r => r.state === 'APPROVED' && r.commitId === headSha && MAINTAINER_ASSOCIATIONS.includes(r.authorAssociation))
}

/** Plugin test counts from the untrusted pr-check job, as an informational section; anything malformed is dropped. */
export function testsSection(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ''
  const lines: string[] = []
  for (const [slug, counts] of Object.entries(raw)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || typeof counts !== 'object' || counts === null) continue
    const { passed, failed } = counts as { passed?: unknown; failed?: unknown }
    if (!Number.isInteger(passed) || !Number.isInteger(failed)) continue
    lines.push(`- ${slug}: ${String(passed)} passed, ${String(failed)} failed`)
  }
  return lines.length > 0 ? `**Plugin tests** (reported by the pull request's own workflow; informational)\n${lines.join('\n')}` : ''
}

export function reviewOutcome(input: { scope: string[]; summary: CheckSummary; approved: boolean; hasListings: boolean }): {
  state: 'success' | 'failure'
  description: string
} {
  if (input.scope.length > 0 || input.summary.failed) return { state: 'failure', description: 'Fix the problems in the claudemodz check comment' }
  if (input.summary.needsReview && !input.approved) return { state: 'failure', description: "Needs a maintainer's approval on the latest commit" }
  return { state: 'success', description: input.hasListings ? 'Listing checks passed' : 'No listing changes' }
}

async function readMain<T>(mainRoot: string, path: string, parse: (text: string) => T | null): Promise<T | null> {
  const text = await readFile(join(mainRoot, path), 'utf8').catch(() => null)
  if (text === null) return null
  try {
    return parse(text)
  } catch {
    return null
  }
}

/** main's registry with the pull request's listing and media files applied, fetched as data at its head commit. */
async function workingRegistry(mainRoot: string, pr: PullRef, files: readonly PullFile[], api: GitHubApi): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'claudemodz-review-'))
  if (existsSync(join(mainRoot, 'registry'))) await cp(join(mainRoot, 'registry'), join(work, 'registry'), { recursive: true })
  for (const file of files) {
    if (file.previousFilename && LISTING_PATH.test(file.previousFilename)) await rm(join(work, file.previousFilename), { force: true })
    if (!LISTING_PATH.test(file.filename) || file.filename.includes('..')) continue
    const target = join(work, file.filename)
    const content = file.status === 'removed' ? null : await api.fileAt(pr.headRepo, file.filename, pr.headSha)
    if (content === null) {
      await rm(target, { force: true })
    } else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content)
    }
  }
  return work
}

export type ReviewInput = {
  mainRoot: string
  run: WorkflowRun
  testResults: unknown
  api: GitHubApi
  deps: Pick<CheckDeps, 'fetch' | 'scan' | 'licenseOf' | 'validateEntry'>
}

/**
 * The trusted review: runs main's scanner on the pull request's listings (never its code), then posts
 * the comment, the review label and the `claudemodz/review` commit status branch protection requires.
 */
export async function review(input: ReviewInput): Promise<{ pr: number; state: 'success' | 'failure' } | null> {
  const { api, mainRoot } = input
  const pr = await resolvePr(input.run, api)
  if (pr === null) return null

  const files = await api.pullFiles(pr.number)
  const names = files.flatMap(f => (f.previousFilename ? [f.filename, f.previousFilename] : [f.filename]))
  const scope = scopeErrors(names)
  const slugs = changedSlugsOf(names)
  const work = await workingRegistry(mainRoot, pr, files, api)

  const results = await checkListings(work, slugs, {
    ...input.deps,
    baseScanOf: slug =>
      readMain(mainRoot, `registry/generated/${slug}.json`, text => {
        const parsed = ScanResultSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
      }),
    baseListingOf: slug =>
      readMain(mainRoot, `registry/listings/${slug}.yaml`, text => {
        const parsed = parseListing(text, `${slug}.yaml`)
        return parsed.ok ? parsed.listing : null
      }),
  })
  await rm(work, { recursive: true, force: true })

  const summary = summarize(results)
  const approved = hasCurrentApproval(await api.reviews(pr.number), pr.headSha)
  const outcome = reviewOutcome({ scope, summary, approved, hasListings: slugs.length > 0 })

  const sections = [renderComment(results).trimEnd()]
  if (scope.length > 0) sections.push(scope.map(error => `❌ ${plainText(error)}`).join('\n'))
  const tests = testsSection(input.testResults)
  if (tests) sections.push(tests)
  if (summary.needsReview) sections.push(approved ? '✅ A maintainer approved the latest commit.' : '⏳ Waiting for a maintainer to approve the latest commit.')

  await api.upsertComment(pr.number, findBotComment(await api.comments(pr.number)), `${sections.join('\n\n')}\n`)
  await api.setLabel(pr.number, REVIEW_LABEL, summary.needsReview && !approved)
  await api.setStatus(pr.headSha, outcome.state, outcome.description)
  return { pr: pr.number, state: outcome.state }
}
