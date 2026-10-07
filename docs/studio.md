# Studio guide

Studio creates a single plugin with an above-prompt workspace. It currently supports three widget types, up to six widgets, five accent colors, a roomy or compact layout, and up to six items per checklist.

## Compatibility

Use Claude Code **2.1.288 or later with mods enabled in your profile**. Version alone is not enough: host rollout and organization settings can affect whether hook modules load. Studio cannot enable a disabled feature.

The generated hooks are validated and tested with Claude's native harness on 2.1.288 and 2.1.289. Those tests cover terminal and desktop render contracts, including actual button activation. They do not establish pixel-perfect painting in every terminal or live desktop version.

The local end-to-end attempt on 2026-10-07 encountered a logged-out Claude session and a cached disabled-mod rollout setting. The generated command was unavailable there. A signed-in, mod-enabled live session remains the release acceptance check; passing native tests is not a substitute for it.

## Install an export

1. Download the plugin ZIP and extract it.
2. Keep the resulting folder, for example `mission-control`.
3. In its parent directory, run:

```sh
claude plugin validate ./mission-control --strict
claude --plugin-dir ./mission-control
```

The workspace draws above the prompt. Replace `mission-control` with your export's slug. The launch option loads a local plugin for that session; it does not install a marketplace entry.

| Command | Behavior |
| --- | --- |
| `/mission-control` or `/mission-control status` | Full text summary |
| `/mission-control hide` / `show` | Hide or show the workspace |
| `/mission-control check 1` | Toggle the first checklist item |
| `/mission-control reset` | Clear checklist completion |

Checklist numbering continues across all checklists in widget order. Completion is session-local and resets in a new session. Buttons toggle items when the full layout is visible. Narrow layouts use a truncated summary; the command provides the full details.

Context is unknown until Claude reports a measurement. Cost appears only if selected and reported by Claude; it is not an estimate or a billing promise. “Turn finished” means the turn finished, not that tests passed or deployment succeeded. The UI yields during surveys, in agent transcript views, and when there is no room. Headless sessions have no visual workspace.

If nothing appears, verify the folder path, sign-in, version and mod availability in Claude. Try the exported slash command and inspect Claude's plugin diagnostics. If Claude says hook modules are disabled, follow its instructions to refresh rollout settings, or check with your organization administrator. Do not change feature gates to force loading.

Official background: [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview).

## Save and share

Changes save in this browser on this origin. Renaming the workspace changes its export folder and slash-command name. Undo keeps the last 30 edits in the current page; a reload does not retain undo history. Save project JSON for a durable portable backup.

**Share** puts a validated project in the URL fragment. Studio does not send that fragment to an application backend. Anyone with the link can decode its labels and checklist text; it is not encrypted. Do not put private text in a public remix. The link is consumed when loaded so later edits survive a refresh. Your previously saved project is available through Undo immediately after opening a remix.

Localhost links work only where Studio runs at that address. For another machine, send project JSON or host the static app at a stable URL. Changing a hosted path or origin changes where browser saves live.

Imports, links and saves use one versioned schema. Invalid or oversized imports leave your current project unchanged. Project JSON is limited to 12 KB; unknown fields, invalid IDs and duplicate widget IDs are rejected. Opening an invalid remix retains a valid local save if one exists.

## What exports can do

Generated hooks observe session lifecycle, turn lifecycle and context/cost measurements; register one immediate command; invalidate and draw UI. They keep only status, measurements and checklist booleans in memory. They do not retain prompt text or conversations, call models, run programs, access files or secrets, or make network requests.

This describes the generated code, not a sandbox guarantee. Mods execute with host privileges. Studio uses checked-in runtime templates and serializes configuration as data. The editor shows the exact files before download so they can be inspected.

The browser preview uses shared widget logic with sample events. Its cards, spacing and terminal illustration are an editor presentation; native Claude controls adapt to their host. Real exports begin with unknown context and an idle session, never the sample 42% value.

## Architecture

```text
editor / JSON / remix link
           |
      validated project
        /           \
 browser preview    ZIP generator
 shared runtime      config + same runtime + Claude adapter
```

- `packages/studio/src/config.ts`: schema, limits, widget constructors and starter projects.
- `runtime.js`: pure state transitions, display rows, meter and layout selection, shared with exports.
- `register.js`: Claude hook adapter, slash commands and UI buttons.
- `export.ts`: plugin file map; fixed source templates plus safely serialized project data.
- `share.ts`: bounded UTF-8/base64url encoding and decoding.
- `apps/studio/src/storage.ts`: precedence and recovery for saved/remixed projects.
- `apps/studio/src/App.tsx`: editor interactions, import, undo and export.
- `scripts/test-studio-native.ts`: fresh generated plugins, strict validation, isolated native tests and optional example export.

## Verify changes

```sh
pnpm check
pnpm build
pnpm test:studio:native
pnpm export:example
```

`pnpm check` includes the existing registry suite. `pnpm build` also type-checks the browser. Native tests require the `claude` executable and run with an isolated temporary profile; the script cleans only its own directory. No credentials or model calls are needed for the test fixtures.

Browser acceptance checks:

- Customize labels, colors, order and context cost; reload and check persistence.
- Add/remove widgets; use presets and Undo; confirm an empty required field disables export.
- Import a valid project, then malformed JSON; confirm the latter preserves your work.
- Open a remix, edit it, then reload; confirm the edit remains.
- Download a ZIP; inspect the included `studio.json` and validate the extracted plugin.
- Check desktop and 390px mobile views, compact mode, keyboard controls and dialog feedback.

Before announcing live compatibility, load the example into a signed-in, mod-enabled Claude session. Check `/mission-control status`, toggle an item, run a normal turn, confirm context updates, and check narrow terminal behavior. Record Claude version and surface with the result.

## Host the editor

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @claudemodz/studio-app preview --port 5174
```

Deploy **`apps/studio/dist`** to a static HTTPS host. Vite emits relative asset paths, so a repository subpath works too. There are no environment variables, server routes, keys or databases to configure. HTTPS enables clipboard access; JSON export remains available if clipboard access fails. Do not expose the development server as the public deployment.

No public hosting or domain is configured by this change. The initial launch needs a stable URL, the live-session compatibility check above, and a short real-use demo. The built-in remix link is the sharing mechanism; there are no fake usage counts, marketplace install claims or automatic submissions.
