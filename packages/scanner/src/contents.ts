import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { CONTAINS, type Contains } from '@claudemodz/schema'

export type ExternalCode = {
  settingsHooks: { event: string; command: string }[]
  mcpServers: { name: string; command: string | null; url: string | null }[]
}

export type PluginContents = {
  manifest: { name: string; version: string | null; description: string | null; license: string | null }
  contains: Contains[]
  external: ExternalCode
  hasTests: boolean
}

type Json = Record<string, unknown>

async function readJson(path: string): Promise<Json | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Json) : null
  } catch {
    return null
  }
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

function settingsHooksOf(hooks: unknown): ExternalCode['settingsHooks'] {
  const found: ExternalCode['settingsHooks'] = []
  for (const [event, matchers] of Object.entries(obj(hooks))) {
    for (const matcher of Array.isArray(matchers) ? matchers : []) {
      for (const hook of Array.isArray(obj(matcher).hooks) ? (obj(matcher).hooks as unknown[]) : []) {
        const h = obj(hook)
        const command = str(h.command) ?? str(h.url) ?? (str(h.prompt) !== null ? `prompt: ${str(h.prompt)}` : null)
        if (command !== null) found.push({ event, command })
      }
    }
  }
  return found
}

function mcpServersOf(servers: unknown): ExternalCode['mcpServers'] {
  return Object.entries(obj(servers))
    .map(([name, value]) => {
      const server = obj(value)
      const command = str(server.command)
      const args = Array.isArray(server.args) ? server.args.filter((a): a is string => typeof a === 'string') : []
      return { name, command: command === null ? null : [command, ...args].join(' '), url: str(server.url) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function hasTestFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries.some(
    entry => entry.isFile() && /\.test\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.parentPath.includes('node_modules'),
  )
}

/** Reads what a plugin directory contains, from its files (the validator reports only mod code). */
export async function readContents(dir: string): Promise<PluginContents> {
  const manifest = await readJson(join(dir, '.claude-plugin', 'plugin.json'))
  if (manifest === null) throw new Error(`no .claude-plugin/plugin.json in ${dir}`)

  const hooksFile = (await readJson(join(dir, 'hooks', 'hooks.json'))) ?? {}
  const mcpFile = (await readJson(join(dir, '.mcp.json'))) ?? {}
  const lspFile = await readJson(join(dir, '.lsp.json'))

  const settingsHooks = [...settingsHooksOf(hooksFile.hooks), ...settingsHooksOf(manifest.hooks)]
  const mcpServers = mcpServersOf({ ...obj(mcpFile.mcpServers), ...obj(manifest.mcpServers) })
  const modules = Array.isArray(hooksFile.modules) ? hooksFile.modules : []

  const present: Record<Contains, boolean> = {
    mod: modules.length > 0,
    skill: await isNonEmptyDir(join(dir, 'skills')),
    agent: await isNonEmptyDir(join(dir, 'agents')),
    command: await isNonEmptyDir(join(dir, 'commands')),
    'settings-hook': settingsHooks.length > 0,
    mcp: mcpServers.length > 0,
    lsp: lspFile !== null || Object.keys(obj(manifest.lspServers)).length > 0,
    'output-style': await isNonEmptyDir(join(dir, 'output-styles')),
    theme: await isNonEmptyDir(join(dir, 'themes')),
    workflow: await isNonEmptyDir(join(dir, 'workflows')),
    monitor: (await readJson(join(dir, 'monitors', 'monitors.json'))) !== null,
  }

  return {
    manifest: {
      name: str(manifest.name) ?? '',
      version: str(manifest.version),
      description: str(manifest.description),
      license: str(manifest.license),
    },
    contains: CONTAINS.filter(kind => present[kind]),
    external: { settingsHooks, mcpServers },
    hasTests: await hasTestFiles(dir),
  }
}
