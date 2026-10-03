import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readContents } from '../src/contents'

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', 'plugins', name)

describe('readContents', () => {
  it('a mod with tests', async () => {
    const contents = await readContents(fixture('standard'))
    expect(contents.manifest).toEqual({
      name: 'standard',
      version: '1.0.0',
      description: 'Reads a file through a helper.',
      license: 'MIT',
    })
    expect(contents.contains).toEqual(['mod'])
    expect(contents.hasTests).toBe(true)
    expect(contents.external).toEqual({ settingsHooks: [], mcpServers: [] })
  })

  it('skills, agents, commands, settings hooks and MCP servers', async () => {
    const contents = await readContents(fixture('mixed'))
    expect(contents.contains).toEqual(['skill', 'agent', 'command', 'settings-hook', 'mcp'])
    expect(contents.external.settingsHooks).toEqual([{ event: 'PostToolUse', command: 'npx prettier --write "$FILE"' }])
    expect(contents.external.mcpServers).toEqual([
      { name: 'docs', command: null, url: 'https://mcp.example.com/docs' },
      { name: 'fs', command: 'npx -y @modelcontextprotocol/server-filesystem /tmp', url: null },
    ])
    expect(contents.hasTests).toBe(false)
  })

  it('a skill-only plugin has no mod and no external code', async () => {
    const contents = await readContents(fixture('skill-only'))
    expect(contents.contains).toEqual(['skill'])
    expect(contents.manifest.license).toBeNull()
  })

  it('a directory without a manifest is an error', async () => {
    await expect(readContents(fixture('does-not-exist'))).rejects.toThrow(/no \.claude-plugin\/plugin\.json/)
  })
})
