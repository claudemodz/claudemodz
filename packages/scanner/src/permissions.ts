import { PERMISSIONS, RISKY_PERMISSIONS, type Permission } from '@claudemodz/schema'

/** Mods-API calls that are also hookable events: hooking one intercepts other mods' calls. */
const API_EVENT_PREFIXES = ['fs.', 'process.', 'http.', 'model.', 'store.', 'env.', 'settings.', 'clock.', 'mcp.', 'audio.']
const UI_API_EVENTS = ['ui.open', 'ui.close', 'ui.toast', 'ui.status', 'ui.log', 'ui.notice', 'ui.invalidate', 'ui.blit', 'ui.copy', 'ui.ask', 'ui.panes']

const anyOf = (items: readonly string[], names: readonly string[]) => items.some(item => names.includes(item))
const anyPrefixed = (items: readonly string[], prefixes: readonly string[]) =>
  items.some(item => prefixes.some(prefix => item.startsWith(prefix)))

export function permissionsOf(input: { events: readonly string[]; calls: readonly string[]; hasExternal: boolean }): Permission[] {
  const { events, calls } = input
  const found = new Set<Permission>()
  if (anyOf(calls, ['fs.read', 'fs.list', 'fs.exists', 'fs.stat', 'fs.ancestors'])) found.add('reads-files')
  if (anyOf(calls, ['fs.write'])) found.add('writes-files')
  if (anyOf(calls, ['process.run', 'process.spawn'])) found.add('runs-processes')
  if (anyOf(calls, ['http.fetch', 'mcp.connect'])) found.add('network')
  if (anyOf(calls, ['env.get', 'settings.read'])) found.add('reads-secrets')
  if (anyPrefixed(calls, ['model.']) || anyOf(calls, ['agent.spawn'])) found.add('spends-usage')
  if (anyOf(events, ['tool.check']) || anyOf(calls, ['prompt.submit', 'tool.call', 'session.send', 'session.authorize'])) {
    found.add('acts-for-you')
  }
  if (anyOf(events, ['prompt.compose', 'prompt.section', 'session.append', 'turn.step'])) found.add('rewrites-session')
  if (anyOf(events, ['plugin.register', 'engine.create']) || anyPrefixed(events, API_EVENT_PREFIXES) || anyOf(events, UI_API_EVENTS)) {
    found.add('controls-other-mods')
  }
  if (anyOf(events, ['prompt.submit']) || anyOf(calls, ['session.messages'])) found.add('reads-conversation')
  if (anyPrefixed(calls, ['ui.']) || anyOf(events, ['ui.render'])) found.add('draws-ui')
  if (input.hasExternal) found.add('external-code')
  return PERMISSIONS.filter(permission => found.has(permission))
}

export function riskOf(permissions: readonly Permission[]): 'standard' | 'elevated' {
  return permissions.some(permission => RISKY_PERMISSIONS.includes(permission)) ? 'elevated' : 'standard'
}
