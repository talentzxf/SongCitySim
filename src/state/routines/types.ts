/**
 * TickContext - the single mutable bag of state threaded through every
 * simulation-tick routine via the Chain of Responsibility.
 *
 * Routines read and write the mutable fields; the read-only block
 * is derived once per tick and must never be changed mid-chain.
 */
import type {
  Building, Citizen, Walker, Migrant, FarmZone,
  OxCart, MarketBuyer, Peddler, CropInventory, CityState, FarmPile, PeddlerTripStat,
} from '../types'
export interface TickContext {
  // read-only: original state snapshot & tick metadata
  readonly s: CityState
  readonly nextTick: number
  readonly prevDay: number
  readonly nextDay: number
  readonly isNewDay: boolean
  readonly dayCount: number
  readonly isDaytime: boolean
  readonly crossedMorning: boolean
  readonly crossedEvening: boolean
  // read-only: pre-built lookups (computed once before the chain runs)
  readonly houses: Building[]
  readonly houseMap: Map<string, Building>
  readonly buildingMap: Map<string, Building>
  readonly workplacePos: { x: number; y: number }[]
  readonly granaries: Building[]
  readonly marketsList: Building[]
  readonly smithBldgs: Building[]
  // mutable: agent arrays
  citizens: Citizen[]
  walkers: Walker[]
  migrants: Migrant[]
  oxCarts: OxCart[]
  marketBuyers: MarketBuyer[]
  peddlers: Peddler[]
  farmPiles: FarmPile[]
  farmZones: FarmZone[]
  peddlerTripLog: Record<string, PeddlerTripStat[]>  // marketId -> last N trips
  // mutable: per-household ledgers
  houseFood: Record<string, number>
  houseCrops: Record<string, CropInventory>
  houseSavings: Record<string, number>
  houseDead: Record<string, number>
  houseTools: Record<string, number>
  // mutable: global inventories
  farmInventory: CropInventory
  granaryInventory: CropInventory
  marketInventory: CropInventory
  mineInventory: number
  smithInventory: number
  timberInventory: number
  oreVeinHealth:   Record<string, number>
  forestHealth:    Record<string, number>
  grasslandHealth: Record<string, number>
  /** 各民居治安覆盖度（巡逻加成，自然衰减） */
  houseSafety: Record<string, number>
  // mutable: monthly accumulators
  monthlyFarmOutput: number
  monthlyFarmValue: number
  monthlyMarketSales: number
  // output: written by statsRoutine
  population: number
  avgSatisfaction: number
  needPressure: { food: number; safety: number; culture: number }
  /** 城市文脉指数 0-100 */
  cityWenmai: number
  /** 城市商脉指数 0-100 */
  cityShangmai: number
  // output: written by monthlyTaxRoutine
  lastTaxBreakdown: { ding: number; tian: number; shang: number }
  totalMonthlyTax: number
  lastMonthlyFarmValue: number
  lastMonthlyMarketSales: number
  lastMonthlyExpenseBreakdown: { yangmin: number; jianshe: number; total: number }
  nextMonthlyFarmOutput: number
  nextMonthlyFarmValue: number
  nextMonthlyMarketSales: number
  monthlyDue: boolean
}
/** A single link in the simulation-tick chain. Must return the (possibly mutated) ctx. */
export type TickRoutine = (ctx: TickContext) => TickContext
