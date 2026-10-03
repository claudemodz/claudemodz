# Maintaining claudemodz

## How a listing pull request is decided

1. **pr-check** (untrusted, the pull request's code, read-only token) runs the listed plugins' own tests with a scrubbed environment and uploads the counts.
2. **review** (trusted, `main`'s code) finds the pull request whose head is exactly the run's head commit, reads its listing and media files as data, scans each listed plugin at its pinned commit with `claude plugin validate` (static — plugin code never runs here), and posts:
   - the **claudemodz check** comment (plus the test counts as an untrusted badge),
   - the `needs-permission-review` label while risky permissions await approval,
   - the **`claudemodz/review`** commit status.
3. Risky permissions, or a listing pointed at a different repository, need a maintainer (owner, member or collaborator) to **approve the latest commit**. A new push needs a new approval. Submitting a review re-runs pr-check and therefore the review.
4. **publish** (on push to `main`) reconciles the registry: it rescans whatever is out of date, keeps the previous reviewed version of anything that fails (and fails the run so you notice), removes only listings whose YAML was deleted, and commits `registry/generated/` and `.claude-plugin/marketplace.json`.

## Branch protection for `main`

- Require the status checks **`claudemodz/review`** and **`ci / check`**. Both run on every pull request, so they never sit pending.
- Require review from Code Owners (`.github/CODEOWNERS` covers `.github/`, `packages/` and `docs/`), and dismiss stale approvals when new commits are pushed.
- **publish pushes to `main` directly.** If you require pull requests, add **GitHub Actions** as a bypass actor in the branch ruleset (or, from phase 3, the `claudemodz-bot` GitHub App). Without a bypass, publish's push is rejected and the marketplace stops updating.

## Bumping Claude Code

Change the pinned version in all four workflows in one pull request. After it merges, publish rescans every listing whose scan came from the old version; anything that newly fails keeps its previous entry and the run fails, listing what needs attention.
