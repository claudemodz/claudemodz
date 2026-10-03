import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseListing, ScanResultSchema, type Listing, type ListingSource, type ScanResult } from '@claudemodz/schema'

import { buildMarketplace, type Marketplace, type MarketplaceEntryInput } from './marketplace'
import type { FetchedSource } from './source'

export type PublishDeps = {
  fetch: (source: ListingSource) => Promise<FetchedSource>
  scan: (dir: string, slug: string, sha: string) => Promise<ScanResult>
}

export type PublishOutcome = { written: string[]; removed: string[]; failed: { slug: string; error: string }[] }

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

async function listingSlugs(root: string): Promise<string[]> {
  const files = await readdir(join(root, 'registry/listings')).catch(() => [])
  return files.filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -'.yaml'.length)).sort()
}

async function readListing(root: string, slug: string): Promise<{ listing: Listing } | { errors: string[] }> {
  const text = await readFile(join(root, `registry/listings/${slug}.yaml`), 'utf8')
  const parsed = parseListing(text, `${slug}.yaml`)
  return parsed.ok ? { listing: parsed.listing } : { errors: parsed.errors }
}

async function readScan(root: string, slug: string): Promise<ScanResult | null> {
  const text = await readFile(join(root, `registry/generated/${slug}.json`), 'utf8').catch(() => null)
  if (text === null) return null
  try {
    const parsed = ScanResultSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function readMarketplace(root: string): Promise<Marketplace | null> {
  try {
    return JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8')) as Marketplace
  } catch {
    return null
  }
}

/**
 * Reconciles the registry with its listings: rescans every listing whose scan is missing, for another
 * sha or from another Claude Code version (or all, with `force`), keeps the previous reviewed version
 * of anything that fails, removes only listings whose YAML is gone, and rewrites the marketplace.
 */
export async function publishRegistry(
  root: string,
  options: { force: boolean; claudeCodeVersion: string },
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const slugs = await listingSlugs(root)
  const previousMarketplace = await readMarketplace(root)
  await mkdir(join(root, 'registry/generated'), { recursive: true })

  const outcome: PublishOutcome = { written: [], removed: [], failed: [] }
  const entries: MarketplaceEntryInput[] = []
  for (const slug of slugs) {
    const read = await readListing(root, slug)
    const previous = await readScan(root, slug)
    if ('errors' in read) {
      outcome.failed.push({ slug, error: `listing: ${read.errors.join('; ')}` })
      entries.push({ slug, listing: null, scan: previous })
      continue
    }
    const { listing } = read
    const isCurrent = previous !== null && previous.sha === listing.source.sha && previous.claudeCodeVersion === options.claudeCodeVersion
    if (isCurrent && !options.force) {
      entries.push({ slug, listing, scan: previous })
      continue
    }
    const fetched = await deps.fetch(listing.source)
    if (!fetched.ok) {
      outcome.failed.push({ slug, error: fetched.error })
      entries.push({ slug, listing, scan: previous })
      continue
    }
    const scan = await deps.scan(fetched.dir, slug, listing.source.sha)
    if (!scan.validator.success) {
      outcome.failed.push({ slug, error: scan.validator.errors.map(e => `claude plugin validate: ${e}`).join('; ') })
      if (previous !== null) {
        entries.push({ slug, listing, scan: previous })
        continue
      }
    }
    await writeFile(join(root, `registry/generated/${slug}.json`), json(scan))
    outcome.written.push(slug)
    entries.push({ slug, listing, scan })
  }

  const generated = (await readdir(join(root, 'registry/generated'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
  outcome.removed = generated.filter(slug => !slugs.includes(slug)).sort()
  for (const slug of outcome.removed) await rm(join(root, `registry/generated/${slug}.json`))

  await mkdir(join(root, '.claude-plugin'), { recursive: true })
  await writeFile(join(root, '.claude-plugin/marketplace.json'), json(buildMarketplace(entries, previousMarketplace)))
  return outcome
}
