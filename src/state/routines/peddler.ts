/**
 * Peddler routine — merchant citizens with peddlerState ≠ null.
 * Was a separate Peddler[] array; now lives on Citizen.peddlerState.
 */
import type { PeddlerTripStat, PeddlerState, CitizenMotion } from '../types'
import type { TickRoutine } from './types'
import { SIM_TICK_MS, WALKER_SPEED } from '../../config/simulation'
import {
  CROP_KEYS, PEDDLER_FOOD_THRESH, PEDDLER_SELL_FOOD, FARM_TOOL_PRICE, SMITH_CAPACITY_PER,
  TOOL_DURABILITY_MAX, TOOL_DURABILITY_LOW,
  clampCrop, clampFood, cropPrice, inventoryTotal,
  roadsAdjacent, findRoadPath, transferInventory, computeMarketCap,
  pickNextPeddlerTile, createEmptyInventory, isPeddlerCargoEmpty, bestPath,
  getResidentData, updateResidentData, addBldgCrop, getAggregateCrops, addBldgUnit, getAggregateBldgUnit,
} from '../helpers'

export const peddlerRoutine: TickRoutine = (ctx) => {
  const { s, nextTick, houseMap, dayCount } = ctx
  const { houses, farmZones, buildingMap, marketsList, smithBldgs } = ctx
  let citizens  = ctx.citizens
  let buildings = ctx.buildings

  citizens = citizens.map(c => {
    if (!c.peddlerState) return c
    let p: PeddlerState = {
      ...c.peddlerState,
      cargo: { ...c.peddlerState.cargo, crops: { ...c.peddlerState.cargo.crops } },
    }
    p.segT += p.speed * (SIM_TICK_MS / 1000)
    if (p.segT < 1) return { ...c, peddlerState: p }
    p.segT    -= 1
    p.fromTile = { ...p.toTile }
    const tile = p.fromTile
    // ── sell food to adjacent houses ────────────────────────────────────────
    for (const house of houses) {
      if (inventoryTotal(p.cargo.crops) < 0.1) break
      if (Math.abs(house.x - tile.x) + Math.abs(house.y - tile.y) > 1) continue
      const rd      = getResidentData(buildings, house.id)
      const hcNow   = { ...(rd.crops ?? createEmptyInventory()) }
      const foodTotal = inventoryTotal(hcNow)
      if (foodTotal >= PEDDLER_FOOD_THRESH) continue
      const sav = rd.savings
      if (foodTotal < 2 && sav <= 0) {
        const give = Math.min(1, inventoryTotal(p.cargo.crops))
        if (give > 0.01) {
          transferInventory(p.cargo.crops, hcNow, give)
          buildings = updateResidentData(buildings, house.id, {
            crops: hcNow, food: clampFood(inventoryTotal(hcNow)),
          })
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
        buildings = updateResidentData(buildings, house.id, {
          crops: hcNow, food: clampFood(inventoryTotal(hcNow)),
          savings: Math.max(0, sav - cost),
        })
        p.statsHousesServed++
        p.statsFoodSold  += moved
        p.statsRevenue   += cost
      }
    }
    // ── sell iron tools to adjacent farmers ────────────────────────────────
    if (p.cargo.ironTools > 0) {
      for (const zone of farmZones) {
        if (p.cargo.ironTools <= 0) break
        let near = false
        for (let dx = 0; dx <= 1 && !near; dx++)
          for (let dy = 0; dy <= 1 && !near; dy++)
            if (Math.abs((zone.x + dx) - tile.x) + Math.abs((zone.y + dy) - tile.y) <= 1) near = true
        if (!near) continue
        const farmer = citizens.find(c2 => c2.farmZoneId === zone.id)
        if (!farmer) continue
        const rd = getResidentData(buildings, farmer.houseId)
        if ((rd.tools ?? 0) >= TOOL_DURABILITY_LOW) continue
        if (rd.savings < FARM_TOOL_PRICE) continue
        p.cargo.ironTools--
        p.statsToolsSold++
        buildings = updateResidentData(buildings, farmer.houseId, {
          tools: TOOL_DURABILITY_MAX,
          savings: Math.max(0, rd.savings - FARM_TOOL_PRICE),
        })
      }
    }
    // ── routing ────────────────────────────────────────────────────────────
    if (p.phase === 'outbound' && c.isSick) p.stepsLeft = 0
    if (p.phase === 'outbound') {
      p.stepsLeft--
      if (p.stepsLeft <= 0 || isPeddlerCargoEmpty(p.cargo)) {
        const market = buildingMap.get(p.marketId); if (!market) return { ...c, peddlerState: null }
        const mRoads = roadsAdjacent(s.roads, market.x, market.y)
        let best: { x: number; y: number }[] | null = null
        for (const mr of mRoads) {
          const path = findRoadPath(s.roads, p.fromTile, mr)
          if (path && (!best || path.length < best.length)) best = path
        }
        if (!best) return { ...c, peddlerState: null }
        p = { ...p, phase: 'returning', returnRoute: best, returnIdx: 0, toTile: best[0] }
      } else {
        const next = pickNextPeddlerTile(p.fromTile, p.prevTile, s.roads)
        if (next) { p.prevTile = { ...p.fromTile }; p.toTile = next }
        else { p.stepsLeft = 0 }
      }
    } else {
      p.returnIdx++
      if (p.returnIdx >= p.returnRoute.length) {
        // Arrived back at market — deposit remaining stock
        const mktCap  = computeMarketCap(marketsList)
        const mkInv   = getAggregateCrops(marketsList)
        const canStock = Math.max(0, mktCap - inventoryTotal(mkInv))
        if (canStock > 0) {
          const tmpCrops = { ...p.cargo.crops }
          const moveAmt  = Math.min(inventoryTotal(tmpCrops), canStock)
          if (moveAmt > 0 && marketsList[0]) {
            const mkt = buildingMap.get(p.marketId) ?? marketsList[0]
            // distribute evenly per crop ratio
            for (const k of CROP_KEYS) {
              const take = clampCrop(tmpCrops[k] > 0 ? Math.min(tmpCrops[k], canStock * (tmpCrops[k] / inventoryTotal(tmpCrops) || 0)) : 0)
              if (take > 0) buildings = addBldgCrop(buildings, mkt.id, k, take)
            }
          }
        }
        if (p.cargo.ironTools > 0 && smithBldgs[0]) {
          const cap = smithBldgs.length * SMITH_CAPACITY_PER
          const cur = getAggregateBldgUnit(smithBldgs, 'ironTools')
          const add = Math.min(p.cargo.ironTools, Math.max(0, cap - cur))
          if (add > 0) buildings = addBldgUnit(buildings, smithBldgs[0].id, 'ironTools', add)
        }
        // Record trip stat on the market building's tripLog
        const stat: PeddlerTripStat = {
          peddlerId:    c.id,
          citizenId:    c.id,
          dayCount:     p.statsDayCount,
          cargoAtStart: p.statsCargoAtStart,
          housesServed: p.statsHousesServed,
          foodSold:     p.statsFoodSold,
          revenue:      p.statsRevenue,
          toolsSold:    p.statsToolsSold,
        }
        buildings = buildings.map(b =>
          b.id === p.marketId
            ? { ...b, tripLog: [...(b.tripLog ?? []), stat].slice(-6) }
            : b,
        )
        // Send citizen home with a motion
        const market  = buildingMap.get(p.marketId)
        const house   = houseMap.get(c.houseId)
        if (market && house) {
          const route = bestPath(s.roads, market, house)
          if (route && route.length >= 2) {
            const homeMotion: CitizenMotion = {
              route, routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toHome',
            }
            return { ...c, peddlerState: null, motion: homeMotion }
          }
        }
        return { ...c, peddlerState: null, isAtHome: true }
      }
      p = { ...p, toTile: p.returnRoute[p.returnIdx] }
    }
    return { ...c, peddlerState: p }
  })

  ctx.citizens  = citizens
  ctx.buildings = buildings
  return ctx
}
