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
