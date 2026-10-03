# Phase 2: Registry + Review Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `claudemodz/claudemodz` into a working, reviewed plugin marketplace: listings as YAML, a scanner that turns `claude plugin validate --json` into a permission summary and diff, PR checks that comment and gate risky permissions, and a publish job that writes a pinned `.claude-plugin/marketplace.json` — so `/plugin marketplace add claudemodz/claudemodz` works before the website exists.

**Architecture:** A pnpm workspace with two packages. `@claudemodz/schema` holds the listing schema, the scan-result types and the permission vocabulary (shared later by the site and CLI). `@claudemodz/scanner` holds pure modules (note parsing, permission mapping, plugin contents, diff, comment rendering, marketplace generation), thin process wrappers (git fetch at a sha, `claude plugin validate`/`test`), and a CLI with two commands: `check` (PR) and `publish` (main). Three workflows wire it up: `pr-check` (no secrets), `pr-comment` (trusted `workflow_run`), `publish` (push to main).

**Tech Stack:** Node 24, pnpm 10.31.0, TypeScript (strict), zod 4, `yaml`, vitest, tsx, GitHub Actions, Claude Code 2.1.288 CLI, `gh`.

**Spec:** `docs/superpowers/specs/2026-10-03-claudemodz-design.md` (§2 architecture, §3.1–3.4 data, §4.3–4.4 pipelines, §8 security, §9 testing, §10 phase 2).

## Global Constraints

- Claude Code pinned to **2.1.288** in CI (`npm install -g @anthropic-ai/claude-code@2.1.288`); bump deliberately.
- Marketplace name: `claudemodz`. Owner `{ "name": "claudemodz", "url": "https://claudemodz.com" }`. `forceRemoveDeletedPlugins: true`.
- Slugs: `^[a-z0-9][a-z0-9-]{0,63}$`, equal to the listing's file name, immutable.
- Sources: `github` or `git-subdir` only, always with `ref` and a full 40-char lowercase `sha`.
- Media: ≤ 3 files per listing, ≤ 5 MB each, `gif|png|webp|mp4`, under `registry/media/<slug>/`. Listings whose permissions include `draws-ui` need ≥ 1 media file.
- `registry/generated/*.json` and `.claude-plugin/marketplace.json` are written only by `publish`; never hand-edited.
- **Never execute submitted plugin code where secrets exist.** `pr-check` runs with a read-only token and no secrets; it is the only place `claude plugin test` runs. `pr-comment` never checks out PR code.
- TypeScript strict, no `any`, no loosening `tsconfig`.
- Commits authored by `snagrecha <65003978+snagrecha@users.noreply.github.com>` (repo-local config); **no `Co-Authored-By: Claude` trailers or "Generated with Claude Code" lines** anywhere.
- Creating labels, merging PRs and pushing to `main` are outward-facing: confirm with the user in chat first.

## Validator facts this plan relies on (captured 2026-10-03 on 2.1.288)

`claude plugin validate <dir> --json` prints `{ success, strict, target, manifest: { errors, warnings, notes }, contents: [{ file, type, errors, warnings, notes }] }` and exits 1 when `success` is false. For mods, `contents` has a `type: "hooks"` entry whose `notes` look like:

```
./register.ts hooks: session.start, agent.spawn, turn.step, ui.render{component=Spinner}, command.run{command=router}
./register.ts calls: $.command.register, $.ui.invalidate
./register.ts calls: nothing on $
./register.ts calls: $.clock.every, $.process.run (via fetchStatus, rerunFailed), $.ui.open
./register.js env writes: nothing
./register.js env reads: GITHUB_TOKEN
```

Errors look like `{ "path": "modules../register.js", "message": "failing: cannot import \"node:child_process\" …", "code": null }`. **Skills, agents, commands, settings hooks and MCP servers produce no `contents` entries at all** — the scanner reads those from the plugin's files.

## Deviations from the spec (deliberate)

- `publish` commits with the workflow's `GITHUB_TOKEN` as `claudemodz-bot`; the `claudemodz-bot` GitHub App (spec §2) is created in phase 3, when the site needs it to open submission PRs.
- `publish` skips the site sync call (§4.4 step 4) until phase 3 provides `/api/internal/sync` (`SYNC_URL` unset → step skipped).
- Scan results add `mod.envReads` (from the validator's `env reads:` note) and `plugin.license` to the §3.2 shape; the permission panel shows which environment variables a mod reads.
- Submissions are hand-written YAML PRs until the phase-3 submit form exists; `docs/contributing.md` explains how.

## Review Focus

1. **A listing pinned to a sha that doesn't exist or was force-pushed away** — the check reports "commit not found" for that listing and keeps checking others; it never crashes. (Test in Task 8.)
2. **A plugin with no mod code** (skills/agents/MCP only, no `hooks/hooks.json`) — scanned as `mod: null`, `contains` lists what it has, permissions come only from external code. (Tests in Tasks 5 and 8.)
3. **Validator note variants** — `nothing on $`, matchers in braces (including ones with commas), `(via …)` annotations, `env reads/writes`, and unknown future kinds — parsed without losing data or throwing. (Tests in Task 3.)
4. **A listing with a misspelled or unknown key** (e.g. `catgory:`) — rejected with a message naming the key, not silently ignored. (Test in Task 2.)
5. **A PR that renames a listing** (deletes `a.yaml`, adds `b.yaml` for the same source) — rejected, because a rename uninstalls the mod for current users under `forceRemoveDeletedPlugins`. (Test in Task 9.)

---

## File Structure (repo `claudemodz/claudemodz`)

```
claudemodz/
├── package.json · pnpm-workspace.yaml · pnpm-lock.yaml · tsconfig.json · vitest.config.ts · .gitignore
├── .claude-plugin/marketplace.json          # written by publish
├── registry/
│   ├── listings/<slug>.yaml                 # hand-written, reviewed
│   ├── media/<slug>/…                       # demo media
│   └── generated/<slug>.json                # written by publish
├── packages/
│   ├── schema/
│   │   ├── package.json
│   │   ├── src/index.ts · src/listing.ts · src/scan.ts · src/permissions.ts
│   │   └── test/listing.test.ts · test/scan.test.ts
│   └── scanner/
│       ├── package.json
│       ├── src/notes.ts          # validator notes → events/calls/envReads
│       ├── src/permissions.ts    # events/calls/external → permission categories + risk
│       ├── src/contents.ts       # plugin files → contains/external/manifest/hasTests
│       ├── src/diff.ts           # two scans → permission diff
│       ├── src/comment.ts        # check results → PR comment markdown
│       ├── src/marketplace.ts    # listings + scans → marketplace.json
│       ├── src/proc.ts           # run a command, capture output
│       ├── src/source.ts         # fetch a listing's source at its sha
│       ├── src/validate.ts       # claude plugin validate/test wrappers + report parsing
│       ├── src/scan.ts           # plugin dir → ScanResult
│       ├── src/check.ts          # PR check orchestration
│       ├── src/publish.ts        # publish orchestration
│       ├── src/cli.ts            # `check` and `publish` entry point
│       └── test/… (one test file per module, fixtures under test/fixtures/)
├── .github/
│   ├── workflows/ci.yml · pr-check.yml · pr-comment.yml · publish.yml
│   └── pull_request_template.md
└── docs/contributing.md
```

---

### Task 1: Workspace scaffold and CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `packages/schema/package.json`, `packages/scanner/package.json`, `packages/schema/src/index.ts`, `packages/schema/test/smoke.test.ts`, `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm typecheck`, `pnpm test`, `pnpm check`, `pnpm scanner <command>` (runs `packages/scanner/src/cli.ts` with tsx). Package names `@claudemodz/schema` (exports `./src/index.ts`) and `@claudemodz/scanner`.

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "claudemodz",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.31.0",
  "scripts": {
    "typecheck": "tsc -p .",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm test",
    "scanner": "tsx packages/scanner/src/cli.ts"
  }
}
```
`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
```
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "types": ["node"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  },
  "include": ["packages/*/src", "packages/*/test", "vitest.config.ts"]
}
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
```
`.gitignore` (replace contents):
```
.superpowers/
node_modules/
check-results/
```

- [ ] **Step 2: Package manifests and dependencies**

`packages/schema/package.json`:
```json
{
  "name": "@claudemodz/schema",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts"
}
```
`packages/scanner/package.json`:
```json
{
  "name": "@claudemodz/scanner",
  "private": true,
  "type": "module"
}
```
Run:
```bash
pnpm add -D -w typescript vitest tsx @types/node
pnpm --filter @claudemodz/schema add zod
pnpm --filter @claudemodz/scanner add yaml zod @claudemodz/schema@workspace:*
```

- [ ] **Step 3: Write a smoke test that fails**

`packages/schema/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { SCHEMA_VERSION } from '@claudemodz/schema'

describe('schema package', () => {
  it('is importable from the workspace', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})
```
Run: `pnpm test`
Expected: FAIL — `SCHEMA_VERSION` is not exported (or `src/index.ts` missing).

- [ ] **Step 4: Make it pass**

`packages/schema/src/index.ts`:
```ts
/** Bumped when the listing or scan format changes incompatibly. */
export const SCHEMA_VERSION = 1
```
Run: `pnpm check`
Expected: typecheck clean; 1 test passes.

- [ ] **Step 5: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npm install -g @anthropic-ai/claude-code@2.1.288
      - run: pnpm typecheck
      - run: pnpm test
        if: success() || failure()
```

- [ ] **Step 6: Commit on a work branch and push (confirm first)**

```bash
git checkout -b phase-2
git add -A
git commit -m "chore: pnpm workspace with schema and scanner packages"
git push -u origin phase-2
gh pr create --draft --base main --head phase-2 --title "Phase 2: registry and review pipeline" --body "Registry, scanner, PR checks and publish for claudemodz. Plan: docs/superpowers/plans/2026-10-03-phase-2-registry-pipeline.md"
```
Expected: CI green on the PR.

---

### Task 2: Listing schema

**Files:**
- Create: `packages/schema/src/listing.ts`, `packages/schema/test/listing.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Produces (exported from `@claudemodz/schema`):
  - `CATEGORIES: readonly ['dashboards','safety','git-ci','workflow','models-cost','memory','ui','integrations','fun','other']`
  - `ListingSchema` (zod), `type Listing`, `type ListingSource = Listing['source']`
  - `parseListing(text: string, fileName: string): ListingParse` where `type ListingParse = { ok: true; listing: Listing } | { ok: false; errors: string[] }`
  - `MEDIA_LIMITS = { maxFiles: 3, maxBytes: 5 * 1024 * 1024 }`

- [ ] **Step 1: Write the failing tests**

`packages/schema/test/listing.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { parseListing } from '@claudemodz/schema'

const SHA = '0123456789abcdef0123456789abcdef01234567'

const VALID = `slug: ci-pane
displayName: CI Pane
summary: Live PR checks beside the transcript, with re-run and open buttons.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/ci-pane
  ref: main
  sha: ${SHA}
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: git-ci
tags: [github, pull-requests]
media:
  - file: demo.gif
    alt: CI pane showing two passing checks and one failing
submittedBy: snagrecha
`

describe('parseListing', () => {
  it('accepts a valid listing', () => {
    const parsed = parseListing(VALID, 'ci-pane.yaml')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.listing.source).toEqual({
        type: 'git-subdir',
        repo: 'claudemodz/mods',
        path: 'plugins/ci-pane',
        ref: 'main',
        sha: SHA,
      })
    }
  })

  it('defaults tags and media to empty', () => {
    const text = VALID.replace(/tags:.*\n/, '').replace(/media:\n(  .*\n)+/, '')
    const parsed = parseListing(text, 'ci-pane.yaml')
    expect(parsed.ok && parsed.listing.tags).toEqual([])
    expect(parsed.ok && parsed.listing.media).toEqual([])
  })

  it('rejects an unknown or misspelled key, naming it', () => {
    const parsed = parseListing(VALID.replace('category: git-ci', 'catgory: git-ci'), 'ci-pane.yaml')
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors.join('\n')).toMatch(/catgory/)
  })

  it('requires the file name to match the slug', () => {
    const parsed = parseListing(VALID, 'ci-panel.yaml')
    expect(!parsed.ok && parsed.errors).toContain('file name must be ci-pane.yaml to match the slug')
  })

  it('rejects a short sha, a path with .., and an unknown category', () => {
    const bad = VALID.replace(SHA, 'abc123').replace('plugins/ci-pane', '../escape').replace('git-ci', 'devops')
    const parsed = parseListing(bad, 'ci-pane.yaml')
    const text = !parsed.ok ? parsed.errors.join('\n') : ''
    expect(text).toMatch(/source\.sha/)
    expect(text).toMatch(/source\.path/)
    expect(text).toMatch(/category/)
  })

  it('reports YAML syntax errors instead of throwing', () => {
    const parsed = parseListing('slug: [unclosed', 'x.yaml')
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors[0]).toMatch(/^YAML:/)
  })

  it('limits media to three files', () => {
    const many = VALID.replace(
      /media:\n(  .*\n)+/,
      'media:\n' + [1, 2, 3, 4].map(n => `  - file: d${n}.png\n    alt: shot ${n}\n`).join(''),
    )
    const parsed = parseListing(many, 'ci-pane.yaml')
    expect(!parsed.ok && parsed.errors.join('\n')).toMatch(/media/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/schema`
