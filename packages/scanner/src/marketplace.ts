import type { Listing, ScanResult } from '@claudemodz/schema'

/** One listing as publish sees it: `listing` is null when its YAML no longer parses. */
export type MarketplaceEntryInput = { slug: string; listing: Listing | null; scan: ScanResult | null }

type PluginSource =
  | { source: 'github'; repo: string; ref: string; sha: string }
  | { source: 'git-subdir'; url: string; path: string; ref: string; sha: string }

export type MarketplaceEntry = {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  source: PluginSource
  metadata: { claudemodz: { url: string; risk: 'standard' | 'elevated' } }
}

export type Marketplace = {
  name: 'claudemodz'
  owner: { name: string; url: string }
  description: string
  forceRemoveDeletedPlugins: true
  renames: Record<string, string | null>
  plugins: MarketplaceEntry[]
}

function sourceOf(listing: Listing): PluginSource {
  const { source } = listing
  return source.type === 'github'
    ? { source: 'github', repo: source.repo, ref: source.ref, sha: source.sha }
    : { source: 'git-subdir', url: source.repo, path: source.path, ref: source.ref, sha: source.sha }
}

const isPublishable = (listing: Listing | null, scan: ScanResult | null): listing is Listing =>
  listing !== null && scan !== null && scan.validator.success && scan.sha === listing.source.sha

/**
 * Builds the marketplace from the current listings. A listing whose YAML doesn't parse, or whose scan
 * is missing, failed, or is for another sha, keeps its previously published entry (or stays out if it
 * was never published) — only a listing that is gone from `entries` is removed.
 */
export function buildMarketplace(
  entries: readonly MarketplaceEntryInput[],
  previous: Marketplace | null = null,
  renames: Record<string, string | null> = {},
): Marketplace {
  const before = new Map((previous?.plugins ?? []).map(plugin => [plugin.name, plugin]))
  const plugins: MarketplaceEntry[] = []
  for (const { slug, listing, scan } of [...entries].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (isPublishable(listing, scan)) {
      plugins.push({
        name: listing.slug,
        displayName: listing.displayName,
        description: listing.summary,
        category: listing.category,
        tags: listing.tags,
        source: sourceOf(listing),
        metadata: { claudemodz: { url: `https://claudemodz.com/m/${listing.slug}`, risk: (scan as ScanResult).risk } },
      })
    } else {
      const kept = before.get(slug)
      if (kept !== undefined) plugins.push(kept)
    }
  }
  return {
    name: 'claudemodz',
    owner: { name: 'claudemodz', url: 'https://claudemodz.com' },
    description: 'Community Claude Code mods and plugins, reviewed and pinned. claudemodz.com',
    forceRemoveDeletedPlugins: true,
    renames,
    plugins,
  }
}
