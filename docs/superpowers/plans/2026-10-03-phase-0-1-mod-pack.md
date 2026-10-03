# Phase 0–1: Spike + Mod Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the phase-0 unknowns, then ship `claudemodz/mods` with four tested mods (`no-attribution`, `model-router`, `ci-pane`, `standup`) that we install and use daily.

**Architecture:** One GitHub repo, `claudemodz/mods`, that is itself a Claude Code plugin marketplace (`claudemodz-mods`). Each mod is a plugin under `plugins/<name>/`: a thin `hooks/register.ts` that wires events to small pure modules, plus tests run by `claude plugin test`. CI typechecks, runs `claude plugin validate --strict` on every plugin and the marketplace, and runs the tests.

**Tech Stack:** Claude Code ≥ 2.1.287 mods API (TypeScript, `claude-code` types, `claude-code/testing`), TypeScript (`tsc --noEmit`), pnpm, GitHub Actions, GitHub CLI (`gh`).

**Spec:** `docs/superpowers/specs/2026-10-03-claudemodz-design.md` (§1 background facts, §7 mod pack, §10 phases 0–1).

## Global Constraints

- Claude Code **≥ 2.1.287** locally and in CI. CI pins the exact version (`2.1.287` unless Task 1 finds a newer release required).
- A hooks module may import only relative files and `claude-code` (types). No Node built-ins, no npm packages at runtime. Every `$` call is spelled `$.noun.method(...)` — no computed access.
- Hooks-module limits: 10 s per hook (excluding `next` and API calls), `$.store` 4 MiB total, `$.process.run` 30 s default timeout.
- JSX uses the global `h` factory: never import, declare or pragma `h`/`Fragment`.
- Relative imports use the `.js` suffix for `.ts`/`.tsx` files (e.g. `import { x } from './checks.js'`), as Anthropic's own mods do.
- Every plugin's `plugin.json` sets `name`, `version`, `description`, `author` (`{ "name": "claudemodz", "url": "https://claudemodz.com" }`), `license` (`MIT`), `repository` (`https://github.com/claudemodz/mods`). `validate --strict` must pass with zero warnings.
- **Commits and PRs never include `Co-Authored-By: Claude…` trailers or "Generated with Claude Code" lines** (user's global instruction).
- Marketplace name for this repo: `claudemodz-mods`. Plugin names: `no-attribution`, `model-router`, `ci-pane`, `standup`.
- If a test stub fails typecheck against the build's generated types, fix the stub to match `.claude/types/claude-code.d.ts`. Never loosen `tsconfig.json` or add `any`.
- Creating the GitHub repo and pushing are outward-facing: confirm with the user in chat before `gh repo create` and before the first push.

## Review Focus

1. **`gh` missing or signed out** — `ci-pane` must show one calm "install and sign in to gh" state, never throw, toast or retry noisily on each poll. (Test in Task 7.)
2. **Branch with no pull request** — `ci-pane` shows "no pull request for this branch", not an error. (Test in Task 6.)
3. **Subagent spawned with an explicit model, or a fork** — `model-router` must leave it untouched. (Tests in Tasks 4 and 5.)
4. **Corrupt or foreign data in `$.store`** (not an array, wrong fields, from an older version) — `standup` treats bad entries as absent instead of crashing. (Test in Task 8.)
5. **Git worktree where `.git` is a file, or detached HEAD** — `standup` records branch `unknown`/`detached` and still records the turn. (Tests in Tasks 8 and 9.)

## Deviations from the spec (deliberate)

- **standup** does not copy to the clipboard: `$.ui.copy` is absent from Anthropic's published types, so v0.1.0 prints the update instead (Task 2 Step 5 records whether this build has it; add it in a follow-up if present). It reads the branch from `.git/HEAD` (`$.fs.read`) rather than running git, to stay out of the "runs processes" permission. It prunes old records on each write instead of at `session.start` (same effect, one less hook).
- **ci-pane** shows a failing-only **status line** (`$.ui.status`) instead of an `AbovePrompt` band, which other mods also draw into. `/ci rerun` was added so re-running works where panes don't draw.
- **Phase-0 claim-permission check** moves to the phase-4 plan.

---

## File Structure (repo `claudemodz/mods`)

```
mods/
├── .claude-plugin/marketplace.json      # marketplace "claudemodz-mods", one entry per plugin
├── .claude/types/                       # written by /plugin-types for the pinned Claude Code build (committed)
├── .github/workflows/ci.yml             # typecheck · validate --strict · plugin test
├── scripts/each-plugin.mjs              # runs `claude plugin validate|test` over plugins/*
├── docs/spike-2026-10-03.md             # Task 1 results
├── package.json · pnpm-lock.yaml · tsconfig.json · LICENSE · README.md
└── plugins/
    ├── no-attribution/
    │   ├── .claude-plugin/plugin.json
    │   ├── hooks/hooks.json · hooks/register.ts · hooks/attribution.ts
    │   ├── tests/attribution.test.ts · tests/register.test.ts
    │   └── README.md
    ├── model-router/
    │   ├── .claude-plugin/plugin.json
    │   ├── hooks/hooks.json · hooks/register.ts · hooks/routing.ts
    │   ├── tests/routing.test.ts · tests/register.test.ts
    │   └── README.md
    ├── ci-pane/
    │   ├── .claude-plugin/plugin.json
    │   ├── hooks/hooks.json · hooks/register.ts · hooks/checks.ts · hooks/view.tsx
    │   ├── tests/checks.test.ts · tests/register.test.ts · tests/fixtures.ts · tests/text-of.ts
    │   └── README.md
    └── standup/
        ├── .claude-plugin/plugin.json
        ├── hooks/hooks.json · hooks/register.ts · hooks/records.ts
        ├── tests/records.test.ts · tests/register.test.ts
        └── README.md
```

Each `register.ts` only wires events to the pure module beside it; logic lives in the pure module so it can be tested without an engine.

---

### Task 1: Phase-0 spike

Resolve the unknowns from spec §10 phase 0 that affect this plan. (The claim-permission check moves to the phase-4 plan, where the OAuth app exists.)

**Files:**
- Create (in a scratch dir, not committed): `probe-marketplace/.claude-plugin/marketplace.json`
- Create later in Task 2: `docs/spike-2026-10-03.md` (results recorded here)

**Interfaces:**
- Produces: confirmed Claude Code version for CI pin; whether `$.ui.copy` exists; confirmation that marketplace name `claudemodz` registers.

- [ ] **Step 1: Update Claude Code and confirm version**

Run: `claude update && claude --version`
Expected: `2.1.287 (Claude Code)` or higher. If `claude update` is unavailable, run `npm install -g @anthropic-ai/claude-code@latest`.

- [ ] **Step 2: Confirm the `claudemodz` marketplace name registers (not just validates)**

```bash
mkdir -p /tmp/probe-marketplace/.claude-plugin
cat > /tmp/probe-marketplace/.claude-plugin/marketplace.json <<'EOF'
{ "name": "claudemodz", "owner": { "name": "claudemodz" }, "description": "probe", "plugins": [] }
EOF
claude plugin marketplace add /tmp/probe-marketplace
claude plugin marketplace list
claude plugin marketplace remove claudemodz
```
Expected: `add` succeeds and `list` shows `claudemodz`. **If `add` refuses the name as impersonating an official marketplace, stop and tell the user** — the registry's marketplace name in the spec (§3.4) must change before phase 2.

- [ ] **Step 3: Record findings for Task 2**

Note the exact version from Step 1 and the Step 2 outcome; they go into `docs/spike-2026-10-03.md` in Task 2 Step 7. Types for the build are generated in Task 2 Step 5 (`/plugin-types` writes into the current project).

---

### Task 2: Scaffold `claudemodz/mods` with CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `.claude-plugin/marketplace.json`, `scripts/each-plugin.mjs`, `.github/workflows/ci.yml`, `LICENSE`, `README.md`, `.gitignore`, `docs/spike-2026-10-03.md`, `.claude/types/*` (generated)

**Interfaces:**
- Produces: `pnpm typecheck`, `pnpm validate`, `pnpm test`, `pnpm check` (all three). Later tasks add plugins under `plugins/` and entries to `.claude-plugin/marketplace.json`.

- [ ] **Step 1: Create the repo (confirm with the user first)**

Run from the directory where you keep repositories (ask the user which; e.g. `~/Documents/repos`). Every later path in this plan is relative to the new `mods/` directory.

```bash
gh repo create claudemodz/mods --public --description "Claude Code mods we use every day — reviewed, tested, MIT." --clone
cd mods
```

- [ ] **Step 2: Write `package.json`, then add TypeScript**

```json
{
  "name": "claudemodz-mods",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p .",
    "validate": "node scripts/each-plugin.mjs validate",
    "test": "node scripts/each-plugin.mjs test",
    "check": "pnpm typecheck && pnpm validate && pnpm test"
  }
}
```
Run: `pnpm add -D typescript`

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "types": [],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  },
  "include": [".claude/types", "plugins/*/hooks", "plugins/*/tests"]
}
```

- [ ] **Step 4: Write `scripts/each-plugin.mjs`**

```js
// Runs `claude plugin validate --strict` or `claude plugin test` on every plugin
// under plugins/, and validates the marketplace itself. Exits 1 on any failure.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
if (mode !== 'validate' && mode !== 'test') {
  console.error('usage: each-plugin.mjs validate|test')
  process.exit(2)
}

const plugins = readdirSync('plugins')
  .map(name => join('plugins', name))
  .filter(dir => statSync(dir).isDirectory())

const targets = mode === 'validate' ? ['.', ...plugins] : plugins
let failed = 0

for (const dir of targets) {
  // An empty marketplace warns "no plugins defined"; stay non-strict until the first plugin lands.
  const isStrict = !(dir === '.' && plugins.length === 0)
  const args =
    mode === 'validate'
      ? ['plugin', 'validate', dir, ...(isStrict ? ['--strict'] : [])]
      : ['plugin', 'test', dir]
  console.log(`\n$ claude ${args.join(' ')}`)
  const run = spawnSync('claude', args, { stdio: 'inherit' })
  if (run.status !== 0) failed += 1
}

