/** Advance crop growth each tick; harvest into a FarmPile when progress reaches 1. */
import type { FarmZone } from '../types'
import type { TickRoutine } from './types'
import configData from '../../config/buildings-and-citizens.json'
import { DAY_TICKS } from '../../config/simulation'
import { TOOL_EFFICIENCY_BONUS, clampCrop, cropPrice, terrainFertilityAt, adjacentHasRoad } from '../helpers'
const FARM_CYCLE_TICKS   = 5 * DAY_TICKS
const HARVEST_YIELD_BASE = 15
export const farmGrowthRoutine: TickRoutine = (ctx) => {
  const { s, nextTick } = ctx
  let farmPiles         = ctx.farmPiles.map(p => ({ ...p, age: p.age + 1 }))
  let monthlyFarmOutput = ctx.monthlyFarmOutput
  let monthlyFarmValue  = ctx.monthlyFarmValue
  const updatedFarmZones = ctx.farmZones.map(zone => {
    // skip if a pile for this zone is already waiting to be collected
    if (farmPiles.some(p => p.zoneId === zone.id)) return zone
    const zoneHasRoad = (() => {
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          if (adjacentHasRoad(s.roads, zone.x + dx, zone.y + dy)) return true
      return false
    })()
    const farmer = zoneHasRoad
      ? ctx.citizens.find(c => c.farmZoneId === zone.id && !c.isSick)
      : undefined
    if (!farmer) return zone
    // apply pending crop-type change at the start of a new growth cycle
    const eff: FarmZone = (zone.growthProgress === 0 && zone.pendingCropType)
      ? { ...zone, cropType: zone.pendingCropType, pendingCropType: undefined }
      : zone
    const cropCfg    = (configData as any).crops[eff.cropType]
    const fertility  = (
      terrainFertilityAt(eff.x,     eff.y) + terrainFertilityAt(eff.x + 1, eff.y) +
      terrainFertilityAt(eff.x, eff.y + 1) + terrainFertilityAt(eff.x + 1, eff.y + 1)
    ) / 4
    const toolMult   = (ctx.houseTools[farmer.houseId] ?? 0) > 0 ? TOOL_EFFICIENCY_BONUS : 1.0
    const efficiency = Math.max(0.5, Math.min(1.5, 0.5 + farmer.satisfaction / 100)) * toolMult
    const newProgress = eff.growthProgress + (1 / FARM_CYCLE_TICKS) * efficiency
    if (newProgress >= 1) {
      const yieldAmt = clampCrop(HARVEST_YIELD_BASE * fertility * (cropCfg?.fertilityWeight ?? 1))
      farmPiles = [...farmPiles, {
        id: `pile-${nextTick}-${eff.id.slice(-5)}`,
        zoneId: eff.id, x: eff.x, y: eff.y,
        cropType: eff.cropType, amount: yieldAmt, age: 0,
      }]
      monthlyFarmOutput += yieldAmt
      monthlyFarmValue  += yieldAmt * cropPrice(eff.cropType)
      return { ...eff, growthProgress: 0 }
    }
    return { ...eff, growthProgress: newProgress }
  })
  ctx.farmZones         = updatedFarmZones
  ctx.farmPiles         = farmPiles
  ctx.monthlyFarmOutput = monthlyFarmOutput
  ctx.monthlyFarmValue  = monthlyFarmValue
  return ctx
}
