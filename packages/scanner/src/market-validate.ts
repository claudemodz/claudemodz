import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Listing, ScanResult } from '@claudemodz/schema'

import { buildMarketplace } from './marketplace'
import { run } from './proc'

/**
 * Runs `claude plugin validate` on a marketplace holding just these listings, and returns the errors
 * for each slug — catching what only marketplace validation knows, such as names Claude Code reserves.
 */
export async function validateEntries(entries: readonly { listing: Listing; scan: ScanResult }[]): Promise<Map<string, string[]>> {
  const market = buildMarketplace(entries.map(({ listing, scan }) => ({ slug: listing.slug, listing, scan })))
  const dir = await mkdtemp(join(tmpdir(), 'claudemodz-market-'))
  await mkdir(join(dir, '.claude-plugin'))
  await writeFile(join(dir, '.claude-plugin/marketplace.json'), JSON.stringify(market, null, 2))
  const result = await run('claude', ['plugin', 'validate', dir, '--json'], { timeoutMs: 120_000 })

  const errors = new Map<string, string[]>()
  let report: { manifest?: { errors?: { path?: string; message?: string }[] } } = {}
  try {
    report = JSON.parse(result.stdout)
  } catch {
    for (const { listing } of entries) errors.set(listing.slug, ['claude plugin validate did not return a JSON report for the marketplace'])
    return errors
  }
  for (const issue of report.manifest?.errors ?? []) {
    const index = Number((issue.path ?? '').match(/^plugins[.[](\d+)/)?.[1])
    const slug = Number.isInteger(index) ? market.plugins[index]?.name : undefined
    if (slug === undefined) continue
    errors.set(slug, [...(errors.get(slug) ?? []), `${issue.path}: ${issue.message}`])
  }
  return errors
}
