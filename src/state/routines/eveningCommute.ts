/** Evening trigger (once per day at EVENING_START): workers and farmers walk home. */
import type { TickRoutine } from './types'
import { WALKER_SPEED } from '../../config/simulation'
import { roadsAdjacent, findRoadPath, bestPath, isRoadAt } from '../helpers'
export const eveningCommuteRoutine: TickRoutine = (ctx) => {
  if (!ctx.crossedEvening) return ctx
  const { s, nextTick, houseMap, buildingMap, farmZones } = ctx
  let walkers    = ctx.walkers
  const citizens = ctx.citizens
  const activeIds = new Set(walkers.map(w => w.citizenId))
  // citizens who are still out as peddlers must NOT get a duplicate toHome walker
  const peddlingIds = new Set(ctx.peddlers.filter(p => p.citizenId).map(p => p.citizenId!))
  // workers return home
  for (const c of citizens) {
    if (!c.workplaceId || c.isAtHome || activeIds.has(c.id) || peddlingIds.has(c.id)) continue
    const house = houseMap.get(c.houseId); const wp = buildingMap.get(c.workplaceId)
    if (!house || !wp) continue
    const route = bestPath(s.roads, wp, house); if (!route || route.length < 2) continue
    walkers = [...walkers, {
      id: `w-${nextTick}-${c.id}-home`, citizenId: c.id,
      route, routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toHome',
    }]
    activeIds.add(c.id)
  }
  // farmers return home
  for (const c of citizens) {
    if (!c.farmZoneId || c.isAtHome || activeIds.has(c.id)) continue
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
        const p = findRoadPath(s.roads, fr, hr)
        if (p && (!roadSeg || p.length < roadSeg.length)) roadSeg = p
      }
    if (!roadSeg) continue
    walkers = [...walkers, {
      id: `w-${nextTick}-${c.id}-home`, citizenId: c.id,
      route: [{ x: zone.x, y: zone.y }, ...roadSeg, { x: house.x, y: house.y }],
      routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'toHome',
    }]
    activeIds.add(c.id)
  }
  ctx.walkers = walkers
  return ctx
}
