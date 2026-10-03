import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ScanResult } from '@claudemodz/schema'

import { COMMENT_MARKER } from '../src/comment'
import {
  findBotComment,
  hasCurrentApproval,
  resolvePr,
  review,
  testsSection,
  type GitHubApi,
  type PullFile,
  type Review,
  type WorkflowRun,
} from '../src/review'
import { scanOf } from './fixtures/scans'

const HEAD = 'a'.repeat(40)
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

const sameRepoRun: WorkflowRun = {
  head_sha: HEAD,
  head_branch: 'listings/b',
  head_repository: { full_name: 'claudemodz/claudemodz', owner: { login: 'claudemodz' } },
  pull_requests: [{ number: 7, head: { sha: HEAD } }],
}

const forkRun: WorkflowRun = {
  head_sha: HEAD,
  head_branch: 'main',
  head_repository: { full_name: 'someone/claudemodz', owner: { login: 'someone' } },
  pull_requests: [],
}

type FakeApi = GitHubApi & {
  posted: { pr: number; id: number | null; body: string }[]
  labels: { pr: number; name: string; present: boolean }[]
  statuses: { sha: string; state: string; description: string }[]
}

function apiOf(options: { files?: PullFile[]; contents?: Record<string, string>; reviews?: Review[]; comments?: { id: number; login: string; body: string }[] } = {}): FakeApi {
  const api: FakeApi = {
    posted: [],
    labels: [],
    statuses: [],
    openPulls: async (owner, branch) => (owner === 'someone' && branch === 'main' ? [{ number: 9, headSha: HEAD, headRepo: 'someone/claudemodz' }] : []),
    pullFiles: async () => options.files ?? [],
    fileAt: async (_repo, path) => (options.contents?.[path] !== undefined ? Buffer.from(options.contents[path] as string) : null),
    reviews: async () => options.reviews ?? [],
    comments: async () => options.comments ?? [],
    upsertComment: async (pr, id, body) => void api.posted.push({ pr, id, body }),
    setLabel: async (pr, name, present) => void api.labels.push({ pr, name, present }),
    setStatus: async (sha, state, description) => void api.statuses.push({ sha, state, description }),
  }
  return api
}

async function mainRegistry(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'claudemodz-main-'))
  await mkdir(join(root, 'registry/listings'), { recursive: true })
  await mkdir(join(root, 'registry/generated'), { recursive: true })
  await writeFile(join(root, 'registry/listings/a.yaml'), yamlOf('a'))
  await writeFile(join(root, 'registry/generated/a.json'), JSON.stringify(scanOf({ slug: 'a', sha: SHA, permissions: [], risk: 'standard' })))
  return root
}

function depsOf(scan: Partial<ScanResult> = {}) {
  return {
    fetch: async () => ({ ok: true as const, dir: '/x' }),
    scan: async (_dir: string, slug: string, sha: string) => scanOf({ slug, sha, permissions: ['reads-files'], risk: 'standard', tests: null, ...scan }),
    licenseOf: async () => 'MIT',
    validateEntry: async () => [],
  }
}

const addB: PullFile[] = [{ filename: 'registry/listings/b.yaml', status: 'added' }]

describe('resolvePr', () => {
  it('uses the run\'s own pull request when its head matches', async () => {
    expect(await resolvePr(sameRepoRun, apiOf())).toEqual({ number: 7, headSha: HEAD, headRepo: 'claudemodz/claudemodz' })
  })

  it('finds a fork\'s pull request by its head branch and sha', async () => {
    expect(await resolvePr(forkRun, apiOf())).toEqual({ number: 9, headSha: HEAD, headRepo: 'someone/claudemodz' })
  })

  it('finds nothing when no pull request has the run\'s head sha', async () => {
    expect(await resolvePr({ ...forkRun, head_sha: 'b'.repeat(40) }, apiOf())).toBeNull()
  })
})

describe('findBotComment', () => {
  it('only reuses a marker comment the bot wrote', () => {
    expect(
      findBotComment([
        { id: 1, login: 'mallory', body: `${COMMENT_MARKER}\nfake` },
        { id: 2, login: 'github-actions[bot]', body: `${COMMENT_MARKER}\nreal` },
      ]),
    ).toBe(2)
    expect(findBotComment([{ id: 1, login: 'mallory', body: COMMENT_MARKER }])).toBeNull()
  })
})

