import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { PRESETS } from '../packages/studio/src/config'
import { pluginFiles } from '../packages/studio/src/export'
import { pluginArchive } from '../packages/studio/src/archive'
import { run } from '../packages/scanner/src/proc'

const work = await mkdtemp(join(tmpdir(), 'studio-native-'))
const profile = join(work, 'profile')
const runtime = await readFile(new URL('../packages/studio/src/runtime.js', import.meta.url), 'utf8')
const register = await readFile(new URL('../packages/studio/src/register.js', import.meta.url), 'utf8')
try {
  for (const preset of PRESETS) {
    const dir = join(work, preset.id)
    for (const [path, text] of Object.entries(pluginFiles(preset.project, runtime, register))) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), text)
    }
    const result = await run('claude', ['plugin', 'validate', dir, '--strict', '--json'])
    if (result.code !== 0) throw Error(result.stdout + '\n' + result.stderr)
    const report = JSON.parse(result.stdout)
    if (report.success !== true) throw Error('Validation failed: ' + result.stdout)
    console.log(`Validated ${preset.name}`)
    if (preset.id === 'mission') {
      await mkdir(join(dir, 'tests'))
      await writeFile(
        join(dir, 'tests', 'studio.test.ts'),
        await readFile(new URL('../packages/studio/test/native.fixture.txt', import.meta.url), 'utf8'),
      )
      const test = await run('claude', ['plugin', 'test', dir], { env: { ...process.env, CLAUDE_CONFIG_DIR: profile } })
      process.stdout.write(test.stdout)
      process.stderr.write(test.stderr)
      if (test.code !== 0) throw Error('Native generated-plugin tests failed')
    }
  }
  if (process.argv.includes('--export')) {
    const output = resolve('artifacts/mission-control')
    for (const [path, text] of Object.entries(pluginFiles(PRESETS[0]!.project, runtime, register))) {
      await mkdir(dirname(join(output, path)), { recursive: true })
      await writeFile(join(output, path), text)
    }
    console.log('Example exported to ' + output)
    await writeFile(resolve('artifacts/mission-control.zip'), pluginArchive(PRESETS[0]!.project, runtime, register))
  }
} finally {
  await rm(work, { recursive: true, force: true })
}
