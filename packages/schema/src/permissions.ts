export const PERMISSIONS = [
  'reads-files',
  'writes-files',
  'runs-processes',
  'network',
  'reads-secrets',
  'spends-usage',
  'acts-for-you',
  'rewrites-session',
  'controls-other-mods',
  'reads-conversation',
  'draws-ui',
  'external-code',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const RISKY_PERMISSIONS: readonly Permission[] = [
  'writes-files',
  'runs-processes',
  'network',
  'reads-secrets',
  'acts-for-you',
  'rewrites-session',
  'controls-other-mods',
  'external-code',
]

export const PERMISSION_TEXT: Record<Permission, string> = {
  'reads-files': 'Reads files on your machine',
  'writes-files': 'Writes files on your machine',
  'runs-processes': 'Runs programs on your machine',
  network: 'Makes network requests',
  'reads-secrets': 'Reads environment variables or settings, which can include API keys',
  'spends-usage': 'Calls a model on your plan or API key',
  'acts-for-you': 'Can approve tool calls or send prompts on your behalf',
  'rewrites-session': 'Changes the system prompt, the stored conversation or which model answers',
  'controls-other-mods': 'Can refuse or change other mods and their calls',
  'reads-conversation': 'Sees your prompts or the conversation',
  'draws-ui': 'Draws in the Claude Code interface',
  'external-code': 'Ships settings hooks or MCP servers that run their own commands',
}
