/** Wholesale buyer: travels from market to granary, loads top-crop, returns to restock market. */
import type { MarketBuyer } from '../types'
import type { TickRoutine } from './types'
import { MARKET_BUYER_SPEED, SIM_TICK_MS } from '../../config/simulation'
import { CROP_KEYS, clampCrop, inventoryTotal, cropPrice, computeMarketCap } from '../helpers'
export const marketBuyerRoutine: TickRoutine = (ctx) => {
  const { s }           = ctx
  let granaryInventory  = ctx.granaryInventory
  let marketInventory   = ctx.marketInventory
  let monthlyMarketSales = ctx.monthlyMarketSales
  const { marketsList } = ctx
  const arrived: MarketBuyer[] = []
  let marketBuyers = ctx.marketBuyers.map(mb => ({ ...mb, route: mb.route.map(p => ({ ...p })) }))
  marketBuyers = marketBuyers.filter(mb => {
    let rem = mb.speed * (SIM_TICK_MS / 1000)
    while (rem > 0 && mb.routeIndex < mb.route.length - 1) {
      const seg = 1 - mb.routeT
      if (rem < seg) { mb.routeT += rem; rem = 0 }
      else { rem -= seg; mb.routeIndex += 1; mb.routeT = 0 }
    }
    // pick up cargo at the granary (waypoint index 1)
    if (mb.routeIndex >= 1 && !mb.pickedUp) {
      const total = inventoryTotal(granaryInventory)
      if (total > 1) {
        const pickAmt = Math.min(80, total)   // 每次最多取 80 担（原20），加快补货速度
        const topCrop = CROP_KEYS.reduce((best, k) =>
          granaryInventory[k] > granaryInventory[best] ? k : best, CROP_KEYS[0])
        const take = Math.min(pickAmt, granaryInventory[topCrop])
        granaryInventory = { ...granaryInventory, [topCrop]: clampCrop(granaryInventory[topCrop] - take) }
        mb.cargoType = topCrop; mb.cargoAmount = take
      }
      mb.pickedUp = true
    }
    if (mb.routeIndex >= mb.route.length - 1) { arrived.push(mb); return false }
    return true
  })
  // deposit cargo into market on arrival
  for (const mb of arrived) {
    if (mb.cargoAmount > 0) {
      const marketCap = computeMarketCap(marketsList, s.marketConfig)
      const canStock  = Math.max(0, marketCap - inventoryTotal(marketInventory))
      if (canStock > 0) {
        const stocked = Math.min(mb.cargoAmount, canStock)
        marketInventory = { ...marketInventory, [mb.cargoType]: clampCrop(marketInventory[mb.cargoType] + stocked) }
        monthlyMarketSales += stocked * cropPrice(mb.cargoType)
      }
    }
  }
  ctx.marketBuyers       = marketBuyers
  ctx.granaryInventory   = granaryInventory
  ctx.marketInventory    = marketInventory
  ctx.monthlyMarketSales = monthlyMarketSales
  return ctx
}
