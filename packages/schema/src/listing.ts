import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const CATEGORIES = [
  'dashboards',
  'safety',
  'git-ci',
  'workflow',
  'models-cost',
  'memory',
  'ui',
  'integrations',
  'fun',
  'other',
] as const

export const MEDIA_LIMITS = { maxFiles: 3, maxBytes: 5 * 1024 * 1024 } as const

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'lowercase letters, digits and hyphens, up to 64')
const login = z.string().regex(/^[A-Za-z0-9-]{1,39}$/, 'a GitHub login')
const sha = z.string().regex(/^[0-9a-f]{40}$/, 'a full 40-character lowercase commit SHA')
const repo = z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, 'owner/repo')
const ref = z.string().min(1).max(255)
const subdir = z
  .string()
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._/-]+$/, 'a relative path inside the repository, without ..')

const source = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('github'), repo, ref, sha }),
  z.strictObject({ type: z.literal('git-subdir'), repo, path: subdir, ref, sha }),
])

const media = z.strictObject({
  file: z.string().regex(/^[A-Za-z0-9._-]+\.(gif|png|webp|mp4)$/, 'a gif, png, webp or mp4 file name'),
  alt: z.string().min(1).max(200),
})

export const ListingSchema = z.strictObject({
  slug,
  displayName: z.string().min(1).max(60),
  summary: z.string().min(1).max(140),
  source,
  authors: z.array(z.strictObject({ github: login })).min(1),
  maintainers: z.array(login).min(1),
  license: z.string().regex(/^[A-Za-z0-9.+-]+$/, 'an SPDX identifier such as MIT'),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/, 'lowercase words and hyphens')).max(10).default([]),
  media: z.array(media).max(MEDIA_LIMITS.maxFiles).default([]),
  submittedBy: login,
})

export type Listing = z.infer<typeof ListingSchema>
export type ListingSource = Listing['source']
export type ListingParse = { ok: true; listing: Listing } | { ok: false; errors: string[] }

/** Parses and validates one `registry/listings/<slug>.yaml` file. */
export function parseListing(text: string, fileName: string): ListingParse {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (error) {
    return { ok: false, errors: [`YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`] }
  }
  const result = ListingSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(issue => {
        const where = issue.path.join('.')
        if (issue.code === 'unrecognized_keys') return `${where || 'listing'}: unknown key(s) ${issue.keys.join(', ')}`
        return where ? `${where}: ${issue.message}` : issue.message
      }),
    }
  }
  const expected = `${result.data.slug}.yaml`
  if (fileName !== expected) return { ok: false, errors: [`file name must be ${expected} to match the slug`] }
  return { ok: true, listing: result.data }
}
