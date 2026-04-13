/** Emergency restock: if the market runs low during the day, send another buyer immediately. */
import type { TickRoutine } from './types'
import { MARKET_BUYER_SPEED } from '../../config/simulation'
import { inventoryTotal } from '../helpers'
export const daytimeMarketRestockRoutine: TickRoutine = (ctx) => {
  // only runs during daytime, and not if we just crossed morning (morning routine already handles it)
  if (!ctx.isDaytime || ctx.crossedMorning) return ctx
  const { nextTick, granaries, marketsList } = ctx
  let marketBuyers     = ctx.marketBuyers
  const marketInventory = ctx.marketInventory
  const granaryInventory = ctx.granaryInventory
  for (const market of marketsList) {
    if (marketBuyers.some(mb => mb.marketId === market.id)) continue
    if (inventoryTotal(marketInventory) >= 30) continue  // 库存低于30担才补货（原10）
    if (!granaries.length || inventoryTotal(granaryInventory) < 2) continue
    const g = granaries.reduce((best, gr) =>
      (gr.x - market.x) ** 2 + (gr.y - market.y) ** 2 <
      (best.x - market.x) ** 2 + (best.y - market.y) ** 2 ? gr : best)
    marketBuyers = [...marketBuyers, {
      id: `mb-${nextTick}-emg-${market.id.slice(-4)}`,
      marketId: market.id, granaryId: g.id,
      route: [{ x: market.x, y: market.y }, { x: g.x, y: g.y }, { x: market.x, y: market.y }],
      routeIndex: 0, routeT: 0, speed: MARKET_BUYER_SPEED, pickedUp: false, cargoType: 'rice', cargoAmount: 0,
    }]
  }
  ctx.marketBuyers = marketBuyers
  return ctx
}
