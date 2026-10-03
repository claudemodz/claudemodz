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

/** An inline code span that untrusted text can't close: the fence is longer than any backtick run inside. */
export function inlineCode(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text.replace(/\n/g, ' ')}${pad}${fence}`
}

/** Plain markdown text with HTML, markdown syntax and @mentions neutralized. */
export function plainText(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, ch => `\\${ch}`).replace(/@/g, '@\u200b').replace(/\n/g, ' ')
}

const code = (items: readonly string[]) => items.map(inlineCode).join(', ')

function section(result: CheckedListing): string {
  const lines = [`### ${result.slug}`]
  if (result.removed) return [...lines, 'Removed from the marketplace. Users who installed it are uninstalled on their next update.'].join('\n')

  lines.push(...result.errors.map(error => `❌ ${plainText(error)}`), ...result.warnings.map(warning => `⚠️ ${plainText(warning)}`))
  const { scan, diff } = result
  if (scan === null) return lines.join('\n')

  lines.push('', `**Risk:** ${scan.risk} · **Contains:** ${scan.contains.join(', ') || 'nothing detected'}`)
  lines.push('', '**What it can do**')
  lines.push(...(scan.permissions.length > 0 ? scan.permissions.map(p => `- ${PERMISSION_TEXT[p]}`) : ['- Nothing beyond its own hooks']))
  if (scan.mod !== null) {
    lines.push('', `Hooks: ${code(scan.mod.events) || 'none'}`, `Calls: ${code(scan.mod.calls) || 'none'}`)
    if (scan.mod.envReads.length > 0) lines.push(`Reads environment variables: ${code(scan.mod.envReads)}`)
  }
  for (const hook of scan.external.settingsHooks) lines.push(`Settings hook on ${plainText(hook.event)}: ${inlineCode(hook.command)}`)
  for (const server of scan.external.mcpServers) lines.push(`MCP server ${plainText(server.name)}: ${inlineCode(server.command ?? server.url ?? '')}`)
  for (const server of scan.external.lspServers) lines.push(`LSP server ${plainText(server.name)}: ${inlineCode(server.command)}`)
  for (const monitor of scan.external.monitors) lines.push(`Monitor ${plainText(monitor.name)} (runs in the background): ${inlineCode(monitor.command)}`)
  for (const bundle of scan.external.bundles) lines.push(`MCP bundle: ${inlineCode(bundle)}`)
  for (const url of scan.external.remoteBundles) lines.push(`Remote MCP bundle: ${inlineCode(url)}`)
  lines.push('', scan.tests === null ? 'Tests: none' : `Tests: ${scan.tests.passed} passed, ${scan.tests.failed} failed`)

  if (diff !== null) {
    const changes = [
      ...diff.addedPermissions.map(p => `**Added:** ${PERMISSION_TEXT[p]}`),
      ...diff.removedPermissions.map(p => `**Removed:** ${PERMISSION_TEXT[p]}`),
      ...(diff.addedCalls.length ? [`New calls: ${code(diff.addedCalls)}`] : []),
      ...(diff.addedEvents.length ? [`New hooks: ${code(diff.addedEvents)}`] : []),
      ...diff.addedExternal.map(key => `New external code: ${inlineCode(key)}`),
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
