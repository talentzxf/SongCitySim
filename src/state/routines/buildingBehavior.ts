/**
 * Building Behavior Routine
 * ─────────────────────────
 * Engine-side Chain-of-Responsibility link that:
 *   1. Iterates every placed building
 *   2. Looks up its BuildingLifecycle from the behavior registry
 *   3. Constructs a BuildingTickContext (the "SDK" view)
 *   4. Dispatches  onTick | onDayStart | onMonthEnd  as appropriate
 *
 * The context closes over the live TickContext, so pool/household mutations
 * are immediately visible to subsequent buildings in the same tick.
 */
import type { Building, Citizen, CropType } from '../types'
import type { TickContext, TickRoutine }     from './types'
import type { BuildingTickContext, BuildingPool, BuildingHousehold } from '../../config/buildings/_lifecycle'
import { getBehavior } from '../../config/buildings/_behavior_loader'
import { ORE_VEIN_INITIAL_HEALTH, FOREST_TILE_INITIAL_HEALTH } from '../helpers'

// ── Context factory ───────────────────────────────────────────────────────────

const CROP_LIST: CropType[] = ['rice', 'millet', 'wheat', 'soybean', 'vegetable']

function makePool(ctx: TickContext): BuildingPool {
  function get(key: string): number {
    if (key === 'mine.ore')       return ctx.mineInventory
    if (key === 'smith.tools')    return ctx.smithInventory
    if (key === 'lumber.timber')  return ctx.timberInventory
    if (key.startsWith('ore.health.'))    return ctx.oreVeinHealth[key.slice(11)]    ?? ORE_VEIN_INITIAL_HEALTH
    if (key.startsWith('forest.health.')) return ctx.forestHealth[key.slice(14)]    ?? FOREST_TILE_INITIAL_HEALTH
    for (const ck of CROP_LIST) {
      if (key === `granary.${ck}`) return ctx.granaryInventory[ck]
      if (key === `market.${ck}`)  return ctx.marketInventory[ck]
      if (key === `farm.${ck}`)    return ctx.farmInventory[ck]
    }
    return 0
  }

  function mutate(key: string, delta: number): number {
    const next = Math.max(0, get(key) + delta)
    if (key === 'mine.ore')       { ctx.mineInventory   = next; return next }
    if (key === 'smith.tools')    { ctx.smithInventory  = next; return next }
    if (key === 'lumber.timber')  { ctx.timberInventory = next; return next }
    if (key.startsWith('ore.health.'))    { ctx.oreVeinHealth  = { ...ctx.oreVeinHealth,  [key.slice(11)]: next }; return next }
    if (key.startsWith('forest.health.')) { ctx.forestHealth   = { ...ctx.forestHealth,   [key.slice(14)]: next }; return next }
    for (const ck of CROP_LIST) {
      if (key === `granary.${ck}`) { ctx.granaryInventory = { ...ctx.granaryInventory, [ck]: next }; return next }
      if (key === `market.${ck}`)  { ctx.marketInventory  = { ...ctx.marketInventory,  [ck]: next }; return next }
      if (key === `farm.${ck}`)    { ctx.farmInventory    = { ...ctx.farmInventory,    [ck]: next }; return next }
    }
    return 0
  }

  return {
    get,
    set: (key, value) => { mutate(key, value - get(key)) },
    mutate,
  }
}

function makeHousehold(ctx: TickContext): BuildingHousehold {
  return {
    get(houseId, key) {
      if (key === 'food')    return ctx.houseFood[houseId]    ?? 0
      if (key === 'savings') return ctx.houseSavings[houseId] ?? 0
      if (key === 'tools')   return ctx.houseTools[houseId]   ?? 0
      return 0
    },
    set(houseId, key, value) {
      if (key === 'food')    ctx.houseFood    = { ...ctx.houseFood,    [houseId]: value }
      if (key === 'savings') ctx.houseSavings = { ...ctx.houseSavings, [houseId]: value }
      if (key === 'tools')   ctx.houseTools   = { ...ctx.houseTools,   [houseId]: value }
    },
    mutate(houseId, key, delta) {
      const next = Math.max(0, this.get(houseId, key) + delta)
      this.set(houseId, key, next)
      return next
    },
  }
}

function createBuildingTickContext(
  ctx: TickContext,
  building: Building,
  pool: BuildingPool,
  household: BuildingHousehold,
): BuildingTickContext {
  const workers    = ctx.citizens.filter(c => c.workplaceId === building.id && !c.isSick)
  const allWorkers = ctx.citizens.filter(c => c.workplaceId === building.id)
  return {
    building,
    workers,
    allWorkers,
    isNewDay:   ctx.isNewDay,
    isNewMonth: ctx.monthlyDue,
    dayTime:    ctx.nextDay,
    dayCount:   ctx.dayCount,
    month:      ctx.s.month,
    cityBuildings: ctx.s.buildings,
    cityMoney:     ctx.s.money,
    citizens:      ctx.citizens,
    pool,
    household,
  }
}

// ── Routine ───────────────────────────────────────────────────────────────────

export const buildingBehaviorRoutine: TickRoutine = (ctx) => {
  // Build pool/household adapters once per tick (they close over ctx)
  const pool      = makePool(ctx)
  const household = makeHousehold(ctx)

  for (const building of ctx.s.buildings) {
    const lifecycle = getBehavior(building.type)
    if (!lifecycle) continue

    // onTick — every tick
    if (lifecycle.onTick) {
      const bctx = createBuildingTickContext(ctx, building, pool, household)
      lifecycle.onTick(bctx)
    }

    // onDayStart — once per in-game day
    if (ctx.isNewDay && lifecycle.onDayStart) {
      const bctx = createBuildingTickContext(ctx, building, pool, household)
      lifecycle.onDayStart(bctx)
    }

    // onMonthEnd — once per in-game month
    if (ctx.monthlyDue && lifecycle.onMonthEnd) {
      const bctx = createBuildingTickContext(ctx, building, pool, household)
      lifecycle.onMonthEnd(bctx)
    }
  }

  return ctx
}

