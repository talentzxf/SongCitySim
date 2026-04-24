/**
 * Morning trigger (once per day at MORNING_START):
 *  - Workers and farmers commute to their workplaces
 *  - Citizens with low food / savings head to the market
 *  - Market restock buyers are dispatched from each market (as Building.agents)
 *  - Peddlers are spawned from markets – set on Citizen.peddlerState
 */
import type { CitizenMotion, BuildingAgent, PeddlerState } from '../types'
import type { TickRoutine } from './types'
import { WALKER_SPEED, MARKET_BUYER_SPEED, SHOP_INTERVAL_DAYS } from '../../config/simulation'
import {
  CROP_KEYS, PEDDLER_MAX_STEPS, PEDDLER_SPEED,
  PEDDLER_CARRY_FOOD, PEDDLER_CARRY_TOOLS, FARM_TOOL_PRICE, TOOL_DURABILITY_LOW,
  inventoryTotal, buildingHasRoadAccess, roadsAdjacent, roadsAdjacentToBuilding, findRoadPath, bestPath, isRoadAt,
  getMarketCfg, transferInventory, createEmptyPeddlerCargo,
  getAggregateCrops, getAggregateBldgUnit, addBldgUnit, createEmptyInventory,
  getResidentData,
} from '../helpers'

export const morningCommuteRoutine: TickRoutine = (ctx) => {
  if (!ctx.crossedMorning) return ctx
  const { s, nextTick, isNewDay, dayCount, houseMap, buildingMap, farmZones, marketsList, granaries } = ctx
  let citizens  = ctx.citizens
  let buildings = ctx.buildings

  // Active citizen IDs = those who already have motion (don't dispatch again)
  const activeIds = new Set(citizens.filter(c => c.motion !== null).map(c => c.id))

  // ── Pre-identify peddler workers BEFORE the commute loop ──────────────────
  // peddlingIds = citizens currently on a peddler delivery (peddlerState ≠ null)
  const peddlingIds = new Set(
    citizens.filter(c => c.peddlerState !== null).map(c => c.id),
  )
  // Map: marketId -> list of citizen ids chosen to peddle today
  const peddlerAssignments = new Map<string, string[]>()
  for (const market of marketsList) {
    if (!buildingHasRoadAccess(s.roads, market)) continue
    const cfg       = getMarketCfg(market)
    const alreadyOut = citizens.filter(c =>
      c.peddlerState?.marketId === market.id &&
      !c.isSick
    ).length
    const needed = Math.max(0, cfg.peddlers - alreadyOut)
    if (!needed) continue
    const busyCitizenIds = new Set(
      citizens
        .filter(c => c.peddlerState?.marketId === market.id && !c.isSick)
        .map(c => c.id),
    )
    // find market workers who are home, healthy, and not already peddling.
    const eligible = citizens
      .filter(c =>
        c.workplaceId === market.id &&
        c.isAtHome && !c.isSick && !activeIds.has(c.id) && !busyCitizenIds.has(c.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
    const candidates = eligible.slice(eligible.length - needed) // tail = peddler slots
    if (!candidates.length) continue
    const ids = candidates.map(c => c.id)
    peddlerAssignments.set(market.id, ids)
    for (const id of ids) activeIds.add(id) // block regular toWork walker
  }

  // ── Workplace commute ─────────────────────────────────────────────────────
  for (const c of citizens) {
    if (!c.workplaceId || !c.isAtHome || c.isSick || activeIds.has(c.id)) continue
    const house = houseMap.get(c.houseId); const wp = buildingMap.get(c.workplaceId)
    if (!house || !wp) continue
    const route = bestPath(s.roads, house, wp); if (!route || route.length < 2) continue
    const motion: CitizenMotion = { route, routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toWork' }
    citizens = citizens.map(x => x.id === c.id ? { ...x, motion, isAtHome: false } : x)
    activeIds.add(c.id)
  }

  // ── Farm commute ──────────────────────────────────────────────────────────
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
    const motion: CitizenMotion = {
      route: [{ x: house.x, y: house.y }, ...roadSeg, { x: zone.x, y: zone.y }],
      routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toWork',
    }
    citizens = citizens.map(x => x.id === c.id ? { ...x, motion, isAtHome: false } : x)
    activeIds.add(c.id)
  }

  // ── Shopping trips ────────────────────────────────────────────────────────
  const mktAggInv = getAggregateCrops(marketsList)
  if (marketsList.length > 0 && inventoryTotal(mktAggInv) > 0) {
    const isShopDay     = isNewDay && dayCount % SHOP_INTERVAL_DAYS === 0
    const smithTotal    = getAggregateBldgUnit(ctx.smithBldgs, 'ironTools')
    for (const c of citizens) {
      if (!c.isAtHome || c.isSick || activeIds.has(c.id)) continue
      const house = houseMap.get(c.houseId); if (!house) continue
      const rd       = getResidentData(buildings, c.houseId)
      const savings  = rd.savings
      const hcTotal  = inventoryTotal(rd.crops ?? createEmptyInventory())
      const mustGo      = hcTotal < 10 && savings > 0
      const wantMore    = hcTotal < 22 && savings > 8
      const randomWander= hcTotal < 25 && savings > 3 && Math.random() < 0.08
      const needsTool   = Boolean(c.farmZoneId) && (rd.tools ?? 0) < TOOL_DURABILITY_LOW && smithTotal > 0 && savings >= FARM_TOOL_PRICE && Math.random() < 0.18
      const trigger     = isShopDay ? hcTotal < 20 : (mustGo || wantMore || randomWander || needsTool)
      if (!trigger || (savings <= 0 && hcTotal >= 5)) continue
      const market = marketsList.reduce((best, m) =>
        (m.x - house.x) ** 2 + (m.y - house.y) ** 2 < (best.x - house.x) ** 2 + (best.y - house.y) ** 2 ? m : best)
      const motion: CitizenMotion = {
        route: [{ x: house.x, y: house.y }, { x: market.x, y: market.y }],
        routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toShop', targetId: market.id,
      }
      citizens = citizens.map(x => x.id === c.id ? { ...x, motion, isAtHome: false } : x)
      activeIds.add(c.id)
    }
  }

  // ── Market restock buyers (as Building.agents on market buildings) ─────────
  for (const market of marketsList) {
    const mBldg = buildings.find(b => b.id === market.id)
    if (mBldg?.agents.some(a => a.kind === 'marketbuyer')) continue
    const granaryInv = getAggregateCrops(granaries)
    if (!granaries.length || inventoryTotal(granaryInv) < 2) continue
    const g = granaries.reduce((b, gr) =>
      (gr.x - market.x) ** 2 + (gr.y - market.y) ** 2 < (b.x - market.x) ** 2 + (b.y - market.y) ** 2 ? gr : b)
    // Build a road-aligned route: market road tile → granary road tile → back.
    // bestPath returns the road segment between both buildings' adjacent road tiles.
    const roadSeg = bestPath(s.roads, market, g)
    // Fall back to straight-line tile route if no road connection exists yet.
    const route = roadSeg && roadSeg.length >= 2
      ? [...roadSeg, ...[...roadSeg].reverse().slice(1)]
      : [{ x: market.x, y: market.y }, { x: g.x, y: g.y }, { x: market.x, y: market.y }]
    const agent: BuildingAgent = {
      id: `mb-${nextTick}-${market.id.slice(-4)}`,
      kind: 'marketbuyer',
      route,
      routeIndex: 0, routeT: 0, speed: MARKET_BUYER_SPEED, pickedUp: false,
      cargoType: 'rice', cargoAmount: 0,
      srcGranaryId: g.id,
    }
    buildings = buildings.map(b => b.id === market.id ? { ...b, agents: [...b.agents, agent] } : b)
  }

  // ── Spawn peddlers from real market workers ────────────────────────────────
  for (const [marketId, citizenIds] of peddlerAssignments) {
    const market = buildingMap.get(marketId); if (!market) continue
    const startRoads = roadsAdjacentToBuilding(s.roads, market)
    if (!startRoads.length) continue
    for (let i = 0; i < citizenIds.length; i++) {
      const citizenId = citizenIds[i]
      // Read current market inventory (may have been reduced by earlier peddlers in this loop)
      const mBldgNow = buildings.find(b => b.id === marketId)
      const mktCrops = { ...(mBldgNow?.inventory?.crops ?? createEmptyInventory()) }
      const foodInMkt = inventoryTotal(mktCrops)
      const cargo = createEmptyPeddlerCargo()
      if (foodInMkt > 0.1) {
        const take = Math.min(PEDDLER_CARRY_FOOD, foodInMkt / Math.max(1, citizenIds.length - i))
        transferInventory(mktCrops, cargo.crops, take)
        // Save updated market inventory back to buildings
        buildings = buildings.map(b =>
          b.id === marketId && b.inventory
            ? { ...b, inventory: { ...b.inventory, crops: mktCrops } }
            : b,
        )
      }
      // Tools
      if (ctx.smithBldgs[0]) {
        const smithBldgNow = buildings.find(b => b.id === ctx.smithBldgs[0].id)
        const smithAvail = smithBldgNow?.inventory?.ironTools ?? 0
        if (smithAvail > 0) {
          const carry = Math.min(PEDDLER_CARRY_TOOLS, smithAvail)
          cargo.ironTools = carry
          buildings = addBldgUnit(buildings, ctx.smithBldgs[0].id, 'ironTools', -carry)
        }
      }
      const cargoFood = inventoryTotal(cargo.crops)
      const newPeddlerState: PeddlerState = {
        marketId, cargo, phase: 'outbound', stepsLeft: PEDDLER_MAX_STEPS,
        fromTile: { x: market.x, y: market.y },
        toTile:   { ...startRoads[i % startRoads.length] },
        segT: 0, speed: PEDDLER_SPEED, prevTile: null, returnRoute: [], returnIdx: 0,
        statsCargoAtStart: cargoFood,
        statsHousesServed: 0,
        statsFoodSold:     0,
        statsRevenue:      0,
        statsToolsSold:    0,
        statsDayCount:     dayCount,
      }
      citizens = citizens.map(c => c.id === citizenId ? { ...c, peddlerState: newPeddlerState, isAtHome: false } : c)
    }
  }

  ctx.citizens  = citizens
  ctx.buildings = buildings
  return ctx
}