if (targets.length === 0) console.log('no plugins yet')
process.exit(failed > 0 ? 1 : 0)
```

- [ ] **Step 5: Generate build types**

Run `claude` in the repo root, type `/plugin-types`, then exit. Then:
Run: `ls .claude/types && grep -c "'attribution.text'" .claude/types/claude-code.d.ts && grep -n "copy:" .claude/types/claude-code.d.ts | head -3`
Expected: `claude-code.d.ts` exists; the `attribution.text` count is ≥ 1. Note whether a `copy:` method appears under the `ui` noun (record in Step 7; this plan does not depend on it).

- [ ] **Step 6: Write the empty marketplace, `.gitignore`, LICENSE, README**

`.claude-plugin/marketplace.json`:
```json
{
  "name": "claudemodz-mods",
  "owner": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "description": "Claude Code mods by the claudemodz maintainers. Browse more at claudemodz.com.",
  "plugins": []
}
```
`.gitignore`:
```
node_modules/
```
`LICENSE`: the standard MIT license text with `Copyright (c) 2026 claudemodz contributors`.

`README.md`:
````markdown
# claudemodz/mods

Claude Code mods we use every day. Each one is reviewed, tested and MIT-licensed.
Requires Claude Code 2.1.287 or later.

```
/plugin marketplace add claudemodz/mods
/plugin install <mod>@claudemodz-mods
```

| Mod | What it does |
|---|---|

Unofficial community project, not affiliated with Anthropic. Mods run with your permissions — read a mod's README and run `claude plugin validate plugins/<mod>` to see exactly what it can do.
````

- [ ] **Step 7: Record the spike**

`docs/spike-2026-10-03.md`:
```markdown
# Phase-0 spike — 2026-10-03

- Claude Code version: <version from Task 1 Step 1>
- `claude plugin marketplace add` with name `claudemodz`: <accepted | refused + message>
- `$.ui.copy` in build types: <present | absent>
- `claude plugin validate` headless in GitHub Actions (no sign-in): <pass | fail> — filled in after the first CI run (Step 10)
```
Replace each `<…>` with the observed result before committing.

- [ ] **Step 8: Write `.github/workflows/ci.yml`**

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
      - run: npm install -g @anthropic-ai/claude-code@2.1.287
      - run: claude --version
      - run: pnpm typecheck
      - run: pnpm validate
      - run: pnpm test
```
If Task 1 found a version newer than 2.1.287 is needed, use that exact version here.

- [ ] **Step 9: Run the checks locally**

Run: `pnpm check`
Expected: typecheck passes (its only inputs so far are the generated `.claude/types`); validate runs non-strict on the empty marketplace and passes with the "no plugins" warning; test prints `no plugins yet`.

- [ ] **Step 10: Commit, push (confirm first), and confirm CI runs headless**

```bash
git add -A
git commit -m "chore: scaffold mods marketplace with CI"
git push -u origin main
gh run watch --exit-status || true
```
Expected: `claude plugin validate .` runs **without asking for sign-in**. Update `docs/spike-2026-10-03.md` with the headless result and commit:
```bash
git commit -am "docs: record headless validate result"
git push
```
If `claude plugin validate` or `claude plugin test` demands authentication in CI, add an `ANTHROPIC_API_KEY` repository secret, pass it as `env:` on those steps, and record that in the spike doc.

---

### Task 3: `no-attribution`

**Files:**
- Create: `plugins/no-attribution/.claude-plugin/plugin.json`, `plugins/no-attribution/hooks/hooks.json`, `plugins/no-attribution/hooks/attribution.ts`, `plugins/no-attribution/hooks/register.ts`, `plugins/no-attribution/tests/attribution.test.ts`, `plugins/no-attribution/tests/register.test.ts`, `plugins/no-attribution/README.md`
- Modify: `.claude-plugin/marketplace.json` (add entry), `README.md` (table row)

**Interfaces:**
- Produces: `attributionFor(kind: AttributionTextKind, options: AttributionOptions): string | undefined` in `hooks/attribution.ts`; `AttributionOptions = { readonly commitText?: unknown; readonly prText?: unknown }`.

- [ ] **Step 1: Write the manifest and hooks.json**

`plugins/no-attribution/.claude-plugin/plugin.json`:
```json
{
  "name": "no-attribution",
  "displayName": "No Attribution",
  "version": "0.1.0",
  "description": "Removes the Co-Authored-By commit trailer and the \"Generated with Claude Code\" PR footer, or replaces them with your own text. Deterministic — no CLAUDE.md rule needed.",
  "author": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "license": "MIT",
  "repository": "https://github.com/claudemodz/mods",
  "keywords": ["git", "commits", "pull-requests", "attribution"],
  "userConfig": {
    "commitText": {
      "type": "string",
      "title": "Commit trailer",
      "description": "Text Claude adds to commit messages instead of the Co-Authored-By trailer. Leave empty to add nothing.",
      "required": false,
      "default": ""
    },
    "prText": {
      "type": "string",
      "title": "Pull request footer",
      "description": "Text Claude adds to pull request descriptions instead of the \"Generated with Claude Code\" line. Leave empty to add nothing.",
      "required": false,
      "default": ""
    }
  }
}
```
`plugins/no-attribution/hooks/hooks.json`:
```json
{
  "description": "attribution.text: replaces the commit trailer and PR footer with the configured text (empty by default); other attribution texts pass through.",
  "modules": ["./register.ts"]
}
```

- [ ] **Step 2: Write the failing logic test**

`plugins/no-attribution/tests/attribution.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import { attributionFor } from '../hooks/attribution.js'

describe('attributionFor', () => {
  test('commit and pr texts are empty by default', async () => {
    expect(attributionFor('commit', {})).toBe('')
    expect(attributionFor('pr', {})).toBe('')
  })

  test('configured texts replace the defaults', async () => {
    const options = { commitText: 'Reviewed-by: me', prText: 'Built with care' }
    expect(attributionFor('commit', options)).toBe('Reviewed-by: me')
    expect(attributionFor('pr', options)).toBe('Built with care')
  })

  test('non-string option values count as empty', async () => {
    expect(attributionFor('commit', { commitText: 42 })).toBe('')
  })

  test('exemption and remedy texts are not ours to change', async () => {
    expect(attributionFor('exemption', {})).toBeUndefined()
    expect(attributionFor('remedy', {})).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `claude plugin test plugins/no-attribution`
Expected: FAIL — cannot resolve `../hooks/attribution.js` (and the plugin has no register module yet).

- [ ] **Step 4: Implement the logic and register module**

`plugins/no-attribution/hooks/attribution.ts`:
```ts
import type { AttributionTextKind } from 'claude-code'

export type AttributionOptions = {
  readonly commitText?: unknown
  readonly prText?: unknown
}

/**
 * The text to use for one attribution slot, or undefined to leave the
 * engine's text alone (the exemption and remedy sentences).
 */
export function attributionFor(
  kind: AttributionTextKind,
  options: AttributionOptions,
): string | undefined {
  if (kind === 'commit') return asText(options.commitText)
  if (kind === 'pr') return asText(options.prText)
  return undefined
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
```
`plugins/no-attribution/hooks/register.ts`:
```ts
import type { On, PluginOptions } from 'claude-code'

import { attributionFor } from './attribution.js'

export function register(on: On, options: PluginOptions): void {
  on('attribution.text', ($, e, next) => {
    const text = attributionFor(e.kind, options)
    return text === undefined ? next(e) : { text }
  })
}
```

- [ ] **Step 5: Add the engine-level test**

`plugins/no-attribution/tests/register.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

const TRAILER = 'Co-Authored-By: Claude <noreply@anthropic.com>'

describe('register', () => {
  test('the commit trailer becomes empty', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(await $.attribution.text({ kind: 'commit', text: TRAILER })).toEqual({ text: '' })
  })

  test('the PR footer becomes empty', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(
      await $.attribution.text({ kind: 'pr', text: '🤖 Generated with Claude Code' }),
    ).toEqual({ text: '' })
  })

  test('the remedy sentence passes through untouched', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(await $.attribution.text({ kind: 'remedy', text: 'Add the trailer.' })).toEqual({
      text: 'Add the trailer.',
    })
  })
})
```

- [ ] **Step 6: Run tests, typecheck and strict validate**

Run: `claude plugin test plugins/no-attribution && pnpm typecheck && claude plugin validate plugins/no-attribution --strict`
Expected: all tests PASS; typecheck clean; validate prints `hooks: attribution.text`, no `calls:` line, and passes.

- [ ] **Step 7: Verify in a real session**

```bash
mkdir -p /tmp/attr-check && cd /tmp/attr-check && git init -q && echo hi > a.txt
claude --plugin-dir "$OLDPWD/plugins/no-attribution" -p "Commit a.txt with the message 'add a'" --allowedTools "Bash(git add:*) Bash(git commit:*)"
git log -1 --format=%B
cd "$OLDPWD"
```
Expected: the commit message is `add a` with **no** `Co-Authored-By` line and no trailing blank line. If a blank line remains, record it in `plugins/no-attribution/README.md` under "Known behavior".

- [ ] **Step 8: README, marketplace entry, table row**

`plugins/no-attribution/README.md`:
````markdown
# No Attribution

Removes Claude's `Co-Authored-By` commit trailer and "Generated with Claude Code" PR footer — or swaps in your own text. Unlike a CLAUDE.md rule, this is deterministic: the text is changed where Claude Code composes it.

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install no-attribution@claudemodz-mods
```

## Options (`/config`)
- **Commit trailer** — text to use instead of the trailer (default: nothing)
- **Pull request footer** — text to use instead of the footer (default: nothing)

