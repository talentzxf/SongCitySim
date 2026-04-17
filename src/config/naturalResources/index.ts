/**
 * Natural Resource Registry
 * ─────────────────────────
 * Single source of truth for all extractable terrain resources.
 * Adding a new resource (coal, fish, stone…) only requires a new entry here.
 *
 * Runtime state is stored in CityState.terrainResources as:
 *   { [kind: string]: { [tileKey: string]: number } }
 *
 * tileKey format: "${x},${y}"
 */

export interface NaturalResourceDef {
  /** Unique key — used as kind in terrainResources and in lifecycle API */
  kind: string
  /** Health/capacity of a completely fresh tile */
  initialHealth: number
  /** Human-readable label (Chinese) */
  label: string
  /** Display unit */
  unit: string
  /**
   * Natural regeneration per in-game day (0 = non-renewable).
   * Applied by the terrain-regen routine when implemented.
   */
  regenPerDay: number
}

export const NATURAL_RESOURCES: NaturalResourceDef[] = [
  { kind: 'ore',       initialHealth: 600, label: '铁矿脉', unit: '矿石', regenPerDay: 0   },
  { kind: 'forest',    initialHealth: 400, label: '林地',   unit: '木材', regenPerDay: 0.5 },
  { kind: 'grassland', initialHealth: 300, label: '草地',   unit: '牧草', regenPerDay: 1   },
  // future: { kind: 'coal',  initialHealth: 800, label: '煤矿', unit: '煤炭', regenPerDay: 0 },
  // future: { kind: 'stone', initialHealth: 500, label: '石场', unit: '石料', regenPerDay: 0 },
  // future: { kind: 'fish',  initialHealth: 200, label: '渔场', unit: '鱼获', regenPerDay: 2 },
]

/** Map for O(1) lookup by kind. */
export const NATURAL_RESOURCE_MAP: Readonly<Record<string, NaturalResourceDef>> =
  Object.fromEntries(NATURAL_RESOURCES.map(r => [r.kind, r]))

/** Returns the definition for a given kind; falls back to a safe default. */
export function getResourceDef(kind: string): NaturalResourceDef {
  return NATURAL_RESOURCE_MAP[kind] ?? { kind, initialHealth: 100, label: kind, unit: '', regenPerDay: 0 }
}

/** Convenience: initialHealth for a given kind. */
export const resourceInitialHealth = (kind: string): number =>
  getResourceDef(kind).initialHealth

// ── Re-export named constants for backward-compatibility ──────────────────────
// (So existing imports of ORE_VEIN_INITIAL_HEALTH etc. still compile)
export const ORE_VEIN_INITIAL_HEALTH      = NATURAL_RESOURCE_MAP['ore'].initialHealth       // 600
export const FOREST_TILE_INITIAL_HEALTH   = NATURAL_RESOURCE_MAP['forest'].initialHealth    // 400
export const GRASSLAND_TILE_INITIAL_HEALTH = NATURAL_RESOURCE_MAP['grassland'].initialHealth // 300

