/** Daily production & consumption: mine ore, smith tools, households eat food and earn wages. */
import type { TickRoutine } from './types'
import {
  CROP_KEYS, MINE_CAPACITY_PER, SMITH_CAPACITY_PER,
  ORE_PER_MINER_DAY, ORE_PER_TOOL,
  TOOL_WEAR_PER_DAY,
  clampCrop, clampFood, createEmptyInventory,
} from '../helpers'
export const dailyProductionRoutine: TickRoutine = (ctx) => {
  if (!ctx.isNewDay) return ctx
  const { s, citizens, houses } = ctx
  let mineInventory  = ctx.mineInventory
  let smithInventory = ctx.smithInventory
  let houseCrops     = ctx.houseCrops
  let houseFood      = ctx.houseFood
  let houseSavings   = ctx.houseSavings
  let houseTools     = ctx.houseTools
  // mine produces ore proportional to healthy miners on shift
  const mines = s.buildings.filter(b => b.type === 'mine')
  if (mines.length > 0) {
    const cap = mines.length * MINE_CAPACITY_PER
    for (const mine of mines) {
      const miners = citizens.filter(c => c.workplaceId === mine.id && !c.isSick)
      mineInventory = Math.min(
        mineInventory + Math.min(miners.length * ORE_PER_MINER_DAY, Math.max(0, cap - mineInventory)),
        cap,
      )
    }
  }
  // blacksmiths convert ore into tools
  const smithBuildings = s.buildings.filter(b => b.type === 'blacksmith')
  if (smithBuildings.length > 0) {
    const cap = smithBuildings.length * SMITH_CAPACITY_PER
    for (const smith of smithBuildings) {
      const smiths = citizens.filter(c => c.workplaceId === smith.id && !c.isSick)
      if (!smiths.length) continue
      const oreUsed   = Math.min(mineInventory, smiths.length * ORE_PER_TOOL)
      const toolsMade = Math.floor(oreUsed / ORE_PER_TOOL)
      mineInventory  = Math.max(0, mineInventory - toolsMade * ORE_PER_TOOL)
      smithInventory = Math.min(smithInventory + Math.min(toolsMade, Math.max(0, cap - smithInventory)), cap)
    }
  }
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

    // ── tool wear: active farmers degrade their iron tool each day ────────
    const activeFarmers = residents.filter(c => c.farmZoneId && !c.isSick)
    if (activeFarmers.length > 0) {
      const dur = houseTools[h.id] ?? 0
      if (dur > 0) {
        const newDur = Math.max(0, dur - TOOL_WEAR_PER_DAY)
        houseTools = { ...houseTools, [h.id]: newDur }
      }
    }
  }
  ctx.mineInventory  = mineInventory
  ctx.smithInventory = smithInventory
  ctx.houseCrops     = houseCrops
  ctx.houseFood      = houseFood
  ctx.houseSavings   = houseSavings
  ctx.houseTools     = houseTools
  return ctx
}
