import { MAX_PROJECT_BYTES, parseProject, parseProjectJson, type Project } from './config'

export function encodeProject(project: Project): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parseProject(project)))
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Project is too large to share.')
  return (
    '#studio=' +
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  )
}
export function decodeProject(fragment: string): Project {
  if (!fragment.startsWith('#studio=') || fragment.length > 17_000)
    throw new Error('This is not a valid Studio remix link.')
  const value = fragment.slice(8)
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('This remix link is incomplete or malformed.')
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    return parseProjectJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('This remix link is invalid or uses an unsupported project version.')
  }
}
