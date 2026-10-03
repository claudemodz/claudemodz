import type { Listing, ScanResult } from '@claudemodz/schema'

export type MarketplaceEntryInput = { listing: Listing; scan: ScanResult | null }

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

export function buildMarketplace(
  entries: readonly MarketplaceEntryInput[],
  renames: Record<string, string | null> = {},
): Marketplace {
  const plugins = entries
    .filter((entry): entry is { listing: Listing; scan: ScanResult } => entry.scan !== null && entry.scan.validator.success)
    .sort((a, b) => a.listing.slug.localeCompare(b.listing.slug))
    .map(({ listing, scan }) => ({
      name: listing.slug,
      displayName: listing.displayName,
      description: listing.summary,
      category: listing.category,
      tags: listing.tags,
      source: sourceOf(listing),
      metadata: { claudemodz: { url: `https://claudemodz.com/m/${listing.slug}`, risk: scan.risk } },
    }))
  return {
    name: 'claudemodz',
    owner: { name: 'claudemodz', url: 'https://claudemodz.com' },
    description: 'Community Claude Code mods and plugins, reviewed and pinned. claudemodz.com',
    forceRemoveDeletedPlugins: true,
    renames,
    plugins,
  }
}
