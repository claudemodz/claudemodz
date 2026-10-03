import type { ScanResult } from '@claudemodz/schema'

export function scanOf(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    slug: 'ci-pane',
    sha: '0123456789abcdef0123456789abcdef01234567',
    scannedAt: '2026-10-03T12:00:00.000Z',
    claudeCodeVersion: '2.1.288',
    plugin: { name: 'ci-pane', version: '0.1.0', description: 'CI checks', license: 'MIT' },
    contains: ['mod'],
    mod: { events: ['session.start', 'ui.render'], calls: ['process.run', 'ui.open'], envReads: [] },
    external: { settingsHooks: [], mcpServers: [] },
    permissions: ['runs-processes', 'draws-ui'],
    risk: 'elevated',
    validator: { success: true, errors: [], warnings: [] },
    tests: { passed: 18, failed: 0 },
    ...overrides,
  }
}