Expected: FAIL — `parseListing` is not exported.

- [ ] **Step 3: Implement `listing.ts` and export it**

Run: `pnpm --filter @claudemodz/schema add yaml`

`packages/schema/src/listing.ts`:
```ts
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const CATEGORIES = [
  'dashboards',
  'safety',
  'git-ci',
  'workflow',
  'models-cost',
  'memory',
  'ui',
  'integrations',
  'fun',
  'other',
] as const

export const MEDIA_LIMITS = { maxFiles: 3, maxBytes: 5 * 1024 * 1024 } as const

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'lowercase letters, digits and hyphens, up to 64')
const login = z.string().regex(/^[A-Za-z0-9-]{1,39}$/, 'a GitHub login')
const sha = z.string().regex(/^[0-9a-f]{40}$/, 'a full 40-character lowercase commit SHA')
const repo = z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, 'owner/repo')
const ref = z.string().min(1).max(255)
const subdir = z
  .string()
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._/-]+$/, 'a relative path inside the repository, without ..')

const source = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('github'), repo, ref, sha }),
  z.strictObject({ type: z.literal('git-subdir'), repo, path: subdir, ref, sha }),
])

const media = z.strictObject({
  file: z.string().regex(/^[A-Za-z0-9._-]+\.(gif|png|webp|mp4)$/, 'a gif, png, webp or mp4 file name'),
  alt: z.string().min(1).max(200),
})

export const ListingSchema = z.strictObject({
  slug,
  displayName: z.string().min(1).max(60),
  summary: z.string().min(1).max(140),
  source,
  authors: z.array(z.strictObject({ github: login })).min(1),
  maintainers: z.array(login).min(1),
  license: z.string().regex(/^[A-Za-z0-9.+-]+$/, 'an SPDX identifier such as MIT'),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/, 'lowercase words and hyphens')).max(10).default([]),
  media: z.array(media).max(MEDIA_LIMITS.maxFiles).default([]),
  submittedBy: login,
})

export type Listing = z.infer<typeof ListingSchema>
export type ListingSource = Listing['source']
export type ListingParse = { ok: true; listing: Listing } | { ok: false; errors: string[] }

/** Parses and validates one `registry/listings/<slug>.yaml` file. */
export function parseListing(text: string, fileName: string): ListingParse {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (error) {
    return { ok: false, errors: [`YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`] }
  }
  const result = ListingSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(issue => {
        const where = issue.path.join('.')
        if (issue.code === 'unrecognized_keys') return `${where || 'listing'}: unknown key(s) ${issue.keys.join(', ')}`
        return where ? `${where}: ${issue.message}` : issue.message
      }),
    }
  }
  const expected = `${result.data.slug}.yaml`
  if (fileName !== expected) return { ok: false, errors: [`file name must be ${expected} to match the slug`] }
  return { ok: true, listing: result.data }
}
```
Append to `packages/schema/src/index.ts`:
```ts
export * from './listing'
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test packages/schema && pnpm typecheck`
Expected: all listing tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(schema): listing schema and parser"
```

---

### Task 3: Validator note parsing

**Files:**
- Create: `packages/scanner/src/notes.ts`, `packages/scanner/test/notes.test.ts`

**Interfaces:**
- Produces:
  - `type ModNotes = { events: string[]; calls: string[]; envReads: string[]; other: string[] }` (events/calls/envReads sorted, unique; `calls` without the `$.` prefix; `other` = raw notes of kinds we don't model, except `env writes: nothing`)
  - `parseNotes(notes: readonly string[]): ModNotes`
  - `splitTopLevel(list: string): string[]` — splits on `, ` outside `{…}` and `(…)`

- [ ] **Step 1: Write the failing tests**

`packages/scanner/test/notes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { parseNotes, splitTopLevel } from '../src/notes'

describe('splitTopLevel', () => {
  it('keeps commas inside braces and parentheses', () => {
    expect(splitTopLevel('a, b{x=1,2}, $.c (via f, g), d')).toEqual(['a', 'b{x=1,2}', '$.c (via f, g)', 'd'])
  })
})

describe('parseNotes', () => {
  it('reads events with matchers stripped', () => {
    const notes = parseNotes([
      './register.ts hooks: session.start, agent.spawn, turn.step, ui.render{component=Spinner}, command.run{command=router}',
      './register.ts calls: $.command.register, $.ui.invalidate',
    ])
    expect(notes.events).toEqual(['agent.spawn', 'command.run', 'session.start', 'turn.step', 'ui.render'])
    expect(notes.calls).toEqual(['command.register', 'ui.invalidate'])
  })

  it('reads "nothing on $" as no calls', () => {
    expect(parseNotes(['./register.ts calls: nothing on $']).calls).toEqual([])
  })

  it('strips (via …) annotations and dedupes', () => {
    const notes = parseNotes([
      './register.ts calls: $.clock.every, $.process.run (via fetchStatus, rerunFailed), $.ui.toast (via refresh), $.ui.toast',
    ])
    expect(notes.calls).toEqual(['clock.every', 'process.run', 'ui.toast'])
  })

  it('reads environment variable reads and ignores "env writes: nothing"', () => {
    const notes = parseNotes(['./register.js env writes: nothing', './register.js env reads: GITHUB_TOKEN, HOME'])
    expect(notes.envReads).toEqual(['GITHUB_TOKEN', 'HOME'])
    expect(notes.other).toEqual([])
  })

  it('keeps unknown kinds and env writes in other, without throwing', () => {
    const notes = parseNotes([
      './register.js env writes: DEBUG',
      './register.js state: count',
      'something unexpected',
    ])
    expect(notes.other).toEqual([
      './register.js env writes: DEBUG',
      './register.js state: count',
      'something unexpected',
    ])
  })

  it('aggregates several modules', () => {
    const notes = parseNotes([
      './a.ts hooks: tool.call{tool=Bash}',
      './a.ts calls: nothing on $',
      './b.ts hooks: tool.call, ui.render{component=Pane}',
      './b.ts calls: $.ui.open',
    ])
    expect(notes.events).toEqual(['tool.call', 'ui.render'])
    expect(notes.calls).toEqual(['ui.open'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/scanner/test/notes.test.ts`
Expected: FAIL — cannot resolve `../src/notes`.

- [ ] **Step 3: Implement `notes.ts`**

```ts
export type ModNotes = { events: string[]; calls: string[]; envReads: string[]; other: string[] }

const NOTE = /^(\S+) (hooks|calls|env reads|env writes): (.*)$/

/** Splits a validator list on ", " that is not inside {…} or (…). */
export function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < list.length; i++) {
    const ch = list[i] as string
    if (ch === '{' || ch === '(') depth += 1
    if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && ch === ',' && list[i + 1] === ' ') {
      parts.push(current.trim())
      current = ''
      i += 1
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const sortedUnique = (items: Iterable<string>) => [...new Set(items)].sort()

/** Turns `claude plugin validate --json` notes into the events, calls and env reads a mod uses. */
export function parseNotes(notes: readonly string[]): ModNotes {
  const events: string[] = []
  const calls: string[] = []
  const envReads: string[] = []
  const other: string[] = []
  for (const note of notes) {
    const match = note.match(NOTE)
    if (!match) {
      other.push(note)
      continue
    }
    const kind = match[2]
    const value = (match[3] ?? '').trim()
    if (kind === 'hooks') {
      events.push(...splitTopLevel(value).map(event => event.replace(/\{.*\}$/, '')))
    } else if (kind === 'calls') {
      if (value !== 'nothing on $') {
        calls.push(...splitTopLevel(value).map(call => call.replace(/\s*\(via .*\)$/, '').replace(/^\$\./, '')))
      }
    } else if (kind === 'env reads') {
      if (value !== 'nothing') envReads.push(...splitTopLevel(value))
    } else if (value !== 'nothing') {
      other.push(note)
    }
  }
  return { events: sortedUnique(events), calls: sortedUnique(calls), envReads: sortedUnique(envReads), other }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test packages/scanner/test/notes.test.ts && pnpm typecheck`
Expected: all notes tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scanner): parse validator notes into events, calls and env reads"
```

---

### Task 4: Permission vocabulary and mapping

**Files:**
- Create: `packages/schema/src/permissions.ts`, `packages/scanner/src/permissions.ts`, `packages/scanner/test/permissions.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Produces (from `@claudemodz/schema`):
  - `PERMISSIONS` (12 names, spec §3.3 order), `type Permission`
  - `RISKY_PERMISSIONS: readonly Permission[]` = `writes-files, runs-processes, network, reads-secrets, acts-for-you, rewrites-session, controls-other-mods, external-code`
  - `PERMISSION_TEXT: Record<Permission, string>` (plain-language lines for comments and the site)
- Produces (from `packages/scanner/src/permissions.ts`):
  - `permissionsOf(input: { events: readonly string[]; calls: readonly string[]; hasExternal: boolean }): Permission[]` (in `PERMISSIONS` order)
  - `riskOf(permissions: readonly Permission[]): 'standard' | 'elevated'`

- [ ] **Step 1: Write the failing tests**

`packages/scanner/test/permissions.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { permissionsOf, riskOf } from '../src/permissions'

const none = { events: [], calls: [], hasExternal: false }

describe('permissionsOf', () => {
  it('no-attribution: an attribution hook and no calls needs nothing', () => {
    expect(permissionsOf({ ...none, events: ['attribution.text'] })).toEqual([])
  })

  it('model-router: turn.step rewrites the session; ui calls draw', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['agent.spawn', 'command.run', 'session.start', 'turn.step', 'ui.render'],
        calls: ['command.register', 'ui.invalidate'],
      }),
    ).toEqual(['rewrites-session', 'draws-ui'])
  })

  it('ci-pane: process.run runs processes', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['command.run', 'session.start', 'ui.render'],
        calls: ['clock.every', 'command.register', 'process.run', 'ui.open', 'ui.toast'],
      }),
    ).toEqual(['runs-processes', 'draws-ui'])
  })

  it('standup: reads files and the conversation, spends usage', () => {
    expect(
      permissionsOf({
        ...none,
        events: ['command.run', 'prompt.submit', 'session.start', 'tool.call', 'turn.complete'],
        calls: ['clock.now', 'command.register', 'fs.read', 'model.complete', 'session.cwd', 'store.get'],
      }),
    ).toEqual(['reads-files', 'spends-usage', 'reads-conversation'])
  })

  it('maps the risky categories', () => {
    expect(
      permissionsOf({
        events: ['tool.check', 'plugin.register', 'fs.read', 'prompt.section'],
        calls: ['fs.write', 'http.fetch', 'env.get', 'prompt.submit'],
        hasExternal: true,
      }),
    ).toEqual([
      'writes-files',
      'network',
      'reads-secrets',
      'acts-for-you',
      'rewrites-session',
      'controls-other-mods',
      'external-code',
    ])
  })
})

describe('riskOf', () => {
  it('is elevated when any risky permission is present', () => {
    expect(riskOf(['reads-files', 'draws-ui'])).toBe('standard')
    expect(riskOf(['draws-ui', 'runs-processes'])).toBe('elevated')
    expect(riskOf([])).toBe('standard')
  })
})
```
In "maps the risky categories", `prompt.submit` is a **call** (acts-for-you), not a hook, so `reads-conversation` is correctly absent: it comes only from a `prompt.submit` hook or a `session.messages` call.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/scanner/test/permissions.test.ts`
Expected: FAIL — cannot resolve `../src/permissions`.