## What it can do
Hooks `attribution.text`. Makes no API calls: it cannot read files, run commands or use the network.
````
Add to `.claude-plugin/marketplace.json` `plugins`:
```json
{
  "name": "no-attribution",
  "source": "./plugins/no-attribution",
  "description": "Removes the Co-Authored-By trailer and PR footer, or replaces them with your text.",
  "category": "git-ci",
  "tags": ["git", "attribution"]
}
```
Add to the root README table: `| [no-attribution](plugins/no-attribution) | Removes Claude's commit trailer and PR footer, or replaces them with your text |`

- [ ] **Step 9: Full check and commit**

Run: `pnpm check`
Expected: PASS (the marketplace now has a plugin, so strict validate passes).
```bash
git add -A
git commit -m "feat(no-attribution): replace commit trailer and PR footer"
```

---

### Task 4: `model-router` routing logic

**Files:**
- Create: `plugins/model-router/hooks/routing.ts`, `plugins/model-router/tests/routing.test.ts`

**Interfaces:**
- Produces (all from `hooks/routing.ts`):
  - `type Preset = 'off' | 'fast' | 'smart'`
  - `type PresetModels = { readonly fast: string; readonly smart: string }`
  - `type SpawnFacts = { readonly subagentType: string; readonly model?: string; readonly fork: boolean }`
  - `parseModelMap(spec: string): ReadonlyMap<string, string>`
  - `routedModel(spawn: SpawnFacts, map: ReadonlyMap<string, string>): string | undefined`
  - `parsePreset(args: string): Preset | 'status' | 'invalid'`
  - `presetModel(preset: Preset, models: PresetModels): string | undefined`
  - `statusText(preset: Preset, models: PresetModels, routed: ReadonlyMap<string, number>): string`

- [ ] **Step 1: Write the failing tests**

`plugins/model-router/tests/routing.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  parseModelMap,
  parsePreset,
  presetModel,
  routedModel,
  statusText,
} from '../hooks/routing.js'

const MODELS = { fast: 'sonnet', smart: 'opus' }

describe('parseModelMap', () => {
  test('reads comma-separated type=model pairs, trimming spaces', async () => {
    expect([...parseModelMap('Explore=haiku, general-purpose = sonnet')]).toEqual([
      ['Explore', 'haiku'],
      ['general-purpose', 'sonnet'],
    ])
  })

  test('skips malformed pairs and empty input', async () => {
    expect([...parseModelMap('Explore=, =haiku, nonsense, Plan=sonnet')]).toEqual([['Plan', 'sonnet']])
    expect(parseModelMap('').size).toBe(0)
  })
})

describe('routedModel', () => {
  const map = parseModelMap('Explore=haiku')

  test('routes a mapped type with no explicit model', async () => {
    expect(routedModel({ subagentType: 'Explore', fork: false }, map)).toBe('haiku')
  })

  test('keeps an explicit model', async () => {
    expect(routedModel({ subagentType: 'Explore', model: 'opus', fork: false }, map)).toBeUndefined()
  })

  test('never touches a fork', async () => {
    expect(routedModel({ subagentType: 'Explore', fork: true }, map)).toBeUndefined()
  })

  test('leaves unmapped types alone', async () => {
    expect(routedModel({ subagentType: 'general-purpose', fork: false }, map)).toBeUndefined()
  })
})

describe('presets', () => {
  test('parsePreset reads the command argument', async () => {
    expect(parsePreset('')).toBe('status')
    expect(parsePreset(' FAST ')).toBe('fast')
    expect(parsePreset('smart')).toBe('smart')
    expect(parsePreset('off')).toBe('off')
    expect(parsePreset('turbo')).toBe('invalid')
  })

  test('presetModel maps a preset to its model', async () => {
    expect(presetModel('off', MODELS)).toBeUndefined()
    expect(presetModel('fast', MODELS)).toBe('sonnet')
    expect(presetModel('smart', MODELS)).toBe('opus')
  })

  test('statusText summarizes preset and routing counts', async () => {
    expect(statusText('off', MODELS, new Map())).toBe(
      'main session: unchanged · subagents routed: none yet',
    )
    expect(statusText('fast', MODELS, new Map([['Explore', 3]]))).toBe(
      'main session: fast (sonnet) · subagents routed: Explore ×3',
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `claude plugin test plugins/model-router`
Expected: FAIL — `../hooks/routing.js` not found.

- [ ] **Step 3: Implement `hooks/routing.ts`**

```ts
export type Preset = 'off' | 'fast' | 'smart'

export type PresetModels = { readonly fast: string; readonly smart: string }

export type SpawnFacts = {
  readonly subagentType: string
  readonly model?: string
  readonly fork: boolean
}

/** `Explore=haiku,Plan=sonnet` → Map { Explore → haiku, Plan → sonnet }. */
export function parseModelMap(spec: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const pair of spec.split(',')) {
    const [agent, model] = pair.split('=').map(part => part.trim())
    if (agent && model) map.set(agent, model)
  }
  return map
}

/** The model to give a subagent, or undefined to leave the spawn as it is. */
export function routedModel(
  spawn: SpawnFacts,
  map: ReadonlyMap<string, string>,
): string | undefined {
  if (spawn.fork || spawn.model !== undefined) return undefined
  return map.get(spawn.subagentType)
}

export function parsePreset(args: string): Preset | 'status' | 'invalid' {
  const word = args.trim().toLowerCase()
  if (word === '') return 'status'
  if (word === 'off' || word === 'fast' || word === 'smart') return word
  return 'invalid'
}

export function presetModel(preset: Preset, models: PresetModels): string | undefined {
  return preset === 'off' ? undefined : models[preset]
}

