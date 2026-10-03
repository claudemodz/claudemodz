import { run } from './proc'

export type ValidateReport = { success: boolean; errors: string[]; warnings: string[]; notes: string[] }

type Issue = { path?: unknown; message?: unknown }
type Section = { errors?: unknown; warnings?: unknown; notes?: unknown }

const issues = (list: unknown): string[] =>
  (Array.isArray(list) ? (list as Issue[]) : []).map(issue =>
    typeof issue.path === 'string' && issue.path ? `${issue.path}: ${String(issue.message)}` : String(issue.message),
  )
const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [])

/** Flattens `claude plugin validate --json` output into one report. */
export function reportOf(json: unknown): ValidateReport {
  if (typeof json !== 'object' || json === null || !('success' in json)) {
    return { success: false, errors: ['claude plugin validate did not return a JSON report'], warnings: [], notes: [] }
  }
  const data = json as { success: unknown; manifest?: Section; contents?: unknown }
  const sections: Section[] = [data.manifest ?? {}, ...(Array.isArray(data.contents) ? (data.contents as Section[]) : [])]
  return {
    success: data.success === true,
    errors: sections.flatMap(s => issues(s.errors)),
    warnings: sections.flatMap(s => issues(s.warnings)),
    notes: sections.flatMap(s => strings(s.notes)),
  }
}

export async function runValidate(dir: string): Promise<ValidateReport> {
  const result = await run('claude', ['plugin', 'validate', dir, '--json'], { timeoutMs: 120_000 })
  try {
    return reportOf(JSON.parse(result.stdout))
  } catch {
    return reportOf(null)
  }
}

export function testCountsOf(output: string): { passed: number; failed: number } | null {
  const passed = output.match(/^\s*(\d+) pass\s*$/m)
  const failed = output.match(/^\s*(\d+) fail\s*$/m)
  if (!passed && !failed) return null
  return { passed: Number(passed?.[1] ?? 0), failed: Number(failed?.[1] ?? 0) }
}

export async function runPluginTests(dir: string): Promise<{ passed: number; failed: number } | null> {
  const result = await run('claude', ['plugin', 'test', dir], { timeoutMs: 300_000 })
  return testCountsOf(`${result.stdout}\n${result.stderr}`)
}

export async function claudeVersion(): Promise<string> {
  const result = await run('claude', ['--version'])
  return result.stdout.trim().split(' ')[0] ?? 'unknown'
}
