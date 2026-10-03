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
  validateEntry: (listing: Listing, scan: ScanResult) => Promise<string[]>
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

const LISTING_PATH = /^registry\/(listings|media)\//
const PUBLISHED_PATH = /^(registry\/generated\/|\.claude-plugin\/)/
const isPlaceholder = (file: string) => file.endsWith('/.gitkeep')

/** A listing PR may only touch listings and media; nothing may hand-edit what publish writes. */
export function scopeErrors(changedFiles: readonly string[]): string[] {
  const errors: string[] = []
  const published = changedFiles.filter(file => PUBLISHED_PATH.test(file))
  if (published.length > 0) {
    errors.push(`scope: registry/generated and .claude-plugin are written by publish; remove ${published.join(', ')} from this pull request`)
  }
  const listings = changedFiles.filter(file => LISTING_PATH.test(file) && !isPlaceholder(file))
  const others = changedFiles.filter(file => !LISTING_PATH.test(file) && !PUBLISHED_PATH.test(file))
  if (listings.length > 0 && others.length > 0) {
    errors.push(`scope: a listing pull request may only change registry/listings and registry/media (it also changes ${others.join(', ')})`)
  }
  return errors
}

const sourceLabel = (source: ListingSource) => (source.type === 'git-subdir' ? `${source.repo}/${source.path}` : source.repo)

function listingChanges(before: Listing | null, after: Listing): { changes: string[]; sourceChanged: boolean } {
  if (before === null) return { changes: [], sourceChanged: false }
  const changes: string[] = []
  const sourceChanged = sourceLabel(before.source) !== sourceLabel(after.source)
  if (sourceChanged) changes.push(`Source changed from ${sourceLabel(before.source)} to ${sourceLabel(after.source)}`)
  const people = (list: readonly string[]) => list.join(', ')
  if (people(before.maintainers) !== people(after.maintainers)) {
    changes.push(`Maintainers changed from ${people(before.maintainers)} to ${people(after.maintainers)}`)
  }
  const authors = (listing: Listing) => people(listing.authors.map(a => a.github))
  if (authors(before) !== authors(after)) changes.push(`Authors changed from ${authors(before)} to ${authors(after)}`)
  return { changes, sourceChanged }
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
  const result: CheckedListing = { slug, file, removed: false, errors: [], warnings: [], scan: null, diff: null, changes: [], sourceChanged: false }
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

  Object.assign(result, listingChanges(await deps.baseListingOf(slug), listing))
  result.errors.push(...(await mediaErrors(root, listing)))
  const fetched = await deps.fetch(listing.source)
  if (!fetched.ok) return { ...result, errors: [...result.errors, fetched.error] }

  const scan = await deps.scan(fetched.dir, slug, listing.source.sha)
  result.scan = scan
  if (!scan.validator.success) result.errors.push(...scan.validator.errors.map(error => `claude plugin validate: ${error}`))
  else result.errors.push(...(await deps.validateEntry(listing, scan)).map(error => `marketplace: ${error}`))
  for (const url of scan.external.remoteBundles) {
    result.errors.push(`mcpServers: the remote bundle ${url} isn't pinned to the listing's commit; ship the bundle in the repository instead`)
  }
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
        changes: [],
        sourceChanged: false,
      })
    }
  }
  return results
}

export function summarize(results: readonly CheckedListing[]): CheckSummary {
  return {
    failed: results.some(r => r.errors.length > 0),
    needsReview: results.some(r => r.diff?.needsReview === true || r.sourceChanged),
  }
}
