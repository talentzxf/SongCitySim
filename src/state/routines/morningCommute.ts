/**
 * Morning trigger (once per day at MORNING_START):
 *  - Workers and farmers commute to their workplaces
 *  - Citizens with low food / savings head to the market
 *  - Market restock buyers are dispatched from each market
 *  - Peddlers are spawned from markets – one per assigned market worker (real citizens)
 */
import type { TickRoutine } from './types'
import { WALKER_SPEED, MARKET_BUYER_SPEED, SHOP_INTERVAL_DAYS } from '../../config/simulation'
import {
  CROP_KEYS, PEDDLER_MAX_STEPS, PEDDLER_SPEED,
  PEDDLER_CARRY_FOOD, PEDDLER_CARRY_TOOLS, FARM_TOOL_PRICE, TOOL_DURABILITY_LOW,
  inventoryTotal, adjacentHasRoad, roadsAdjacent, findRoadPath, bestPath, isRoadAt,
  getMarketCfg, transferInventory, createEmptyPeddlerCargo,
} from '../helpers'
export const morningCommuteRoutine: TickRoutine = (ctx) => {
  if (!ctx.crossedMorning) return ctx
  const { s, nextTick, isNewDay, dayCount, houseMap, buildingMap, farmZones, marketsList, granaries } = ctx
  let citizens         = ctx.citizens
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

  // ── Pre-identify peddler workers BEFORE the commute loop ──────────────────
  // Key: only real market workers can peddle; reserve their slot in activeIds so
  // they don't also receive a plain toWork commute walker.
  // Map: marketId -> list of citizen ids chosen to peddle today
  const peddlerAssignments = new Map<string, string[]>()
  for (const market of marketsList) {
    if (!adjacentHasRoad(s.roads, market.x, market.y)) continue
    const cfg          = getMarketCfg(market.id, s.marketConfig)
    const alreadyOut   = peddlers.filter(p =>
      p.marketId === market.id &&
      // 生病的行商不占名额——让坐商顶替
      !(p.citizenId && citizens.find(c => c.id === p.citizenId)?.isSick)
    ).length
    const needed       = Math.max(0, cfg.peddlers - alreadyOut)
    if (!needed) continue
    const busyCitizenIds = new Set(
      peddlers.filter(p =>
        p.marketId === market.id && p.citizenId &&
        // 同上：生病的行商不锁定名额
        !citizens.find(c => c.id === p.citizenId)?.isSick
      ).map(p => p.citizenId!)
    )
    // find market workers who are home, healthy, and not already peddling.
    // Sort by id so the selection is deterministic and matches the HUD designation:
    // the LAST cfg.peddlers workers (by sorted order) are always the peddler candidates.
    const eligible = citizens
      .filter(c =>
        c.workplaceId === market.id &&
        c.isAtHome && !c.isSick && !activeIds.has(c.id) && !busyCitizenIds.has(c.id)
      )
      .sort((a, b) => a.id.localeCompare(b.id))
    const candidates = eligible.slice(eligible.length - needed)  // tail = peddler slots
    if (!candidates.length) continue
    const ids = candidates.map(c => c.id)
    peddlerAssignments.set(market.id, ids)
    for (const id of ids) activeIds.add(id)   // block regular toWork walker
  }

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
      const needsTool    = Boolean(c.farmZoneId) && (houseTools[c.houseId] ?? 0) < TOOL_DURABILITY_LOW && smithInventory > 0 && savings >= FARM_TOOL_PRICE && Math.random() < 0.18
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
  // ── Spawn peddlers from real market workers ────────────────────────────────
  for (const [marketId, citizenIds] of peddlerAssignments) {
    const market = buildingMap.get(marketId); if (!market) continue
    const startRoads = roadsAdjacent(s.roads, market.x, market.y)
    if (!startRoads.length) continue
    for (let i = 0; i < citizenIds.length; i++) {
      const citizenId  = citizenIds[i]
      const foodInMkt  = inventoryTotal(marketInventory)
      const cargo      = createEmptyPeddlerCargo()
      if (foodInMkt > 0.1)
        transferInventory(marketInventory, cargo.crops,
          Math.min(PEDDLER_CARRY_FOOD, foodInMkt / Math.max(1, citizenIds.length - i)))
      if (smithInventory > 0) {
        const carry = Math.min(PEDDLER_CARRY_TOOLS, smithInventory)
        cargo.ironTools = carry; smithInventory -= carry
      }
      const cargoFood = inventoryTotal(cargo.crops)
      peddlers = [...peddlers, {
        id: `pd-${nextTick}-${marketId.slice(-4)}-${i}`,
        citizenId,
        marketId, cargo, phase: 'outbound', stepsLeft: PEDDLER_MAX_STEPS,
        fromTile: { x: market.x, y: market.y },
        toTile:   { ...startRoads[i % startRoads.length] },
        segT: 0, speed: PEDDLER_SPEED, prevTile: null, returnRoute: [], returnIdx: 0,
        // trip statistics
        statsCargoAtStart: cargoFood,
        statsHousesServed: 0,
        statsFoodSold:     0,
        statsRevenue:      0,
        statsToolsSold:    0,
        statsDayCount:     dayCount,
      }]
      // citizen leaves home to peddle
      citizens = citizens.map(c => c.id === citizenId ? { ...c, isAtHome: false } : c)
    }
  }
  ctx.citizens         = citizens
  ctx.walkers          = walkers
  ctx.marketBuyers     = marketBuyers
  ctx.peddlers         = peddlers
  ctx.marketInventory  = marketInventory
  ctx.smithInventory   = smithInventory
  ctx.granaryInventory = granaryInventory
  return ctx
}