describe('hasCurrentApproval', () => {
  it('needs an approval by a maintainer on the head commit', () => {
    expect(hasCurrentApproval([{ state: 'APPROVED', commitId: HEAD, authorAssociation: 'MEMBER' }], HEAD)).toBe(true)
    expect(hasCurrentApproval([{ state: 'APPROVED', commitId: 'c'.repeat(40), authorAssociation: 'OWNER' }], HEAD)).toBe(false)
    expect(hasCurrentApproval([{ state: 'APPROVED', commitId: HEAD, authorAssociation: 'CONTRIBUTOR' }], HEAD)).toBe(false)
    expect(hasCurrentApproval([{ state: 'COMMENTED', commitId: HEAD, authorAssociation: 'OWNER' }], HEAD)).toBe(false)
  })
})

describe('testsSection', () => {
  it('shows valid counts and drops anything else', () => {
    const text = testsSection({ standup: { passed: 21, failed: 0 }, 'bad slug!': { passed: 1, failed: 0 }, ci: { passed: '<b>', failed: 0 } })
    expect(text).toContain('standup: 21 passed, 0 failed')
    expect(text).not.toContain('bad slug')
    expect(text).not.toContain('<b>')
    expect(testsSection('nonsense')).toBe('')
  })
})

describe('review', () => {
  it('a standard new listing passes, comments, and clears the label', async () => {
    const api = apiOf({ files: addB, contents: { 'registry/listings/b.yaml': yamlOf('b') } })
    const outcome = await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api, deps: depsOf() })
    expect(outcome).toEqual({ pr: 7, state: 'success' })
    expect(api.statuses).toEqual([{ sha: HEAD, state: 'success', description: 'Listing checks passed' }])
    expect(api.posted[0]?.id).toBeNull()
    expect(api.posted[0]?.body).toContain('### b')
    expect(api.labels).toEqual([{ pr: 7, name: 'needs-permission-review', present: false }])
  })

  it('an elevated listing fails until a maintainer approves the latest commit', async () => {
    const elevated = depsOf({ permissions: ['runs-processes'], risk: 'elevated' })
    const files = { files: addB, contents: { 'registry/listings/b.yaml': yamlOf('b') } }
    const unapproved = apiOf(files)
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api: unapproved, deps: elevated })
    expect(unapproved.statuses[0]).toEqual({ sha: HEAD, state: 'failure', description: "Needs a maintainer's approval on the latest commit" })
    expect(unapproved.labels).toEqual([{ pr: 7, name: 'needs-permission-review', present: true }])

    const stale = apiOf({ ...files, reviews: [{ state: 'APPROVED', commitId: 'c'.repeat(40), authorAssociation: 'OWNER' }] })
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api: stale, deps: elevated })
    expect(stale.statuses[0]?.state).toBe('failure')

    const approved = apiOf({ ...files, reviews: [{ state: 'APPROVED', commitId: HEAD, authorAssociation: 'OWNER' }] })
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api: approved, deps: elevated })
    expect(approved.statuses[0]?.state).toBe('success')
  })

  it('a listing PR that also changes workflows fails the scope rule', async () => {
    const api = apiOf({
      files: [...addB, { filename: '.github/workflows/pr-check.yml', status: 'modified' }],
      contents: { 'registry/listings/b.yaml': yamlOf('b') },
    })
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api, deps: depsOf() })
    expect(api.statuses[0]?.state).toBe('failure')
    expect(api.posted[0]?.body).toContain('a listing pull request may only change registry/listings and registry/media')
  })

  it('a removed listing is reported and checked against main', async () => {
    const api = apiOf({ files: [{ filename: 'registry/listings/a.yaml', status: 'removed' }] })
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: null, api, deps: depsOf() })
    expect(api.posted[0]?.body).toContain('Removed from the marketplace')
    expect(api.statuses[0]?.state).toBe('success')
  })

  it('updates its own earlier comment, and appends untrusted test counts safely', async () => {
    const api = apiOf({
      files: addB,
      contents: { 'registry/listings/b.yaml': yamlOf('b') },
      comments: [{ id: 42, login: 'github-actions[bot]', body: `${COMMENT_MARKER}\nold` }],
    })
    await review({ mainRoot: await mainRegistry(), run: sameRepoRun, testResults: { b: { passed: 3, failed: 1 } }, api, deps: depsOf() })
    expect(api.posted[0]?.id).toBe(42)
    expect(api.posted[0]?.body).toContain('b: 3 passed, 1 failed')
  })

  it('does nothing when the run matches no pull request', async () => {
    const api = apiOf()
    expect(await review({ mainRoot: await mainRegistry(), run: { ...forkRun, head_sha: 'b'.repeat(40) }, testResults: null, api, deps: depsOf() })).toBeNull()
    expect(api.statuses).toEqual([])
  })
})
