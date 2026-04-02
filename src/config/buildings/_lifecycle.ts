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
 *
 * Pool key convention
 *   "<store>.<goodId>"  e.g.  "mine.ore"  "granary.rice"  "market.wheat"
 *   Supported stores:  mine | smith | granary | market | farm
 *   Supported goodIds: ore | tools | rice | millet | wheat | soybean | vegetable
 */
import type { Building, Citizen, CityState } from '../../state/types'

// ── Pool ──────────────────────────────────────────────────────────────────────

/**
 * City-wide shared numeric pools, addressed by "<store>.<goodId>".
 *
 * Currently mapped pools
 *   "mine.ore"          total iron ore across all mines
 *   "smith.tools"       total iron tools across all smiths
 *   "granary.{crop}"    grain in all granaries (rice/millet/wheat/soybean/vegetable)
 *   "market.{crop}"     goods available at all markets
 *   "farm.{crop}"       in-progress crop yield on farms
 */
export interface BuildingPool {
  /** Read current value (returns 0 for unknown keys). */
  get(key: string): number
  /** Overwrite value directly. */
  set(key: string, value: number): void
  /**
   * Add delta to current value, floor at 0.
   * Returns the resulting value.
   */
  mutate(key: string, delta: number): number
}

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

  // ── Mutable state APIs ────────────────────────────────────────────────────
  readonly pool: BuildingPool
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

