/**
 * Daily household consumption and wages.
 *
 * NOTE: Mine ore production and blacksmith tool production have been moved to
 * src/config/buildings/mine/behavior.ts and blacksmith/behavior.ts respectively.
 * They are dispatched by buildingBehaviorRoutine (runs before this routine in TICK_CHAIN).
 */
import type { TickRoutine } from './types'
import {
  CROP_KEYS,
  TOOL_WEAR_PER_DAY,
  clampCrop, clampFood, createEmptyInventory,
} from '../helpers'
export const dailyProductionRoutine: TickRoutine = (ctx) => {
  if (!ctx.isNewDay) return ctx
  const { citizens, houses } = ctx
  let houseCrops   = ctx.houseCrops
  let houseFood    = ctx.houseFood
  let houseSavings = ctx.houseSavings
  let houseTools   = ctx.houseTools

  // households consume food; working residents earn daily wages; farmers wear tools
  for (const h of houses) {
    const residents = citizens.filter(c => c.houseId === h.id)
    if (!residents.length) continue
    const hc      = { ...(houseCrops[h.id] ?? createEmptyInventory()) }
    const totalHc = CROP_KEYS.reduce((s, k) => s + hc[k], 0)
    if (totalHc > 0) {
      const consume = Math.min(0.5 * residents.length, totalHc)
      for (const k of CROP_KEYS)
        hc[k] = clampCrop(hc[k] - Math.min(hc[k], consume * (hc[k] / totalHc)))
      houseCrops = { ...houseCrops, [h.id]: hc }
      houseFood  = { ...houseFood,  [h.id]: clampFood(CROP_KEYS.reduce((s, k) => s + hc[k], 0)) }
    }
    const working = residents.filter(c => (c.workplaceId || c.farmZoneId) && !c.isSick).length
    houseSavings  = { ...houseSavings, [h.id]: (houseSavings[h.id] ?? 0) + working * 3 }

    // tool wear: active farmers degrade their iron tool each day
    const activeFarmers = residents.filter(c => c.farmZoneId && !c.isSick)
    if (activeFarmers.length > 0) {
      const dur = houseTools[h.id] ?? 0
      if (dur > 0) houseTools = { ...houseTools, [h.id]: Math.max(0, dur - TOOL_WEAR_PER_DAY) }
    }
  }
  ctx.houseCrops   = houseCrops
  ctx.houseFood    = houseFood
  ctx.houseSavings = houseSavings
  ctx.houseTools   = houseTools
  return ctx
}
