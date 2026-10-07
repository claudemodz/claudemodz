# ClaudeModz Studio

The user selected the visual mod builder on 2026-10-07, conditional on feasibility, after asking for a useful open-source project with organic sharing potential.

## First release

A browser workspace for assembling an above-prompt Claude Code mod from three templates: session status, context meter, and a personal checklist. Users add, remove, reorder and customize widgets, preview sample session states, export a complete plugin ZIP, and share a remix URL or portable JSON configuration. Work saves locally. No account, model API, server-side execution, or database is needed.

The key end-to-end contract is configuration → shared rendering model → generated plugin → Claude's validator and native UI tests. The browser preview is explicitly a simulation of supported components, not a running Claude session or pixel-identical terminal emulator. Exported plugins operate on actual session events; sample data never ships as runtime state.

## Boundaries

- Support Claude Code 2.1.288+ terminal and desktop render contracts; live desktop paint requires separate manual verification.
- Rendering is confined to AbovePrompt. Preserve other mods' content; yield to surveys, agent views, tiny layouts and noninteractive sessions.
- Templates use session events and UI APIs. No arbitrary user code, shell commands, network requests, model calls, secrets, or conversation storage.
- A checklist is session-local; configurable text is shipped in the plugin and reset on session start. Buttons and a plugin-specific slash command toggle completion.
- Context values stay unknown until measured. Completion means the turn ended, not that a build or deployment succeeded.
- Three starters are configurations using the same templates, not third-party plugins or fabricated community submissions.
- Project import, local storage and URL fragments are untrusted, bounded, versioned data validated by a shared schema. Share links contain widget text; the UI explicitly tells users this before copying. No automatic uploads.
- Export is a ZIP containing `.claude-plugin/plugin.json`, `hooks/hooks.json`, generated hook code, the shared runtime, a remixable `studio.json`, README, and MIT license. Installation uses the extracted local folder with `claude --plugin-dir`; do not claim a remote marketplace or npm release exists.

## Product layout

Dark, warm-neutral workspace with an orange accent. Header: brand, local-save state, import, share and export. Left: starter presets and widget stack with reorder controls. Center: terminal-style preview with Ready/Working/Finished/Error scenarios, width controls and an explicit simulated-data label. Right: selected widget properties. A compact onboarding explanation and export dialog explain the real install steps. Mobile stacks panels without horizontal page overflow. Keyboard labels, visible focus, reduced-motion behavior, and clipboard fallbacks are required.

## Architecture

- `packages/studio`: configuration schema/presets, pure runtime shared with exported mods, versioned share encoding, and plugin file generation.
- `apps/studio`: React + Vite editor; local persistence, preview, import/export dialogs, ZIP download. A static production build works without a backend.
- `scripts`: build-time export verification against the installed Claude binary; automated native tests use isolated temporary profiles without changing account flags or settings.
- Existing registry/scanner packages remain usable and their tests must keep passing.

## Feasibility evidence

A throwaway configured status mod passed `claude plugin validate --json` on 2.1.289. Its native UI test verifies configured text and preservation of existing content on terminal and desktop surfaces. Existing companion native tests pass in an isolated profile. The normal signed-in profile currently reports a cached rollout switch disabling mods; native test results do not establish live-session availability.

## Acceptance

1. All three widgets work from editor through exported native tests.
2. Editing, reordering, presets, save/reload, JSON import, remix URLs, and ZIP export work in a real browser.
3. Exported metadata and capabilities describe the generated code accurately; hostile text stays text, and malformed configs fail clearly.
4. Production build, type checks, unit/integration tests and original registry tests pass.
5. Desktop/mobile browser inspection shows a usable editor with no console errors. Native tests establish runtime behavior; unavailable live-host checks are disclosed.
6. README includes reproducible setup, installation, limitations, contribution and deployment instructions. No deployment is implied by a local preview.

Public hosting, a user gallery, accounts, free-form code generation, CI/network widgets, a marketplace, drag-and-drop dependencies, and automatic installation are later work. Validate that people can build a useful widget before expanding.
