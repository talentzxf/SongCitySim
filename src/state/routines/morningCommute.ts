/**
 * Morning trigger (once per day at MORNING_START):
 *  - Workers and farmers commute to their workplaces
 *  - Citizens with low food / savings head to the market
 *  - Market restock buyers are dispatched from each market
 *  - Peddlers are spawned from markets with stock
 */
import type { TickRoutine } from './types'
import { WALKER_SPEED, MARKET_BUYER_SPEED, SHOP_INTERVAL_DAYS } from '../../config/simulation'
import {
  CROP_KEYS, PEDDLER_MAX_STEPS, PEDDLER_SPEED,
  PEDDLER_CARRY_FOOD, PEDDLER_CARRY_TOOLS, FARM_TOOL_PRICE,
  inventoryTotal, adjacentHasRoad, roadsAdjacent, findRoadPath, bestPath, isRoadAt,
  getMarketCfg, transferInventory, createEmptyPeddlerCargo,
} from '../helpers'
export const morningCommuteRoutine: TickRoutine = (ctx) => {
  if (!ctx.crossedMorning) return ctx
  const { s, nextTick, isNewDay, dayCount, houseMap, buildingMap, farmZones, citizens, marketsList, granaries } = ctx
  let walkers          = ctx.walkers
  let marketBuyers     = ctx.marketBuyers
  let peddlers         = ctx.peddlers
  let marketInventory  = ctx.marketInventory
  let smithInventory   = ctx.smithInventory
  let houseCrops       = ctx.houseCrops
  let houseFood        = ctx.houseFood
  let houseSavings     = ctx.houseSavings
  let houseTools       = ctx.houseTools
  let granaryInventory = ctx.granaryInventory
  const activeIds = new Set(walkers.map(w => w.citizenId))
  // workplace commute
  for (const c of citizens) {
    if (!c.workplaceId || !c.isAtHome || c.isSick || activeIds.has(c.id)) continue
    const house = houseMap.get(c.houseId); const wp = buildingMap.get(c.workplaceId)
    if (!house || !wp) continue
    const route = bestPath(s.roads, house, wp); if (!route || route.length < 2) continue
    walkers = [...walkers, { id: `w-${nextTick}-${c.id}-work`, citizenId: c.id, route, routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toWork' }]
    activeIds.add(c.id)
  }
  // farm commute
  for (const c of citizens) {
    if (!c.farmZoneId || !c.isAtHome || c.isSick || activeIds.has(c.id)) continue
    const zone  = farmZones.find(z => z.id === c.farmZoneId)
    const house = houseMap.get(c.houseId)
    if (!zone || !house) continue
    const farmRoads: { x: number; y: number }[] = []
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
      const tx = zone.x + dx, ty = zone.y + dy
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
        if (isRoadAt(s.roads, tx + ddx, ty + ddy)) farmRoads.push({ x: tx + ddx, y: ty + ddy })
    }
    let roadSeg: { x: number; y: number }[] | null = null
    for (const hr of roadsAdjacent(s.roads, house.x, house.y))
      for (const fr of farmRoads) {
        const p = findRoadPath(s.roads, hr, fr)
        if (p && (!roadSeg || p.length < roadSeg.length)) roadSeg = p
      }
    if (!roadSeg) continue
    walkers = [...walkers, {
      id: `w-${nextTick}-${c.id}-work`, citizenId: c.id,
      route: [{ x: house.x, y: house.y }, ...roadSeg, { x: zone.x, y: zone.y }],
      routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toWork',
    }]
    activeIds.add(c.id)
  }
  // shopping trips
  if (marketsList.length > 0 && inventoryTotal(marketInventory) > 0) {
    const isShopDay = isNewDay && dayCount % SHOP_INTERVAL_DAYS === 0
    for (const c of citizens) {
      if (!c.isAtHome || c.isSick || activeIds.has(c.id)) continue
      const house = houseMap.get(c.houseId); if (!house) continue
      const savings = houseSavings[c.houseId] ?? 0
      const hcNow   = houseCrops[c.houseId]
      const hcTotal = hcNow ? CROP_KEYS.reduce((s, k) => s + hcNow[k], 0) : (houseFood[c.houseId] ?? 0)
      const mustGo       = hcTotal < 10 && savings > 0
      const wantMore     = hcTotal < 22 && savings > 8
      const randomWander = hcTotal < 25 && savings > 3 && Math.random() < 0.08
      const needsTool    = Boolean(c.farmZoneId) && (houseTools[c.houseId] ?? 0) === 0 && smithInventory > 0 && savings >= FARM_TOOL_PRICE && Math.random() < 0.18
      const trigger      = isShopDay ? hcTotal < 20 : (mustGo || wantMore || randomWander || needsTool)
      if (!trigger || (savings <= 0 && hcTotal >= 5)) continue
      const market = marketsList.reduce((best, m) =>
        (m.x - house.x) ** 2 + (m.y - house.y) ** 2 < (best.x - house.x) ** 2 + (best.y - house.y) ** 2 ? m : best)
      walkers = [...walkers, {
        id: `w-${nextTick}-${c.id}-shop`, citizenId: c.id,
        route: [{ x: house.x, y: house.y }, { x: market.x, y: market.y }],
        routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toShop', targetId: market.id,
      }]
      activeIds.add(c.id)
    }
  }
  // market restock buyers (one per market per morning)
  for (const market of marketsList) {
    if (marketBuyers.some(mb => mb.marketId === market.id)) continue
    if (!granaries.length || inventoryTotal(granaryInventory) < 2) continue
    const g = granaries.reduce((b, gr) =>
      (gr.x - market.x) ** 2 + (gr.y - market.y) ** 2 < (b.x - market.x) ** 2 + (b.y - market.y) ** 2 ? gr : b)
    marketBuyers = [...marketBuyers, {
      id: `mb-${nextTick}-${market.id.slice(-4)}`,
      marketId: market.id, granaryId: g.id,
      route: [{ x: market.x, y: market.y }, { x: g.x, y: g.y }, { x: market.x, y: market.y }],
      routeIndex: 0, routeT: 0, speed: MARKET_BUYER_SPEED, pickedUp: false, cargoType: 'rice', cargoAmount: 0,
    }]
  }
  // spawn peddlers from markets
  for (const market of marketsList) {
    if (!adjacentHasRoad(s.roads, market.x, market.y)) continue
    const cfg      = getMarketCfg(market.id, s.marketConfig)
    const active   = peddlers.filter(p => p.marketId === market.id).length
    const toSpawn  = Math.max(0, cfg.peddlers - active)
    if (!toSpawn) continue
    const startRoads = roadsAdjacent(s.roads, market.x, market.y)
    if (!startRoads.length) continue
    const foodTotal = inventoryTotal(marketInventory)
    for (let i = 0; i < toSpawn; i++) {
      const cargo = createEmptyPeddlerCargo()
      if (foodTotal > 0.1)
        transferInventory(marketInventory, cargo.crops, Math.min(PEDDLER_CARRY_FOOD, foodTotal / Math.max(1, toSpawn)))
      if (smithInventory > 0) {
        const carry = Math.min(PEDDLER_CARRY_TOOLS, smithInventory)
        cargo.ironTools = carry; smithInventory -= carry
      }
      peddlers = [...peddlers, {
        id: `pd-${nextTick}-${market.id.slice(-4)}-${i}`,
        marketId: market.id, cargo, phase: 'outbound', stepsLeft: PEDDLER_MAX_STEPS,
        fromTile: { x: market.x, y: market.y },
        toTile:   { ...startRoads[i % startRoads.length] },
        segT: 0, speed: PEDDLER_SPEED, prevTile: null, returnRoute: [], returnIdx: 0,
      }]
    }
  }
  ctx.walkers          = walkers
  ctx.marketBuyers     = marketBuyers
  ctx.peddlers         = peddlers
  ctx.marketInventory  = marketInventory
  ctx.smithInventory   = smithInventory
  ctx.granaryInventory = granaryInventory
  return ctx
}
