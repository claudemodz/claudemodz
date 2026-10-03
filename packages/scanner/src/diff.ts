import { RISKY_PERMISSIONS, type Permission, type ScanResult } from '@claudemodz/schema'

export type PermissionDiff = {
  addedEvents: string[]
  removedEvents: string[]
  addedCalls: string[]
  removedCalls: string[]
  addedPermissions: Permission[]
  removedPermissions: Permission[]
  addedExternal: string[]
  removedExternal: string[]
  needsReview: boolean
}

export function externalKeys(scan: ScanResult): string[] {
  return [
    ...scan.external.settingsHooks.map(hook => `settings hook ${hook.event}: ${hook.command}`),
    ...scan.external.mcpServers.map(server => `MCP server ${server.name}: ${server.command ?? server.url ?? ''}`),
  ]
}

const minus = <T>(a: readonly T[], b: readonly T[]) => a.filter(item => !b.includes(item))

/** What changed between the reviewed scan and the new one; null before means a new listing. */
export function diffScans(before: ScanResult | null, after: ScanResult): PermissionDiff {
  const was = {
    events: before?.mod?.events ?? [],
    calls: before?.mod?.calls ?? [],
    permissions: before?.permissions ?? [],
    external: before ? externalKeys(before) : [],
  }
  const now = {
    events: after.mod?.events ?? [],
    calls: after.mod?.calls ?? [],
    permissions: after.permissions,
    external: externalKeys(after),
  }
  const addedPermissions = minus(now.permissions, was.permissions)
  const addedExternal = minus(now.external, was.external)
  const needsReview =
    before === null
      ? after.risk === 'elevated'
      : addedPermissions.some(p => RISKY_PERMISSIONS.includes(p)) || addedExternal.length > 0
  return {
    addedEvents: minus(now.events, was.events),
    removedEvents: minus(was.events, now.events),
    addedCalls: minus(now.calls, was.calls),
    removedCalls: minus(was.calls, now.calls),
    addedPermissions,
    removedPermissions: minus(was.permissions, now.permissions),
    addedExternal,
    removedExternal: minus(was.external, now.external),
    needsReview,
  }
}
