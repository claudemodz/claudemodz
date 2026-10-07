import { PRESETS, parseProjectJson, type Project } from '../../../packages/studio/src/config'
import { decodeProject } from '../../../packages/studio/src/share'
export const STORAGE_KEY = 'claudemodz-studio-v1'
type StorageReader = { getItem(key: string): string | null }
export type Boot = { project: Project; notice: string; source: 'saved' | 'remix' | 'starter'; previous?: Project }
export function loadProject(storage: StorageReader, hash: string): Boot {
  const fallback = () => structuredClone(PRESETS[0]!.project)
  let saved: Project | undefined
  let storageError = false
  try {
    const text = storage.getItem(STORAGE_KEY)
    if (text) saved = parseProjectJson(text)
  } catch {
    storageError = true
  }
  if (hash.startsWith('#studio=')) {
    try {
      return {
        project: decodeProject(hash),
        source: 'remix',
        previous: saved,
        notice: 'Remix loaded. Undo restores your previous workspace.',
      }
    } catch {
      return {
        project: saved || fallback(),
        source: saved ? 'saved' : 'starter',
        notice: 'That remix link could not be opened. Your saved project has not been changed.',
      }
    }
  }
  return {
    project: saved || fallback(),
    source: saved ? 'saved' : 'starter',
    notice: storageError ? 'The saved project could not be read. You can still build and export a new one.' : '',
  }
}
