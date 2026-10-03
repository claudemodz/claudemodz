import type { ScanResult } from '@claudemodz/schema'

import { readContents } from './contents'
import { parseNotes } from './notes'
import { permissionsOf, riskOf } from './permissions'
import { runPluginTests, runValidate } from './validate'

export type ScanMeta = { slug: string; sha: string; now: Date; claudeCodeVersion: string; withTests: boolean }

/** Scans a fetched plugin directory. Never executes plugin code unless `withTests` is set. */
export async function scanPlugin(dir: string, meta: ScanMeta): Promise<ScanResult> {
  const [contents, report] = await Promise.all([readContents(dir), runValidate(dir)])
  const notes = parseNotes(report.notes)
  const hasMod = contents.contains.includes('mod')
  const mod = hasMod ? { events: notes.events, calls: notes.calls, envReads: notes.envReads } : null
  const hasExternal = contents.external.settingsHooks.length > 0 || contents.external.mcpServers.length > 0
  const permissions = report.success ? permissionsOf({ events: notes.events, calls: notes.calls, hasExternal }) : []
  const tests = meta.withTests && contents.hasTests && report.success ? await runPluginTests(dir) : null
  return {
    slug: meta.slug,
    sha: meta.sha,
    scannedAt: meta.now.toISOString(),
    claudeCodeVersion: meta.claudeCodeVersion,
    plugin: contents.manifest,
    contains: contents.contains,
    mod,
    external: contents.external,
    permissions,
    risk: riskOf(permissions),
    validator: { success: report.success, errors: report.errors, warnings: report.warnings },
    tests,
  }
}
