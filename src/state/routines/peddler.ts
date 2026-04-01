/**
 * Peddler walk: each peddler moves one step per tick.
 * Outbound phase: sells food and iron tools to nearby households and farmers.
 * Return phase: walks back to market and restocks the market + smith inventory.
 */
import type { Peddler } from '../types'
import type { TickRoutine } from './types'
import { SIM_TICK_MS } from '../../config/simulation'
import {
  CROP_KEYS, PEDDLER_FOOD_THRESH, PEDDLER_SELL_FOOD, FARM_TOOL_PRICE, SMITH_CAPACITY_PER,
  clampCrop, clampFood, cropPrice, inventoryTotal,
  roadsAdjacent, findRoadPath, transferInventory, computeMarketCap,
  pickNextPeddlerTile, createEmptyInventory, isPeddlerCargoEmpty,
} from '../helpers'
export const peddlerRoutine: TickRoutine = (ctx) => {
  const { s }          = ctx
  let houseCrops       = ctx.houseCrops
  let houseFood        = ctx.houseFood
  let houseSavings     = ctx.houseSavings
  let houseTools       = ctx.houseTools
  let marketInventory  = ctx.marketInventory
  let smithInventory   = ctx.smithInventory
  const { houses, farmZones, citizens, buildingMap, marketsList, smithBldgs } = ctx
  const arrived: Peddler[] = []
  let peddlers = ctx.peddlers.map(p => ({ ...p, cargo: { ...p.cargo, crops: { ...p.cargo.crops } } }))
  peddlers = peddlers.filter(p => {
    p.segT += p.speed * (SIM_TICK_MS / 1000)
    if (p.segT < 1) return true
    p.segT   -= 1
    p.fromTile = { ...p.toTile }
    if (p.phase === 'outbound') {
      p.stepsLeft--
      const tile = p.fromTile
      // sell food to adjacent houses
      for (const house of houses) {
        if (inventoryTotal(p.cargo.crops) < 0.1) break
        if (Math.abs(house.x - tile.x) + Math.abs(house.y - tile.y) > 1) continue
        const hcNow     = { ...(houseCrops[house.id] ?? createEmptyInventory()) }
        const foodTotal = inventoryTotal(hcNow)
        if (foodTotal >= PEDDLER_FOOD_THRESH) continue
        const sav = houseSavings[house.id] ?? 0
        // charity: give one unit free to starving households with no savings
        if (foodTotal < 2 && sav <= 0) {
          const give = Math.min(1, inventoryTotal(p.cargo.crops))
          if (give > 0.01) {
            transferInventory(p.cargo.crops, hcNow, give)
            houseCrops = { ...houseCrops, [house.id]: hcNow }
            houseFood  = { ...houseFood,  [house.id]: clampFood(inventoryTotal(hcNow)) }
          }
          continue
        }
        if (sav <= 0) continue
        const want = Math.min(PEDDLER_SELL_FOOD, PEDDLER_FOOD_THRESH - foodTotal)
        let moved = 0, cost = 0
        for (const k of CROP_KEYS) {
          if (moved >= want || p.cargo.crops[k] < 0.01 || sav - cost <= 0) continue
          const take = Math.min(p.cargo.crops[k], want - moved, (sav - cost) / cropPrice(k))
          if (take < 0.01) continue
          p.cargo.crops[k] = clampCrop(p.cargo.crops[k] - take)
          hcNow[k]         = clampCrop(hcNow[k] + take)
          moved += take; cost += take * cropPrice(k)
        }
        if (moved > 0) {
          houseCrops   = { ...houseCrops,   [house.id]: hcNow }
          houseFood    = { ...houseFood,    [house.id]: clampFood(inventoryTotal(hcNow)) }
          houseSavings = { ...houseSavings, [house.id]: Math.max(0, sav - cost) }
        }
      }
      // sell iron tools to adjacent farmers who do not yet have a tool
      if (p.cargo.ironTools > 0) {
        for (const zone of farmZones) {
          if (p.cargo.ironTools <= 0) break
          let near = false
          for (let dx = 0; dx <= 1 && !near; dx++)
            for (let dy = 0; dy <= 1 && !near; dy++)
              if (Math.abs((zone.x + dx) - tile.x) + Math.abs((zone.y + dy) - tile.y) <= 1) near = true
          if (!near) continue
          const farmer = citizens.find(c => c.farmZoneId === zone.id)
          if (!farmer || (houseTools[farmer.houseId] ?? 0) > 0) continue
          const sav = houseSavings[farmer.houseId] ?? 0
          if (sav < FARM_TOOL_PRICE) continue
          p.cargo.ironTools--
          houseTools   = { ...houseTools,   [farmer.houseId]: (houseTools[farmer.houseId] ?? 0) + 1 }
          houseSavings = { ...houseSavings, [farmer.houseId]: Math.max(0, sav - FARM_TOOL_PRICE) }
        }
      }
      // decide: keep walking or begin the return journey
      if (p.stepsLeft <= 0 || isPeddlerCargoEmpty(p.cargo)) {
        const market = buildingMap.get(p.marketId); if (!market) return false
        const mRoads = roadsAdjacent(s.roads, market.x, market.y)
        let best: { x: number; y: number }[] | null = null
        for (const mr of mRoads) {
          const path = findRoadPath(s.roads, p.fromTile, mr)
          if (path && (!best || path.length < best.length)) best = path
        }
        if (!best) return false
        p.phase = 'returning'; p.returnRoute = best; p.returnIdx = 0; p.toTile = best[0]
      } else {
        const next = pickNextPeddlerTile(p.fromTile, p.prevTile, s.roads)
        if (next) { p.prevTile = { ...p.fromTile }; p.toTile = next }
        else { p.stepsLeft = 0 }
      }
    } else {
      // returning phase: follow pre-computed return route
      p.returnIdx++
      if (p.returnIdx >= p.returnRoute.length) { arrived.push(p); return false }
      p.toTile = p.returnRoute[p.returnIdx]
    }
    return true
  })
  // peddlers that arrived back at market deposit remaining stock
  for (const p of arrived) {
    const mktCap  = computeMarketCap(marketsList, s.marketConfig)
    const canStock = Math.max(0, mktCap - inventoryTotal(marketInventory))
    if (canStock > 0) {
      const tmpCrops = { ...p.cargo.crops }
      transferInventory(tmpCrops, marketInventory, Math.min(inventoryTotal(tmpCrops), canStock))
    }
    if (p.cargo.ironTools > 0)
      smithInventory = Math.min(smithInventory + p.cargo.ironTools, smithBldgs.length * SMITH_CAPACITY_PER)
  }
  ctx.peddlers        = peddlers
  ctx.houseCrops      = houseCrops
  ctx.houseFood       = houseFood
  ctx.houseSavings    = houseSavings
  ctx.houseTools      = houseTools
  ctx.marketInventory = marketInventory
  ctx.smithInventory  = smithInventory
  return ctx
}
