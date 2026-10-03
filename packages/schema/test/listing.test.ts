import { describe, expect, it } from 'vitest'

import { parseListing } from '@claudemodz/schema'

const SHA = '0123456789abcdef0123456789abcdef01234567'

const VALID = `slug: ci-pane
displayName: CI Pane
summary: Live PR checks beside the transcript, with re-run and open buttons.
source:
  type: git-subdir
  repo: claudemodz/mods
  path: plugins/ci-pane
  ref: main
  sha: ${SHA}
authors:
  - github: snagrecha
maintainers: [snagrecha]
license: MIT
category: git-ci
tags: [github, pull-requests]
media:
  - file: demo.gif
    alt: CI pane showing two passing checks and one failing
submittedBy: snagrecha
`

describe('parseListing', () => {
  it('accepts a valid listing', () => {
    const parsed = parseListing(VALID, 'ci-pane.yaml')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.listing.source).toEqual({
        type: 'git-subdir',
        repo: 'claudemodz/mods',
        path: 'plugins/ci-pane',
        ref: 'main',
        sha: SHA,
      })
    }
  })

  it('defaults tags and media to empty', () => {
    const text = VALID.replace(/tags:.*\n/, '').replace(/media:\n(  .*\n)+/, '')
    const parsed = parseListing(text, 'ci-pane.yaml')
    expect(parsed.ok && parsed.listing.tags).toEqual([])
    expect(parsed.ok && parsed.listing.media).toEqual([])
  })

  it('rejects an unknown or misspelled key, naming it', () => {
    const parsed = parseListing(VALID.replace('category: git-ci', 'catgory: git-ci'), 'ci-pane.yaml')
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors.join('\n')).toMatch(/catgory/)
  })

  it('requires the file name to match the slug', () => {
    const parsed = parseListing(VALID, 'ci-panel.yaml')
    expect(!parsed.ok && parsed.errors).toContain('file name must be ci-pane.yaml to match the slug')
  })

  it('rejects a short sha, a path with .., and an unknown category', () => {
    const bad = VALID.replace(SHA, 'abc123').replace('plugins/ci-pane', '../escape').replace('git-ci', 'devops')
    const parsed = parseListing(bad, 'ci-pane.yaml')
    const text = !parsed.ok ? parsed.errors.join('\n') : ''
    expect(text).toMatch(/source\.sha/)
    expect(text).toMatch(/source\.path/)
    expect(text).toMatch(/category/)
  })

  it('reports YAML syntax errors instead of throwing', () => {
    const parsed = parseListing('slug: [unclosed', 'x.yaml')
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors[0]).toMatch(/^YAML:/)
  })

  it('limits media to three files', () => {
    const many = VALID.replace(
      /media:\n(  .*\n)+/,
      'media:\n' + [1, 2, 3, 4].map(n => `  - file: d${n}.png\n    alt: shot ${n}\n`).join(''),
    )
    const parsed = parseListing(many, 'ci-pane.yaml')
    expect(!parsed.ok && parsed.errors.join('\n')).toMatch(/media/)
  })
})