export function statusText(
  preset: Preset,
  models: PresetModels,
  routed: ReadonlyMap<string, number>,
): string {
  const main = preset === 'off' ? 'main session: unchanged' : `main session: ${preset} (${models[preset]})`
  const counts = [...routed].map(([type, n]) => `${type} ×${n}`).join(', ')
  return `${main} · subagents routed: ${counts || 'none yet'}`
}
```

- [ ] **Step 4: Run to verify pass**

Run: `claude plugin test plugins/model-router`
Expected: routing tests PASS. (The plugin has no manifest yet; if the runner refuses to load a directory without `.claude-plugin/plugin.json`, do Task 5 Step 1 first, then rerun.)

- [ ] **Step 5: Commit**

```bash
git add plugins/model-router/hooks/routing.ts plugins/model-router/tests/routing.test.ts
git commit -m "feat(model-router): routing and preset logic"
```

---

### Task 5: `model-router` hooks, command and spinner

**Files:**
- Create: `plugins/model-router/.claude-plugin/plugin.json`, `plugins/model-router/hooks/hooks.json`, `plugins/model-router/hooks/register.ts`, `plugins/model-router/tests/register.test.ts`, `plugins/model-router/README.md`
- Modify: `.claude-plugin/marketplace.json`, `README.md`

**Interfaces:**
- Consumes: everything listed as produced in Task 4.
- Produces: command `/router [fast|smart|off]`.

- [ ] **Step 1: Manifest and hooks.json**

`plugins/model-router/.claude-plugin/plugin.json`:
```json
{
  "name": "model-router",
  "displayName": "Model Router",
  "version": "0.1.0",
  "description": "Runs chosen subagent types on cheaper models (Explore on Haiku by default) and adds /router to switch the main session between fast, smart and unchanged. Shows the active model beside the spinner.",
  "author": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "license": "MIT",
  "repository": "https://github.com/claudemodz/mods",
  "keywords": ["models", "cost", "subagents"],
  "userConfig": {
    "subagentModels": {
      "type": "string",
      "title": "Subagent models",
      "description": "Comma-separated agentType=model pairs, e.g. Explore=haiku,Plan=sonnet. A model Claude picks explicitly, and forks, are never changed.",
      "required": false,
      "default": "Explore=haiku"
    },
    "fastModel": {
      "type": "string",
      "title": "Fast preset model",
      "description": "Main-session model for /router fast.",
      "required": false,
      "default": "sonnet"
    },
    "smartModel": {
      "type": "string",
      "title": "Smart preset model",
      "description": "Main-session model for /router smart.",
      "required": false,
      "default": "opus"
    }
  }
}
```
`plugins/model-router/hooks/hooks.json`:
```json
{
  "description": "agent.spawn routes mapped subagent types to configured models; /router sets a main-session preset applied on turn.step; ui.render on Spinner shows the preset's model.",
  "modules": ["./register.ts"]
}
```

- [ ] **Step 2: Write the failing engine tests**

`plugins/model-router/tests/register.test.ts`:
```ts
import type { CommandRunInput, TurnStepResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work' }

function routerCommand(args: string): CommandRunInput {
  return {
    command: 'router',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  }
}

describe('register', () => {
  test('Explore subagents run on haiku by default', async ($, on) => {
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit' }))
    expect(await $.agent.spawn({ prompt: 'find the loader', subagentType: 'Explore' })).toEqual({
      model: 'haiku',
    })
  })

  test('an explicit subagent model is kept', async ($, on) => {
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit' }))
    expect(
      await $.agent.spawn({ prompt: 'find the loader', subagentType: 'Explore', model: 'opus' }),
    ).toEqual({ model: 'opus' })
  })

  test('/router fast reports the preset and main steps use the fast model', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const seen: string[] = []
    on('turn.step', async function* ($, e) {
      seen.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null } as TurnStepResult
    })

    await $.session.start(SESSION)
    expect(await $.command.run(routerCommand('fast'))).toEqual({
      text: 'main session: fast (sonnet) · subagents routed: none yet',
    })

    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 })
    for await (const _chunk of stream) {
      // drain
    }
    await stream.result
    expect(seen).toEqual(['sonnet'])
  })

  test('subagent steps keep their own model under a preset', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const seen: string[] = []
    on('turn.step', async function* ($, e) {
      seen.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null } as TurnStepResult
    })

    await $.session.start(SESSION)
    await $.command.run(routerCommand('smart'))
    const stream = $.turn.step({ turnId: 't2', index: 0, model: 'haiku', messageCount: 1, agentId: 'a1' })
    for await (const _chunk of stream) {
      // drain
    }
    await stream.result
    expect(seen).toEqual(['haiku'])
  })

  test('an unknown argument prints usage', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start(SESSION)
    expect(await $.command.run(routerCommand('turbo'))).toEqual({
      text: 'Usage: /router [fast|smart|off]',
    })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `claude plugin test plugins/model-router`
Expected: register tests FAIL — `hooks/register.ts` does not exist.

- [ ] **Step 4: Implement `hooks/register.ts`**

```ts
import type { On, PluginOptions } from 'claude-code'

import {
  parseModelMap,
  parsePreset,
  presetModel,
  routedModel,
  statusText,
  type Preset,
} from './routing.js'

export function register(on: On, options: PluginOptions): void {
  const map = parseModelMap(String(options.subagentModels ?? ''))
  const models = {
    fast: String(options.fastModel ?? 'sonnet'),
    smart: String(options.smartModel ?? 'opus'),
  }
  const routed = new Map<string, number>()
  let preset: Preset = 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Show model routing, or set the main session to fast, smart or off',
      argumentHint: '[fast|smart|off]',
      immediate: true,
    })
    return next(e)
  })

  on('agent.spawn', ($, e, next) => {
    const model = routedModel(e, map)
    if (model === undefined) return next(e)
    routed.set(e.subagentType, (routed.get(e.subagentType) ?? 0) + 1)
    return next({ ...e, model })
  })

  on('turn.step', async function* ($, e, next) {
    const model = e.agentId === undefined ? presetModel(preset, models) : undefined
    return yield* next(model === undefined ? e : { ...e, model })
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const model = presetModel(preset, models)
    if (model === undefined) return next(e)
    return next({ ...e, props: { ...e.props, suffix: `${e.props.suffix ?? ''} · ${model}` } })
  })

  on('command.run', { command: 'router' }, ($, e) => {
    const choice = parsePreset(e.args)
    if (choice === 'invalid') return { text: 'Usage: /router [fast|smart|off]' }
    if (choice !== 'status') {
      preset = choice
      $.ui.invalidate('ui.render')
    }
    return { text: statusText(preset, models, routed) }
  })
}
```

- [ ] **Step 5: Run tests, typecheck, strict validate**

Run: `claude plugin test plugins/model-router && pnpm typecheck && claude plugin validate plugins/model-router --strict`
Expected: all PASS. Validate lists `hooks: session.start, agent.spawn, turn.step, ui.render, command.run` and `calls: $.command.register, $.ui.invalidate`.

- [ ] **Step 6: Try it live**

Run: `claude --plugin-dir plugins/model-router`, then ask "Use an Explore subagent to find where tests live", then `/router`.
Expected: `/router` shows `subagents routed: Explore ×1`. Then `/router fast` — the spinner shows `· sonnet` on the next turn. `/router off` removes it.

- [ ] **Step 7: README, marketplace entry, table row, commit**

`plugins/model-router/README.md`:
````markdown
# Model Router

Sends routine subagents to cheaper models and lets you switch the main session's model in one command.

- **Subagents:** by default, `Explore` subagents run on Haiku. Configure any `agentType=model` pairs in `/config`. A model Claude chooses explicitly, and forks, are never changed.
- **`/router fast | smart | off`:** sets the main session's model for following requests (defaults: Sonnet / Opus / unchanged). The spinner shows the active preset model.

> Switching the main model mid-conversation restarts the prompt cache, which can cost more for a turn or two. That's why presets are manual, not automatic.

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install model-router@claudemodz-mods
```

## What it can do
Hooks `agent.spawn`, `turn.step`, `ui.render` (spinner), `command.run`, `session.start`. Calls `$.command.register`, `$.ui.invalidate`. It changes which model requests use; it can't read files, run commands or use the network.
````
Marketplace entry:
```json
{
  "name": "model-router",
  "source": "./plugins/model-router",
  "description": "Routes subagents to cheaper models and adds /router presets for the main session.",
  "category": "models-cost",
  "tags": ["models", "cost", "subagents"]
}
```
README row: `| [model-router](plugins/model-router) | Runs Explore subagents on Haiku; /router switches the main model |`
```bash
pnpm check
git add -A
git commit -m "feat(model-router): subagent routing, /router presets, spinner badge"
```

---

### Task 6: `ci-pane` check parsing logic

**Files:**
- Create: `plugins/ci-pane/hooks/checks.ts`, `plugins/ci-pane/tests/fixtures.ts`, `plugins/ci-pane/tests/checks.test.ts`

**Interfaces:**
- Produces (from `hooks/checks.ts`):
  - `type CheckState = 'passed' | 'failed' | 'pending' | 'skipped'`
  - `type Check = { readonly name: string; readonly state: CheckState; readonly url: string | null; readonly runId: string | null }`
  - `type PrStatus = { kind: 'loading' } | { kind: 'no-gh' } | { kind: 'no-pr' } | { kind: 'error'; message: string } | { kind: 'pr'; number: number; title: string; url: string; checks: readonly Check[] }`
  - `type Tally = { readonly passed: number; readonly failed: number; readonly pending: number }`
  - `parsePrView(stdout: string): PrStatus`
  - `errorStatus(exitCode: number, stderr: string): PrStatus`
  - `tally(checks: readonly Check[]): Tally`
  - `summaryLine(status: PrStatus): string`
  - `transitionOf(before: PrStatus, after: PrStatus): 'now-failing' | 'now-passing' | null`
  - `failingRunIds(checks: readonly Check[]): string[]`
- Produces (from `tests/fixtures.ts`): `PR_FAILING: string`, `PR_PASSING: string`, `PR_PENDING: string` (JSON text as `gh pr view --json number,title,url,statusCheckRollup` prints it).

- [ ] **Step 1: Write fixtures**

`plugins/ci-pane/tests/fixtures.ts`:
```ts
const BASE = { number: 42, title: 'Add login rate limiting', url: 'https://github.com/acme/app/pull/42' }

function prJson(statusCheckRollup: readonly object[]): string {
  return JSON.stringify({ ...BASE, statusCheckRollup })
}

const LINT_OK = {
  __typename: 'CheckRun',
  name: 'lint',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
  detailsUrl: 'https://github.com/acme/app/actions/runs/1001/job/1',
}

const TESTS_FAILED = {
  __typename: 'CheckRun',
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'FAILURE',
  detailsUrl: 'https://github.com/acme/app/actions/runs/1002/job/7',
}

const TESTS_OK = { ...TESTS_FAILED, conclusion: 'SUCCESS' }

const TESTS_RUNNING = { ...TESTS_FAILED, status: 'IN_PROGRESS', conclusion: null }

const DEPLOY_PREVIEW = {
  __typename: 'StatusContext',
  context: 'vercel',
  state: 'SUCCESS',
  targetUrl: 'https://vercel.com/acme/app/xyz',
}

export const PR_FAILING = prJson([LINT_OK, TESTS_FAILED, DEPLOY_PREVIEW])
export const PR_PASSING = prJson([LINT_OK, TESTS_OK, DEPLOY_PREVIEW])
export const PR_PENDING = prJson([LINT_OK, TESTS_RUNNING])
```

- [ ] **Step 2: Write the failing tests**

`plugins/ci-pane/tests/checks.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  errorStatus,
  failingRunIds,
  parsePrView,
  summaryLine,
  tally,
  transitionOf,
  type PrStatus,
} from '../hooks/checks.js'
import { PR_FAILING, PR_PASSING, PR_PENDING } from './fixtures.js'

describe('parsePrView', () => {
  test('reads check runs and status contexts', async () => {
    const status = parsePrView(PR_FAILING)
    expect(status.kind).toBe('pr')
    if (status.kind !== 'pr') return
    expect(status.number).toBe(42)
    expect(status.checks.map(c => [c.name, c.state, c.runId])).toEqual([
      ['lint', 'passed', '1001'],
      ['test', 'failed', '1002'],
      ['vercel', 'passed', null],
    ])
  })

  test('in-progress runs are pending', async () => {
    const status = parsePrView(PR_PENDING)
    expect(status.kind === 'pr' && tally(status.checks)).toEqual({ passed: 1, failed: 0, pending: 1 })
  })

  test('non-JSON output is an error, not a crash', async () => {
    expect(parsePrView('<html>')).toEqual({ kind: 'error', message: 'gh returned output that is not JSON' })
  })

  test('a PR with no checks has an empty list', async () => {
    const status = parsePrView(JSON.stringify({ number: 7, title: 't', url: 'u', statusCheckRollup: [] }))
    expect(status.kind === 'pr' && status.checks).toEqual([])
  })
})

describe('errorStatus', () => {
  test('no PR for the branch is its own state', async () => {
    expect(errorStatus(1, 'no pull requests found for branch "feature/x"\n')).toEqual({ kind: 'no-pr' })
  })

  test('outside a git repository counts as no PR', async () => {
    expect(errorStatus(1, 'fatal: not a git repository (or any of the parent directories): .git')).toEqual({
      kind: 'no-pr',
    })
  })

  test('other failures keep the first stderr line', async () => {
    expect(errorStatus(4, 'HTTP 502: Bad Gateway\nretry later')).toEqual({ kind: 'error', message: 'HTTP 502: Bad Gateway' })
    expect(errorStatus(4, '')).toEqual({ kind: 'error', message: 'gh exited with 4' })
  })
})

describe('summaryLine', () => {
  test('describes each state', async () => {
    expect(summaryLine({ kind: 'loading' })).toBe('CI: checking…')
    expect(summaryLine({ kind: 'no-gh' })).toBe('CI: install and sign in to the GitHub CLI (gh) to see checks.')
    expect(summaryLine({ kind: 'no-pr' })).toBe('CI: no pull request for this branch.')
    expect(summaryLine({ kind: 'error', message: 'HTTP 502' })).toBe('CI: HTTP 502')
    expect(summaryLine(parsePrView(PR_FAILING))).toBe('CI #42: 1 failing · 0 pending · 2 passing')
  })
})

