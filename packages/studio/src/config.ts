import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Enter some text.')
    .max(max, `Use ${max} characters or fewer.`)
    .regex(/^[^\u0000-\u001f\u007f-\u009f]*$/, 'Use ordinary text without control characters')
const common = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  title: text(32),
  accent: z.enum(['mint', 'amber', 'sky', 'rose', 'violet']),
}
export const WidgetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('status') }),
  z.strictObject({ ...common, kind: z.literal('context'), showCost: z.boolean().default(false) }),
  z.strictObject({
    ...common,
    kind: z.literal('checklist'),
    items: z.array(text(80)).min(1, 'Add at least one checklist item.').max(6, 'Use at most six checklist items.'),
  }),
])
export const ProjectSchema = z
  .strictObject({
    version: z.literal(1),
    name: text(48),
    slug: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
    density: z.enum(['compact', 'comfortable']),
    widgets: z.array(WidgetSchema).min(1).max(6),
  })
  .refine((p) => new Set(p.widgets.map((w) => w.id)).size === p.widgets.length, {
    message: 'Every widget needs a unique ID',
    path: ['widgets'],
  })
export type Project = z.infer<typeof ProjectSchema>
export type Widget = z.infer<typeof WidgetSchema>
export type Accent = Widget['accent']
export const ACCENTS: Record<Accent, string> = {
  mint: '#94dbba',
  amber: '#efac77',
  sky: '#92c9ed',
  rose: '#e8a1b0',
  violet: '#baa6ed',
}
export const MAX_PROJECT_BYTES = 12_000
export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input)
}
export function parseProjectJson(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES)
    throw new Error('Project is too large (12 KB maximum).')
  return parseProject(JSON.parse(text))
}
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/-+$/, '')
      .slice(0, 48) || 'my-workspace'
  )
}
export function makeWidget(kind: Widget['kind'], id: string): Widget {
  if (kind === 'context') return { id, kind, title: 'Context', accent: 'amber', showCost: false }
  if (kind === 'checklist')
    return {
      id,
      kind,
      title: 'Before you ship',
      accent: 'sky',
      items: ['Review the diff', 'Run the tests', 'Write the release note'],
    }
  return { id, kind, title: 'Session', accent: 'mint' }
}
export const PRESETS: { id: string; name: string; description: string; project: Project }[] = [
  {
    id: 'mission',
    name: 'Mission control',
    description: 'A little more signal. A lot less guessing.',
    project: parseProject({
      version: 1,
      name: 'Mission control',
      slug: 'mission-control',
      density: 'comfortable',
      widgets: [
        makeWidget('status', 'session'),
        makeWidget('context', 'context'),
        makeWidget('checklist', 'checklist'),
      ],
    }),
  },
  {
    id: 'focus',
    name: 'Deep focus',
    description: 'Just your session and room to think.',
    project: parseProject({
      version: 1,
      name: 'Deep focus',
      slug: 'deep-focus',
      density: 'compact',
      widgets: [makeWidget('status', 'session'), { ...makeWidget('context', 'context'), accent: 'violet' }],
    }),
  },
  {
    id: 'ship',
    name: 'Ship something',
    description: 'Your last-mile checklist, always in view.',
    project: parseProject({
      version: 1,
      name: 'Ship something',
      slug: 'ship-something',
      density: 'comfortable',
      widgets: [{ ...makeWidget('checklist', 'checklist'), title: 'Ready to ship?', accent: 'amber' }],
    }),
  },
]
