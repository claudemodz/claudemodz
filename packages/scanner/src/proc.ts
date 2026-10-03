import { spawn } from 'node:child_process'

export type ProcResult = { code: number; stdout: string; stderr: string }

/** Runs a command and resolves with its exit code and output; never rejects on a non-zero exit. */
export function run(cmd: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<ProcResult> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 300_000)
    child.stdout.on('data', chunk => (stdout += String(chunk)))
    child.stderr.on('data', chunk => (stderr += String(chunk)))
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: stderr + error.message })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}