describe('transitionOf', () => {
  const failing = parsePrView(PR_FAILING)
  const passing = parsePrView(PR_PASSING)
  const pending = parsePrView(PR_PENDING)
  const loading: PrStatus = { kind: 'loading' }

  test('first failure is announced', async () => {
    expect(transitionOf(loading, failing)).toBe('now-failing')
    expect(transitionOf(pending, failing)).toBe('now-failing')
  })

  test('still failing is not announced again', async () => {
    expect(transitionOf(failing, failing)).toBeNull()
  })

  test('finishing green after failing or pending is announced', async () => {
    expect(transitionOf(failing, passing)).toBe('now-passing')
    expect(transitionOf(pending, passing)).toBe('now-passing')
  })

  test('passing to passing, and anything to no-pr, is quiet', async () => {
    expect(transitionOf(passing, passing)).toBeNull()
    expect(transitionOf(failing, { kind: 'no-pr' })).toBeNull()
  })
})

describe('failingRunIds', () => {
  test('lists each failing workflow run once', async () => {
    const status = parsePrView(PR_FAILING)
    expect(status.kind === 'pr' && failingRunIds(status.checks)).toEqual(['1002'])
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `claude plugin test plugins/ci-pane`
Expected: FAIL — `../hooks/checks.js` not found.

- [ ] **Step 4: Implement `hooks/checks.ts`**

```ts
export type CheckState = 'passed' | 'failed' | 'pending' | 'skipped'

export type Check = {
  readonly name: string
  readonly state: CheckState
  readonly url: string | null
  readonly runId: string | null
}

export type PrStatus =
  | { kind: 'loading' }
  | { kind: 'no-gh' }
  | { kind: 'no-pr' }
  | { kind: 'error'; message: string }
  | { kind: 'pr'; number: number; title: string; url: string; checks: readonly Check[] }

export type Tally = { readonly passed: number; readonly failed: number; readonly pending: number }

type RollupItem = {
  readonly __typename?: string
  readonly name?: string
  readonly context?: string
  readonly status?: string
  readonly conclusion?: string | null
  readonly state?: string
  readonly detailsUrl?: string
  readonly targetUrl?: string
}

const SHAPE_ERROR: PrStatus = { kind: 'error', message: 'gh returned an unexpected shape' }

/** Parses `gh pr view --json number,title,url,statusCheckRollup` output. */
export function parsePrView(stdout: string): PrStatus {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return { kind: 'error', message: 'gh returned output that is not JSON' }
  }
  if (typeof data !== 'object' || data === null) return SHAPE_ERROR
  const pr = data as { number?: unknown; title?: unknown; url?: unknown; statusCheckRollup?: unknown }
  if (typeof pr.number !== 'number' || typeof pr.url !== 'string') return SHAPE_ERROR
  const items = Array.isArray(pr.statusCheckRollup) ? (pr.statusCheckRollup as RollupItem[]) : []
  return {
    kind: 'pr',
    number: pr.number,
    title: typeof pr.title === 'string' ? pr.title : '',
    url: pr.url,
    checks: items.map(checkOf),
  }
}

function checkOf(item: RollupItem): Check {
  const url = item.detailsUrl ?? item.targetUrl ?? null
  return { name: item.name ?? item.context ?? 'check', state: stateOf(item), url, runId: runIdOf(url) }
}

function stateOf(item: RollupItem): CheckState {
  if (item.__typename === 'StatusContext') {
    const state = (item.state ?? '').toUpperCase()
    if (state === 'SUCCESS') return 'passed'
    if (state === 'FAILURE' || state === 'ERROR') return 'failed'
    return 'pending'
  }
  if ((item.status ?? '').toUpperCase() !== 'COMPLETED') return 'pending'
  const conclusion = (item.conclusion ?? '').toUpperCase()
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') return 'passed'
  if (conclusion === 'SKIPPED') return 'skipped'
  return 'failed'
}

function runIdOf(url: string | null): string | null {
  return url?.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null
}

/** The state for a `gh pr view` that exited non-zero. */
export function errorStatus(exitCode: number, stderr: string): PrStatus {
  if (/no pull requests found/i.test(stderr) || /not a git repository/i.test(stderr)) {
    return { kind: 'no-pr' }
  }
  const first = stderr.trim().split('\n')[0] ?? ''
  return { kind: 'error', message: first || `gh exited with ${exitCode}` }
}

export function tally(checks: readonly Check[]): Tally {
  return {
    passed: checks.filter(c => c.state === 'passed').length,
    failed: checks.filter(c => c.state === 'failed').length,
    pending: checks.filter(c => c.state === 'pending').length,
  }
}

export function summaryLine(status: PrStatus): string {
  switch (status.kind) {
    case 'loading':
      return 'CI: checking…'
    case 'no-gh':
      return 'CI: install and sign in to the GitHub CLI (gh) to see checks.'
    case 'no-pr':
      return 'CI: no pull request for this branch.'
    case 'error':
      return `CI: ${status.message}`
    case 'pr': {
      if (status.checks.length === 0) return `CI #${status.number}: no checks reported`
      const t = tally(status.checks)
      return `CI #${status.number}: ${t.failed} failing · ${t.pending} pending · ${t.passed} passing`
    }
  }
}

/** Whether moving from `before` to `after` deserves a toast. */
export function transitionOf(before: PrStatus, after: PrStatus): 'now-failing' | 'now-passing' | null {
  if (after.kind !== 'pr') return null
  const now = tally(after.checks)
  const was = before.kind === 'pr' ? tally(before.checks) : null
  if (now.failed > 0) return was === null || was.failed === 0 ? 'now-failing' : null
  const isGreen = now.pending === 0 && now.passed > 0
  return isGreen && was !== null && (was.failed > 0 || was.pending > 0) ? 'now-passing' : null
}

export function failingRunIds(checks: readonly Check[]): string[] {
  const ids = checks.filter(c => c.state === 'failed' && c.runId !== null).map(c => c.runId as string)
  return [...new Set(ids)]
}
```

- [ ] **Step 5: Run to verify pass**

Run: `claude plugin test plugins/ci-pane`
Expected: all `checks` tests PASS. (If the runner needs a manifest first, do Task 7 Step 1, then rerun.)

- [ ] **Step 6: Commit**

```bash
git add plugins/ci-pane/hooks/checks.ts plugins/ci-pane/tests/fixtures.ts plugins/ci-pane/tests/checks.test.ts
git commit -m "feat(ci-pane): parse gh PR checks and summarize transitions"
```

---

### Task 7: `ci-pane` hooks, `/ci` command and pane

**Files:**
- Create: `plugins/ci-pane/.claude-plugin/plugin.json`, `plugins/ci-pane/hooks/hooks.json`, `plugins/ci-pane/hooks/register.ts`, `plugins/ci-pane/hooks/view.tsx`, `plugins/ci-pane/tests/text-of.ts`, `plugins/ci-pane/tests/register.test.ts`, `plugins/ci-pane/README.md`
- Modify: `.claude-plugin/marketplace.json`, `README.md`

**Interfaces:**
- Consumes: `PrStatus`, `parsePrView`, `errorStatus`, `summaryLine`, `tally`, `transitionOf`, `failingRunIds` (Task 6); `PR_FAILING`, `PR_PASSING` (Task 6 fixtures).
- Produces: `PANE_ID = 'ci'` (exported from `register.ts`); `paneView(ui: Kit, status: PrStatus, note: string, actions: PaneActions): ReturnType<typeof h>` from `view.tsx`, with `type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'>` and `type PaneActions = { readonly refresh: () => void; readonly rerun: () => void }`; command `/ci [rerun]`; `textOf(tree: unknown): string` from `tests/text-of.ts`.

- [ ] **Step 1: Manifest and hooks.json**

`plugins/ci-pane/.claude-plugin/plugin.json`:
```json
{
  "name": "ci-pane",
  "displayName": "CI Pane",
  "version": "0.1.0",
  "description": "Live pull request checks beside the transcript: pass/fail per check, re-run failed jobs, open the PR. A status line appears only while something is failing. Uses the GitHub CLI.",
  "author": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "license": "MIT",
  "repository": "https://github.com/claudemodz/mods",
  "keywords": ["github", "ci", "pull-requests", "pane"],
  "userConfig": {
    "pollSeconds": {
      "type": "number",
      "title": "Refresh interval (seconds)",
      "description": "How often to ask GitHub for check status. Minimum 10.",
      "required": false,
      "default": 30
    }
  }
}
```
`plugins/ci-pane/hooks/hooks.json`:
```json
{
  "description": "session.start registers /ci and polls `gh pr view` on a timer; ui.render draws the CI pane; command.run opens it or re-runs failed jobs.",
  "modules": ["./register.ts"]
}
```

- [ ] **Step 2: Write the tree-text helper and failing engine tests**

`plugins/ci-pane/tests/text-of.ts`:
```ts
/** All visible text in a render tree: strings, plus Button/Link labels. */
export function textOf(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (typeof tree !== 'object' || tree === null) return ''
  const props: unknown = Reflect.get(tree, 'props')
  const label = typeof props === 'object' && props !== null ? Reflect.get(props, 'label') : undefined
  return `${typeof label === 'string' ? label : ''}${textOf(Reflect.get(tree, 'children') ?? [])}`
}
```
`plugins/ci-pane/tests/register.test.ts`:
```ts
import type { CommandRunInput, On, RenderInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { PR_FAILING, PR_PASSING } from './fixtures.js'
import { textOf } from './text-of.js'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work' }

function ciCommand(args = ''): CommandRunInput {
  return { command: 'ci', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } }
}

const PANE: RenderInput<'Pane'> = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'ci',
  viewport: { columns: 160, rows: 40 },
  props: {
    title: 'CI',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
}

type World = {
  stdout: string
  exitCode: number
  stderr: string
  isGhMissing: boolean
  runs: string[][]
  toasts: string[]
  statuses: (string | undefined)[]
  opened: string[]
}

/** Stubs gh, the toast/status/pane calls and the clock; mutate the returned world to change what gh answers. */
function worldOf(on: On): World & { clock: ReturnType<typeof mock.clock> } {
  const world: World = {
    stdout: PR_PASSING,
    exitCode: 0,
    stderr: '',
    isGhMissing: false,
    runs: [],
    toasts: [],
    statuses: [],
    opened: [],
  }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    world.runs.push([...e.argv])
    if (world.isGhMissing) return { deny: 'spawn gh ENOENT' }
    const isView = e.argv[1] === 'pr'
    return {
      value: { exitCode: isView ? world.exitCode : 0, stdout: isView ? world.stdout : '', stderr: world.stderr },
    }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.id)
    return { value: undefined }
  })
  return Object.assign(world, { clock: mock.clock(on) })
}

describe('register', () => {
  test('/ci opens the pane and answers with the summary', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await world.clock.settle()

    expect(await $.command.run(ciCommand())).toEqual({ text: 'CI #42: 0 failing · 0 pending · 3 passing' })
    expect(world.opened).toEqual(['ci'])
  })

  test('the pane lists checks with the PR link and actions', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    const drawn = textOf(await $.ui.render(PANE))
    expect(drawn).toContain('#42 Add login rate limiting')
    expect(drawn).toContain('✗ test')
    expect(drawn).toContain('✓ lint')
    expect(drawn).toContain('Refresh')
    expect(drawn).toContain('Re-run failed')
  })

  test('a new failure toasts once and sets the status line', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await world.clock.settle()

    world.stdout = PR_FAILING
    await world.clock.advance(30_000)
    await world.clock.advance(30_000)

    expect(world.toasts).toEqual(['CI #42: 1 failing · 0 pending · 2 passing'])
    expect(world.statuses.at(-1)).toBe('CI #42: 1 failing · 0 pending · 2 passing · /ci')
  })

  test('/ci rerun re-runs each failing workflow run', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    await $.command.run(ciCommand('rerun'))
    expect(world.runs).toContainEqual(['gh', 'run', 'rerun', '1002', '--failed'])
  })

  test('missing gh shows one calm state and never toasts', async ($, on) => {
    const world = worldOf(on)
    world.isGhMissing = true
    await $.session.start(SESSION)
    await world.clock.settle()
    await world.clock.advance(90_000)

    expect(await $.command.run(ciCommand())).toEqual({
      text: 'CI: install and sign in to the GitHub CLI (gh) to see checks.',
    })
    expect(world.toasts).toEqual([])
  })
})
```
- [ ] **Step 3: Run to verify failure**

Run: `claude plugin test plugins/ci-pane`
Expected: register tests FAIL — no `hooks/register.ts`.

- [ ] **Step 4: Implement `hooks/view.tsx`**

```tsx
import type { Elements } from 'claude-code'

import { summaryLine, type Check, type PrStatus } from './checks.js'

export type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'>

export type PaneActions = { readonly refresh: () => void; readonly rerun: () => void }

const MARK: Record<Check['state'], { glyph: string; color: string }> = {
  passed: { glyph: '✓', color: 'green' },
  failed: { glyph: '✗', color: 'red' },
  pending: { glyph: '•', color: 'yellow' },
  skipped: { glyph: '–', color: 'gray' },
}

export function paneView(ui: Kit, status: PrStatus, note: string, actions: PaneActions): ReturnType<typeof h> {
  const { Box, Text, Button, Link } = ui
  if (status.kind !== 'pr') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{summaryLine(status)}</Text>
        <Button key="refresh" label="Refresh" onPress={actions.refresh} />
      </Box>
    )
  }
  const hasFailures = status.checks.some(c => c.state === 'failed')
  return (
    <Box flexDirection="column" gap={1}>
      <Link href={status.url} label={`#${status.number} ${status.title}`} />
      <Text dimColor>{summaryLine(status)}</Text>
      <Box flexDirection="column">
        {status.checks.map(check => (
          <Text key={check.name} color={MARK[check.state].color}>
            {`${MARK[check.state].glyph} ${check.name}`}
          </Text>
        ))}
      </Box>
      <Box gap={2}>
        <Button key="refresh" label="Refresh" onPress={actions.refresh} />
        {hasFailures ? <Button key="rerun" label="Re-run failed" onPress={actions.rerun} /> : null}
      </Box>
      {note ? <Text dimColor>{note}</Text> : null}
    </Box>
  )
}
```

- [ ] **Step 5: Implement `hooks/register.ts`**

```ts
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  errorStatus,
  failingRunIds,
  parsePrView,
  summaryLine,
  tally,
  transitionOf,
  type PrStatus,
} from './checks.js'
import { paneView } from './view.js'

