import { zipSync, strToU8 } from 'fflate'
import { parseProject, type Project } from './config'
import { pluginFiles } from './export'

export function pluginArchive(project: Project, runtime: string, register: string): Uint8Array<ArrayBuffer> {
  const parsed = parseProject(project)
  const entries = Object.fromEntries(
    Object.entries(pluginFiles(parsed, runtime, register)).map(([path, content]) => [
      `${parsed.slug}/${path}`,
      strToU8(content),
    ]),
  )
  return zipSync(entries, { level: 6 })
}
