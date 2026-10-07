import { parseProject, type Project } from './config'

export const MIT_LICENSE = `MIT License

Copyright (c) 2026 ClaudeModz contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
const json = (data: unknown) => JSON.stringify(data, null, 2) + '\n'
const markdown = (value: string) => value.replace(/[\\`*_{}\[\]()<>#+!|]/g, '\\$&')
export function pluginFiles(input: Project, runtimeSource: string, registerSource: string): Record<string, string> {
  const project = parseProject(input)
  return {
    '.claude-plugin/plugin.json': json({
      name: project.slug,
      displayName: project.name,
      version: '0.1.0',
      description: 'A personal Claude Code workspace built with ClaudeModz Studio.',
      author: { name: 'Studio creator' },
      license: 'MIT',
    }),
    'hooks/hooks.json': json({ modules: ['./register.js'] }),
    'hooks/config.js': `export default ${json(project).trim()};\n`,
    'hooks/runtime.js': runtimeSource,
    'hooks/register.js': registerSource,
    'studio.json': json(project),
    LICENSE: MIT_LICENSE,
    'README.md': `# ${markdown(project.name)}\n\nA personal workspace for Claude Code, made in [ClaudeModz Studio](https://github.com/claudemodz/claudemodz).\n\n## Try it\n\nRequires Claude Code 2.1.288 or later, with mods enabled. Extract this folder, then run these commands from its parent:\n\n\`\`\`sh\nclaude plugin validate ./${project.slug}\nclaude --plugin-dir ./${project.slug}\n\`\`\`\n\nKeep this folder; use the same --plugin-dir option for future sessions. This is a local plugin, not an automatically installed marketplace entry. If mods are disabled by your host or organization, the plugin cannot enable them.\n\n## Use it\n\nRun \`/${project.slug}\` for a text summary. Use \`/${project.slug} hide\` or \`show\` to toggle the workspace. \`/${project.slug} check 1\` toggles the first checklist item (numbering continues across checklists); \`reset\` clears checklist completion. Buttons also toggle items when the full layout is visible. Checklist progress is session-local.\n\nContext and token counts stay unknown until the host reports a measurement. Budget targets are advisory: they do not enforce spending limits. Turn timing reports the last and accumulated durations of observed main turns, including interruptions; it resets with the session. A finished turn does not mean tests or a deployment succeeded. Narrow layouts show a single summary line; use the slash command for full details. The mod yields during surveys and in agent transcript views.\n\n## Capabilities\n\nObserves session lifecycle, turn lifecycle and usage measurements; registers one immediate slash command; draws in the interface. Does not call models, run programs, access files, read secrets, make network requests or store conversations. It does not retain prompt text. Mods run with the host's privileges; this capability description is not a sandbox.\n\nThe terminal is the primary target. Desktop render contracts are tested with Claude's native harness; live desktop painting can differ. Noninteractive sessions have no visual workspace.\n\n## Remix\n\nImport \`studio.json\` into Studio to edit this configuration. It contains your widget labels, notes, budget target and checklist text, so review it before sharing. Browser previews use sample data; this plugin starts with actual session state.\n\n## License\n\nMIT. Unofficial community project, not affiliated with Anthropic.\n`,
  }
}