export const PANE_ID = 'ci'

const PR_FIELDS = 'number,title,url,statusCheckRollup'

export function register(on: On, options: PluginOptions): void {
  const pollMs = Math.max(10, Number(options.pollSeconds ?? 30)) * 1000
  let status: PrStatus = { kind: 'loading' }
  let note = ''

  async function refresh($: EngineInterface): Promise<void> {
    const next = await fetchStatus($)
    const transition = transitionOf(status, next)
    status = next
    if (transition === 'now-failing') $.ui.toast(summaryLine(status))
    if (transition === 'now-passing' && status.kind === 'pr') $.ui.toast(`CI #${status.number}: all checks passed`)
    const isFailing = status.kind === 'pr' && tally(status.checks).failed > 0
    $.ui.status(isFailing ? `${summaryLine(status)} · /ci` : undefined)
    $.ui.invalidate('ui.render')
  }

  async function rerunFailed($: EngineInterface): Promise<void> {
    const ids = status.kind === 'pr' ? failingRunIds(status.checks) : []
    for (const id of ids) {
      await $.process.run(['gh', 'run', 'rerun', id, '--failed'], { timeoutMs: 30_000 }).catch(() => undefined)
    }
    note = ids.length > 0 ? `Re-ran ${ids.length} workflow run${ids.length === 1 ? '' : 's'}.` : 'Nothing to re-run.'
    await refresh($)
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ci',
      description: "Show CI checks for this branch's pull request (/ci rerun re-runs failed jobs)",
      argumentHint: '[rerun]',
      immediate: true,
    })
    void refresh($).catch(() => undefined)
    $.clock.every(pollMs, () => {
      void refresh($).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'ci' }, async ($, e) => {
    if (e.args.trim() === 'rerun') {
      await rerunFailed($)
      return { text: note }
    }
    await refresh($)
    await $.ui.open({ id: PANE_ID, title: 'CI' })
    return { text: summaryLine(status) }
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    return paneView($.ui.resolve(e), status, note, {
      refresh: () => void refresh($).catch(() => undefined),
      rerun: () => void rerunFailed($).catch(() => undefined),
    })
  })
}

async function fetchStatus($: EngineInterface): Promise<PrStatus> {
  try {
    const run = await $.process.run(['gh', 'pr', 'view', '--json', PR_FIELDS], { timeoutMs: 15_000 })
    return run.exitCode === 0 ? parsePrView(run.stdout) : errorStatus(run.exitCode, run.stderr)
  } catch {
    return { kind: 'no-gh' }
  }
}
```

- [ ] **Step 6: Run tests, typecheck, strict validate**

Run: `claude plugin test plugins/ci-pane && pnpm typecheck && claude plugin validate plugins/ci-pane --strict`
Expected: all PASS. Validate lists `calls:` including `$.process.run`, `$.clock.every`, `$.ui.open`, `$.ui.toast`, `$.ui.status`, `$.ui.invalidate`, `$.command.register`.

- [ ] **Step 7: Try it live on a branch with an open PR**

Run: `claude --plugin-dir plugins/ci-pane` in a repo whose current branch has a PR, then `/ci`.
Expected: the pane docks beside the transcript (terminal ≥ 144 columns) with checks listed; `/ci rerun` on a failing PR starts a re-run (visible in `gh run list`). In a branch without a PR, `/ci` prints `CI: no pull request for this branch.`

- [ ] **Step 8: README, marketplace entry, table row, commit**

`plugins/ci-pane/README.md`:
````markdown
# CI Pane

Your pull request's checks, live, beside the transcript.

- `/ci` opens the pane: every check with ✓/✗/•, a link to the PR, **Refresh** and **Re-run failed** buttons.
- A status line appears under the prompt only while something is failing, and you get a toast when checks start failing or all pass.
- `/ci rerun` re-runs failed jobs from anywhere, including surfaces that don't draw panes.

Requires the [GitHub CLI](https://cli.github.com) signed in (`gh auth login`).

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install ci-pane@claudemodz-mods
```

## Options (`/config`)
- **Refresh interval** — seconds between checks (default 30, minimum 10)

## What it can do
Runs `gh pr view` and `gh run rerun` (`$.process.run`), polls on a timer, and draws a pane, toasts and a status line. It does not read or write files or make other network calls.
````
Marketplace entry:
```json
{
  "name": "ci-pane",
  "source": "./plugins/ci-pane",
  "description": "Live PR checks beside the transcript, with re-run and open buttons.",
  "category": "git-ci",
  "tags": ["github", "ci", "pane"]
}
```
README row: `| [ci-pane](plugins/ci-pane) | Live PR checks in a pane, with re-run failed and a failing-only status line |`
```bash
pnpm check
git add -A
git commit -m "feat(ci-pane): live PR checks pane and /ci command"
```

---

### Task 8: `standup` record logic

**Files:**
- Create: `plugins/standup/hooks/records.ts`, `plugins/standup/tests/records.test.ts`

