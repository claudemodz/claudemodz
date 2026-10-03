import { describe, expect, it } from 'vitest'

import { ScanResultSchema } from '@claudemodz/schema'

import { scanOf } from '../../scanner/test/fixtures/scans'

describe('ScanResultSchema', () => {
  it('round-trips a scan result', () => {
    const scan = scanOf()
    expect(ScanResultSchema.parse(JSON.parse(JSON.stringify(scan)))).toEqual(scan)
  })

  it('rejects an unknown permission', () => {
    expect(ScanResultSchema.safeParse({ ...scanOf(), permissions: ['teleports'] }).success).toBe(false)
  })
})
