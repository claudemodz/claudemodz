import { describe, expect, it } from 'vitest'

import { SCHEMA_VERSION } from '@claudemodz/schema'

describe('schema package', () => {
  it('is importable from the workspace', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})
