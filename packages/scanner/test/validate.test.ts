import { describe, expect, it } from 'vitest'

import { reportOf, testCountsOf } from '../src/validate'

describe('reportOf', () => {
  it('flattens manifest and contents into one report', () => {
    const report = reportOf({
      success: false,
      manifest: { errors: [], warnings: [{ path: 'author', message: 'No author', code: null }], notes: [] },
      contents: [
        {
          type: 'hooks',
          errors: [{ path: 'modules../register.js', message: 'cannot import "node:child_process"', code: null }],
          warnings: [],
          notes: ['./register.js hooks: session.start'],
        },
      ],
    })
    expect(report).toEqual({
      success: false,
      errors: ['modules../register.js: cannot import "node:child_process"'],
      warnings: ['author: No author'],
      notes: ['./register.js hooks: session.start'],
    })
  })

  it('treats output that is not a validator report as a failure', () => {
    expect(reportOf('nonsense')).toEqual({
      success: false,
      errors: ['claude plugin validate did not return a JSON report'],
      warnings: [],
      notes: [],
    })
  })
})

describe('testCountsOf', () => {
  it('reads pass and fail counts', () => {
    expect(testCountsOf('tests/a.test.ts:\n 13 pass\n 2 fail\nRan 15 tests across 2 files.')).toEqual({ passed: 13, failed: 2 })
  })

  it('returns null when nothing ran', () => {
    expect(testCountsOf('no tests')).toBeNull()
  })
})
