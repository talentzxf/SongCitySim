/** Assign idle workers to farm zones and buildings that have road access. */
import type { TickRoutine } from './types'
import { adjacentHasRoad, BUILDING_DEFS, PROFESSION_BY_BUILDING } from '../helpers'
export const farmAssignmentRoutine: TickRoutine = (ctx) => {
  const { s } = ctx
  const assigned = new Set<string>()
  let citizens = ctx.citizens.map(c => {
    if (c.workplaceId) {
      // clear farmZoneId if citizen has a building job
      if (c.farmZoneId) return { ...c, farmZoneId: null }
      // clear workplaceId if the building no longer exists
      if (!s.buildings.some(b => b.id === c.workplaceId))
        return { ...c, workplaceId: null, profession: null }
      return c
    }
    if (c.farmZoneId) {
      const zone = ctx.farmZones.find(z => z.id === c.farmZoneId)
      if (!zone) return { ...c, farmZoneId: null, profession: null }
      assigned.add(c.farmZoneId)
      return { ...c, profession: 'farmer' as const }
    }
    return c
  })

  // ── 1. Fill vacant farm zones ─────────────────────────────────────────────
  const vacantZones = ctx.farmZones.filter(z => {
    if (assigned.has(z.id)) return false
    for (let dx = 0; dx <= 1; dx++)
      for (let dy = 0; dy <= 1; dy++)
        if (adjacentHasRoad(s.roads, z.x + dx, z.y + dy)) return true
    return false
  })
  let idleWorkers = citizens.filter(c => !c.workplaceId && !c.farmZoneId)
  for (let i = 0; i < Math.min(vacantZones.length, idleWorkers.length); i++) {
    const idx = citizens.findIndex(c => c.id === idleWorkers[i].id)
    if (idx >= 0)
      citizens[idx] = { ...citizens[idx], farmZoneId: vacantZones[i].id, profession: 'farmer' as const }
  }

  // ── 2. Fill vacant worker slots in buildings (market, blacksmith, mine…) ──
  const vacantBuildings: typeof s.buildings = []
  for (const b of s.buildings) {
    const def = BUILDING_DEFS[b.type]
    if (!def || def.workerSlots <= 0) continue
    if (!adjacentHasRoad(s.roads, b.x, b.y)) continue
    const filled = citizens.filter(c => c.workplaceId === b.id).length
    const slots  = def.workerSlots - filled
    for (let n = 0; n < slots; n++) vacantBuildings.push(b)
  }
  // re-query idle workers after farm assignment
  idleWorkers = citizens.filter(c => !c.workplaceId && !c.farmZoneId)
  for (let i = 0; i < Math.min(vacantBuildings.length, idleWorkers.length); i++) {
    const b   = vacantBuildings[i]
    const idx = citizens.findIndex(c => c.id === idleWorkers[i].id)
    if (idx >= 0)
      citizens[idx] = {
        ...citizens[idx],
        workplaceId: b.id,
        profession:  PROFESSION_BY_BUILDING[b.type] ?? null,
      }
  }

  ctx.citizens = citizens
  return ctx
}