**Interfaces:**
- Produces (from `hooks/records.ts`):
  - `type WorkRecord = { readonly at: number; readonly repo: string; readonly branch: string; readonly prompt: string; readonly files: readonly string[] }`
  - `type Range = 'today' | 'yesterday' | 'week'`
  - `STANDUP_SYSTEM: string`
  - `isRange(value: string): value is Range`
  - `readRecords(stored: unknown): WorkRecord[]`
  - `addRecord(records: readonly WorkRecord[], record: WorkRecord, retentionDays: number): WorkRecord[]`
  - `recordsIn(records: readonly WorkRecord[], range: Range, now: number): WorkRecord[]`
  - `branchFromHead(head: string): string`
  - `baseName(path: string): string`
  - `relativeTo(path: string, root: string): string`
  - `standupPrompt(records: readonly WorkRecord[], range: Range): string`

- [ ] **Step 1: Write the failing tests**

`plugins/standup/tests/records.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import {
  addRecord,
  baseName,
  branchFromHead,
  isRange,
  readRecords,
  recordsIn,
  relativeTo,
  standupPrompt,
  type WorkRecord,
} from '../hooks/records.js'

// Local-time instants, so day boundaries hold in any timezone.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime()

function record(day: number, hour: number, prompt = 'work'): WorkRecord {
  return { at: at(day, hour), repo: 'app', branch: 'main', prompt, files: [] }
}

describe('readRecords', () => {
  test('keeps valid records', async () => {
    expect(readRecords([record(3, 9)])).toEqual([record(3, 9)])
  })

  test('treats non-arrays and malformed entries as absent', async () => {
    expect(readRecords(undefined)).toEqual([])
    expect(readRecords({ records: [] })).toEqual([])
    expect(readRecords([record(3, 9), { at: 'yesterday' }, null, 7])).toEqual([record(3, 9)])
  })
})

describe('addRecord', () => {
  test('appends and drops records older than the retention window', async () => {
    const old = record(1, 9)
    const recent = record(10, 9)
    expect(addRecord([old, recent], record(16, 9), 14)).toEqual([recent, record(16, 9)])
  })
})

describe('recordsIn', () => {
  const all = [record(1, 9), record(2, 10), record(2, 23), record(3, 8)]
  const now = at(3, 12)

  test('today, yesterday and week use local day boundaries', async () => {
    expect(recordsIn(all, 'today', now)).toEqual([record(3, 8)])
    expect(recordsIn(all, 'yesterday', now)).toEqual([record(2, 10), record(2, 23)])
    expect(recordsIn(all, 'week', now)).toEqual(all)
  })

  test('isRange accepts only the three ranges', async () => {
    expect(['today', 'yesterday', 'week', 'month'].map(isRange)).toEqual([true, true, true, false])
  })
})

describe('branchFromHead', () => {
  test('reads a branch ref', async () => {
    expect(branchFromHead('ref: refs/heads/feature/login\n')).toBe('feature/login')
  })

  test('a bare sha is detached; anything else is unknown', async () => {
    expect(branchFromHead('3f2a1c9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39\n')).toBe('detached')
    expect(branchFromHead('')).toBe('unknown')
  })
})

describe('paths', () => {
  test('baseName and relativeTo', async () => {
    expect(baseName('/work/app/')).toBe('app')
    expect(relativeTo('/work/app/src/a.ts', '/work/app')).toBe('src/a.ts')
    expect(relativeTo('/elsewhere/b.ts', '/work/app')).toBe('/elsewhere/b.ts')
  })
})

describe('standupPrompt', () => {
  test('groups records by repo and branch with times and files', async () => {
    const records: WorkRecord[] = [
      { at: at(3, 9), repo: 'app', branch: 'feature/login', prompt: 'Add rate limiting', files: ['src/login.ts'] },
      { at: at(3, 11), repo: 'docs', branch: 'main', prompt: 'Fix typo', files: [] },
    ]
    const text = standupPrompt(records, 'today')
    expect(text).toContain('Work log for today')
    expect(text).toContain('## app (feature/login)')
    expect(text).toContain('09:00 Add rate limiting — files: src/login.ts')
    expect(text).toContain('## docs (main)')
    expect(text).toContain('11:00 Fix typo')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `claude plugin test plugins/standup`
Expected: FAIL — `../hooks/records.js` not found.

- [ ] **Step 3: Implement `hooks/records.ts`**

```ts
export type WorkRecord = {
  readonly at: number
  readonly repo: string
  readonly branch: string
  readonly prompt: string
  readonly files: readonly string[]
}

export type Range = 'today' | 'yesterday' | 'week'

const DAY_MS = 86_400_000
const MAX_RECORDS = 3000

export const STANDUP_SYSTEM =
  'You write short standup updates for a software engineer from their work log. ' +
  'Use only what the log shows; never invent work. Output markdown with a "Done" section ' +
  'grouped by repository, at most 8 bullets in total, each a plain past-tense phrase. ' +
  'Merge log lines that describe the same piece of work.'

export function isRange(value: string): value is Range {
  return value === 'today' || value === 'yesterday' || value === 'week'
}

export function readRecords(stored: unknown): WorkRecord[] {
  return Array.isArray(stored) ? stored.filter(isWorkRecord) : []
}

function isWorkRecord(value: unknown): value is WorkRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.at === 'number' &&
    typeof r.repo === 'string' &&
    typeof r.branch === 'string' &&
    typeof r.prompt === 'string' &&
    Array.isArray(r.files) &&
    r.files.every(f => typeof f === 'string')
  )
}

export function addRecord(
  records: readonly WorkRecord[],
  record: WorkRecord,
  retentionDays: number,
): WorkRecord[] {
  const cutoff = record.at - retentionDays * DAY_MS
  return [...records.filter(r => r.at >= cutoff), record].slice(-MAX_RECORDS)
}

