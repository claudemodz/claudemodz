import { describe, expect, it } from 'vitest'

import { scrubbedEnv } from '../src/proc'

describe('scrubbedEnv', () => {
  it('drops tokens, secrets and Actions runtime credentials but keeps the basics', () => {
    expect(
      scrubbedEnv({
        PATH: '/usr/bin',
        HOME: '/home/runner',
        GITHUB_TOKEN: 't',
        GH_TOKEN: 't',
        NPM_TOKEN: 't',
        AWS_SECRET_ACCESS_KEY: 's',
        ACTIONS_RUNTIME_TOKEN: 'r',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'u',
        ANTHROPIC_API_KEY: 'k',
        CI: 'true',
      }),
    ).toEqual({ PATH: '/usr/bin', HOME: '/home/runner', CI: 'true' })
  })
})
