/**
 * Building Behavior Routine — dispatches onTick / onDayStart / onMonthEnd
 * lifecycle callbacks.  This file is a pure dispatcher: it has no knowledge
 * of specific building types.  All resource logic lives in each building's
 * own behavior.ts via the typed context API.
 */
import type { TickContext, TickRoutine } from './types'
import type { BuildingTickContext, BuildingHousehold, UnitField } from '../../config/buildings/_lifecycle'
import { getBehavior } from '../../config/buildings/_behavior_loader'
import {
  getResidentData, updateResidentData, addBldgUnit, getAggregateBldgUnit,
} from '../helpers'
import { resourceInitialHealth } from '../../config/naturalResources'
import type { Building, BuildingType } from '../types'

// ── Household adapter ─────────────────────────────────────────────────────────

function makeHousehold(ctx: TickContext): BuildingHousehold {
  return {
    get(houseId, key) {
      const rd = getResidentData(ctx.buildings, houseId)
      if (key === 'food')    return rd.food
      if (key === 'savings') return rd.savings
      if (key === 'tools')   return rd.tools
      return 0
    },
    set(houseId, key, value) {
      if (key === 'food')    ctx.buildings = updateResidentData(ctx.buildings, houseId, { food: value })
      if (key === 'savings') ctx.buildings = updateResidentData(ctx.buildings, houseId, { savings: value })
      if (key === 'tools')   ctx.buildings = updateResidentData(ctx.buildings, houseId, { tools: value })
    },
    mutate(houseId, key, delta) {
      const next = Math.max(0, this.get(houseId, key) + delta)
      this.set(houseId, key, next)
      return next
    },
  }
}

// ── Context factory ───────────────────────────────────────────────────────────

function createBuildingTickContext(
  ctx: TickContext,
  building: Building,
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
    household,

    // ── Unit inventory ───────────────────────────────────────────────────────

    cityUnit(type: BuildingType, field: UnitField): number {
      return getAggregateBldgUnit(ctx.buildings.filter(b => b.type === type), field)
    },

    produceUnit(field: UnitField, amount: number): void {
      if (amount <= 0) return
      ctx.buildings = addBldgUnit(ctx.buildings, building.id, field, amount)
    },

    consumeUnit(sourceType: BuildingType, field: UnitField, amount: number): void {
      if (amount <= 0) return
      const source = ctx.buildings.find(b => b.type === sourceType)
      if (source) ctx.buildings = addBldgUnit(ctx.buildings, source.id, field, -amount)
    },

    // ── Terrain health ───────────────────────────────────────────────────────

    terrainHealth(tileKey: string, kind: string): number {
      return ctx.terrainResources[kind]?.[tileKey] ?? resourceInitialHealth(kind)
    },

    depleteTerrainHealth(tileKey: string, kind: string, amount: number): void {
      if (amount <= 0) return
      const current = ctx.terrainResources[kind]?.[tileKey] ?? resourceInitialHealth(kind)
      const next = Math.max(0, current - amount)
      ctx.terrainResources = {
        ...ctx.terrainResources,
        [kind]: { ...(ctx.terrainResources[kind] ?? {}), [tileKey]: next },
      }
    },
  }
}

// ── Routine ───────────────────────────────────────────────────────────────────

export const buildingBehaviorRoutine: TickRoutine = (ctx) => {
  const household = makeHousehold(ctx)

  for (const building of ctx.s.buildings) {
    const lifecycle = getBehavior(building.type)
    if (!lifecycle) continue
    if (lifecycle.onTick) {
      const bctx = createBuildingTickContext(ctx, building, household)
      lifecycle.onTick(bctx)
    }
    if (ctx.isNewDay && lifecycle.onDayStart) {
      const bctx = createBuildingTickContext(ctx, building, household)
      lifecycle.onDayStart(bctx)
    }
    if (ctx.monthlyDue && lifecycle.onMonthEnd) {
      const bctx = createBuildingTickContext(ctx, building, household)
      lifecycle.onMonthEnd(bctx)
    }
  }
  return ctx
}

