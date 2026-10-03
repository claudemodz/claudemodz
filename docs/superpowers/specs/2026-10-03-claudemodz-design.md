# claudemodz — Design Spec

**Date:** 2026-10-03
**Status:** Draft for review
**Domain:** claudemodz.com (primary), claudemodz.dev (redirect) — both unregistered as of 2026-10-03
**GitHub org:** `claudemodz` — available as of 2026-10-03

---

## 1. Intent

### What was decided

- **Goal: community play.** claudemodz becomes the place people go to find, install and share Claude Code mods.
- **Scope: mods first, all plugins welcome.** Mods are the headline; skill-, MCP-, agent- and hook-only plugins are listed too, tagged by what they contain.
- **Model: indexed + verified + claim.** A crawler indexes public plugins automatically (unverified). Creators claim or submit a listing, which goes through review and becomes verified and installable from the `claudemodz` marketplace.
- **Source of truth: the repo.** Verified listings live as YAML in `claudemodz/claudemodz` and change only through reviewed PRs. Live data (votes, installs, users, indexed listings) lives in Postgres.
- **Review bar: standard.** Pinned commit, auto-generated permission summary, demo media for UI mods, permission diff on every update, maintainer sign-off for risky permissions, optional test/eval badges.
- **Two repos.** `claudemodz/claudemodz` (registry, site, CLI) and `claudemodz/mods` (our mod pack, submitted through the normal pipeline).
- **Website: dynamic, on Vercel.** Next.js, server-rendered, with GitHub sign-in.
- **CLI: planned.** `npx claudemodz add <mod>` with anonymous install counts that drive rankings.
- **Brand: neutral community project**, "Maintained by smartSense" in the footer, and "Unofficial community project, not affiliated with Anthropic."

### Assumptions (correct these if wrong)

- Success = external submissions, installs, and people talking about it. No revenue goal.
- Speed matters: mods launched 2026-10-02 and several directories already exist. Public launch target is phases 0–4 (§10), in roughly two weeks.
- Code is MIT-licensed. Registry listing data is CC0 so anyone can reuse it.

### Background facts this design relies on (verified 2026-10-03)

- A mod is a plugin whose `hooks/hooks.json` has `"modules": ["./register.js"]`. The module exports `register(on)`. Requires Claude Code ≥ 2.1.287. (Local machine is on 2.1.286 — must update.)
- `claude plugin validate <dir> --json` runs offline with no sign-in and reports each module's events and API calls as notes, e.g. `"./register.js hooks: tool.call"`, `"./register.js calls: $.http.fetch"`.
- The validator **rejects** mods that import anything other than relative files and `claude-code` (e.g. `node:child_process`), and rejects computed access on `$` (e.g. `$['ht'+'tp']`). So a mod's reach is exactly its listed `$` calls. Non-mod components (settings hooks, MCP servers) run arbitrary commands and are not covered by this.
- Marketplace name `claudemodz` passes validation (no impersonation error).
- Marketplace plugin sources support `github` and `git-subdir` with a pinned 40-char `sha`.

---

## 2. Architecture

```
                    ┌──────────────── GitHub ─────────────────┐
 creator ──submit/claim──▶ claudemodz-bot (GitHub App) ──opens PR──▶ claudemodz/claudemodz
                    │                                         │   registry/listings/*.yaml
 claudemodz/mods ───┤  (our mods: submitted like anyone's)    │   registry/generated/*.json (bot)
                    │                                         │   .claude-plugin/marketplace.json (bot)
                    │  Actions: PR checks · permission diff · nightly crawler · upstream watcher
                    └───────────┬──────────────────┬──────────┘
                     push webhook          crawler results
                                ▼                  ▼
                  ┌──────────── Vercel ─────────────────────┐
  users ─────────▶│ Next.js app (pages + /api)               │◀── npx claudemodz add <mod>
                  │ Auth.js (GitHub sign-in)                 │       (anonymous install event)
                  └───────────────┬─────────────────────────┘
                                  ▼
                 Postgres (Neon via Vercel Marketplace) + Upstash Redis (rate limits)
```

