import { PERMISSION_TEXT, type ScanResult } from '@claudemodz/schema'

import type { PermissionDiff } from './diff'

export type CheckedListing = {
  slug: string
  file: string
  removed: boolean
  errors: string[]
  warnings: string[]
  scan: ScanResult | null
  diff: PermissionDiff | null
}

export const COMMENT_MARKER = '<!-- claudemodz-check -->'

const code = (items: readonly string[]) => items.map(item => `\`${item}\``).join(', ')

function section(result: CheckedListing): string {
  const lines = [`### ${result.slug}`]
  if (result.removed) return [...lines, 'Removed from the marketplace. Users who installed it are uninstalled on their next update.'].join('\n')

  lines.push(...result.errors.map(error => `❌ ${error}`), ...result.warnings.map(warning => `⚠️ ${warning}`))
  const { scan, diff } = result
  if (scan === null) return lines.join('\n')

  lines.push('', `**Risk:** ${scan.risk} · **Contains:** ${scan.contains.join(', ') || 'nothing detected'}`)
  lines.push('', '**What it can do**')
  lines.push(...(scan.permissions.length > 0 ? scan.permissions.map(p => `- ${PERMISSION_TEXT[p]}`) : ['- Nothing beyond its own hooks']))
  if (scan.mod !== null) {
    lines.push('', `Hooks: ${code(scan.mod.events) || 'none'}`, `Calls: ${code(scan.mod.calls) || 'none'}`)
    if (scan.mod.envReads.length > 0) lines.push(`Reads environment variables: ${code(scan.mod.envReads)}`)
  }
  for (const hook of scan.external.settingsHooks) lines.push(`Settings hook on ${hook.event}: \`${hook.command}\``)
  for (const server of scan.external.mcpServers) lines.push(`MCP server ${server.name}: \`${server.command ?? server.url ?? ''}\``)
  for (const server of scan.external.lspServers) lines.push(`LSP server ${server.name}: \`${server.command}\``)
  for (const monitor of scan.external.monitors) lines.push(`Monitor ${monitor.name} (runs in the background): \`${monitor.command}\``)
  for (const bundle of scan.external.bundles) lines.push(`MCP bundle: \`${bundle}\``)
  for (const url of scan.external.remoteBundles) lines.push(`Remote MCP bundle: \`${url}\``)
  lines.push('', scan.tests === null ? 'Tests: none' : `Tests: ${scan.tests.passed} passed, ${scan.tests.failed} failed`)

  if (diff !== null) {
    const changes = [
      ...diff.addedPermissions.map(p => `**Added:** ${PERMISSION_TEXT[p]}`),
      ...diff.removedPermissions.map(p => `**Removed:** ${PERMISSION_TEXT[p]}`),
      ...(diff.addedCalls.length ? [`New calls: ${code(diff.addedCalls)}`] : []),
      ...(diff.addedEvents.length ? [`New hooks: ${code(diff.addedEvents)}`] : []),
      ...diff.addedExternal.map(key => `New external code: \`${key}\``),
    ]
    if (changes.length > 0) lines.push('', '**Changes since the reviewed version**', ...changes.map(c => `- ${c}`))
    if (diff.needsReview) lines.push('', '🔒 This needs a maintainer to add the `permissions-approved` label before it can merge.')
  }
  return lines.join('\n')
}

export function renderComment(results: readonly CheckedListing[]): string {
  const body = results.length > 0 ? results.map(section).join('\n\n---\n\n') : 'No listing changes found.'
  return `${COMMENT_MARKER}\n## claudemodz check\n\n${body}\n`
}
