export type ModNotes = { events: string[]; calls: string[]; envReads: string[]; other: string[] }

const NOTE = /^(\S+) (hooks|calls|env reads|env writes): (.*)$/

/** Splits a validator list on ", " that is not inside {…} or (…). */
export function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < list.length; i++) {
    const ch = list[i] as string
    if (ch === '{' || ch === '(') depth += 1
    if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && ch === ',' && list[i + 1] === ' ') {
      parts.push(current.trim())
      current = ''
      i += 1
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const sortedUnique = (items: Iterable<string>) => [...new Set(items)].sort()

/** Turns `claude plugin validate --json` notes into the events, calls and env reads a mod uses. */
export function parseNotes(notes: readonly string[]): ModNotes {
  const events: string[] = []
  const calls: string[] = []
  const envReads: string[] = []
  const other: string[] = []
  for (const note of notes) {
    const match = note.match(NOTE)
    if (!match) {
      other.push(note)
      continue
    }
    const kind = match[2]
    const value = (match[3] ?? '').trim()
    if (kind === 'hooks') {
      events.push(...splitTopLevel(value).map(event => event.replace(/\{.*\}$/, '')))
    } else if (kind === 'calls') {
      if (value !== 'nothing on $') {
        calls.push(...splitTopLevel(value).map(call => call.replace(/\s*\(via .*\)$/, '').replace(/^\$\./, '')))
      }
    } else if (kind === 'env reads') {
      if (value !== 'nothing') envReads.push(...splitTopLevel(value))
    } else if (value !== 'nothing') {
      other.push(note)
    }
  }
  return { events: sortedUnique(events), calls: sortedUnique(calls), envReads: sortedUnique(envReads), other }
}