function startOfDay(ms: number): number {
  const day = new Date(ms)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

export function recordsIn(records: readonly WorkRecord[], range: Range, now: number): WorkRecord[] {
  const today = startOfDay(now)
  const from = range === 'today' ? today : range === 'yesterday' ? startOfDay(today - 1) : startOfDay(today - 6 * DAY_MS)
  const to = range === 'yesterday' ? today : Number.POSITIVE_INFINITY
  return records.filter(r => r.at >= from && r.at < to)
}

export function branchFromHead(head: string): string {
  const ref = head.match(/^ref: refs\/heads\/(.+)$/m)?.[1]?.trim()
  if (ref) return ref
  return /^[0-9a-f]{40}\s*$/.test(head) ? 'detached' : 'unknown'
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

export function relativeTo(path: string, root: string): string {
  const prefix = root.replace(/\/+$/, '') + '/'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function standupPrompt(records: readonly WorkRecord[], range: Range): string {
  const groups = new Map<string, WorkRecord[]>()
  for (const r of records) {
    const key = `${r.repo} (${r.branch})`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const sections = [...groups].map(([key, items]) => {
    const lines = items.map(r => {
      const files = r.files.length > 0 ? ` — files: ${r.files.join(', ')}` : ''
      return `- ${clockTime(r.at)} ${r.prompt}${files}`
    })
    return `## ${key}\n${lines.join('\n')}`
  })
  return `Work log for ${range}:\n\n${sections.join('\n\n')}\n\nWrite my standup update.`
}
```

- [ ] **Step 4: Run to verify pass**

Run: `claude plugin test plugins/standup`
Expected: all `records` tests PASS. (If the runner needs a manifest first, do Task 9 Step 1, then rerun.)

- [ ] **Step 5: Commit**

```bash
git add plugins/standup/hooks/records.ts plugins/standup/tests/records.test.ts
git commit -m "feat(standup): work-log records, ranges and prompt"
```

---

### Task 9: `standup` hooks and `/standup` command

**Files:**
- Create: `plugins/standup/.claude-plugin/plugin.json`, `plugins/standup/hooks/hooks.json`, `plugins/standup/hooks/register.ts`, `plugins/standup/tests/register.test.ts`, `plugins/standup/README.md`
- Modify: `.claude-plugin/marketplace.json`, `README.md`

**Interfaces:**
- Consumes: everything produced by Task 8.
- Produces: command `/standup [today|yesterday|week]`; store key `records` holding `WorkRecord[]`.

- [ ] **Step 1: Manifest and hooks.json**

`plugins/standup/.claude-plugin/plugin.json`:
```json
{
  "name": "standup",
  "displayName": "Standup",
  "version": "0.1.0",
  "description": "Keeps a short log of what you asked Claude to do and which files changed, across sessions, and writes your standup update with /standup.",
  "author": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "license": "MIT",
  "repository": "https://github.com/claudemodz/mods",
  "keywords": ["standup", "productivity", "log"],
  "userConfig": {
    "model": {
      "type": "string",
      "title": "Model",
      "description": "Model that writes the standup (alias or full id).",
      "required": false,
      "default": "haiku"
    },
    "retentionDays": {
      "type": "number",
      "title": "Keep log for (days)",
      "description": "Older log entries are dropped.",
      "required": false,
      "default": 14
    }
  }
}
```
`plugins/standup/hooks/hooks.json`:
```json
{
  "description": "prompt.submit and tool.call (Edit/Write/NotebookEdit) collect each main-loop turn's prompt and edited files; turn.complete appends a record to $.store; /standup summarizes a range with $.model.complete.",
  "modules": ["./register.ts"]
}
```

- [ ] **Step 2: Write the failing engine tests**

`plugins/standup/tests/register.test.ts`:
```ts
import type { CommandRunInput, On, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { WorkRecord } from '../hooks/records.js'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work/app' }
const NOW = new Date(2026, 9, 3, 15, 0).getTime()

function standup(args = ''): CommandRunInput {
  return { command: 'standup', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }
}

const ANSWERED: TurnCompleteInput = {
  answer: 'Done.',
  durationMs: 1200,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
}

function sessionOf(on: On, head: string | null): { prompts: string[] } {
  const prompts: string[] = []
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.repo', () => ({ value: null }))
  on('fs.read', ($, e) =>
    head !== null && e.path === '/work/app/.git/HEAD' ? { value: head } : { deny: 'ENOENT' },
  )
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)
    return { value: '**Done**\n- Added rate limiting' }
  })
  return { prompts }
}

describe('register', () => {
  test('a finished turn is recorded with prompt, branch and edited files', async ($, on) => {
    mock.store(on)
    sessionOf(on, 'ref: refs/heads/feature/login\n')
    await $.session.start(SESSION)

    await $.prompt.submit({ text: 'Add login rate limiting', wait: false })
    await $.tool.call({ tool: 'Edit', file_path: '/work/app/src/login.ts', old_string: 'a', new_string: 'b' })
    await $.turn.complete(ANSWERED)

    const stored = (await $.store.get('records')) as WorkRecord[]
    expect(stored).toEqual([
      { at: NOW, repo: 'app', branch: 'feature/login', prompt: 'Add login rate limiting', files: ['src/login.ts'] },
    ])
  })

  test('a worktree (unreadable .git/HEAD) still records, as branch unknown', async ($, on) => {
    mock.store(on)
    sessionOf(on, null)
    await $.session.start(SESSION)

    await $.prompt.submit({ text: 'Refactor', wait: false })
    await $.turn.complete(ANSWERED)

    const stored = (await $.store.get('records')) as WorkRecord[]
    expect(stored[0]?.branch).toBe('unknown')
  })

  test('long prompts are cut to 200 characters; slash commands are not recorded', async ($, on) => {
    mock.store(on)
    sessionOf(on, 'ref: refs/heads/main\n')
    await $.session.start(SESSION)

    await $.prompt.submit({ text: '/standup', wait: false })
    await $.turn.complete(ANSWERED)
    await $.prompt.submit({ text: 'x'.repeat(500), wait: false })
    await $.turn.complete(ANSWERED)

    const stored = (await $.store.get('records')) as WorkRecord[]
    expect(stored.length).toBe(1)
    expect(stored[0]?.prompt.length).toBe(200)
  })

  test('/standup summarizes today with the model', async ($, on) => {
    mock.store(on, {
      records: [{ at: NOW - 3_600_000, repo: 'app', branch: 'main', prompt: 'Add rate limiting', files: [] }],
    })
    const { prompts } = sessionOf(on, null)
    await $.session.start(SESSION)

    expect(await $.command.run(standup())).toEqual({ text: '**Done**\n- Added rate limiting' })
    expect(prompts[0]).toContain('Add rate limiting')
  })

  test('/standup with nothing recorded, or corrupt store data, says so without a model call', async ($, on) => {
    mock.store(on, { records: 'not-a-list' })
    const { prompts } = sessionOf(on, null)
    await $.session.start(SESSION)

    expect(await $.command.run(standup('yesterday'))).toEqual({ text: 'Nothing recorded for yesterday.' })
    expect(prompts).toEqual([])
  })

  test('/standup with a bad range prints usage', async ($, on) => {
    mock.store(on)
    sessionOf(on, null)
    await $.session.start(SESSION)
    expect(await $.command.run(standup('month'))).toEqual({ text: 'Usage: /standup [today|yesterday|week]' })
  })
})
```
The `tool.call` stub shape (`{ result: 'ok' }`) and `TurnCompleteInput` fields must match the build's types; adjust per the Global Constraints rule if typecheck complains.

- [ ] **Step 3: Run to verify failure**

Run: `claude plugin test plugins/standup`
Expected: register tests FAIL — no `hooks/register.ts`.

- [ ] **Step 4: Implement `hooks/register.ts`**

```ts
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  addRecord,
  baseName,
  branchFromHead,
  isRange,
  readRecords,
  recordsIn,
  relativeTo,
  standupPrompt,
  STANDUP_SYSTEM,
  type WorkRecord,
} from './records.js'

const STORE_KEY = 'records'
const PROMPT_CHARS = 200
const MAX_FILES = 20

export function register(on: On, options: PluginOptions): void {
  const model = String(options.model ?? 'haiku')
  const retentionDays = Math.max(1, Number(options.retentionDays ?? 14))
  let prompt: string | undefined
  const files = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'standup',
      description: 'Write a standup update from what you worked on',
      argumentHint: '[today|yesterday|week]',
    })
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    const text = e.text.trim()
    prompt = text === '' || text.startsWith('/') ? undefined : text
    files.clear()
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    const path =
      'file_path' in e && typeof e.file_path === 'string'
        ? e.file_path
        : 'notebook_path' in e && typeof e.notebook_path === 'string'
          ? e.notebook_path
          : undefined
    if (e.agentId === undefined && result.deny === undefined && path !== undefined) files.add(path)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && prompt !== undefined) {
      const entry = await recordOf($, prompt, [...files]).catch(() => undefined)
      if (entry) {
        const records = readRecords(await $.store.get(STORE_KEY))
        await $.store.set(STORE_KEY, addRecord(records, entry, retentionDays))
      }
      prompt = undefined
      files.clear()
    }
    return result
  })

  on('command.run', { command: 'standup' }, async ($, e) => {
    const range = e.args.trim() || 'today'
    if (!isRange(range)) return { text: 'Usage: /standup [today|yesterday|week]' }
    const picked = recordsIn(readRecords(await $.store.get(STORE_KEY)), range, await $.clock.now())
    if (picked.length === 0) return { text: `Nothing recorded for ${range}.` }
    const text = await $.model.complete({
      model,
      system: STANDUP_SYSTEM,
      prompt: standupPrompt(picked, range),
      maxTokens: 800,
    })
    return { text }
  })
}

async function recordOf($: EngineInterface, prompt: string, edited: readonly string[]): Promise<WorkRecord> {
  const [at, cwd, repo] = await Promise.all([$.clock.now(), $.session.cwd(), $.session.repo()])
  const root = repo?.root ?? cwd
  const head = await $.fs.read(`${root}/.git/HEAD`).catch(() => '')
  return {
    at,
    repo: baseName(root),
    branch: branchFromHead(typeof head === 'string' ? head : ''),
    prompt: prompt.slice(0, PROMPT_CHARS),
    files: edited.map(path => relativeTo(path, root)).slice(0, MAX_FILES),
  }
}
```

- [ ] **Step 5: Run tests, typecheck, strict validate**

Run: `claude plugin test plugins/standup && pnpm typecheck && claude plugin validate plugins/standup --strict`
Expected: all PASS. Validate `calls:` include `$.store.get`, `$.store.set`, `$.model.complete`, `$.fs.read`, `$.session.cwd`, `$.session.repo`, `$.clock.now`, `$.command.register` — and **no** `$.process` or `$.http`.

- [ ] **Step 6: Try it live**

Run `claude --plugin-dir plugins/standup` in any repo, ask Claude for two small changes, then `/standup`.
Expected: a short markdown standup naming both changes. Start a second session in another repo, make a change, and `/standup` there includes both repos (the store is shared across sessions).

- [ ] **Step 7: README, marketplace entry, table row, commit**

`plugins/standup/README.md`:
````markdown
# Standup

Never write a standup from memory again. Standup keeps a tiny log of what you asked Claude to do and which files changed — across every session on your machine — and `/standup` turns it into your update.

- `/standup` — today · `/standup yesterday` · `/standup week`
- The log stays on your machine (Claude Code's plugin store) and keeps 14 days by default.
- No model call per turn: the model is used only when you run `/standup` (Haiku by default).

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install standup@claudemodz-mods
```

## Options (`/config`)
- **Model** — which model writes the update (default `haiku`)
- **Keep log for** — days of history (default 14)

## What it can do
Reads your prompts and which files Claude edits, reads `.git/HEAD` for the branch name, stores the log with `$.store`, and calls the model when you run `/standup`. It does not run commands or use the network beyond that model call.
````
Marketplace entry:
```json
{
  "name": "standup",
  "source": "./plugins/standup",
  "description": "Logs what you worked on across sessions and writes your standup with /standup.",
  "category": "workflow",
  "tags": ["standup", "productivity"]
}
```
README row: `| [standup](plugins/standup) | Logs your work across sessions; /standup writes the update |`
```bash
pnpm check
git add -A
git commit -m "feat(standup): cross-session work log and /standup"
```

---

### Task 10: Dogfood, demos and v0.1.0

**Files:**
- Create: `plugins/<mod>/media/demo.gif` for `model-router`, `ci-pane`, `standup` (UI or command output); `plugins/no-attribution/media/demo.png` (before/after commit message)
- Modify: each `plugins/<mod>/README.md` (embed media), root `README.md`

**Interfaces:**
- Consumes: all four plugins and the marketplace.
- Produces: tag `v0.1.0`; media files that phase 2 copies into `registry/media/<slug>/`.

- [ ] **Step 1: Install from the local marketplace exactly as users will**

```bash
claude plugin marketplace add "$(pwd)"
for m in no-attribution model-router ci-pane standup; do claude plugin install "$m@claudemodz-mods"; done
claude plugin list
```
Expected: four plugins listed and enabled; `/plugin` in a session shows `4 mods active`.

- [ ] **Step 2: Use them for one working day**

Work normally with all four enabled. Log any bug as a GitHub issue on `claudemodz/mods`, fix it test-first in the owning plugin, and commit. Expected at the end: no open bugs labelled `v0.1.0`.

- [ ] **Step 3: Record demos**

Record each mod in a terminal at least 144 columns wide with any screen recorder that outputs GIF (keep each ≤ 5 MB, ≤ 20 s). Save to `plugins/<mod>/media/`. Embed at the top of each README: `![CI Pane demo](media/demo.gif)` (matching name and alt text per mod).

- [ ] **Step 4: Final check, tag and push (confirm with the user first)**

```bash
pnpm check
git add -A
git commit -m "docs: demos for all four mods"
git tag v0.1.0
git push && git push --tags
gh run watch --exit-status
```
Expected: CI green on `main`. Users can now run `/plugin marketplace add claudemodz/mods`.
