import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { CONTAINS, type Contains } from '@claudemodz/schema'

type Named = { name: string; command: string }

export type ExternalCode = {
  settingsHooks: { event: string; command: string }[]
  mcpServers: { name: string; command: string | null; url: string | null }[]
  lspServers: Named[]
  monitors: Named[]
  bundles: string[]
  remoteBundles: string[]
}

export type PluginContents = {
  manifest: { name: string; version: string | null; description: string | null; license: string | null }
  contains: Contains[]
  external: ExternalCode
  hasTests: boolean
}

type Json = Record<string, unknown>

async function readJsonValue(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

async function readJson(path: string): Promise<Json | null> {
  const data = await readJsonValue(path)
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Json) : null
}

async function isNonEmptyDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory() && (await readdir(path)).length > 0
  } catch {
    return false
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : null)
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {})
const list = (value: unknown): unknown[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value])
const isBundle = (value: string) => /\.(mcpb|dxt)$/i.test(value)
const isUrl = (value: string) => /^https?:\/\//i.test(value)

function commandLine(config: Json): string | null {
  const command = str(config.command)
  const args = Array.isArray(config.args) ? config.args.filter((a): a is string => typeof a === 'string') : []
  return command === null ? null : [command, ...args].join(' ')
}

/** Flattens a hooks event map (`{ Event: [{ matcher, hooks: [...] }] }`) into commands. */
function settingsHooksOf(eventMap: unknown): ExternalCode['settingsHooks'] {
  const found: ExternalCode['settingsHooks'] = []
  for (const [event, matchers] of Object.entries(obj(eventMap))) {
    for (const matcher of list(matchers)) {
      for (const hook of list(obj(matcher).hooks)) {
        const h = obj(hook)
        const command = str(h.command) ?? str(h.url) ?? (str(h.prompt) !== null ? `prompt: ${str(h.prompt)}` : null)
        if (command !== null) found.push({ event, command })
      }
    }
  }
  return found
}

/** An `.mcp.json`-style document, with or without the `mcpServers` wrapper. */
function serverMapOf(document: unknown): Json {
  const json = obj(document)
  return 'mcpServers' in json ? obj(json.mcpServers) : json
}

/** Reads what a plugin directory contains, from its files (the validator reports only mod code). */
export async function readContents(dir: string): Promise<PluginContents> {
  const manifest = await readJson(join(dir, '.claude-plugin', 'plugin.json'))
  if (manifest === null) throw new Error(`no .claude-plugin/plugin.json in ${dir}`)
  const inPlugin = (path: string) => join(dir, path)

  // Hooks: hooks/hooks.json, then the manifest's path / inline map / array of either.
  const hooksFile = (await readJson(inPlugin('hooks/hooks.json'))) ?? {}
  const settingsHooks = settingsHooksOf(hooksFile.hooks)
  let hasModules = Array.isArray(hooksFile.modules) && hooksFile.modules.length > 0
  for (const item of list(manifest.hooks)) {
    if (typeof item === 'string') {
      const file = (await readJson(inPlugin(item))) ?? {}
      settingsHooks.push(...settingsHooksOf(file.hooks))
      hasModules ||= Array.isArray(file.modules) && file.modules.length > 0
    } else {
      settingsHooks.push(...settingsHooksOf(item))
    }
  }

  // MCP: .mcp.json, then the manifest's file paths, bundles, URLs and inline maps; later names replace earlier.
  const servers = new Map<string, ExternalCode['mcpServers'][number]>()
  const addServers = (map: Json) => {
    for (const [name, value] of Object.entries(map)) {
      servers.set(name, { name, command: commandLine(obj(value)), url: str(obj(value).url) })
    }
  }
  const bundles: string[] = []
  const remoteBundles: string[] = []
  addServers(serverMapOf(await readJsonValue(inPlugin('.mcp.json'))))
  for (const item of list(manifest.mcpServers)) {
    if (typeof item !== 'string') addServers(obj(item))
    else if (isBundle(item)) (isUrl(item) ? remoteBundles : bundles).push(item)
    else addServers(serverMapOf(await readJsonValue(inPlugin(item))))
  }

  // LSP: .lsp.json, then the manifest's path / inline map / array.
  const lsp = new Map<string, Named>()
  const addLsp = (map: Json) => {
    for (const [name, value] of Object.entries(map)) lsp.set(name, { name, command: commandLine(obj(value)) ?? '' })
  }
  addLsp(obj(await readJsonValue(inPlugin('.lsp.json'))))
  for (const item of list(manifest.lspServers)) addLsp(typeof item === 'string' ? obj(await readJsonValue(inPlugin(item))) : obj(item))

  // Monitors: experimental.monitors (or a legacy top-level monitors) replaces monitors/monitors.json.
  const declared = obj(manifest.experimental).monitors ?? manifest.monitors
  const monitorList =
    declared === undefined
      ? list(await readJsonValue(inPlugin('monitors/monitors.json')))
      : typeof declared === 'string'
        ? list(await readJsonValue(inPlugin(declared)))
        : list(declared)
  const monitors = monitorList
    .map(entry => ({ name: str(obj(entry).name) ?? '', command: str(obj(entry).command) ?? '' }))
    .filter(monitor => monitor.command !== '')

  const external: ExternalCode = {
    settingsHooks,
    mcpServers: [...servers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    lspServers: [...lsp.values()].sort((a, b) => a.name.localeCompare(b.name)),
    monitors,
    bundles,
    remoteBundles,
  }

  const present: Record<Contains, boolean> = {
    mod: hasModules,
    skill: await isNonEmptyDir(inPlugin('skills')),
    agent: await isNonEmptyDir(inPlugin('agents')),
    command: await isNonEmptyDir(inPlugin('commands')),
    'settings-hook': settingsHooks.length > 0,
    mcp: external.mcpServers.length > 0 || bundles.length > 0 || remoteBundles.length > 0,
    lsp: external.lspServers.length > 0,
    'output-style': await isNonEmptyDir(inPlugin('output-styles')),
    theme: await isNonEmptyDir(inPlugin('themes')),
    workflow: await isNonEmptyDir(inPlugin('workflows')),
    monitor: monitors.length > 0,
  }

  return {
    manifest: {
      name: str(manifest.name) ?? '',
      version: str(manifest.version),
      description: str(manifest.description),
      license: str(manifest.license),
    },
    contains: CONTAINS.filter(kind => present[kind]),
    external,
    hasTests: await hasTestFiles(dir),
  }
}

async function hasTestFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries.some(
    entry => entry.isFile() && /\.test\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.parentPath.includes('node_modules'),
  )
}