- [ ] **Step 3: Implement the vocabulary and mapping**

`packages/schema/src/permissions.ts`:
```ts
export const PERMISSIONS = [
  'reads-files',
  'writes-files',
  'runs-processes',
  'network',
  'reads-secrets',
  'spends-usage',
  'acts-for-you',
  'rewrites-session',
  'controls-other-mods',
  'reads-conversation',
  'draws-ui',
  'external-code',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const RISKY_PERMISSIONS: readonly Permission[] = [
  'writes-files',
  'runs-processes',
  'network',
  'reads-secrets',
  'acts-for-you',
  'rewrites-session',
  'controls-other-mods',
  'external-code',
]

export const PERMISSION_TEXT: Record<Permission, string> = {
  'reads-files': 'Reads files on your machine',
  'writes-files': 'Writes files on your machine',
  'runs-processes': 'Runs programs on your machine',
  network: 'Makes network requests',
  'reads-secrets': 'Reads environment variables or settings, which can include API keys',
  'spends-usage': 'Calls a model on your plan or API key',
  'acts-for-you': 'Can approve tool calls or send prompts on your behalf',
  'rewrites-session': 'Changes the system prompt, the stored conversation or which model answers',
  'controls-other-mods': 'Can refuse or change other mods and their calls',
  'reads-conversation': 'Sees your prompts or the conversation',
  'draws-ui': 'Draws in the Claude Code interface',
  'external-code': 'Ships settings hooks or MCP servers that run their own commands',
}
```
Append to `packages/schema/src/index.ts`:
```ts
export * from './permissions'
```
`packages/scanner/src/permissions.ts`:
```ts
import { PERMISSIONS, RISKY_PERMISSIONS, type Permission } from '@claudemodz/schema'

/** Mods-API calls that are also hookable events: hooking one intercepts other mods' calls. */
const API_EVENT_PREFIXES = ['fs.', 'process.', 'http.', 'model.', 'store.', 'env.', 'settings.', 'clock.', 'mcp.', 'audio.']
const UI_API_EVENTS = ['ui.open', 'ui.close', 'ui.toast', 'ui.status', 'ui.log', 'ui.notice', 'ui.invalidate', 'ui.blit', 'ui.copy', 'ui.ask', 'ui.panes']

const anyOf = (items: readonly string[], names: readonly string[]) => items.some(item => names.includes(item))
const anyPrefixed = (items: readonly string[], prefixes: readonly string[]) =>
  items.some(item => prefixes.some(prefix => item.startsWith(prefix)))

export function permissionsOf(input: { events: readonly string[]; calls: readonly string[]; hasExternal: boolean }): Permission[] {
  const { events, calls } = input
  const found = new Set<Permission>()
  if (anyOf(calls, ['fs.read', 'fs.list', 'fs.exists', 'fs.stat', 'fs.ancestors'])) found.add('reads-files')
  if (anyOf(calls, ['fs.write'])) found.add('writes-files')
  if (anyOf(calls, ['process.run', 'process.spawn'])) found.add('runs-processes')
  if (anyOf(calls, ['http.fetch', 'mcp.connect'])) found.add('network')
  if (anyOf(calls, ['env.get', 'settings.read'])) found.add('reads-secrets')
  if (anyPrefixed(calls, ['model.']) || anyOf(calls, ['agent.spawn'])) found.add('spends-usage')
  if (anyOf(events, ['tool.check']) || anyOf(calls, ['prompt.submit', 'tool.call', 'session.send', 'session.authorize'])) {
    found.add('acts-for-you')
  }
  if (anyOf(events, ['prompt.compose', 'prompt.section', 'session.append', 'turn.step'])) found.add('rewrites-session')
  if (anyOf(events, ['plugin.register', 'engine.create']) || anyPrefixed(events, API_EVENT_PREFIXES) || anyOf(events, UI_API_EVENTS)) {
    found.add('controls-other-mods')
  }
  if (anyOf(events, ['prompt.submit']) || anyOf(calls, ['session.messages'])) found.add('reads-conversation')
  if (anyPrefixed(calls, ['ui.']) || anyOf(events, ['ui.render'])) found.add('draws-ui')
  if (input.hasExternal) found.add('external-code')
  return PERMISSIONS.filter(permission => found.has(permission))
}

export function riskOf(permissions: readonly Permission[]): 'standard' | 'elevated' {
  return permissions.some(permission => RISKY_PERMISSIONS.includes(permission)) ? 'elevated' : 'standard'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test packages/scanner/test/permissions.test.ts && pnpm typecheck`
Expected: all permission tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: permission vocabulary and mapping from mod events and calls"
```

---

### Task 5: Plugin contents and external code

**Files:**
- Create: `packages/scanner/src/contents.ts`, `packages/scanner/test/contents.test.ts`, fixture plugins under `packages/scanner/test/fixtures/plugins/` (`standard/`, `elevated/`, `failing/`, `mixed/`, `skill-only/`)

**Interfaces:**
- Produces:
  - `CONTAINS` and `type Contains` exported from `@claudemodz/schema` (add to `packages/schema/src/permissions.ts`): `['mod','skill','agent','command','settings-hook','mcp','lsp','output-style','theme','workflow','monitor']`
  - `type ExternalCode = { settingsHooks: { event: string; command: string }[]; mcpServers: { name: string; command: string | null; url: string | null }[] }`
  - `type PluginContents = { manifest: { name: string; version: string | null; description: string | null; license: string | null }; contains: Contains[]; external: ExternalCode; hasTests: boolean }`
  - `readContents(dir: string): Promise<PluginContents>` (throws `Error('no .claude-plugin/plugin.json in <dir>')` if the manifest is missing)
  - Fixture plugin directories reused by Tasks 8 and 9.

- [ ] **Step 1: Create fixture plugins**

`packages/scanner/test/fixtures/plugins/standard/.claude-plugin/plugin.json`:
```json
{ "name": "standard", "version": "1.0.0", "description": "Reads a file through a helper.", "author": { "name": "fixture" }, "license": "MIT" }
```
`packages/scanner/test/fixtures/plugins/standard/hooks/hooks.json`:
```json
{ "modules": ["./register.js"] }
```
`packages/scanner/test/fixtures/plugins/standard/hooks/register.js`:
```js
export function register(on) {
  on('session.start', async ($, e, next) => {
    await readNotes($)
    return next(e)
  })
}

async function readNotes($) {
  return $.fs.read('NOTES.md').catch(() => '')
}
```
`packages/scanner/test/fixtures/plugins/standard/tests/register.test.js`:
```js
import { describe, expect, test } from 'claude-code/testing'

describe('standard', () => {
  test('loads', async () => {
    expect(1).toBe(1)
  })
})
```
`packages/scanner/test/fixtures/plugins/elevated/.claude-plugin/plugin.json`:
```json
{ "name": "elevated", "version": "0.1.0", "description": "Runs gh and draws a pane.", "author": { "name": "fixture" }, "license": "MIT" }
```
`packages/scanner/test/fixtures/plugins/elevated/hooks/hooks.json`:
```json
{ "modules": ["./register.js"] }
```
`packages/scanner/test/fixtures/plugins/elevated/hooks/register.js`:
```js
export function register(on) {
  on('ui.render', { component: 'Pane' }, ($, e, next) => next(e))
  on('session.start', async ($, e, next) => {
    await $.process.run(['gh', 'pr', 'view'])
    await $.env.get('GITHUB_TOKEN')
    return next(e)
  })
}
```
`packages/scanner/test/fixtures/plugins/failing/.claude-plugin/plugin.json`:
```json
{ "name": "failing", "version": "0.0.1", "description": "Imports a Node built-in.", "author": { "name": "fixture" }, "license": "MIT" }
```
`packages/scanner/test/fixtures/plugins/failing/hooks/hooks.json`:
```json
{ "modules": ["./register.js"] }
```
`packages/scanner/test/fixtures/plugins/failing/hooks/register.js`:
```js
import { execSync } from 'node:child_process'

export function register(on) {
  on('session.start', ($, e, next) => next(e))
}
```
`packages/scanner/test/fixtures/plugins/mixed/.claude-plugin/plugin.json`:
```json
{ "name": "mixed", "version": "0.2.0", "description": "Skill, agent, command, settings hook and MCP server.", "author": { "name": "fixture" }, "license": "Apache-2.0" }
```
`packages/scanner/test/fixtures/plugins/mixed/hooks/hooks.json`:
```json
{ "hooks": { "PostToolUse": [{ "matcher": "Edit", "hooks": [{ "type": "command", "command": "npx prettier --write \"$FILE\"" }] }] } }
```
`packages/scanner/test/fixtures/plugins/mixed/.mcp.json`:
```json
{ "mcpServers": { "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }, "docs": { "type": "http", "url": "https://mcp.example.com/docs" } } }
```
`packages/scanner/test/fixtures/plugins/mixed/skills/hello/SKILL.md`:
```markdown
---
name: hello
description: Say hello.
---
Say hello.
```
`packages/scanner/test/fixtures/plugins/mixed/agents/helper.md`:
```markdown
---
name: helper
description: Helps.
---
Help.
```
`packages/scanner/test/fixtures/plugins/mixed/commands/greet.md`:
```markdown
---
description: Greet.
---
Greet.
```
`packages/scanner/test/fixtures/plugins/skill-only/.claude-plugin/plugin.json`:
```json
{ "name": "skill-only", "version": "1.0.0", "description": "Just a skill.", "author": { "name": "fixture" } }
```
`packages/scanner/test/fixtures/plugins/skill-only/skills/tidy/SKILL.md`:
```markdown
---
name: tidy
description: Tidy imports.
---
Tidy the imports.
```

- [ ] **Step 2: Write the failing tests**

`packages/scanner/test/contents.test.ts`:
```ts
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readContents } from '../src/contents'

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', 'plugins', name)

describe('readContents', () => {
  it('a mod with tests', async () => {
    const contents = await readContents(fixture('standard'))
    expect(contents.manifest).toEqual({
      name: 'standard',
      version: '1.0.0',
      description: 'Reads a file through a helper.',
      license: 'MIT',
    })
    expect(contents.contains).toEqual(['mod'])
    expect(contents.hasTests).toBe(true)
    expect(contents.external).toEqual({ settingsHooks: [], mcpServers: [] })
  })

  it('skills, agents, commands, settings hooks and MCP servers', async () => {
    const contents = await readContents(fixture('mixed'))
    expect(contents.contains).toEqual(['skill', 'agent', 'command', 'settings-hook', 'mcp'])
    expect(contents.external.settingsHooks).toEqual([{ event: 'PostToolUse', command: 'npx prettier --write "$FILE"' }])
    expect(contents.external.mcpServers).toEqual([
      { name: 'docs', command: null, url: 'https://mcp.example.com/docs' },
      { name: 'fs', command: 'npx -y @modelcontextprotocol/server-filesystem /tmp', url: null },
    ])
    expect(contents.hasTests).toBe(false)
  })

  it('a skill-only plugin has no mod and no external code', async () => {
    const contents = await readContents(fixture('skill-only'))
    expect(contents.contains).toEqual(['skill'])
    expect(contents.manifest.license).toBeNull()
  })

  it('a directory without a manifest is an error', async () => {
    await expect(readContents(fixture('does-not-exist'))).rejects.toThrow(/no \.claude-plugin\/plugin\.json/)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test packages/scanner/test/contents.test.ts`
Expected: FAIL — cannot resolve `../src/contents`.

- [ ] **Step 4: Implement**

Add to `packages/schema/src/permissions.ts`:
```ts
export const CONTAINS = [
  'mod',
  'skill',
  'agent',
  'command',
  'settings-hook',
  'mcp',
  'lsp',
  'output-style',
  'theme',
  'workflow',
  'monitor',
] as const

export type Contains = (typeof CONTAINS)[number]
```
`packages/scanner/src/contents.ts`:
```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { CONTAINS, type Contains } from '@claudemodz/schema'

export type ExternalCode = {
  settingsHooks: { event: string; command: string }[]
  mcpServers: { name: string; command: string | null; url: string | null }[]
}

export type PluginContents = {
  manifest: { name: string; version: string | null; description: string | null; license: string | null }
  contains: Contains[]
  external: ExternalCode
  hasTests: boolean
}

type Json = Record<string, unknown>

async function readJson(path: string): Promise<Json | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Json) : null
  } catch {
    return null
  }
}

async function isNonEmptyDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory() && (await readdir(path)).length > 0
  } catch {
    return false
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : null)
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {})