### Repo: `claudemodz/claudemodz` (pnpm workspace)

| Path | Purpose |
|---|---|
| `registry/listings/<slug>.yaml` | Hand-written verified listing (§3.1). Source of truth. |
| `registry/media/<slug>/` | Demo media (≤3 files, ≤5 MB each; gif/png/webp/mp4). |
| `registry/generated/<slug>.json` | Bot-written scan result: permissions, contents, validator output, Claude Code version used. Never hand-edited. |
| `.claude-plugin/marketplace.json` | Bot-written from listings. Contains verified listings only. |
| `apps/web` | Next.js site. |
| `packages/schema` | Zod schemas for listing YAML, generated JSON, and API payloads. Shared by web, CLI and CI. |
| `packages/scanner` | Clones a source at a sha, runs `claude plugin validate --json`, produces a permission summary, diffs two summaries. Used by CI and crawler. |
| `packages/cli` | The `claudemodz` npm package. |
| `.github/workflows/` | `pr-check`, `pr-comment`, `publish` (on push to main), `crawl` (nightly), `upstream-watch` (nightly). |
| `docs/` | This spec, plans, contributor docs. |

### Repo: `claudemodz/mods`

Our mod pack: one directory per mod under `plugins/`, its own `.claude-plugin/marketplace.json`, tests run with `claude plugin test`. Each mod reaches the registry by a normal submission PR.

### Where things run

- **GitHub Actions** does everything that needs the `claude` binary or a git clone: PR checks, publishing, crawling, upstream watching. The Claude Code version is pinned in CI and bumped deliberately.
- **Vercel** runs the site and API only. It never runs plugin code or the validator.
- **claudemodz-bot (GitHub App)** opens submission, claim and update PRs, and commits generated files to `main`. Creators never need write access.
- **Postgres** is the read model for all listings (verified ones are synced from the repo) plus users, votes, installs, claims, submissions and reports.

Note: because the dynamic site reads listings from Postgres, a database outage takes the site down. That replaces the earlier "live layer is optional" property. Neon's availability makes this acceptable. Verified installs keep working regardless, because they go through GitHub, not our servers.

---

## 3. Data

### 3.1 Listing YAML (hand-written, `registry/listings/<slug>.yaml`)

```yaml
slug: ci-pane                       # marketplace plugin name; [a-z0-9-], ≤64, unique, immutable (renames via marketplace `renames`)
displayName: CI Pane
summary: Live PR checks beside the transcript, with re-run and open buttons.   # ≤140 chars
source:
  type: git-subdir                  # github | git-subdir
  repo: claudemodz/mods             # owner/repo
  path: plugins/ci-pane             # git-subdir only
  ref: main
  sha: 0123456789abcdef0123456789abcdef01234567
authors:                            # credited on the page
  - github: octocat
maintainers: [octocat]         # GitHub logins allowed to approve update PRs for this listing
license: MIT                        # SPDX; must match the source repo's license
category: git-ci                    # one of the fixed list below
tags: [github, pull-requests]
media:
  - file: demo.gif                  # relative to registry/media/<slug>/
    alt: CI pane showing two passing checks and one failing
submittedBy: octocat
```

**Categories (fixed):** `dashboards`, `safety`, `git-ci`, `workflow`, `models-cost`, `memory`, `ui`, `integrations`, `fun`, `other`.

### 3.2 Generated scan result (bot-written, `registry/generated/<slug>.json`)

```jsonc
{
  "slug": "ci-pane",
  "sha": "0123…",
  "scannedAt": "2026-10-03T12:00:00Z",
  "claudeCodeVersion": "2.1.287",
  "plugin": { "name": "ci-pane", "version": "1.0.0", "description": "…" },
  "contains": ["mod", "commands"],               // mod | skill | agent | command | settings-hook | mcp | lsp | output-style | theme | workflow | monitor
  "mod": {
    "events": ["session.start", "ui.render", "ui.press"],
    "calls": ["$.process.run", "$.clock.every", "$.ui.open", "$.ui.invalidate"]
  },
  "external": {                                   // components the validator can't bound
    "settingsHooks": [{ "event": "PostToolUse", "command": "…" }],
    "mcpServers": [{ "name": "…", "command": "…", "url": null }]
  },
  "permissions": ["runs-processes", "draws-ui"],  // derived, §3.3
  "risk": "elevated",                             // standard | elevated
  "validator": { "success": true, "warnings": [] },
  "tests": null,                                  // { "passed": n, "failed": n } when the plugin ships *.test.ts
  "evals": null                                   // reserved for phase 6
}
```

