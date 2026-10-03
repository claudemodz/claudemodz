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

The **claudemodz review** reads your listing, fetches the plugin at `sha` (which must be on `ref`), runs `claude plugin validate`, and comments with what it can do: files, programs, network, secrets, model usage, whether it can act for the user, and any settings hooks, MCP servers, LSP servers or monitors it ships. Your plugin's own tests run too and appear as an informational badge.

A listing pull request may only change `registry/listings/` and `registry/media/`. Never edit `registry/generated/` or `.claude-plugin/` — the publish workflow writes those.

If the plugin can do something risky — write files, run programs, use the network, read secrets, act for the user, rewrite the session, control other mods, or ship code that runs on its own (settings hooks, MCP/LSP servers, monitors) — the pull request gets `needs-permission-review` and can merge only after a maintainer **approves its latest commit**. Pushing again needs a new approval.

## 3. Updates

Open a PR that changes `sha`. The review posts what changed since the reviewed version, including any change to the source repository or maintainers. Pointing a listing at a different repository always needs a maintainer's approval.

## Renaming

Slugs can't change: a rename uninstalls the mod for everyone who has it. Change `displayName` instead.
