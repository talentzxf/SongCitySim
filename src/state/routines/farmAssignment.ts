/** Assign idle workers to unfarmed farm zones that have road access. */
import type { TickRoutine } from './types'
import { adjacentHasRoad } from '../helpers'
export const farmAssignmentRoutine: TickRoutine = (ctx) => {
  const { s } = ctx
  const assigned = new Set<string>()
  let citizens = ctx.citizens.map(c => {
    if (c.workplaceId) return c.farmZoneId ? { ...c, farmZoneId: null } : c
    if (c.farmZoneId) {
      const zone = ctx.farmZones.find(z => z.id === c.farmZoneId)
      if (!zone) return { ...c, farmZoneId: null, profession: null }
      assigned.add(c.farmZoneId)
      return { ...c, profession: 'farmer' as const }
    }
    return c
  })
  // zones that have road access but no assigned farmer yet
  const vacantZones = ctx.farmZones.filter(z => {
    if (assigned.has(z.id)) return false
    for (let dx = 0; dx <= 1; dx++)
      for (let dy = 0; dy <= 1; dy++)
        if (adjacentHasRoad(s.roads, z.x + dx, z.y + dy)) return true
    return false
  })
  const idleWorkers = citizens.filter(c => !c.workplaceId && !c.farmZoneId)
  for (let i = 0; i < Math.min(vacantZones.length, idleWorkers.length); i++) {
    const idx = citizens.findIndex(c => c.id === idleWorkers[i].id)
    if (idx >= 0)
      citizens[idx] = { ...citizens[idx], farmZoneId: vacantZones[i].id, profession: 'farmer' as const }
  }
  ctx.citizens = citizens
  return ctx
}
