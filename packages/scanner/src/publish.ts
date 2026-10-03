import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseListing, ScanResultSchema, type Listing, type ListingSource, type ScanResult } from '@claudemodz/schema'

import { buildMarketplace } from './marketplace'
import type { FetchedSource } from './source'

export type PublishDeps = {
  fetch: (source: ListingSource) => Promise<FetchedSource>
  scan: (dir: string, slug: string, sha: string) => Promise<ScanResult>
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

async function listingSlugs(root: string): Promise<string[]> {
  const files = await readdir(join(root, 'registry/listings')).catch(() => [])
  return files.filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -'.yaml'.length)).sort()
}

async function readListing(root: string, slug: string): Promise<Listing | null> {
  const text = await readFile(join(root, `registry/listings/${slug}.yaml`), 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = parseListing(text, `${slug}.yaml`)
  return parsed.ok ? parsed.listing : null
}

async function readScan(root: string, slug: string): Promise<ScanResult | null> {
  const text = await readFile(join(root, `registry/generated/${slug}.json`), 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = ScanResultSchema.safeParse(JSON.parse(text))
  return parsed.success ? parsed.data : null
}

/** Rescans the given listings, prunes scans of deleted listings, and rewrites the marketplace. */
export async function publishRegistry(root: string, slugsToScan: readonly string[] | 'all', deps: PublishDeps): Promise<{ written: string[]; removed: string[] }> {
  const slugs = await listingSlugs(root)
  const targets = slugsToScan === 'all' ? slugs : slugsToScan.filter(slug => slugs.includes(slug))
  await mkdir(join(root, 'registry/generated'), { recursive: true })

  const written: string[] = []
  for (const slug of targets) {
    const listing = await readListing(root, slug)
    if (listing === null) continue
    const fetched = await deps.fetch(listing.source)
    if (!fetched.ok) {
      await rm(join(root, `registry/generated/${slug}.json`), { force: true })
      continue
    }
    await writeFile(join(root, `registry/generated/${slug}.json`), json(await deps.scan(fetched.dir, slug, listing.source.sha)))
    written.push(slug)
  }

  const generated = (await readdir(join(root, 'registry/generated'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
  const removed = generated.filter(slug => !slugs.includes(slug)).sort()
  for (const slug of removed) await rm(join(root, `registry/generated/${slug}.json`))

  const entries = []
  for (const slug of slugs) {
    const listing = await readListing(root, slug)
    if (listing !== null) entries.push({ listing, scan: await readScan(root, slug) })
  }
  await mkdir(join(root, '.claude-plugin'), { recursive: true })
  await writeFile(join(root, '.claude-plugin/marketplace.json'), json(buildMarketplace(entries)))
  return { written, removed }
}
