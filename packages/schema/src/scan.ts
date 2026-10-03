import { z } from 'zod'

import { CONTAINS, PERMISSIONS } from './permissions'

export const ScanResultSchema = z.strictObject({
  slug: z.string(),
  sha: z.string(),
  scannedAt: z.string(),
  claudeCodeVersion: z.string(),
  plugin: z.strictObject({
    name: z.string(),
    version: z.string().nullable(),
    description: z.string().nullable(),
    license: z.string().nullable(),
  }),
  contains: z.array(z.enum(CONTAINS)),
  mod: z.strictObject({ events: z.array(z.string()), calls: z.array(z.string()), envReads: z.array(z.string()) }).nullable(),
  external: z.strictObject({
    settingsHooks: z.array(z.strictObject({ event: z.string(), command: z.string() })),
    mcpServers: z.array(z.strictObject({ name: z.string(), command: z.string().nullable(), url: z.string().nullable() })),
    lspServers: z.array(z.strictObject({ name: z.string(), command: z.string() })),
    monitors: z.array(z.strictObject({ name: z.string(), command: z.string() })),
    bundles: z.array(z.string()),
    remoteBundles: z.array(z.string()),
  }),
  permissions: z.array(z.enum(PERMISSIONS)),
  risk: z.enum(['standard', 'elevated']),
  validator: z.strictObject({ success: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()) }),
  tests: z.strictObject({ passed: z.number(), failed: z.number() }).nullable(),
})

export type ScanResult = z.infer<typeof ScanResultSchema>
