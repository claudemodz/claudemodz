import type { Project, Accent, Widget } from './config'
export const COLORS: Record<Accent, string>
export type State = {
  turnId: string | null
  phase: 'ready' | 'working' | 'finished' | 'interrupted' | 'error'
  completed: number
  percent: number | null
  cost: number | null
  tokens: number | null
  contextWindow: number | null
  lastDurationMs: number | null
  totalDurationMs: number
  timedTurns: number
  hidden: boolean
  checked: Record<string, boolean[]>
}
export type Event =
  | { type: 'start'; turnId: string }
  | { type: 'complete'; turnId: string; reason: string; durationMs?: number }
  | { type: 'measure'; percent?: number; cost?: number; tokens?: number; window?: number }
export type Row = { id: string; title: string; color: string; kind: Widget['kind']; lines: string[] }
export function initialState(project: Project): State
export function reduceEvent(state: State, event: Event): State
export function toggleItem(state: State, id: string, index: number): State
export function rowsFor(project: Project, state: State, working?: boolean): Row[]
export function meterFor(percent: number | null): string
export function layoutFor(
  project: Project,
  state: State,
  columns: number,
  maxRows: number,
): 'hidden' | 'compact' | 'full'
