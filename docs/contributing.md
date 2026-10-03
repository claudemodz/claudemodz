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
