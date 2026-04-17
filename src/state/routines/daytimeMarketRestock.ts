/** Emergency restock: if the market runs low during the day, send another buyer immediately. */
import type { BuildingAgent } from '../types'
import type { TickRoutine } from './types'
import { MARKET_BUYER_SPEED } from '../../config/simulation'
import { inventoryTotal, getAggregateCrops } from '../helpers'
export const daytimeMarketRestockRoutine: TickRoutine = (ctx) => {
  if (!ctx.isDaytime || ctx.crossedMorning) return ctx
  const { nextTick, granaries, marketsList } = ctx
  let buildings = ctx.buildings
  const marketInv   = getAggregateCrops(marketsList)
  const granaryInv  = getAggregateCrops(granaries)
  for (const market of marketsList) {
    // Skip if this market already has a buyer agent en-route
    if (buildings.find(b => b.id === market.id)?.agents.some(a => a.kind === 'marketbuyer')) continue
    if (inventoryTotal(marketInv) >= 30) continue
    if (!granaries.length || inventoryTotal(granaryInv) < 2) continue
    const g = granaries.reduce((best, gr) =>
      (gr.x - market.x) ** 2 + (gr.y - market.y) ** 2 <
      (best.x - market.x) ** 2 + (best.y - market.y) ** 2 ? gr : best)
    const newBuyer: BuildingAgent = {
      id: `mb-${nextTick}-emg-${market.id.slice(-4)}`,
      kind: 'marketbuyer',
      srcGranaryId: g.id,
      route: [{ x: market.x, y: market.y }, { x: g.x, y: g.y }, { x: market.x, y: market.y }],
      routeIndex: 0, routeT: 0, speed: MARKET_BUYER_SPEED,
      pickedUp: false, cargoType: 'rice', cargoAmount: 0,
    }
    buildings = buildings.map(b => b.id === market.id ? { ...b, agents: [...b.agents, newBuyer] } : b)
  }
  ctx.buildings = buildings
  return ctx
}
