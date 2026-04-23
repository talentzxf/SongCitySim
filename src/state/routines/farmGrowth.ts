/** Advance crop growth each tick; harvest into a FarmPile when progress reaches 1. */
import type { FarmZone } from '../types'
import type { TickRoutine } from './types'
import { GOODS_REGISTRY } from '../../config/goods/_loader'
import { DAY_TICKS } from '../../config/simulation'
import { TOOL_EFFICIENCY_BONUS, clampCrop, cropPrice, terrainFertilityAt, adjacentHasRoad, getResidentData } from '../helpers'
const FARM_CYCLE_TICKS   = 3 * DAY_TICKS   // 每3天收一季（原5天），加快产粮
const HARVEST_YIELD_BASE = 30              // 每次收获基础产量（原15），提高单产
export const farmGrowthRoutine: TickRoutine = (ctx) => {
  const { s, nextTick } = ctx
  let monthlyFarmOutput = ctx.monthlyFarmOutput
  let monthlyFarmValue  = ctx.monthlyFarmValue
  // Age all existing piles in all farm zones
  let farmZones = ctx.farmZones.map(z => ({
    ...z,
    piles: z.piles.map(p => ({ ...p, age: p.age + 1 })),
  }))
  const updatedFarmZones = farmZones.map(zone => {
    // skip if a pile for this zone is already waiting to be collected
    if (zone.piles.some(p => p.zoneId === zone.id)) return zone
    const zoneHasRoad = (() => {
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          if (adjacentHasRoad(s.roads, zone.x + dx, zone.y + dy)) return true
      return false
    })()
    const farmers = zoneHasRoad
      ? ctx.citizens.filter(c => c.farmZoneId === zone.id && !c.isSick)
      : []
    if (farmers.length === 0) return zone
    const farmer = farmers[0]  // use first farmer for tools/satisfaction
    // apply pending crop-type change at the start of a new growth cycle
    const eff: FarmZone = (zone.growthProgress === 0 && zone.pendingCropType)
      ? { ...zone, cropType: zone.pendingCropType, pendingCropType: undefined }
      : zone
    const cropCfg    = GOODS_REGISTRY[eff.cropType]
    const fertility  = (
      terrainFertilityAt(eff.x,     eff.y) + terrainFertilityAt(eff.x + 1, eff.y) +
      terrainFertilityAt(eff.x, eff.y + 1) + terrainFertilityAt(eff.x + 1, eff.y + 1)
    ) / 4
    const farmerTools = getResidentData(ctx.buildings, farmer.houseId).tools
    const toolMult   = farmerTools > 0 ? TOOL_EFFICIENCY_BONUS : 1.0
    const efficiency = Math.max(0.5, Math.min(1.5, 0.5 + farmer.satisfaction / 100)) * toolMult
    // Each additional worker beyond the first adds 40% productivity (diminishing after 3rd)
    const workerMult = 1 + (farmers.length - 1) * 0.4
    const newProgress = eff.growthProgress + (1 / FARM_CYCLE_TICKS) * efficiency * workerMult
    if (newProgress >= 1) {
      const yieldAmt = clampCrop(HARVEST_YIELD_BASE * fertility * workerMult * (cropCfg?.cropData?.fertilityWeight ?? 1))
      // Add pile directly to farmZone.piles
      const newPile = {
        id: `pile-${nextTick}-${eff.id.slice(-5)}`,
        zoneId: eff.id, x: eff.x, y: eff.y,
        cropType: eff.cropType, amount: yieldAmt, age: 0,
      }
      monthlyFarmOutput += yieldAmt
      monthlyFarmValue  += yieldAmt * cropPrice(eff.cropType)
      return { ...eff, growthProgress: 0, piles: [...eff.piles, newPile] }
    }
    return { ...eff, growthProgress: newProgress }
  })
  ctx.farmZones         = updatedFarmZones
  ctx.monthlyFarmOutput = monthlyFarmOutput
  ctx.monthlyFarmValue  = monthlyFarmValue
  return ctx
}
