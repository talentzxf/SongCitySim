import type { BuildingType } from '../state/types'

// ─── Level Definitions ────────────────────────────────────────────────────────

export interface MapBounds {
  minX: number; maxX: number
  minY: number; maxY: number
}

export type ObjectiveKind =
  | { kind: 'population';   target: number }
  | { kind: 'noDeath' }
  | { kind: 'money';        target: number }
  | { kind: 'satisfaction'; target: number }

export type LevelStatus = 'locked' | 'available' | 'completed'

export type AllowedBuildingType = BuildingType | 'farmZone' | 'teaZone' | 'road' | 'bulldoze'

export interface LevelDef {
  id: string
  order: number
  title: string
  subtitle: string
  description: string
  prerequisites: string[]
  col: number
  row: number
  hasIntro?: boolean
  /** Playable tile rectangle — outside is fogged and blocked. */
  mapBounds: MapBounds
  /** BuildingTypes available in the build palette for this level. */
  allowedBuildings: BuildingType[]
  /** Win conditions — ALL must be met simultaneously. */
  objectives: ObjectiveKind[]
}

// ─── Level registry — one file per level in ./data/ ──────────────────────────
import l01 from './data/l01'
import l02 from './data/l02'
import l03 from './data/l03'
import l04 from './data/l04'
import l05 from './data/l05'
import l06 from './data/l06'
import l07 from './data/l07'
import l08 from './data/l08'
import l09 from './data/l09'

const LEVELS: LevelDef[] = [l01, l02, l03, l04, l05, l06, l07, l08, l09]

export default LEVELS

// ─── Save helpers (localStorage) ─────────────────────────────────────────────
const SAVE_KEY = 'citysim_campaign_progress'

export function loadProgress(): Record<string, LevelStatus> {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  // Default: first level available
  return { l01: 'available' }
}

export function saveProgress(progress: Record<string, LevelStatus>) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress))
  } catch {}
}

/** Mark a level as completed and unlock any newly-available levels. */
export function completeLevel(
  levelId: string,
  progress: Record<string, LevelStatus>
): Record<string, LevelStatus> {
  const next = { ...progress, [levelId]: 'completed' as LevelStatus }
  for (const lvl of LEVELS) {
    if (next[lvl.id] === 'completed' || next[lvl.id] === 'available') continue
    const prereqsMet = lvl.prerequisites.every(pid => next[pid] === 'completed')
    if (prereqsMet) next[lvl.id] = 'available'
  }
  return next
}
