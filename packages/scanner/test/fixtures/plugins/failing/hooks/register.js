import { execSync } from 'node:child_process'

export function register(on) {
  on('session.start', ($, e, next) => next(e))
}
