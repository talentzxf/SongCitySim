/**
 * Building Lifecycle SDK
 * ──────────────────────
 * The game engine is the host; each building is a plugin.
 *
 * Engine responsibilities
 *   - Advance time, manage citizens, roads, terrain
 *   - Call lifecycle hooks at the right moments
 *   - Provide a BuildingTickContext with safe read/write access to game state
 *
 * Building responsibilities
 *   - Export `const behavior: BuildingLifecycle` from behavior.ts
 *   - Implement only the hooks it needs
 *   - Never import from simulation.tsx directly — use only the context API
 */
import type { Building, BuildingType, Citizen, CityState } from '../../state/types'

/** Unit inventory fields that buildings can produce or consume. */
export type UnitField = 'ironOre' | 'ironTools' | 'timber'

// ── Household ledger ──────────────────────────────────────────────────────────

/**
 * Per-household key-value ledger.
 *
 * Keys: "food" | "savings" | "tools"
 * houseId = Building.id of the citizen's home
 */
export interface BuildingHousehold {
  get(houseId: string, key: string): number
  set(houseId: string, key: string, value: number): void
  /** Add delta, floor at 0. Returns resulting value. */
  mutate(houseId: string, key: string, delta: number): number
}

// ── Context provided by the engine ───────────────────────────────────────────

/** Full runtime context passed into every lifecycle callback. */
export interface BuildingTickContext {
  // ── This building ─────────────────────────────────────────────────────────
  readonly building: Building

  /**
   * Workers actively assigned to this building and not sick.
   * (status may be 'working' or 'commuting' — production counts both)
   */
  readonly workers: Citizen[]

  /** All assigned workers, including sick ones. */
  readonly allWorkers: Citizen[]

  // ── Timing ────────────────────────────────────────────────────────────────
  readonly isNewDay: boolean
  readonly isNewMonth: boolean
  readonly dayTime: number       // 0..1 fraction of in-game day
  readonly dayCount: number      // total days since city founding
  readonly month: number         // current in-game month (1-based)

  // ── City reference (read-only intent) ────────────────────────────────────
  readonly cityBuildings: readonly Building[]
  readonly cityMoney: number
  readonly citizens: readonly Citizen[]

  // ── Unit inventory — THIS building ───────────────────────────────────────

  /**
   * Produce (add) a unit resource to THIS building's inventory.
   * Negative amounts are silently ignored — use consumeUnit for that.
   */
  produceUnit(field: UnitField, amount: number): void

  /**
   * Consume (deduct) a unit resource from the FIRST building of sourceType.
   * Clamped at 0 — will never go negative.
   */
  consumeUnit(sourceType: BuildingType, field: UnitField, amount: number): void

  /**
   * Sum of a unit resource across all city buildings of the given type.
   */
  cityUnit(type: BuildingType, field: UnitField): number

  // ── Terrain health ────────────────────────────────────────────────────────

  /**
   * Current health of a terrain resource tile.
   * tileKey format: "${x},${y}"
   * kind: any NaturalResourceDef.kind ('ore', 'forest', 'grassland', …)
   */
  terrainHealth(tileKey: string, kind: string): number

  /**
   * Deplete a terrain tile by amount (floor at 0).
   */
  depleteTerrainHealth(tileKey: string, kind: string, amount: number): void

  // ── Household ledger ──────────────────────────────────────────────────────
  readonly household: BuildingHousehold
}

// ── Lifecycle interface (what behavior.ts must implement) ─────────────────────

export interface BuildingLifecycle {
  /**
   * Called once at the start of each in-game day.
   * Primary hook for daily production, consumption, and wage payment.
   * ctx.isNewDay is always true here.
   */
  onDayStart?(ctx: BuildingTickContext): void

  /**
   * Called every simulation tick (~10/s at default speed).
   * Keep very lightweight — prefer onDayStart for production logic.
   */
  onTick?(ctx: BuildingTickContext): void

  /**
   * Called once per in-game month (after tax collection).
   * Use for maintenance deductions or monthly bonuses.
   */
  onMonthEnd?(ctx: BuildingTickContext): void

  /**
   * Called once when the building is first placed on the map.
   * city is a readonly snapshot at the moment of placement.
   */
  onPlaced?(building: Building, city: Readonly<CityState>): void

  /**
   * Called when the building is demolished / bulldozed.
   */
  onDemolished?(building: Building, city: Readonly<CityState>): void
}