### 3.3 Permission categories

Derived by `packages/scanner` from events and calls. One table drives the badges, the plain-language panel on listing pages, and what counts as risky.

| Category | Triggered by | Risky? |
|---|---|---|
| `reads-files` | `$.fs.read/list/exists/stat/ancestors` | no |
| `writes-files` | `$.fs.write` | yes |
| `runs-processes` | `$.process.run/spawn` | yes |
| `network` | `$.http.fetch`, `$.mcp.connect` | yes |
| `reads-secrets` | `$.env.get`, `$.settings.read` | yes |
| `spends-usage` | `$.model.*`, `$.agent.spawn` | no (shown) |
| `acts-for-you` | hook on `tool.check`; `$.prompt.submit`, `$.tool.call`, `$.session.send`, `$.session.authorize` | yes |
| `rewrites-session` | hook on `prompt.compose`, `prompt.section`, `session.append`, `turn.step` | yes |
| `controls-other-mods` | hook on `plugin.register`, `engine.create`, or any mods-API-call event | yes |
| `reads-conversation` | `$.session.messages`, hook on `prompt.submit` | no (shown) |
| `draws-ui` | any `$.ui.*` or hook on `ui.render` | no |
| `external-code` | any settings hook or MCP server in the plugin | yes |

`risk` is `elevated` if any risky category is present. Elevated listings and updates need a maintainer's explicit approval (§4.3).

The validator's notes are free text. The scanner parses the `hooks:` and `calls:` lines and is covered by fixture tests, so a format change in a new Claude Code version fails CI instead of silently producing empty summaries.

### 3.4 Generated marketplace

`publish` writes `.claude-plugin/marketplace.json`:

```json
{
  "name": "claudemodz",
  "owner": { "name": "claudemodz", "url": "https://claudemodz.com" },
  "description": "Community Claude Code mods and plugins, reviewed and pinned. claudemodz.com",
  "forceRemoveDeletedPlugins": true,
  "renames": {},
  "plugins": [
    {
      "name": "ci-pane",
      "displayName": "CI Pane",
      "description": "Live PR checks beside the transcript…",
      "category": "git-ci",
      "tags": ["github", "pull-requests"],
      "source": { "source": "git-subdir", "url": "claudemodz/mods", "path": "plugins/ci-pane", "ref": "main", "sha": "0123…" },
      "metadata": { "claudemodz": { "url": "https://claudemodz.com/m/ci-pane", "risk": "elevated" } }
    }
  ]
}
```

`forceRemoveDeletedPlugins: true` means a listing removed for abuse is uninstalled from users' machines on their next update.

### 3.5 Postgres schema (Drizzle ORM)

- **users** — `id`, `github_id` (unique), `login`, `name`, `avatar_url`, `role` (`user | maintainer | admin`), `created_at`
- **listings** — `id`, `tier` (`verified | indexed`), `slug` (unique, verified only), `owner`, `repo`, `path`, `plugin_name`, `display_name`, `summary`, `category`, `tags[]`, `contains[]`, `permissions[]`, `risk`, `scan` (jsonb: full generated result), `sha`, `ref`, `version`, `license`, `media` (jsonb), `stars`, `status` (`active | hidden | failing | removed | opted_out`), `claimed_by` → users, `verified_listing_id` (links an indexed row to its verified successor), `first_seen_at`, `last_scanned_at`, `search` (tsvector). Unique on (`owner`, `repo`, `path`, `plugin_name`, `tier`).
- **votes** — (`user_id`, `listing_id`) primary key, `created_at`
- **install_counts** — (`listing_id`, `day`, `source` = `copy | cli`) primary key, `count`. No per-install rows and no IPs are stored.
- **claims** — `id`, `listing_id`, `user_id`, `status` (`pending | pr_open | merged | rejected`), `pr_url`, `created_at`
- **submissions** — `id`, `user_id`, `repo`, `path`, `status`, `pr_url`, `error`, `created_at`
- **reports** — `id`, `listing_id`, `user_id` (nullable), `reason` (`malicious | broken | spam | impersonation | other`), `details`, `status`, `created_at`
- **crawl_runs** — `id`, `started_at`, `finished_at`, `repos_found`, `plugins_scanned`, `failures` (jsonb)

