/** Wholesale buyer: now stored as Building.agents on market buildings. */
import type { BuildingAgent } from '../types'
import type { TickRoutine } from './types'
import { MARKET_BUYER_SPEED, SIM_TICK_MS } from '../../config/simulation'
import { CROP_KEYS, clampCrop, inventoryTotal, cropPrice, computeMarketCap, getAggregateCrops, addBldgCrop } from '../helpers'
export const marketBuyerRoutine: TickRoutine = (ctx) => {
  const { marketsList } = ctx
  let buildings          = ctx.buildings
  let monthlyMarketSales = ctx.monthlyMarketSales
  const arrived: BuildingAgent[] = []

  // Advance every market-buyer agent
  buildings = buildings.map(b => {
    if (!b.agents.some(a => a.kind === 'marketbuyer')) return b
    const updatedAgents: BuildingAgent[] = []
    for (let mb of b.agents.filter(a => a.kind === 'marketbuyer')) {
      mb = { ...mb, route: mb.route.map(p => ({ ...p })) }
      let rem = mb.speed * (SIM_TICK_MS / 1000)
      while (rem > 0 && mb.routeIndex < mb.route.length - 1) {
        const seg = 1 - mb.routeT
        if (rem < seg) { mb.routeT += rem; rem = 0 }
        else { rem -= seg; mb.routeIndex += 1; mb.routeT = 0 }
      }
      // Pick up cargo from the source granary (waypoint index 1)
      if (mb.routeIndex >= 1 && !mb.pickedUp && mb.srcGranaryId) {
        const grBuilding = buildings.find(x => x.id === mb.srcGranaryId)
        const grCrops    = grBuilding?.inventory?.crops
        const total      = grCrops ? inventoryTotal(grCrops) : 0
        if (total > 1) {
          const pickAmt = Math.min(80, total)
          const topCrop = CROP_KEYS.reduce((best, k) =>
            (grCrops![k] ?? 0) > (grCrops![best] ?? 0) ? k : best, CROP_KEYS[0])
          const take = Math.min(pickAmt, grCrops![topCrop] ?? 0)
          buildings = addBldgCrop(buildings, mb.srcGranaryId, topCrop, -take)
          mb = { ...mb, cargoType: topCrop, cargoAmount: take }
        }
        mb = { ...mb, pickedUp: true }
      }
      if (mb.routeIndex >= mb.route.length - 1) {
        arrived.push(mb)
      } else {
        updatedAgents.push(mb)
      }
    }
    return { ...b, agents: [...b.agents.filter(a => a.kind !== 'marketbuyer'), ...updatedAgents] }
  })

  // Deposit cargo into the correct market building on arrival
  for (const mb of arrived) {
    if (mb.cargoAmount > 0) {
      // Find which building owns this agent — the market it delivers to
      const marketId = buildings.find(b => b.agents.some(a => a.id === mb.id))?.id
        ?? marketsList.find(m => m.id)?.id  // fallback: first market
      if (marketId) {
        const marketCap = computeMarketCap(marketsList)
        const mkInv     = getAggregateCrops(marketsList)
        const canStock  = Math.max(0, marketCap - inventoryTotal(mkInv))
        if (canStock > 0) {
          const stocked = Math.min(mb.cargoAmount, canStock)
          buildings = addBldgCrop(buildings, marketId, mb.cargoType, stocked)
          monthlyMarketSales += stocked * cropPrice(mb.cargoType)
        }
      }
    }
  }

  ctx.buildings          = buildings
  ctx.monthlyMarketSales = monthlyMarketSales
  return ctx
}
