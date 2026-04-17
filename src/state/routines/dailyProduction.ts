/**
 * Daily household consumption and wages.
 * All per-house state now lives in Building.residentData.
 */
import type { TickRoutine } from './types'
import {
  CROP_KEYS, TOOL_WEAR_PER_DAY, clampCrop, clampFood, createEmptyInventory, getResidentData, updateResidentData,
} from '../helpers'
import { JOB_REGISTRY } from '../../config/jobs/_loader'

function dailyWage(profession: string | null): number {
  if (!profession) return 8
  return JOB_REGISTRY[profession]?.attributes?.dailyIncome ?? 8
}

export const dailyProductionRoutine: TickRoutine = (ctx) => {
  if (!ctx.isNewDay) return ctx
  const { citizens, houses } = ctx
  let buildings = ctx.buildings

  for (const h of houses) {
    const residents = citizens.filter(c => c.houseId === h.id)
    if (!residents.length) continue
    const rd = getResidentData(buildings, h.id)
    const hc = { ...(rd.crops ?? createEmptyInventory()) }
    const totalHc = CROP_KEYS.reduce((s, k) => s + hc[k], 0)
    let newFood = rd.food
    if (totalHc > 0) {
      const consume = Math.min(0.5 * residents.length, totalHc)
      for (const k of CROP_KEYS)
        hc[k] = clampCrop(hc[k] - Math.min(hc[k], consume * (hc[k] / totalHc)))
      newFood = clampFood(CROP_KEYS.reduce((s, k) => s + hc[k], 0))
    }
    const working   = residents.filter(c => (c.workplaceId || c.farmZoneId) && !c.isSick)
    const totalWage = working.reduce((sum, c) => sum + dailyWage(c.profession), 0)
    const activeFarmers = residents.filter(c => c.farmZoneId && !c.isSick)
    const newTools  = activeFarmers.length > 0 && rd.tools > 0
      ? Math.max(0, rd.tools - TOOL_WEAR_PER_DAY)
      : rd.tools
    buildings = updateResidentData(buildings, h.id, {
      crops: hc, food: newFood,
      savings: rd.savings + totalWage,
      tools: newTools,
    })
  }
  ctx.buildings = buildings
  return ctx
}
