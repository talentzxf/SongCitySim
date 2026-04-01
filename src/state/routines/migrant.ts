/** Advance migrants along their route; settle arrivals into vacant houses; spawn new migrants. */
import type { TickRoutine } from './types'
import { MIGRANT_TILES_PER_SECOND, SIM_TICK_MS } from '../../config/simulation'
import {
  BUILDING_DEFS, PROFESSION_BY_BUILDING,
  adjacentHasRoad, roadsAdjacent, findRoadPath, seededNeeds, createCitizenProfile,
  ENTRY_TILE, bfsHighwayPath,
} from '../helpers'
export const migrantRoutine: TickRoutine = (ctx) => {
  const { s, nextTick, houseMap, houses } = ctx
  let citizens = ctx.citizens
  let migrants = ctx.migrants.map(m => ({ ...m, route: m.route.map(p => ({ ...p })) }))
  // advance every migrant along its route
  const arrived: typeof migrants = []
  migrants = migrants.filter(m => {
    let rem = m.speed * (SIM_TICK_MS / 1000)
    while (rem > 0 && m.routeIndex < m.route.length - 1) {
      const seg = 1 - m.routeT
      if (rem < seg) { m.routeT += rem; rem = 0 }
      else { rem -= seg; m.routeIndex += 1; m.routeT = 0 }
    }
    if (m.routeIndex >= m.route.length - 1) { arrived.push(m); return false }
    return true
  })
  // settle arrived migrants into their target house
  for (const m of arrived) {
    const house = houseMap.get(m.targetHouseId); if (!house) continue
    const occ = citizens.filter(c => c.houseId === house.id).length
    if (occ >= house.capacity) continue
    const seed    = Date.now() + Math.random() * 10000
    const needs   = seededNeeds(seed)
    const sat     = Math.round((needs.food * 0.45 + needs.safety * 0.35 + needs.culture * 0.2) * 100)
    const profile = createCitizenProfile(seed)
    const occupiedSlots = new Map<string, number>()
    for (const c of citizens) if (c.workplaceId) occupiedSlots.set(c.workplaceId, (occupiedSlots.get(c.workplaceId) ?? 0) + 1)
    const wps = s.buildings.filter(b =>
      BUILDING_DEFS[b.type].workerSlots > 0 &&
      (occupiedSlots.get(b.id) ?? 0) < BUILDING_DEFS[b.type].workerSlots &&
      adjacentHasRoad(s.roads, b.x, b.y))
    const wp = wps[Math.floor(Math.random() * wps.length)] ?? null
    citizens = [...citizens, {
      id: `c-${Math.floor(seed)}`, houseId: house.id,
      name: profile.name, age: profile.age, gender: profile.gender,
      workplaceId: wp?.id ?? null, farmZoneId: null,
      profession: wp ? PROFESSION_BY_BUILDING[wp.type] ?? null : null,
      needs, needUnmetTicks: {}, satisfaction: sat,
      isAtHome: true, isSick: false, sickTicks: 0,
      status: 'idle', statusTicks: 0,
    }]
  }
  // spawn a new migrant toward a vacant, road-accessible house
  const targetIds = new Set(migrants.map(m => m.targetHouseId))
  const vacant    = houses.filter(h => {
    const occ = citizens.filter(c => c.houseId === h.id).length +
                migrants.filter(m => m.targetHouseId === h.id).length
    return occ < h.capacity && adjacentHasRoad(s.roads, h.x, h.y)
  })
  const spawnH = vacant.find(h => !targetIds.has(h.id))
  if (spawnH && s.roads.some(r => r.x === ENTRY_TILE.x && r.y === ENTRY_TILE.y)) {
    const candidates = roadsAdjacent(s.roads, spawnH.x, spawnH.y)
      .map(tr => findRoadPath(s.roads, ENTRY_TILE, tr))
      .filter((p): p is { x: number; y: number }[] => Boolean(p))
      .sort((a, b) => a.length - b.length)
    if (candidates.length > 0) {
      migrants = [...migrants, {
        id: `m-${nextTick}-${Math.floor(Math.random() * 10000)}`,
        targetHouseId: spawnH.id, route: candidates[0],
        routeIndex: 0, routeT: 0, speed: MIGRANT_TILES_PER_SECOND,
      }]
    } else {
      // fallback: use the highway BFS path
      const fallback = roadsAdjacent(s.roads, spawnH.x, spawnH.y)
        .map(tr => bfsHighwayPath(ENTRY_TILE, tr))
        .filter((p): p is { x: number; y: number }[] => Boolean(p))
        .sort((a, b) => a.length - b.length)
      if (fallback.length > 0)
        migrants = [...migrants, {
          id: `m-${nextTick}-${Math.floor(Math.random() * 10000)}`,
          targetHouseId: spawnH.id, route: fallback[0],
          routeIndex: 0, routeT: 0, speed: MIGRANT_TILES_PER_SECOND,
        }]
    }
  }
  ctx.citizens = citizens
  ctx.migrants = migrants
  return ctx
}
