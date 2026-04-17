/**
 * IoC Chain Registry
 * -----------------------------------------------------------------------------
 * Simulation.tsx only needs to call three functions:
 *   1. buildTickContext(s)  -> TickContext
 *   2. runTickChain(ctx)    -> TickContext
 *   3. applyTickResult(ctx) -> CityState
 *
 * Every routine is a self-contained module; simulation.tsx knows nothing about
 * what happens inside. Adding / removing / reordering logic = edit TICK_CHAIN.
 */
import type { CityState } from '../types'
import type { TickContext, TickRoutine } from './types'
import { DAY_TICKS, MORNING_START, EVENING_START } from '../../config/simulation'
import { farmAssignmentRoutine }        from './farmAssignment'
import { farmGrowthRoutine }            from './farmGrowth'
import { oxCartRoutine }                from './oxCart'
import { marketBuyerRoutine }           from './marketBuyer'
import { peddlerRoutine }               from './peddler'
import { buildingBehaviorRoutine }      from './buildingBehavior'
import { dailyProductionRoutine }       from './dailyProduction'
import { citizenStatusRoutine }         from './citizenStatus'
import { diseaseRoutine }               from './disease'
import { walkerRoutine }                from './walker'
import { morningCommuteRoutine }        from './morningCommute'
import { eveningCommuteRoutine }        from './eveningCommute'
import { daytimeMarketRestockRoutine }  from './daytimeMarketRestock'
import { migrantRoutine }               from './migrant'
import { statsRoutine }                 from './stats'
import { monthlyTaxRoutine }            from './monthlyTax'
import { jobDispatchRoutine }          from './jobDispatch'
/** Ordered chain - routines execute left to right every tick. */
export const TICK_CHAIN: TickRoutine[] = [
  farmAssignmentRoutine,        //  1. Assign idle workers to unfarmed zones
  farmGrowthRoutine,            //  2. Advance crop growth, harvest -> FarmPile
  oxCartRoutine,                //  3. Ox-cart logistics: pile -> granary
  marketBuyerRoutine,           //  4. Wholesale buyer: granary -> market
  peddlerRoutine,               //  5. Peddler walk, sell food & tools
  buildingBehaviorRoutine,      //  6. Per-building lifecycle callbacks
  dailyProductionRoutine,       //  7. Household food consumption, wages, tool wear
  citizenStatusRoutine,         //  8. State machine + needs hierarchy -> satisfaction
  diseaseRoutine,               //  9. Sickness death + neighbourhood spread
  jobDispatchRoutine,           // 10. Per-job behaviors: safety patrol, …future jobs
  walkerRoutine,                // 11. Advance walkers, handle arrivals
  morningCommuteRoutine,        // 12. Morning: commute + shopping + restock + peddler spawn
  eveningCommuteRoutine,        // 13. Evening: workers & farmers return home
  daytimeMarketRestockRoutine,  // 14. Emergency restock when market runs low mid-day
  migrantRoutine,               // 15. Advance migrants, settle arrivals, spawn new
  statsRoutine,                 // 16. Aggregate population, satisfaction, need pressure
  monthlyTaxRoutine,            // 17. Monthly tax collection and expense settlement
]
/** Run the full chain, threading ctx through every routine. */
export function runTickChain(ctx: TickContext): TickContext {
  return TICK_CHAIN.reduce((c, routine) => routine(c), ctx)
}
/** Build the initial TickContext from the current CityState. */
export function buildTickContext(s: CityState): TickContext {
  const nextTick = s.tick + 1
  const prevDay  = s.dayTime
  const nextDay  = (s.dayTime + 1 / DAY_TICKS) % 1
  const isNewDay = nextDay < prevDay
  const dayCount = isNewDay ? s.dayCount + 1 : s.dayCount
  const isDaytime      = s.dayTime >= MORNING_START && s.dayTime <= EVENING_START
  const crossedMorning = prevDay < MORNING_START && nextDay >= MORNING_START
  const crossedEvening = prevDay < EVENING_START  && nextDay >= EVENING_START
  // Pre-built lookups — read-only, computed once per tick
  const houses      = s.buildings.filter(b => b.type === 'house' || b.type === 'manor')
  const houseMap    = new Map(houses.map(h => [h.id, h]))
  const buildingMap = new Map(s.buildings.map(b => [b.id, b]))
  const workplacePos = s.buildings.filter(b => b.type !== 'house' && b.type !== 'manor').map(b => ({ x: b.x, y: b.y }))
  const granaries   = s.buildings.filter(b => b.type === 'granary')
  const marketsList = s.buildings.filter(b => b.type === 'market')
  const smithBldgs  = s.buildings.filter(b => b.type === 'blacksmith')
  return {
    s,
    nextTick, prevDay, nextDay, isNewDay, dayCount,
    isDaytime, crossedMorning, crossedEvening,
    houses, houseMap, buildingMap, workplacePos, granaries, marketsList, smithBldgs,
    // Entity arrays — routines replace these wholesale
    citizens:  s.citizens.map(c => ({ ...c, motion: c.motion ? { ...c.motion } : null, peddlerState: c.peddlerState ? { ...c.peddlerState, cargo: { ...c.peddlerState.cargo, crops: { ...c.peddlerState.cargo.crops } } } : null })),
    buildings: s.buildings.map(b => ({ ...b, agents: b.agents.map(a => ({ ...a })) })),
    farmZones: s.farmZones.map(z => ({ ...z, piles: z.piles.map(p => ({ ...p })) })),
    migrants:  s.migrants,
    terrainResources: Object.fromEntries(
      Object.entries(s.terrainResources).map(([k, v]) => [k, { ...v }])
    ),
    monthlyFarmOutput:  s.monthlyFarmOutput,
    monthlyFarmValue:   s.monthlyFarmValue,
    monthlyMarketSales: s.monthlyMarketSales,
    // outputs
    population:      s.citizens.length,
    avgSatisfaction: s.avgSatisfaction,
    needPressure:    { ...s.needPressure },
    cityWenmai:      s.cityWenmai,
    cityShangmai:    s.cityShangmai,
    lastTaxBreakdown:            s.lastTaxBreakdown,
    totalMonthlyTax:             0,
    lastMonthlyFarmValue:        s.lastMonthlyFarmValue,
    lastMonthlyMarketSales:      s.lastMonthlyMarketSales,
    lastMonthlyExpenseBreakdown: s.lastMonthlyExpenseBreakdown,
    nextMonthlyFarmOutput:       s.monthlyFarmOutput,
    nextMonthlyFarmValue:        s.monthlyFarmValue,
    nextMonthlyMarketSales:      s.monthlyMarketSales,
    monthlyDue:                  false,
  }
}