function settingsHooksOf(hooks: unknown): ExternalCode['settingsHooks'] {
  const found: ExternalCode['settingsHooks'] = []
  for (const [event, matchers] of Object.entries(obj(hooks))) {
    for (const matcher of Array.isArray(matchers) ? matchers : []) {
      for (const hook of Array.isArray(obj(matcher).hooks) ? (obj(matcher).hooks as unknown[]) : []) {
        const h = obj(hook)
        const command = str(h.command) ?? str(h.url) ?? (str(h.prompt) !== null ? `prompt: ${str(h.prompt)}` : null)
        if (command !== null) found.push({ event, command })
      }
    }
  }
  return found
}

function mcpServersOf(servers: unknown): ExternalCode['mcpServers'] {
  return Object.entries(obj(servers))
    .map(([name, value]) => {
      const server = obj(value)
      const command = str(server.command)
      const args = Array.isArray(server.args) ? server.args.filter((a): a is string => typeof a === 'string') : []
      return { name, command: command === null ? null : [command, ...args].join(' '), url: str(server.url) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function hasTestFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries.some(
    entry => entry.isFile() && /\.test\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.parentPath.includes('node_modules'),
  )
}

/** Reads what a plugin directory contains, from its files (the validator reports only mod code). */
export async function readContents(dir: string): Promise<PluginContents> {
  const manifest = await readJson(join(dir, '.claude-plugin', 'plugin.json'))
  if (manifest === null) throw new Error(`no .claude-plugin/plugin.json in ${dir}`)

  const hooksFile = (await readJson(join(dir, 'hooks', 'hooks.json'))) ?? {}
  const mcpFile = (await readJson(join(dir, '.mcp.json'))) ?? {}
  const lspFile = await readJson(join(dir, '.lsp.json'))

  const settingsHooks = [...settingsHooksOf(hooksFile.hooks), ...settingsHooksOf(manifest.hooks)]
  const mcpServers = mcpServersOf({ ...obj(mcpFile.mcpServers), ...obj(manifest.mcpServers) })
  const modules = Array.isArray(hooksFile.modules) ? hooksFile.modules : []

  const present: Record<Contains, boolean> = {
    mod: modules.length > 0,
    skill: await isNonEmptyDir(join(dir, 'skills')),
    agent: await isNonEmptyDir(join(dir, 'agents')),
    command: await isNonEmptyDir(join(dir, 'commands')),
    'settings-hook': settingsHooks.length > 0,
    mcp: mcpServers.length > 0,
    lsp: lspFile !== null || Object.keys(obj(manifest.lspServers)).length > 0,
    'output-style': await isNonEmptyDir(join(dir, 'output-styles')),
    theme: await isNonEmptyDir(join(dir, 'themes')),
    workflow: await isNonEmptyDir(join(dir, 'workflows')),
    monitor: (await readJson(join(dir, 'monitors', 'monitors.json'))) !== null,
  }

  return {
    manifest: {
      name: str(manifest.name) ?? '',
      version: str(manifest.version),
      description: str(manifest.description),
      license: str(manifest.license),
    },
    contains: CONTAINS.filter(kind => present[kind]),
    external: { settingsHooks, mcpServers },
    hasTests: await hasTestFiles(dir),
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test packages/scanner/test/contents.test.ts && pnpm typecheck`
Expected: all contents tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(scanner): read plugin contents, settings hooks and MCP servers from files"
```

---

### Task 6: Scan-result schema, permission diff and PR comment

**Files:**
- Create: `packages/schema/src/scan.ts`, `packages/schema/test/scan.test.ts`, `packages/scanner/src/diff.ts`, `packages/scanner/src/comment.ts`, `packages/scanner/test/diff.test.ts`, `packages/scanner/test/comment.test.ts`, `packages/scanner/test/fixtures/scans.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Produces (from `@claudemodz/schema`):
  - `ScanResultSchema` (zod) and `type ScanResult` =
    `{ slug: string; sha: string; scannedAt: string; claudeCodeVersion: string; plugin: { name: string; version: string | null; description: string | null; license: string | null }; contains: Contains[]; mod: { events: string[]; calls: string[]; envReads: string[] } | null; external: { settingsHooks: { event: string; command: string }[]; mcpServers: { name: string; command: string | null; url: string | null }[] }; permissions: Permission[]; risk: 'standard' | 'elevated'; validator: { success: boolean; errors: string[]; warnings: string[] }; tests: { passed: number; failed: number } | null }`
- Produces (scanner):
  - `type PermissionDiff = { addedEvents: string[]; removedEvents: string[]; addedCalls: string[]; removedCalls: string[]; addedPermissions: Permission[]; removedPermissions: Permission[]; addedExternal: string[]; removedExternal: string[]; needsReview: boolean }`
  - `diffScans(before: ScanResult | null, after: ScanResult): PermissionDiff`
  - `externalKeys(scan: ScanResult): string[]`
  - `type CheckedListing = { slug: string; file: string; removed: boolean; errors: string[]; warnings: string[]; scan: ScanResult | null; diff: PermissionDiff | null }`
  - `COMMENT_MARKER = '<!-- claudemodz-check -->'`
  - `renderComment(results: readonly CheckedListing[]): string`
  - Test fixtures `scanOf(overrides: Partial<ScanResult>): ScanResult` in `test/fixtures/scans.ts`.

- [ ] **Step 1: Write fixtures and failing tests**

`packages/scanner/test/fixtures/scans.ts`:
```ts
import type { ScanResult } from '@claudemodz/schema'

export function scanOf(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    slug: 'ci-pane',
    sha: '0123456789abcdef0123456789abcdef01234567',
    scannedAt: '2026-10-03T12:00:00.000Z',
    claudeCodeVersion: '2.1.288',
    plugin: { name: 'ci-pane', version: '0.1.0', description: 'CI checks', license: 'MIT' },
    contains: ['mod'],
    mod: { events: ['session.start', 'ui.render'], calls: ['process.run', 'ui.open'], envReads: [] },
    external: { settingsHooks: [], mcpServers: [] },
    permissions: ['runs-processes', 'draws-ui'],
    risk: 'elevated',
    validator: { success: true, errors: [], warnings: [] },
    tests: { passed: 18, failed: 0 },
    ...overrides,
  }
}
```
`packages/schema/test/scan.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { ScanResultSchema } from '@claudemodz/schema'

import { scanOf } from '../../scanner/test/fixtures/scans'

describe('ScanResultSchema', () => {
  it('round-trips a scan result', () => {
    const scan = scanOf()
    expect(ScanResultSchema.parse(JSON.parse(JSON.stringify(scan)))).toEqual(scan)
  })

  it('rejects an unknown permission', () => {
    expect(ScanResultSchema.safeParse({ ...scanOf(), permissions: ['teleports'] }).success).toBe(false)
  })
})
```
`packages/scanner/test/diff.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { diffScans, externalKeys } from '../src/diff'
import { scanOf } from './fixtures/scans'

describe('diffScans', () => {
  it('a new elevated listing needs review', () => {
    expect(diffScans(null, scanOf()).needsReview).toBe(true)
  })

  it('a new standard listing does not', () => {
    expect(diffScans(null, scanOf({ permissions: ['draws-ui'], risk: 'standard' })).needsReview).toBe(false)
  })

  it('an update with the same permissions does not', () => {
    const diff = diffScans(scanOf(), scanOf({ sha: 'f'.repeat(40) }))
    expect(diff.needsReview).toBe(false)
    expect(diff.addedPermissions).toEqual([])
  })

  it('an update that adds a risky permission needs review and lists what changed', () => {
    const after = scanOf({
      mod: { events: ['session.start', 'ui.render'], calls: ['http.fetch', 'process.run', 'ui.open'], envReads: [] },
      permissions: ['runs-processes', 'network', 'draws-ui'],
    })
    const diff = diffScans(scanOf(), after)
    expect(diff.addedCalls).toEqual(['http.fetch'])
    expect(diff.addedPermissions).toEqual(['network'])
    expect(diff.needsReview).toBe(true)
  })

  it('an update that adds an MCP server needs review', () => {
    const after = scanOf({
      external: { settingsHooks: [], mcpServers: [{ name: 'x', command: 'npx x', url: null }] },
      permissions: ['runs-processes', 'draws-ui', 'external-code'],
    })
    const diff = diffScans(scanOf(), after)
    expect(diff.addedExternal).toEqual(['MCP server x: npx x'])
    expect(diff.needsReview).toBe(true)
  })

  it('removing permissions never needs review', () => {
    const diff = diffScans(scanOf(), scanOf({ permissions: ['draws-ui'], risk: 'standard' }))
    expect(diff.removedPermissions).toEqual(['runs-processes'])
    expect(diff.needsReview).toBe(false)
  })
})

describe('externalKeys', () => {
  it('describes settings hooks and MCP servers', () => {
    const scan = scanOf({
      external: {
        settingsHooks: [{ event: 'PostToolUse', command: 'npx prettier' }],
        mcpServers: [{ name: 'docs', command: null, url: 'https://mcp.example.com' }],
      },
    })
    expect(externalKeys(scan)).toEqual(['settings hook PostToolUse: npx prettier', 'MCP server docs: https://mcp.example.com'])
  })
})
```
`packages/scanner/test/comment.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { COMMENT_MARKER, renderComment } from '../src/comment'
import { diffScans } from '../src/diff'
import { scanOf } from './fixtures/scans'

describe('renderComment', () => {
  it('starts with the marker and summarizes a new elevated listing', () => {
    const scan = scanOf()
    const text = renderComment([
      { slug: 'ci-pane', file: 'registry/listings/ci-pane.yaml', removed: false, errors: [], warnings: [], scan, diff: diffScans(null, scan) },
    ])
    expect(text.startsWith(COMMENT_MARKER)).toBe(true)
    expect(text).toContain('### ci-pane')
    expect(text).toContain('Runs programs on your machine')
    expect(text).toContain('Draws in the Claude Code interface')
    expect(text).toContain('needs a maintainer to add the `permissions-approved` label')
    expect(text).toContain('Tests: 18 passed, 0 failed')
  })

  it('shows errors, warnings and the permission diff for an update', () => {
    const before = scanOf()
    const after = scanOf({
      mod: { events: ['session.start', 'ui.render'], calls: ['http.fetch', 'process.run', 'ui.open'], envReads: ['GITHUB_TOKEN'] },
      permissions: ['runs-processes', 'network', 'draws-ui'],
    })
    const text = renderComment([
      {
        slug: 'ci-pane',
        file: 'registry/listings/ci-pane.yaml',
        removed: false,
        errors: ['license: listing says MIT but the repository is Apache-2.0'],
        warnings: ['plugin tests failed: 1 of 18'],
        scan: after,
        diff: diffScans(before, after),
      },
    ])
    expect(text).toContain('❌ license: listing says MIT but the repository is Apache-2.0')
    expect(text).toContain('⚠️ plugin tests failed: 1 of 18')
    expect(text).toContain('**Added:** Makes network requests')
    expect(text).toContain('`http.fetch`')
    expect(text).toContain('Reads environment variables: `GITHUB_TOKEN`')
  })

  it('notes removals', () => {
    const text = renderComment([
      { slug: 'old-mod', file: 'registry/listings/old-mod.yaml', removed: true, errors: [], warnings: [], scan: null, diff: null },
    ])
    expect(text).toContain('### old-mod')
    expect(text).toContain('Removed from the marketplace')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/schema/test/scan.test.ts packages/scanner/test/diff.test.ts packages/scanner/test/comment.test.ts`
Expected: FAIL — `ScanResultSchema`, `../src/diff`, `../src/comment` don't exist.

- [ ] **Step 3: Implement the schema**

`packages/schema/src/scan.ts`:
```ts
import { z } from 'zod'

import { CONTAINS, PERMISSIONS } from './permissions'

export const ScanResultSchema = z.strictObject({
  slug: z.string(),
  sha: z.string(),
  scannedAt: z.string(),
  claudeCodeVersion: z.string(),
  plugin: z.strictObject({
    name: z.string(),
    version: z.string().nullable(),
    description: z.string().nullable(),
    license: z.string().nullable(),
  }),
  contains: z.array(z.enum(CONTAINS)),
  mod: z.strictObject({ events: z.array(z.string()), calls: z.array(z.string()), envReads: z.array(z.string()) }).nullable(),
  external: z.strictObject({
    settingsHooks: z.array(z.strictObject({ event: z.string(), command: z.string() })),
    mcpServers: z.array(z.strictObject({ name: z.string(), command: z.string().nullable(), url: z.string().nullable() })),
  }),
  permissions: z.array(z.enum(PERMISSIONS)),
  risk: z.enum(['standard', 'elevated']),
  validator: z.strictObject({ success: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()) }),
  tests: z.strictObject({ passed: z.number(), failed: z.number() }).nullable(),
})

export type ScanResult = z.infer<typeof ScanResultSchema>
```
Append to `packages/schema/src/index.ts`:
```ts
export * from './scan'
```

- [ ] **Step 4: Implement diff and comment**

`packages/scanner/src/diff.ts`:
```ts
import { RISKY_PERMISSIONS, type Permission, type ScanResult } from '@claudemodz/schema'

export type PermissionDiff = {
  addedEvents: string[]
  removedEvents: string[]
  addedCalls: string[]
  removedCalls: string[]
  addedPermissions: Permission[]
  removedPermissions: Permission[]
  addedExternal: string[]
  removedExternal: string[]
  needsReview: boolean
}

export function externalKeys(scan: ScanResult): string[] {
  return [
    ...scan.external.settingsHooks.map(hook => `settings hook ${hook.event}: ${hook.command}`),
    ...scan.external.mcpServers.map(server => `MCP server ${server.name}: ${server.command ?? server.url ?? ''}`),
  ]
}

const minus = <T>(a: readonly T[], b: readonly T[]) => a.filter(item => !b.includes(item))

/** What changed between the reviewed scan and the new one; null before means a new listing. */
export function diffScans(before: ScanResult | null, after: ScanResult): PermissionDiff {
  const was = {
    events: before?.mod?.events ?? [],
    calls: before?.mod?.calls ?? [],
    permissions: before?.permissions ?? [],
    external: before ? externalKeys(before) : [],
  }
  const now = {
    events: after.mod?.events ?? [],
    calls: after.mod?.calls ?? [],
    permissions: after.permissions,
    external: externalKeys(after),
  }
  const addedPermissions = minus(now.permissions, was.permissions)
  const addedExternal = minus(now.external, was.external)
  const needsReview =
    before === null
      ? after.risk === 'elevated'
      : addedPermissions.some(p => RISKY_PERMISSIONS.includes(p)) || addedExternal.length > 0
  return {
    addedEvents: minus(now.events, was.events),
    removedEvents: minus(was.events, now.events),
    addedCalls: minus(now.calls, was.calls),
    removedCalls: minus(was.calls, now.calls),
    addedPermissions,
    removedPermissions: minus(was.permissions, now.permissions),
    addedExternal,
    removedExternal: minus(was.external, now.external),
    needsReview,
  }
}
```
`packages/scanner/src/comment.ts`:
```ts
import { PERMISSION_TEXT } from '@claudemodz/schema'

import type { PermissionDiff } from './diff'
import type { ScanResult } from '@claudemodz/schema'

export type CheckedListing = {
  slug: string
  file: string
  removed: boolean
  errors: string[]
  warnings: string[]
  scan: ScanResult | null
  diff: PermissionDiff | null
}

export const COMMENT_MARKER = '<!-- claudemodz-check -->'

const code = (items: readonly string[]) => items.map(item => `\`${item}\``).join(', ')

function section(result: CheckedListing): string {
  const lines = [`### ${result.slug}`]
  if (result.removed) return [...lines, 'Removed from the marketplace. Users who installed it are uninstalled on their next update.'].join('\n')

  lines.push(...result.errors.map(error => `❌ ${error}`), ...result.warnings.map(warning => `⚠️ ${warning}`))
  const { scan, diff } = result
  if (scan === null) return lines.join('\n')

  lines.push('', `**Risk:** ${scan.risk} · **Contains:** ${scan.contains.join(', ') || 'nothing detected'}`)
  lines.push('', '**What it can do**')
  lines.push(...(scan.permissions.length > 0 ? scan.permissions.map(p => `- ${PERMISSION_TEXT[p]}`) : ['- Nothing beyond its own hooks']))
  if (scan.mod !== null) {
    lines.push('', `Hooks: ${code(scan.mod.events) || 'none'}`, `Calls: ${code(scan.mod.calls) || 'none'}`)
    if (scan.mod.envReads.length > 0) lines.push(`Reads environment variables: ${code(scan.mod.envReads)}`)
  }
  for (const hook of scan.external.settingsHooks) lines.push(`Settings hook on ${hook.event}: \`${hook.command}\``)
  for (const server of scan.external.mcpServers) lines.push(`MCP server ${server.name}: \`${server.command ?? server.url ?? ''}\``)
  lines.push('', scan.tests === null ? 'Tests: none' : `Tests: ${scan.tests.passed} passed, ${scan.tests.failed} failed`)

  if (diff !== null) {
    const changes = [
      ...diff.addedPermissions.map(p => `**Added:** ${PERMISSION_TEXT[p]}`),
      ...diff.removedPermissions.map(p => `**Removed:** ${PERMISSION_TEXT[p]}`),
      ...(diff.addedCalls.length ? [`New calls: ${code(diff.addedCalls)}`] : []),
      ...(diff.addedEvents.length ? [`New hooks: ${code(diff.addedEvents)}`] : []),
      ...diff.addedExternal.map(key => `New external code: \`${key}\``),
    ]
    if (changes.length > 0) lines.push('', '**Changes since the reviewed version**', ...changes.map(c => `- ${c}`))
    if (diff.needsReview) lines.push('', '🔒 This needs a maintainer to add the `permissions-approved` label before it can merge.')
  }
  return lines.join('\n')
}

export function renderComment(results: readonly CheckedListing[]): string {
  const body = results.length > 0 ? results.map(section).join('\n\n---\n\n') : 'No listing changes found.'
  return `${COMMENT_MARKER}\n## claudemodz check\n\n${body}\n`
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scan-result schema, permission diff and PR comment rendering"
```

---

### Task 7: Marketplace generation

**Files:**
- Create: `packages/scanner/src/marketplace.ts`, `packages/scanner/test/marketplace.test.ts`

**Interfaces:**
- Consumes: `Listing` (Task 2), `ScanResult` (Task 6).
- Produces:
  - `type MarketplaceEntryInput = { listing: Listing; scan: ScanResult | null }`
  - `buildMarketplace(entries: readonly MarketplaceEntryInput[], renames?: Record<string, string | null>): Marketplace` — includes only entries whose scan exists and `validator.success` is true; sorted by slug.
  - `type Marketplace` (the JSON object written to `.claude-plugin/marketplace.json`)

- [ ] **Step 1: Write the failing tests**

`packages/scanner/test/marketplace.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import type { Listing } from '@claudemodz/schema'

import { buildMarketplace } from '../src/marketplace'
import { scanOf } from './fixtures/scans'

const SHA = '0123456789abcdef0123456789abcdef01234567'

function listingOf(overrides: Partial<Listing> = {}): Listing {
  return {
    slug: 'ci-pane',
    displayName: 'CI Pane',
    summary: 'Live PR checks beside the transcript.',
    source: { type: 'git-subdir', repo: 'claudemodz/mods', path: 'plugins/ci-pane', ref: 'main', sha: SHA },
    authors: [{ github: 'snagrecha' }],
    maintainers: ['snagrecha'],
    license: 'MIT',
    category: 'git-ci',
    tags: ['github'],
    media: [],
    submittedBy: 'snagrecha',
    ...overrides,
  }
}

describe('buildMarketplace', () => {
  it('writes the claudemodz header', () => {
    const market = buildMarketplace([])
    expect(market.name).toBe('claudemodz')
    expect(market.owner).toEqual({ name: 'claudemodz', url: 'https://claudemodz.com' })
    expect(market.forceRemoveDeletedPlugins).toBe(true)
    expect(market.plugins).toEqual([])
  })

  it('maps a git-subdir listing to a pinned entry', () => {
    const market = buildMarketplace([{ listing: listingOf(), scan: scanOf() }])
    expect(market.plugins).toEqual([
      {
        name: 'ci-pane',
        displayName: 'CI Pane',
        description: 'Live PR checks beside the transcript.',
        category: 'git-ci',
        tags: ['github'],
        source: { source: 'git-subdir', url: 'claudemodz/mods', path: 'plugins/ci-pane', ref: 'main', sha: SHA },
        metadata: { claudemodz: { url: 'https://claudemodz.com/m/ci-pane', risk: 'elevated' } },
      },
    ])
  })

  it('maps a github listing', () => {
    const listing = listingOf({ slug: 'whole-repo', source: { type: 'github', repo: 'acme/whole-repo', ref: 'v1', sha: SHA } })
    const [entry] = buildMarketplace([{ listing, scan: scanOf({ slug: 'whole-repo' }) }]).plugins
    expect(entry?.source).toEqual({ source: 'github', repo: 'acme/whole-repo', ref: 'v1', sha: SHA })
  })

  it('leaves out listings without a passing scan, and sorts by slug', () => {
    const market = buildMarketplace([
      { listing: listingOf({ slug: 'zeta' }), scan: scanOf({ slug: 'zeta' }) },
      { listing: listingOf({ slug: 'alpha' }), scan: scanOf({ slug: 'alpha' }) },
      { listing: listingOf({ slug: 'broken' }), scan: scanOf({ slug: 'broken', validator: { success: false, errors: ['x'], warnings: [] } }) },
      { listing: listingOf({ slug: 'unscanned' }), scan: null },
    ])
    expect(market.plugins.map(p => p.name)).toEqual(['alpha', 'zeta'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/scanner/test/marketplace.test.ts`
Expected: FAIL — cannot resolve `../src/marketplace`.

- [ ] **Step 3: Implement**

`packages/scanner/src/marketplace.ts`:
```ts
import type { Listing, ScanResult } from '@claudemodz/schema'

export type MarketplaceEntryInput = { listing: Listing; scan: ScanResult | null }

type PluginSource =
  | { source: 'github'; repo: string; ref: string; sha: string }
  | { source: 'git-subdir'; url: string; path: string; ref: string; sha: string }

export type MarketplaceEntry = {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  source: PluginSource
  metadata: { claudemodz: { url: string; risk: 'standard' | 'elevated' } }
}

export type Marketplace = {
  name: 'claudemodz'
  owner: { name: string; url: string }
  description: string
  forceRemoveDeletedPlugins: true
  renames: Record<string, string | null>
  plugins: MarketplaceEntry[]
}

function sourceOf(listing: Listing): PluginSource {
  const { source } = listing
  return source.type === 'github'
    ? { source: 'github', repo: source.repo, ref: source.ref, sha: source.sha }
    : { source: 'git-subdir', url: source.repo, path: source.path, ref: source.ref, sha: source.sha }
}

export function buildMarketplace(
  entries: readonly MarketplaceEntryInput[],
  renames: Record<string, string | null> = {},
): Marketplace {
  const plugins = entries
    .filter((entry): entry is { listing: Listing; scan: ScanResult } => entry.scan !== null && entry.scan.validator.success)
    .sort((a, b) => a.listing.slug.localeCompare(b.listing.slug))
    .map(({ listing, scan }) => ({
      name: listing.slug,
      displayName: listing.displayName,
      description: listing.summary,
      category: listing.category,
      tags: listing.tags,
      source: sourceOf(listing),
      metadata: { claudemodz: { url: `https://claudemodz.com/m/${listing.slug}`, risk: scan.risk } },
    }))
  return {
    name: 'claudemodz',
    owner: { name: 'claudemodz', url: 'https://claudemodz.com' },
    description: 'Community Claude Code mods and plugins, reviewed and pinned. claudemodz.com',
    forceRemoveDeletedPlugins: true,
    renames,
    plugins,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test packages/scanner/test/marketplace.test.ts && pnpm typecheck`
Expected: all marketplace tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scanner): generate the pinned claudemodz marketplace"
```

---

### Task 8: Source fetching, validator wrappers and the scan

**Files:**
- Create: `packages/scanner/src/proc.ts`, `packages/scanner/src/source.ts`, `packages/scanner/src/validate.ts`, `packages/scanner/src/scan.ts`, `packages/scanner/test/validate.test.ts`, `packages/scanner/test/source.test.ts`, `packages/scanner/test/scan.test.ts`, `packages/scanner/test/helpers/git.ts`

**Interfaces:**
- Consumes: `parseNotes` (Task 3), `permissionsOf`/`riskOf` (Task 4), `readContents` (Task 5), `ScanResult` (Task 6), `ListingSource` (Task 2).
- Produces:
  - `run(cmd: string, args: readonly string[], options?: { cwd?: string; timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string }>` (proc.ts; never throws on non-zero exit)
  - `type FetchedSource = { ok: true; dir: string } | { ok: false; error: string }`
  - `fetchSource(source: ListingSource, workDir: string, urlOf?: (repo: string) => string): Promise<FetchedSource>` — default `urlOf` is `https://github.com/<repo>.git`
  - `type ValidateReport = { success: boolean; errors: string[]; warnings: string[]; notes: string[] }`
  - `reportOf(json: unknown): ValidateReport` (pure)
  - `runValidate(dir: string): Promise<ValidateReport>`
  - `testCountsOf(output: string): { passed: number; failed: number } | null` (pure)
  - `runPluginTests(dir: string): Promise<{ passed: number; failed: number } | null>`
  - `claudeVersion(): Promise<string>`
  - `scanPlugin(dir: string, meta: { slug: string; sha: string; now: Date; claudeCodeVersion: string; withTests: boolean }): Promise<ScanResult>`
  - Test helper `commitFixtureRepo(pluginNames: string[], subdir?: string): Promise<{ url: string; sha: string }>` (creates a temp git repo containing fixture plugins, allows fetching by sha)

- [ ] **Step 1: Write the failing pure tests**

`packages/scanner/test/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

import { reportOf, testCountsOf } from '../src/validate'

describe('reportOf', () => {
  it('flattens manifest and contents into one report', () => {
    const report = reportOf({
      success: false,
      manifest: { errors: [], warnings: [{ path: 'author', message: 'No author', code: null }], notes: [] },
      contents: [
        {
          type: 'hooks',
          errors: [{ path: 'modules../register.js', message: 'cannot import "node:child_process"', code: null }],
          warnings: [],
          notes: ['./register.js hooks: session.start'],
        },
      ],
    })
    expect(report).toEqual({
      success: false,
      errors: ['modules../register.js: cannot import "node:child_process"'],
      warnings: ['author: No author'],
      notes: ['./register.js hooks: session.start'],
    })
  })

  it('treats output that is not a validator report as a failure', () => {
    expect(reportOf('nonsense')).toEqual({
      success: false,
      errors: ['claude plugin validate did not return a JSON report'],
      warnings: [],
      notes: [],
    })
  })
})

describe('testCountsOf', () => {
  it('reads pass and fail counts', () => {
    expect(testCountsOf('tests/a.test.ts:\n 13 pass\n 2 fail\nRan 15 tests across 2 files.')).toEqual({ passed: 13, failed: 2 })
  })

  it('returns null when nothing ran', () => {
    expect(testCountsOf('no tests')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/scanner/test/validate.test.ts`
Expected: FAIL — cannot resolve `../src/validate`.

- [ ] **Step 3: Implement proc and validate**

`packages/scanner/src/proc.ts`:
```ts
import { spawn } from 'node:child_process'

export type ProcResult = { code: number; stdout: string; stderr: string }

/** Runs a command and resolves with its exit code and output; never rejects on a non-zero exit. */
export function run(cmd: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<ProcResult> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 300_000)
    child.stdout.on('data', chunk => (stdout += String(chunk)))
    child.stderr.on('data', chunk => (stderr += String(chunk)))
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: stderr + error.message })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}
```
`packages/scanner/src/validate.ts`:
```ts
import { run } from './proc'

export type ValidateReport = { success: boolean; errors: string[]; warnings: string[]; notes: string[] }

type Issue = { path?: unknown; message?: unknown }
type Section = { errors?: unknown; warnings?: unknown; notes?: unknown }

const issues = (list: unknown): string[] =>
  (Array.isArray(list) ? (list as Issue[]) : []).map(issue =>
    typeof issue.path === 'string' && issue.path ? `${issue.path}: ${String(issue.message)}` : String(issue.message),
  )
const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [])

/** Flattens `claude plugin validate --json` output into one report. */
export function reportOf(json: unknown): ValidateReport {
  if (typeof json !== 'object' || json === null || !('success' in json)) {
    return { success: false, errors: ['claude plugin validate did not return a JSON report'], warnings: [], notes: [] }
  }
  const data = json as { success: unknown; manifest?: Section; contents?: unknown }
  const sections: Section[] = [data.manifest ?? {}, ...(Array.isArray(data.contents) ? (data.contents as Section[]) : [])]
  return {
    success: data.success === true,
    errors: sections.flatMap(s => issues(s.errors)),
    warnings: sections.flatMap(s => issues(s.warnings)),
    notes: sections.flatMap(s => strings(s.notes)),
  }
}

export async function runValidate(dir: string): Promise<ValidateReport> {
  const result = await run('claude', ['plugin', 'validate', dir, '--json'], { timeoutMs: 120_000 })
  try {
    return reportOf(JSON.parse(result.stdout))
  } catch {
    return reportOf(null)
  }
}

export function testCountsOf(output: string): { passed: number; failed: number } | null {
  const passed = output.match(/^\s*(\d+) pass\s*$/m)
  const failed = output.match(/^\s*(\d+) fail\s*$/m)
  if (!passed && !failed) return null
  return { passed: Number(passed?.[1] ?? 0), failed: Number(failed?.[1] ?? 0) }
}

export async function runPluginTests(dir: string): Promise<{ passed: number; failed: number } | null> {
  const result = await run('claude', ['plugin', 'test', dir], { timeoutMs: 300_000 })
  return testCountsOf(`${result.stdout}\n${result.stderr}`)
}

export async function claudeVersion(): Promise<string> {
  const result = await run('claude', ['--version'])
  return result.stdout.trim().split(' ')[0] ?? 'unknown'
}
```
Run: `pnpm test packages/scanner/test/validate.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the git helper and failing source/scan tests**

`packages/scanner/test/helpers/git.ts`:
```ts
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
  for (const name of pluginNames) {
    const target = subdir === undefined && pluginNames.length === 1 ? repo : join(repo, subdir ?? 'plugins', name)
    await cp(join(FIXTURES, name), target, { recursive: true })
  }
  await git(repo, 'add', '-A')
  await git(repo, 'commit', '-q', '-m', 'fixture')
  return { url: `file://${repo}`, sha: await git(repo, 'rev-parse', 'HEAD') }
}
```
`packages/scanner/test/source.test.ts`:
```ts
import { mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fetchSource } from '../src/source'
import { commitFixtureRepo } from './helpers/git'

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
})
```
`packages/scanner/test/scan.test.ts`:
```ts
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanPlugin } from '../src/scan'

const hasClaude = spawnSync('claude', ['--version']).status === 0
const fixture = (name: string) => join(import.meta.dirname, 'fixtures', 'plugins', name)
const meta = (slug: string) => ({ slug, sha: 'a'.repeat(40), now: new Date('2026-10-03T12:00:00Z'), claudeCodeVersion: '2.1.288', withTests: false })

describe.runIf(hasClaude)('scanPlugin (real claude plugin validate)', () => {
  it('standard: reads files through a helper', async () => {
    const scan = await scanPlugin(fixture('standard'), meta('standard'))
    expect(scan.mod).toEqual({ events: ['session.start'], calls: ['fs.read'], envReads: [] })
    expect(scan.permissions).toEqual(['reads-files'])
    expect(scan.risk).toBe('standard')
    expect(scan.validator.success).toBe(true)
    expect(scan.scannedAt).toBe('2026-10-03T12:00:00.000Z')
  })

  it('elevated: processes, secrets and a pane', async () => {
    const scan = await scanPlugin(fixture('elevated'), meta('elevated'))
    expect(scan.mod?.envReads).toEqual(['GITHUB_TOKEN'])
    expect(scan.permissions).toEqual(['runs-processes', 'reads-secrets', 'draws-ui'])
    expect(scan.risk).toBe('elevated')
  })

  it('failing: validator errors are kept and nothing is inferred', async () => {
    const scan = await scanPlugin(fixture('failing'), meta('failing'))
    expect(scan.validator.success).toBe(false)
    expect(scan.validator.errors.join('\n')).toMatch(/node:child_process/)
  })

  it('mixed: no mod, external code is elevated', async () => {
    const scan = await scanPlugin(fixture('mixed'), meta('mixed'))
    expect(scan.mod).toBeNull()
    expect(scan.contains).toEqual(['skill', 'agent', 'command', 'settings-hook', 'mcp'])
    expect(scan.permissions).toEqual(['external-code'])
    expect(scan.risk).toBe('elevated')
  })

  it('skill-only: standard with nothing to report', async () => {
    const scan = await scanPlugin(fixture('skill-only'), meta('skill-only'))
    expect(scan.mod).toBeNull()
    expect(scan.permissions).toEqual([])
    expect(scan.risk).toBe('standard')
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `pnpm test packages/scanner/test/source.test.ts packages/scanner/test/scan.test.ts`
Expected: FAIL — cannot resolve `../src/source` and `../src/scan`.

- [ ] **Step 6: Implement source and scan**

`packages/scanner/src/source.ts`:
```ts
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
```
`packages/scanner/src/scan.ts`:
```ts
import type { ScanResult } from '@claudemodz/schema'

import { readContents } from './contents'
import { parseNotes } from './notes'
import { permissionsOf, riskOf } from './permissions'
import { runPluginTests, runValidate } from './validate'

export type ScanMeta = { slug: string; sha: string; now: Date; claudeCodeVersion: string; withTests: boolean }

/** Scans a fetched plugin directory. Never executes plugin code unless `withTests` is set. */
export async function scanPlugin(dir: string, meta: ScanMeta): Promise<ScanResult> {
  const [contents, report] = await Promise.all([readContents(dir), runValidate(dir)])
  const notes = parseNotes(report.notes)
  const hasMod = contents.contains.includes('mod')
  const mod = hasMod ? { events: notes.events, calls: notes.calls, envReads: notes.envReads } : null
  const hasExternal = contents.external.settingsHooks.length > 0 || contents.external.mcpServers.length > 0
  const permissions = report.success ? permissionsOf({ events: notes.events, calls: notes.calls, hasExternal }) : []
  const tests = meta.withTests && contents.hasTests && report.success ? await runPluginTests(dir) : null
  return {
    slug: meta.slug,
    sha: meta.sha,
    scannedAt: meta.now.toISOString(),
    claudeCodeVersion: meta.claudeCodeVersion,
    plugin: contents.manifest,
    contains: contents.contains,
    mod,
    external: contents.external,
    permissions,
    risk: riskOf(permissions),
    validator: { success: report.success, errors: report.errors, warnings: report.warnings },
    tests,
  }
}
```
Note: the `failing` fixture scan keeps `permissions: []` — a listing that fails validation is blocked anyway, and inferring from partial notes would mislead.

- [ ] **Step 7: Run to verify pass**

Run: `pnpm test packages/scanner && pnpm typecheck`
Expected: source and scan tests pass locally (the scan tests run because `claude` is installed). If the `elevated` fixture's validator notes order permissions differently, the test still holds because `permissionsOf` returns `PERMISSIONS` order.

- [ ] **Step 8: Commit and push; confirm CI runs the real-validator tests**

```bash
git add -A
git commit -m "feat(scanner): fetch sources at a sha, run the validator and build scan results"
git push
```
Expected: CI green, and the CI log shows the `scanPlugin (real claude plugin validate)` tests ran (not skipped).

---

### Task 9: PR check orchestration and CLI

**Files:**
- Create: `packages/scanner/src/check.ts`, `packages/scanner/src/publish.ts`, `packages/scanner/src/cli.ts`, `packages/scanner/test/check.test.ts`, `packages/scanner/test/publish.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `type CheckDeps = { fetch: (source: ListingSource) => Promise<FetchedSource>; scan: (dir: string, slug: string, sha: string) => Promise<ScanResult>; baseScanOf: (slug: string) => Promise<ScanResult | null>; baseListingOf: (slug: string) => Promise<Listing | null>; licenseOf: (repo: string) => Promise<string | null> }`
  - `checkListings(root: string, changedSlugs: readonly string[], deps: CheckDeps): Promise<CheckedListing[]>`
  - `type CheckSummary = { failed: boolean; needsReview: boolean }`, `summarize(results: readonly CheckedListing[]): CheckSummary`
  - `changedSlugsOf(changedFiles: readonly string[]): string[]` — from paths under `registry/listings/<slug>.yaml` and `registry/media/<slug>/…`
  - `publishRegistry(root: string, slugsToScan: readonly string[] | 'all', deps: { fetch; scan }): Promise<{ written: string[]; removed: string[] }>` — writes `registry/generated/<slug>.json` for each scanned listing, deletes generated files whose listing is gone, writes `.claude-plugin/marketplace.json`
  - CLI: `pnpm scanner check --base <ref> --out <dir>` (writes `<dir>/comment.md`, `<dir>/summary.json`; exit 1 when `failed`) and `pnpm scanner publish (--base <sha> | --all)`

- [ ] **Step 1: Write the failing check tests**

`packages/scanner/test/check.test.ts`:
```ts
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
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test packages/scanner/test/check.test.ts`
Expected: FAIL — cannot resolve `../src/check`.

- [ ] **Step 3: Implement `check.ts`**

```ts
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { MEDIA_LIMITS, parseListing, type Listing, type ListingSource, type ScanResult } from '@claudemodz/schema'

import type { CheckedListing } from './comment'
import { diffScans } from './diff'
import type { FetchedSource } from './source'

export type CheckDeps = {
  fetch: (source: ListingSource) => Promise<FetchedSource>
  scan: (dir: string, slug: string, sha: string) => Promise<ScanResult>
  baseScanOf: (slug: string) => Promise<ScanResult | null>
  baseListingOf: (slug: string) => Promise<Listing | null>
  licenseOf: (repo: string) => Promise<string | null>
}

export type CheckSummary = { failed: boolean; needsReview: boolean }

export function changedSlugsOf(changedFiles: readonly string[]): string[] {
  const slugs = new Set<string>()
  for (const file of changedFiles) {
    const listing = file.match(/^registry\/listings\/([^/]+)\.yaml$/)
    const media = file.match(/^registry\/media\/([^/]+)\//)
    const slug = listing?.[1] ?? media?.[1]
    if (slug) slugs.add(slug)
  }
  return [...slugs].sort()
}

const sameSource = (a: ListingSource, b: ListingSource) =>
  a.repo === b.repo && (a.type === 'git-subdir' ? a.path : '') === (b.type === 'git-subdir' ? b.path : '')

async function mediaErrors(root: string, listing: Listing): Promise<string[]> {
  const errors: string[] = []
  for (const item of listing.media) {
    const path = `registry/media/${listing.slug}/${item.file}`
    const info = await stat(join(root, path)).catch(() => null)
    if (info === null) errors.push(`media: ${path} is missing`)
    else if (info.size > MEDIA_LIMITS.maxBytes) errors.push(`media: ${path} is larger than 5 MB`)
  }
  return errors
}

function licenseError(listing: Listing, repoLicense: string | null, scan: ScanResult): string | null {
  const known = repoLicense !== null && repoLicense !== 'NOASSERTION' ? repoLicense : null
  if (known !== null) {
    return known === listing.license ? null : `license: the listing says ${listing.license} but the repository is ${known}`
  }
  if (scan.plugin.license === null) return 'license: no license found in the repository or plugin.json'
  return scan.plugin.license === listing.license
    ? null
    : `license: the listing says ${listing.license} but plugin.json says ${scan.plugin.license}`
}

async function checkOne(root: string, slug: string, deps: CheckDeps, removedSources: Map<string, ListingSource>): Promise<CheckedListing> {
  const file = `registry/listings/${slug}.yaml`
  const result: CheckedListing = { slug, file, removed: false, errors: [], warnings: [], scan: null, diff: null }
  const text = await readFile(join(root, file), 'utf8').catch(() => null)
  if (text === null) return { ...result, removed: true }

  const parsed = parseListing(text, `${slug}.yaml`)
  if (!parsed.ok) return { ...result, errors: parsed.errors }
  const { listing } = parsed

  for (const [oldSlug, oldSource] of removedSources) {
    if (sameSource(oldSource, listing.source)) {
      result.errors.push(
        `slug: renaming ${oldSlug} to ${slug} would uninstall it for everyone who has it; keep the old slug and change displayName instead`,
      )
      return result
    }
  }

  result.errors.push(...(await mediaErrors(root, listing)))
  const fetched = await deps.fetch(listing.source)
  if (!fetched.ok) return { ...result, errors: [...result.errors, fetched.error] }

  const scan = await deps.scan(fetched.dir, slug, listing.source.sha)
  result.scan = scan
  if (!scan.validator.success) result.errors.push(...scan.validator.errors.map(error => `claude plugin validate: ${error}`))
  const license = licenseError(listing, await deps.licenseOf(listing.source.repo), scan)
  if (license !== null) result.errors.push(license)
  if (scan.permissions.includes('draws-ui') && listing.media.length === 0) {
    result.errors.push('media: mods that draw in the interface need at least one screenshot or GIF')
  }
  if (scan.tests !== null && scan.tests.failed > 0) {
    result.warnings.push(`plugin tests failed: ${scan.tests.failed} of ${scan.tests.passed + scan.tests.failed}`)
  }
  result.diff = diffScans(await deps.baseScanOf(slug), scan)
  return result
}

/** Checks each changed listing; one listing's failure never stops the others. */
export async function checkListings(root: string, changedSlugs: readonly string[], deps: CheckDeps): Promise<CheckedListing[]> {
  const removedSources = new Map<string, ListingSource>()
  for (const slug of changedSlugs) {
    const exists = await stat(join(root, `registry/listings/${slug}.yaml`)).then(() => true, () => false)
    const before = exists ? null : await deps.baseListingOf(slug)
    if (before !== null) removedSources.set(slug, before.source)
  }
  const results: CheckedListing[] = []
  for (const slug of changedSlugs) {
    try {
      results.push(await checkOne(root, slug, deps, removedSources))
    } catch (error) {
      results.push({
        slug,
        file: `registry/listings/${slug}.yaml`,
        removed: false,
        errors: [`check crashed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        scan: null,
        diff: null,
      })
    }
  }
  return results
}

export function summarize(results: readonly CheckedListing[]): CheckSummary {
  return {
    failed: results.some(r => r.errors.length > 0),
    needsReview: results.some(r => r.diff?.needsReview === true),
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test packages/scanner/test/check.test.ts && pnpm typecheck`
Expected: all check tests pass.

- [ ] **Step 5: Write the failing publish test**

`packages/scanner/test/publish.test.ts`:
```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ScanResultSchema } from '@claudemodz/schema'

import { publishRegistry } from '../src/publish'
import { scanOf } from './fixtures/scans'

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

describe('publishRegistry', () => {
  it('writes generated scans and the marketplace, and removes stale scans', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claudemodz-pub-'))
    await mkdir(join(root, 'registry/listings'), { recursive: true })
    await mkdir(join(root, 'registry/generated'), { recursive: true })
    await writeFile(join(root, 'registry/listings/alpha.yaml'), yamlOf('alpha'))
    await writeFile(join(root, 'registry/listings/beta.yaml'), yamlOf('beta'))
    await writeFile(join(root, 'registry/generated/gone.json'), JSON.stringify(scanOf({ slug: 'gone' })))
    await writeFile(join(root, 'registry/generated/beta.json'), JSON.stringify(scanOf({ slug: 'beta', risk: 'standard', permissions: [] })))

    const outcome = await publishRegistry(root, ['alpha', 'gone'], {
      fetch: async () => ({ ok: true, dir: '/x' }),
      scan: async (_dir, slug, sha) => scanOf({ slug, sha }),
    })

    expect(outcome).toEqual({ written: ['alpha'], removed: ['gone'] })
    expect(existsSync(join(root, 'registry/generated/gone.json'))).toBe(false)
    const alpha = ScanResultSchema.parse(JSON.parse(await readFile(join(root, 'registry/generated/alpha.json'), 'utf8')))
    expect(alpha.slug).toBe('alpha')
    const market = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual(['alpha', 'beta'])
  })

  it('a listing whose source cannot be fetched is left out of the marketplace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claudemodz-pub-'))
    await mkdir(join(root, 'registry/listings'), { recursive: true })
    await writeFile(join(root, 'registry/listings/alpha.yaml'), yamlOf('alpha'))
    const outcome = await publishRegistry(root, 'all', {
      fetch: async () => ({ ok: false, error: 'commit not found' }),
      scan: async (_dir, slug, sha) => scanOf({ slug, sha }),
    })
    expect(outcome.written).toEqual([])
    const market = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    expect(market.plugins).toEqual([])
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm test packages/scanner/test/publish.test.ts`
Expected: FAIL — cannot resolve `../src/publish`.

- [ ] **Step 7: Implement `publish.ts` and `cli.ts`**

`packages/scanner/src/publish.ts`:
```ts
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseListing, ScanResultSchema, type Listing, type ListingSource, type ScanResult } from '@claudemodz/schema'

import { buildMarketplace } from './marketplace'
import type { FetchedSource } from './source'

export type PublishDeps = {
  fetch: (source: ListingSource) => Promise<FetchedSource>
  scan: (dir: string, slug: string, sha: string) => Promise<ScanResult>
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

async function listingSlugs(root: string): Promise<string[]> {
  const files = await readdir(join(root, 'registry/listings')).catch(() => [])
  return files.filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -'.yaml'.length)).sort()
}

async function readListing(root: string, slug: string): Promise<Listing | null> {
  const text = await readFile(join(root, `registry/listings/${slug}.yaml`), 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = parseListing(text, `${slug}.yaml`)
  return parsed.ok ? parsed.listing : null
}

async function readScan(root: string, slug: string): Promise<ScanResult | null> {
  const text = await readFile(join(root, `registry/generated/${slug}.json`), 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = ScanResultSchema.safeParse(JSON.parse(text))
  return parsed.success ? parsed.data : null
}

/** Rescans the given listings, prunes scans of deleted listings, and rewrites the marketplace. */
export async function publishRegistry(root: string, slugsToScan: readonly string[] | 'all', deps: PublishDeps): Promise<{ written: string[]; removed: string[] }> {
  const slugs = await listingSlugs(root)
  const targets = slugsToScan === 'all' ? slugs : slugsToScan.filter(slug => slugs.includes(slug))
  await mkdir(join(root, 'registry/generated'), { recursive: true })

  const written: string[] = []
  for (const slug of targets) {
    const listing = await readListing(root, slug)
    if (listing === null) continue
    const fetched = await deps.fetch(listing.source)
    if (!fetched.ok) {
      await rm(join(root, `registry/generated/${slug}.json`), { force: true })
      continue
    }
    await writeFile(join(root, `registry/generated/${slug}.json`), json(await deps.scan(fetched.dir, slug, listing.source.sha)))
    written.push(slug)
  }

  const generated = (await readdir(join(root, 'registry/generated'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
  const removed = generated.filter(slug => !slugs.includes(slug)).sort()
  for (const slug of removed) await rm(join(root, `registry/generated/${slug}.json`))

  const entries = []
  for (const slug of slugs) {
    const listing = await readListing(root, slug)
    if (listing !== null) entries.push({ listing, scan: await readScan(root, slug) })
  }
  await mkdir(join(root, '.claude-plugin'), { recursive: true })
  await writeFile(join(root, '.claude-plugin/marketplace.json'), json(buildMarketplace(entries)))
  return { written, removed }
}
```
`packages/scanner/src/cli.ts`:
```ts
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
```

- [ ] **Step 8: Run to verify pass, then smoke-test the CLI**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass.

Run: `pnpm scanner publish --all && cat .claude-plugin/marketplace.json && claude plugin validate .`
Expected: with no listings yet, `published: wrote nothing; removed nothing`; the marketplace has `"plugins": []`; validate passes with the "no plugins" warning. Delete the generated files again (`git checkout -- . && git clean -fd registry .claude-plugin`) — publish output is committed only by the workflow.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(scanner): PR check and publish orchestration with CLI"
git push
```

---

### Task 10: Workflows, labels and contributor docs

**Files:**
- Create: `.github/workflows/pr-check.yml`, `.github/workflows/pr-comment.yml`, `.github/workflows/publish.yml`, `.github/pull_request_template.md`, `docs/contributing.md`, `registry/listings/.gitkeep`, `registry/media/.gitkeep`

**Interfaces:**
- Consumes: `pnpm scanner check|publish` (Task 9).
- Produces: labels `needs-permission-review`, `permissions-approved`; required-check names `pr-check / check` and `pr-check / permission-gate`.

- [ ] **Step 1: `pr-check.yml`**

```yaml
name: pr-check
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
    paths: ['registry/**']
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npm install -g @anthropic-ai/claude-code@2.1.288
      - name: Check changed listings
        run: pnpm scanner check --base origin/${{ github.base_ref }} --out check-results
        env:
          GITHUB_TOKEN: ${{ github.token }}
      - name: Record the PR number
        if: always()
        run: mkdir -p check-results && echo "${{ github.event.pull_request.number }}" > check-results/pr-number
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: check-results
          path: check-results
  permission-gate:
    needs: check
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: check-results
          path: check-results
      - name: Require maintainer approval for new risky permissions
        env:
          APPROVED: ${{ contains(github.event.pull_request.labels.*.name, 'permissions-approved') }}
        run: |
          needs=$(jq -r '.needsReview' check-results/summary.json)
          if [ "$needs" = "true" ] && [ "$APPROVED" != "true" ]; then
            echo "::error::New risky permissions need a maintainer to add the permissions-approved label."
            exit 1
          fi
```

- [ ] **Step 2: `pr-comment.yml`**

```yaml
name: pr-comment
on:
  workflow_run:
    workflows: [pr-check]
    types: [completed]
permissions:
  actions: read
  issues: write
  pull-requests: write
jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: check-results
          path: check-results
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
      - name: Post or update the check comment and label
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
        run: |
          pr=$(cat check-results/pr-number)
          [[ "$pr" =~ ^[0-9]+$ ]] || { echo "bad PR number"; exit 1; }
          body=check-results/comment.md
          [ -f "$body" ] || echo "<!-- claudemodz-check -->
          ## claudemodz check

          The check did not finish. See the pr-check run for details." > "$body"
          id=$(gh api "repos/$REPO/issues/$pr/comments" --paginate \
            --jq '.[] | select(.body | startswith("<!-- claudemodz-check -->")) | .id' | head -1)
          if [ -n "$id" ]; then
            gh api -X PATCH "repos/$REPO/issues/comments/$id" -F body=@"$body" > /dev/null
          else
            gh api "repos/$REPO/issues/$pr/comments" -F body=@"$body" > /dev/null
          fi
          if [ "$(jq -r '.needsReview' check-results/summary.json 2>/dev/null)" = "true" ]; then
            gh api "repos/$REPO/issues/$pr/labels" -f 'labels[]=needs-permission-review' > /dev/null
          else
            gh api -X DELETE "repos/$REPO/issues/$pr/labels/needs-permission-review" > /dev/null 2>&1 || true
          fi
```

- [ ] **Step 3: `publish.yml`**

```yaml
name: publish
on:
  push:
    branches: [main]
    paths: ['registry/listings/**', 'registry/media/**']
  workflow_dispatch:
    inputs:
      all:
        description: Rescan every listing (e.g. after bumping Claude Code)
        type: boolean
        default: false
permissions:
  contents: write
concurrency: publish
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npm install -g @anthropic-ai/claude-code@2.1.288
      - name: Scan and write the marketplace
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ] && [ "${{ inputs.all }}" = "true" ]; then
            pnpm scanner publish --all
          else
            pnpm scanner publish --base "${{ github.event.before }}"
          fi
      - run: claude plugin validate .
      - name: Commit generated files
        run: |
          git config user.name "claudemodz-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add registry/generated .claude-plugin/marketplace.json
          if git diff --cached --quiet; then echo "nothing to publish"; exit 0; fi
          git commit -m "chore: publish registry [skip ci]"
          git push
      - name: Notify the site
        if: ${{ env.SYNC_URL != '' }}
        env:
          SYNC_URL: ${{ secrets.SYNC_URL }}
        run: echo "site sync arrives in phase 3"
```

- [ ] **Step 4: PR template and contributor docs**

`.github/pull_request_template.md`:
```markdown
## Listing

- [ ] One listing per PR, at `registry/listings/<slug>.yaml`
- [ ] `source.sha` is the exact commit you want users to get
- [ ] Mods that draw in the interface include a screenshot or GIF under `registry/media/<slug>/`
- [ ] I am an author of this plugin, or I've credited its authors in `authors`

The claudemodz check will comment with what the plugin can do. New risky permissions need a maintainer to add `permissions-approved`.
```
`docs/contributing.md`:
````markdown
# Submitting to claudemodz

claudemodz lists Claude Code mods and plugins. Each listing is reviewed and pinned to an exact commit, so users never get code nobody looked at.

## 1. Add your listing

Create `registry/listings/<slug>.yaml` (the slug is also the install name: `/plugin install <slug>@claudemodz`):

```yaml
slug: my-mod
displayName: My Mod
summary: One sentence, at most 140 characters.
source:
  type: git-subdir          # or github, for a plugin at the repository root
  repo: you/your-repo
  path: plugins/my-mod      # git-subdir only
  ref: main
  sha: <the full 40-character commit SHA>
authors:
  - github: you
maintainers: [you]
license: MIT                # must match your repository's license
category: workflow          # dashboards, safety, git-ci, workflow, models-cost, memory, ui, integrations, fun, other
tags: [example]
media:
  - file: demo.gif
    alt: What the demo shows
submittedBy: you
```

Put media in `registry/media/<slug>/` (up to 3 files, 5 MB each; gif, png, webp or mp4). A mod that draws in the interface needs at least one.

## 2. Open a pull request

The **claudemodz check** fetches your plugin at `sha`, runs `claude plugin validate` and its tests, and comments with what it can do: files, programs, network, secrets, model usage, and whether it can act for the user. If the plugin can do something risky — write files, run programs, use the network, read secrets, act for the user, rewrite the session, control other mods, or ship settings hooks or MCP servers — a maintainer reviews it and adds `permissions-approved`.

## 3. Updates

Open a PR that changes `sha`. The check posts what changed since the reviewed version. Listing maintainers can approve their own updates unless they add risky permissions.

## Renaming

Slugs can't change: a rename uninstalls the mod for everyone who has it. Change `displayName` instead.
````
Create empty `registry/listings/.gitkeep` and `registry/media/.gitkeep`.

- [ ] **Step 5: Create the labels (confirm with the user first)**

```bash
gh label create needs-permission-review --color D93F0B --description "New risky permissions: a maintainer must review"
gh label create permissions-approved --color 0E8A16 --description "A maintainer reviewed the new permissions"
```

- [ ] **Step 6: Commit, push, and note branch protection**

```bash
git add -A
git commit -m "ci: pr-check, pr-comment and publish workflows; contributor docs"
git push
```
Expected: `ci` green. Tell the user that once this is on `main`, they can make `pr-check / check` and `pr-check / permission-gate` required in the repository's branch protection (a settings change only they should make).

---

### Task 11: Submit our mods through the pipeline

**Files:**
- Create: `registry/listings/no-attribution.yaml`, `registry/listings/standup.yaml`, `registry/listings/model-router.yaml`, `registry/listings/ci-pane.yaml`, plus media under `registry/media/model-router/` and `registry/media/ci-pane/` when available

**Interfaces:**
- Consumes: the merged phase-2 pipeline on `main`; `claudemodz/mods` `main` containing the four plugins.

- [ ] **Step 1: Preconditions (stop and ask the user if either fails)**

Run:
```bash
gh pr view 2 --json state --jq .state    # the phase-2 PR (number may differ) must be MERGED
gh pr view 1 -R claudemodz/mods --json state,mergeCommit --jq '"\(.state) \(.mergeCommit.oid)"'
```
Expected: the phase-2 PR is merged into `main`, and `claudemodz/mods#1` is `MERGED` (with a merge commit, so the phase-1 shas stay reachable). If `claudemodz/mods#1` is not merged, **stop and ask the user**: listings must pin a commit on `claudemodz/mods` `main`.

- [ ] **Step 2: Pin the sha**

Run: `git ls-remote https://github.com/claudemodz/mods refs/heads/main | cut -f1`
Use that value as `<MODS_SHA>` in every listing below (replace the placeholder text `<MODS_SHA>` with the 40-character value before committing).

- [ ] **Step 3: Write the two listings that need no media, on a branch**

```bash
git checkout main && git pull && git checkout -b listings/no-attribution-standup
```
`registry/listings/no-attribution.yaml`:
```yaml
slug: no-attribution
displayName: No Attribution
summary: Removes Claude's Co-Authored-By commit trailer and PR footer, or replaces them with your own text.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/no-attribution
  ref: main
  sha: <MODS_SHA>
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: git-ci
tags: [git, attribution, commits]
submittedBy: snagrecha
```
`registry/listings/standup.yaml`:
```yaml
slug: standup
displayName: Standup
summary: Logs what you worked on across sessions and writes your standup with /standup.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/standup
  ref: main
  sha: <MODS_SHA>
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: workflow
tags: [standup, productivity]
submittedBy: snagrecha
```

- [ ] **Step 4: Check locally, then open the PR**

Run: `pnpm scanner check --base origin/main --out check-results; cat check-results/comment.md`
Expected: both listings pass; no-attribution shows "Nothing beyond its own hooks"; standup shows reads files / spends usage / sees your prompts, risk standard, tests 21 passed.
```bash
git add registry/listings
git commit -m "listing: no-attribution and standup"
git push -u origin listings/no-attribution-standup
gh pr create --title "Listing: no-attribution, standup" --body "First listings through the pipeline."
```
Expected: `pr-check` green, the `claudemodz check` comment appears, no `needs-permission-review` label.

- [ ] **Step 5: Merge (confirm with the user) and verify publish**

After the user approves the merge:
```bash
gh pr merge --merge --delete-branch
gh run watch $(gh run list --workflow publish -L 1 --json databaseId --jq '.[0].databaseId') --exit-status
git pull
cat .claude-plugin/marketplace.json
```
Expected: `publish` green; `registry/generated/no-attribution.json` and `standup.json` exist; the marketplace lists both, pinned to `<MODS_SHA>`.

- [ ] **Step 6: Install from the real marketplace in a scratch project**

```bash
cd "$(mktemp -d)"
claude plugin marketplace add claudemodz/claudemodz
claude plugin install no-attribution@claudemodz --scope local
claude plugin list | grep -A2 "no-attribution@claudemodz"
claude plugin uninstall no-attribution@claudemodz --scope local
claude plugin marketplace remove claudemodz
cd -
```
Expected: install succeeds and `plugin list` shows version 0.1.0 from `claudemodz`. (Removing the marketplace afterwards keeps the user's environment as it was; they keep using `claudemodz-mods` while dogfooding.)

- [ ] **Step 7: model-router and ci-pane (needs demo media)**

When the user has recorded demos (phase-1 Task 10), copy them to `registry/media/model-router/demo.gif` and `registry/media/ci-pane/demo.gif`, then add:

`registry/listings/model-router.yaml`:
```yaml
slug: model-router
displayName: Model Router
summary: Runs Explore subagents on Haiku and adds /router to switch the main session's model.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/model-router
  ref: main
  sha: <MODS_SHA>
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: models-cost
tags: [models, cost, subagents]
media:
  - file: demo.gif
    alt: The spinner showing the fast preset's model after /router fast
submittedBy: snagrecha
```
`registry/listings/ci-pane.yaml`:
```yaml
slug: ci-pane
displayName: CI Pane
summary: Live PR checks beside the transcript, with re-run and open buttons.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/ci-pane
  ref: main
  sha: <MODS_SHA>
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: git-ci
tags: [github, ci, pane]
media:
  - file: demo.gif
    alt: CI pane listing checks with one failing and a Re-run failed button
submittedBy: snagrecha
```
Open a PR as in Step 4. Expected: both are **elevated** (model-router: rewrites session; ci-pane: runs processes), so the PR gets `needs-permission-review` and `permission-gate` fails until a maintainer adds `permissions-approved` — the review path working end to end. If the demos aren't ready yet, open this PR without media to watch the media rule block it, and leave it open.
