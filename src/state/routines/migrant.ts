/** Advance migrants along their route; settle arrivals into vacant houses; spawn new migrants. */
import type { TickRoutine } from './types'
import { MIGRANT_TILES_PER_SECOND, SIM_TICK_MS } from '../../config/simulation'
import {
  BUILDING_DEFS, PROFESSION_BY_BUILDING,
  adjacentHasRoad, buildingHasRoadAccess, roadsAdjacent, findRoadPath, seededNeeds, createCitizenProfile,
  ENTRY_TILE, bfsHighwayPath,
} from '../helpers'

/** Seeded pseudo-random float in [0,1) */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

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
      buildingHasRoadAccess(s.roads, b))
    const wp = wps[Math.floor(Math.random() * wps.length)] ?? null
    // Derive citizen ID from the migrant's own ID (already unique via nextTick counter).
    // Using seed-based IDs caused same-millisecond collisions when multiple migrants arrive
    // in one tick, producing duplicate React keys and corrupted citizen arrays.
    const citizenId = `c-${m.id.slice(2)}`   // "m-12345-67890" → "c-12345-67890"
    const isManor   = (house.type as string) === 'manor'
    const isServant = isManor && wp !== null && wp.id === house.id
    const residentTier: 'common' | 'gentry' | 'servant' = isServant ? 'servant' : isManor ? 'gentry' : 'common'
    citizens = [...citizens, {
      id: citizenId, houseId: house.id,
      name: profile.name, age: profile.age, gender: profile.gender,
      workplaceId: wp?.id ?? null, farmZoneId: null,
      profession: wp ? PROFESSION_BY_BUILDING[wp.type] ?? null : null,
      needs, needUnmetTicks: {}, satisfaction: sat,
      isAtHome: true, isSick: false, sickTicks: 0,
      status: 'idle', statusTicks: 0,
      residentTier,
      motion: null,
      peddlerState: null,
    }]
  }
  // spawn new migrants toward vacant, road-accessible houses
  // Spawn up to MAX_SPAWN_PER_TICK per tick; cap total in-transit at MAX_MIGRANTS_ON_ROAD.
  const MAX_SPAWN_PER_TICK  = 5
  const MAX_MIGRANTS_ON_ROAD = 20
  const hasEntryRoad = s.roads.some(r => r.x === ENTRY_TILE.x && r.y === ENTRY_TILE.y)
  if (hasEntryRoad && migrants.length < MAX_MIGRANTS_ON_ROAD) {
    // vacant = houses where (settled + in-transit) < capacity
    const vacant = houses.filter(h => {
      const occ = citizens.filter(c => c.houseId === h.id).length +
                  migrants.filter(m => m.targetHouseId === h.id).length
      return occ < h.capacity && adjacentHasRoad(s.roads, h.x, h.y)
    })
    const canSpawn = Math.min(MAX_SPAWN_PER_TICK, MAX_MIGRANTS_ON_ROAD - migrants.length, vacant.length)
    for (let i = 0; i < canSpawn; i++) {
      const spawnH = vacant[i]
      const seed   = nextTick * 1000 + i * 100 + Math.floor(Math.random() * 100)
      const r0     = seededRand(seed)
      const speed  = MIGRANT_TILES_PER_SECOND * (0.75 + r0 * 0.55)
      // Each successive migrant starts 2 tiles further along so they visually spread out
      const staggerTiles = seededRand(seed + 1) * 0.5 + i * 2.0
      const candidates = roadsAdjacent(s.roads, spawnH.x, spawnH.y)
        .map(tr => findRoadPath(s.roads, ENTRY_TILE, tr))
        .filter((p): p is { x: number; y: number }[] => Boolean(p))
        .sort((a, b) => a.length - b.length)
      let route: { x: number; y: number }[] | null = candidates[0] ?? null
      if (!route) {
        const fallback = roadsAdjacent(s.roads, spawnH.x, spawnH.y)
          .map(tr => bfsHighwayPath(ENTRY_TILE, tr))
          .filter((p): p is { x: number; y: number }[] => Boolean(p))
          .sort((a, b) => a.length - b.length)
        route = fallback[0] ?? null
      }
      if (!route) continue
      const maxStagger    = Math.max(0, route.length - 2)
      const staggerClamped = Math.min(staggerTiles, maxStagger)
      const routeIndex    = Math.floor(staggerClamped)
      const routeT        = staggerClamped - routeIndex
      migrants = [...migrants, {
        id: `m-${nextTick}-${i}-${Math.floor(Math.random() * 10000)}`,
        targetHouseId: spawnH.id, route,
        routeIndex, routeT: Math.min(0.99, routeT), speed, seed,
      }]
    }
  }
  ctx.citizens = citizens
  ctx.migrants = migrants
  return ctx
}