/** Merge tick results back into a new CityState. */
export function applyTickResult(ctx: TickContext): CityState {
  const { s, monthlyDue, totalMonthlyTax } = ctx
  const yangminCost = monthlyDue ? Math.floor(ctx.population * 2) : 0
  // Sync occupant counts from citizens into building residentData
  const occByHouse = new Map<string, number>()
  for (const c of ctx.citizens) occByHouse.set(c.houseId, (occByHouse.get(c.houseId) ?? 0) + 1)
  const buildings = ctx.buildings.map(b =>
    (b.type === 'house' || b.type === 'manor')
      ? { ...b, occupants: occByHouse.get(b.id) ?? 0 }
      : b,
  )
  return {
    ...s,
    tick:     ctx.nextTick,
    dayTime:  ctx.nextDay,
    dayCount: ctx.dayCount,
    month:    monthlyDue ? s.month + 1 : s.month,
    buildings,
    citizens:  ctx.citizens,
    farmZones: ctx.farmZones,
    migrants:  ctx.migrants,
    terrainResources: ctx.terrainResources,
    monthlyFarmOutput:  ctx.nextMonthlyFarmOutput,
    monthlyFarmValue:   ctx.nextMonthlyFarmValue,
    monthlyMarketSales: ctx.nextMonthlyMarketSales,
    lastMonthlyFarmValue:        ctx.lastMonthlyFarmValue,
    lastMonthlyMarketSales:      ctx.lastMonthlyMarketSales,
    lastTaxBreakdown:            ctx.lastTaxBreakdown,
    lastMonthlyExpenseBreakdown: ctx.lastMonthlyExpenseBreakdown,
    monthlyConstructionCost: monthlyDue ? 0 : s.monthlyConstructionCost,
    lastMonthlyTax:  monthlyDue ? totalMonthlyTax : s.lastMonthlyTax,
    money:           s.money + (monthlyDue ? totalMonthlyTax - yangminCost : 0),
    population:      ctx.population,
    avgSatisfaction: ctx.avgSatisfaction,
    needPressure:    ctx.needPressure,
    cityWenmai:      ctx.cityWenmai,
    cityShangmai:    ctx.cityShangmai,
    lastHouseholdBuyDay: s.lastHouseholdBuyDay,
  }
}
