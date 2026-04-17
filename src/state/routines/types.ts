/**
 * TickContext — the single mutable bag threaded through every tick routine.
 *
 * With entity-owned state the context is much leaner:
 *   - buildings[] carries residentData, inventory, agents, tripLog
 *   - citizens[] carries motion (was walkers[]) and peddlerState (was peddlers[])
 *   - farmZones[] carries piles (was farmPiles[])
 *
 * Routines mutate buildings / citizens / farmZones directly via array replacement.
 * The read-only block is derived once per tick.
 */
import type {
  Building, Citizen, Migrant, FarmZone, CityState,
} from '../types'

export interface TickContext {
  // ── read-only: original snapshot & tick metadata ─────────────────────────
  readonly s: CityState
  readonly nextTick: number
  readonly prevDay: number
  readonly nextDay: number
  readonly isNewDay: boolean
  readonly dayCount: number
  readonly isDaytime: boolean
  readonly crossedMorning: boolean
  readonly crossedEvening: boolean
  // ── read-only: pre-built lookups (computed once, never mutated) ───────────
  readonly houses: Building[]
  readonly houseMap: Map<string, Building>
  readonly buildingMap: Map<string, Building>
  readonly workplacePos: { x: number; y: number }[]
  readonly granaries: Building[]
  readonly marketsList: Building[]
  readonly smithBldgs: Building[]
  // ── mutable: entity arrays (routines replace the entire array) ────────────
  citizens:  Citizen[]     // includes motion (was walkers) + peddlerState (was peddlers)
  buildings: Building[]    // includes residentData, inventory, agents, tripLog
  farmZones: FarmZone[]    // includes piles (was farmPiles)
  migrants:  Migrant[]
  // ── mutable: terrain health maps ─────────────────────────────────────────
  /** Unified terrain resource health. { [kind]: { [tileKey]: health } } */
  terrainResources: Record<string, Record<string, number>>
  // ── mutable: monthly accumulators ────────────────────────────────────────
  monthlyFarmOutput:  number
  monthlyFarmValue:   number
  monthlyMarketSales: number
  // ── output: written by statsRoutine ──────────────────────────────────────
  population:      number
  avgSatisfaction: number
  needPressure:    { food: number; safety: number; culture: number }
  cityWenmai:      number
  cityShangmai:    number
  // ── output: written by monthlyTaxRoutine ─────────────────────────────────
  lastTaxBreakdown:            { ding: number; tian: number; shang: number }
  totalMonthlyTax:             number
  lastMonthlyFarmValue:        number
  lastMonthlyMarketSales:      number
  lastMonthlyExpenseBreakdown: { yangmin: number; jianshe: number; total: number }
  nextMonthlyFarmOutput:       number
  nextMonthlyFarmValue:        number
  nextMonthlyMarketSales:      number
  monthlyDue:                  boolean
}

/** A single link in the simulation-tick chain. */
export type TickRoutine = (ctx: TickContext) => TickContext