**Ranking.** `trending` = installs over the last 7 days + 3 × votes over the last 7 days. `hot` = the same over 24 hours. `top` = all-time installs. Computed in SQL; cached for 5 minutes.

---

## 4. Pipelines

### 4.1 Submit (new listing)

1. A signed-in user opens `/submit` and pastes a GitHub URL (repo, or repo + subdirectory).
2. The server checks the repo is public and not archived, finds `.claude-plugin/plugin.json` at that path (or the plugins listed in a `marketplace.json`), and prefills the form from it.
3. The user fills in display name, summary, category, tags, and uploads media.
4. The server builds the listing YAML (pinned to the current HEAD sha) and claudemodz-bot opens a PR adding it plus the media. The submission row records the PR URL. The user is shown the PR link.

Anyone can submit any public plugin. Authors are credited from the repo. The repo owner can claim the listing later to become its maintainer.

### 4.2 Claim (indexed → verified)

1. An indexed listing page shows "Are you the author? Claim this listing."
2. The claimant signs in. The server checks they have `admin` or `maintain` permission on the repo via the GitHub API with their token. (Fallback if the token can't see permissions: the user adds a `.claudemodz.yml` with `claim: <login>` to the repo root and clicks verify.)
3. The submit form opens prefilled. It finishes as in §4.1 steps 3–4, with `maintainers` set to the claimant.
4. On merge, the indexed row is linked to the verified one (`verified_listing_id`) and redirects to it.

### 4.3 PR checks (`pr-check`, on `pull_request`)

Runs for every PR touching `registry/`, on an ephemeral GitHub-hosted runner with no secrets and a read-only token (fork-safe). Only step 4 executes plugin code, and only in this secret-less job.

1. **Schema.** Each changed YAML parses against `packages/schema`. Slug unique, license is SPDX, media within limits.
2. **Fetch.** Clone the source at the pinned sha (partial/sparse clone for `git-subdir`). Fail if unreachable.
3. **Scan.** `claude plugin validate --json` on the plugin directory. Validation errors fail the check.
4. **Tests.** If the plugin contains `*.test.ts(x)`, run `claude plugin test`. Result is recorded as a badge, and failure is a warning, not a block.
5. **License match.** The listing's license must match the repo's detected license.
6. **Media rule.** If permissions include `draws-ui`, at least one media file is required.
7. **Comment.** Because a fork PR's token is read-only, the check job uploads its results as an artifact and a separate trusted `pr-comment` workflow (`workflow_run`) posts or updates one PR comment. It never checks out PR code: the permission summary in plain language and, for updates, the **permission diff** (added and removed events, calls, categories, external components).
8. **Risk gate.** If the listing is new and elevated, or the update adds any risky category or external component, the PR gets the `needs-permission-review` label and a required status check that only passes once a claudemodz maintainer applies `permissions-approved`.

Merging requires a passing check plus one approving review from a claudemodz maintainer. For update PRs, an approval from one of the listing's own `maintainers` also counts when the risk gate isn't triggered.

### 4.4 Publish (`publish`, on push to `main`)

1. Re-scan every changed listing at its pinned sha. Write `registry/generated/<slug>.json`.
2. Regenerate `.claude-plugin/marketplace.json`, then run `claude plugin validate .` on the marketplace itself.
3. claudemodz-bot commits the generated files to `main` (`[skip ci]`).
4. Call `POST /api/internal/sync` (HMAC-signed). The site upserts verified listings from `registry/` into Postgres and revalidates affected pages.

The sync endpoint is idempotent and can rebuild every verified row from the repo, so the repo stays the source of truth.

### 4.5 Upstream watcher (`upstream-watch`, nightly)

For each verified listing, compare the pinned sha with the head of `ref`. If there are new commits touching the plugin path, the bot opens (or updates) one PR per listing bumping `sha`. §4.3 then posts the permission diff and pings the listing's maintainers. Users never get an update that wasn't reviewed.

### 4.6 Crawler (`crawl`, nightly)

1. **Discover.** GitHub code search for `filename:hooks.json modules`, `filename:marketplace.json path:.claude-plugin`, and `filename:plugin.json path:.claude-plugin`, using a GitHub App installation token and staying within rate limits. Skip forks, archived repos, and repos with a `.claudemodz.yml` containing `index: false`.
2. **Enumerate.** Shallow-clone each new or changed repo (by default-branch head sha). Find plugin directories.
3. **Scan.** Validate and summarize each plugin as in §4.3. Failed validation → `status: failing` (stored, hidden from browse).
4. **Upload.** POST results in batches to `/api/internal/index` (HMAC-signed). Upsert indexed rows, and refresh stars and license.
5. **Record** the run in `crawl_runs`. Failures are per repo and never abort the run.

Indexed listings show their own install steps: if the repo has a marketplace, `/plugin marketplace add owner/repo` then `/plugin install name@their-marketplace`; otherwise clone-and-`--plugin-dir` instructions (the CLI can automate this, §6).

---

## 5. Website (`apps/web`)

**Stack:** Next.js (App Router), TypeScript, Tailwind, Drizzle + Neon Postgres, Auth.js (GitHub provider, `read:user` scope), Upstash Ratelimit, deployed on Vercel. Listing pages are server-rendered with tag-based revalidation from the sync endpoint.

### Pages

| Route | Content |
|---|---|
| `/` | One-line marketplace setup command, trending, new this week, featured (maintainer-picked), category tiles, "what are mods" explainer. |
| `/mods` | Browse with filters: tier (verified/indexed), contains (mod, skill, MCP…), category, permissions ("no network", "no processes"), and where it draws (terminal/desktop). Sort: trending, hot, top, new. Postgres full-text search. |
| `/m/[slug]` | Verified listing: name, authors, demo media, install command with copy button, **permission panel** in plain language, contents (events, commands, skills, MCP servers), README rendered from the source at the pinned sha (sanitized, cached), version history with permission diffs, votes, stars, install count, report button. |
| `/i/[owner]/[repo]/[...plugin]` | Indexed listing: same layout with an "Unverified — not reviewed" banner, a permission panel from the crawler scan, their install steps, and the claim button. |
| `/submit` | Submission form (§4.1). |
| `/claim/[id]` | Claim flow (§4.2). |
| `/u/[login]` | Creator profile: listings, total installs, votes received. |
| `/leaderboard` | Trending / hot / all-time table. |
| `/docs/*` | What mods are, how to install, how to build one, how to submit, the permission glossary (§3.3), the trust model, the crawler opt-out, and telemetry. |
| `/admin` | Maintainers only: reports queue, hide/unhide, featured picks, crawl run log. |

### API (`app/api`)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/listings`, `GET /api/listings/[id]` | public | Search and detail, also used by the CLI. |
| `POST /api/votes/[id]`, `DELETE …` | session | Toggle vote. Rate-limited. |
| `POST /api/installs` | none | `{ slug, source: "copy" \| "cli" }` → increments `install_counts`. Rate-limited per IP in Redis; IP never stored. |
| `POST /api/submissions`, `POST /api/claims` | session | §4.1, §4.2. |
| `POST /api/reports` | optional | Report a listing. Rate-limited. |
| `POST /api/internal/sync`, `POST /api/internal/index` | HMAC | §4.4, §4.6. |

Footer on every page: "Unofficial community project, not affiliated with Anthropic · Maintained by smartSense · Open source on GitHub."

---

## 6. CLI (`packages/cli`, npm `claudemodz`)

Thin wrapper over the `claude` CLI. Requires Claude Code installed. Zero runtime dependencies beyond a small argument parser.

| Command | Behavior |
|---|---|
| `npx claudemodz add <slug>` | Fetches the listing from the API and prints its permission summary. Asks to confirm (default **no**) unless `--yes`. Adds the `claudemodz` marketplace if it isn't already registered (`claude plugin marketplace add claudemodz/claudemodz`), then `claude plugin install <slug>@claudemodz [--scope …]`. Sends an install event on success. |
| `npx claudemodz add owner/repo[/path]` | Indexed plugin: prints an **Unverified** warning plus permissions, requires typing `yes`. Uses the repo's own marketplace if it has one; otherwise clones to `~/.claudemodz/plugins/<owner>-<repo>` and prints how to load it. |
| `npx claudemodz search <query>` | Lists matches with tier, risk and installs. |
| `npx claudemodz info <slug>` | Full permission panel and contents. |
| `npx claudemodz list` | Installed plugins that came from `@claudemodz`. |
| `npx claudemodz update` | `claude plugin marketplace update claudemodz`, then summarizes permission changes since the last update. |

**Telemetry:** only `{ slug, cliVersion }` on a successful install. Disabled by `DO_NOT_TRACK=1`, `DISABLE_TELEMETRY=1`, or `CLAUDEMODZ_TELEMETRY=0`. This is stated on first run and in `/docs/telemetry`. The copy button on the site sends the same event with `source: "copy"`.

---

## 7. Our mod pack (`claudemodz/mods`)

Four mods, chosen because we'd use each daily and each shows off a different part of the API. All in TypeScript, each with `claude plugin test` tests, a demo GIF, and `userConfig` for options.

### 7.1 `no-attribution`

- **Hook:** `attribution.text` → returns `{ text: "" }` (or the user's `customText`).
- **Why:** makes "never add Co-Authored-By / Generated with" deterministic instead of relying on CLAUDE.md instructions.
- **Permissions:** none.
- **To verify in phase 0:** that empty text removes the trailer entirely rather than leaving a blank line.

### 7.2 `model-router`

- **v1 scope:** route **subagents**, not main-loop steps. Hook `agent.spawn` returns `{ model }` from a `userConfig` map (e.g. `Explore → haiku`, default unchanged). Adds `/router` to show routing stats and switch the main session between presets (`/router fast | smart | off`), applied via `turn.step` → `next({ ...e, model })` only when the user chooses it explicitly.
- **Why not automatic per-step routing in v1:** switching models mid-turn loses the prompt cache, which can cost *more*. Phase 6 adds measured experiments using `$.session.usage().cost` before making anything automatic.
- **Shows** the active model in the spinner suffix (`ui.render` on `Spinner`).
- **Permissions:** `rewrites-session`, `draws-ui` → elevated (expected; it's our own reference case for the review flow).

### 7.3 `ci-pane`

- `session.start` registers a docked pane and a `/ci` command. `$.clock.every(30s)` runs `gh pr view --json number,url,statusCheckRollup` for the current branch via `$.process.run`.
- The pane lists checks with status. Buttons: refresh, open the PR (`Link`), re-run failed jobs (`gh run rerun --failed`). A one-line band above the prompt appears only while something is failing. `$.ui.toast` on a pass↔fail transition.
- Where nothing draws (VS Code panel, `claude -p`), `/ci` prints the same status as text.
- Does nothing if `gh` is missing or the branch has no PR, and says so once in the pane.
- **Permissions:** `runs-processes`, `draws-ui` → elevated.

### 7.4 `standup`

- `turn.complete` appends a compact record to `$.store`: timestamp, repo, branch, first 200 characters of the prompt, files changed. No model call per turn.
- `/standup [today | yesterday | week]` summarizes the records with `$.model.complete` into a standup update, shows it, and copies it to the clipboard (`$.ui.copy`).
- Records older than 14 days are pruned on `session.start` to stay well under the 4 MiB store limit.
- **Permissions:** `reads-conversation`, `spends-usage`, `draws-ui` → standard.

---

## 8. Security, abuse and failure handling

- **Never execute submitted code where secrets exist.** Validation is static analysis. The only code execution is `claude plugin test` inside the secret-less, read-only `pr-check` job on an ephemeral runner. Only `publish`, `pr-comment`, `crawl` and `upstream-watch` hold secrets; they never run plugin code, and `pr-comment` never checks out PR code.
- **Pinned shas everywhere.** A compromised upstream branch can't reach users without a reviewed PR.
- **Takedown.** A report → maintainer hides the listing in Postgres immediately (site), then a removal PR drops it from the marketplace. `forceRemoveDeletedPlugins` uninstalls it for users on their next update.
- **Rendering.** READMEs are sanitized (`rehype-sanitize`); external images are allowed only over https.
- **Rate limits** on votes, installs, submissions, claims and reports. Bot detection beyond rate limiting is out of scope for v1.
- **Crawler respects opt-out** (`.claudemodz.yml` → `index: false`) and honors removal requests via a report reason.
- **Failure isolation.** Crawler and scanner errors are per repo. The sync endpoint is idempotent. README fetch failure shows a "view on GitHub" fallback.
- **Claude Code version drift.** CI pins the version. Bumping it is a PR that re-runs every scan and shows any summary changes before merge.

---

## 9. Testing

| Unit | How |
|---|---|
| `packages/schema` | Vitest: valid/invalid listing fixtures. |
| `packages/scanner` | Vitest with **recorded `validate --json` fixtures** (including the format seen on 2.1.286/2.1.287); permission mapping table tests; diff tests. One integration test runs the real `claude` binary on sample plugins in CI. |
| Workflows | Run against a fixture registry with sample plugins (one standard, one elevated, one failing, one with an MCP server). |
| `apps/web` | Vitest for route handlers and ranking SQL (against a Neon branch per CI run); Playwright smoke: browse, listing page, sign-in mock, vote, submit (bot mocked). |
| `packages/cli` | Vitest with a fake `claude` executable on `PATH` that records the arguments it receives. |
| Mods | `claude plugin test` per mod; manual check in terminal and desktop app before submission. |

---

## 10. Phases

Each phase gets its own implementation plan.

| Phase | Deliverable | Usable result |
|---|---|---|
| **0. Spike** (½ day) | Update Claude Code to ≥2.1.287. Confirm: validate runs in GitHub Actions without sign-in; `claude plugin marketplace add` accepts `claudemodz`; `attribution.text` empty-string behavior; GitHub permission check for claims. | Risks resolved or design adjusted. |
| **1. Mod pack** | `claudemodz/mods` with the four mods. | We use them daily. |
| **2. Registry + pipeline** | `packages/schema`, `packages/scanner`, `pr-check`, `publish`, generated marketplace. Our four mods submitted through it. | `/plugin marketplace add claudemodz/claudemodz` works — before the site exists. |
| **3. Website v1** | Browse, listing pages, auth, votes, copy counts, submit, docs, admin. | Site live, verified tier only (soft launch). |
| **4. Crawler + claims** | `crawl`, indexed pages, claim flow, `upstream-watch`. | **Public launch** with a large catalog. |
| **5. CLI + leaderboards** | `claudemodz` on npm, install telemetry, trending/hot/top. | skills.sh-style rankings from real installs. |
| **6. Later** | Auto-merge for updates with an empty permission diff (after a 24h delay), eval badges (`claude plugin eval`), collections, OG images, measured automatic model routing. | — |

Phases 3 and 4 can run in parallel once phase 2 is done.

---

## 11. Open risks

1. **Validator note format is free text** and may change between Claude Code versions. Mitigated by pinning and fixture tests (§3.3, §8).
2. **Use of "Claude" in the brand.** Mitigated by the non-affiliation notice; a rename would mean changing the marketplace name (users would re-add it).
3. **Code search coverage and rate limits** may cap crawler breadth. Fallback: also ingest the public awesome-lists' repo URLs as discovery seeds.
4. **Indexed plugins without a marketplace** have no clean persistent install path through Claude Code; the CLI's clone approach is a workaround to revisit if Claude Code adds direct GitHub installs.
5. **Review load** if submissions spike. Mitigated by listing maintainers approving their own non-risky updates and the phase 6 auto-merge.
