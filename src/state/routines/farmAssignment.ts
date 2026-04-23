/** Assign idle workers to farm zones and buildings that have road access. */
import type { TickRoutine } from './types'
import { adjacentHasRoad, buildingHasRoadAccess, BUILDING_DEFS, PROFESSION_BY_BUILDING } from '../helpers'
export const farmAssignmentRoutine: TickRoutine = (ctx) => {
  const { s } = ctx
  const assigned = new Map<string, number>()  // zoneId → worker count
  let citizens = ctx.citizens.map(c => {
    if (c.workplaceId) {
      // clear farmZoneId if citizen has a building job
      if (c.farmZoneId) return { ...c, farmZoneId: null }
      // clear workplaceId if the building no longer exists
      if (!s.buildings.some(b => b.id === c.workplaceId))
        return { ...c, workplaceId: null, profession: null }
      // 修复已在职但职业为空的市民（如采木场、造纸坊工人）
      if (c.profession === null) {
        const bldg = s.buildings.find(b => b.id === c.workplaceId)
        if (bldg) return { ...c, profession: PROFESSION_BY_BUILDING[bldg.type] ?? null }
      }
      return c
    }
    if (c.farmZoneId) {
      const zone = ctx.farmZones.find(z => z.id === c.farmZoneId)
      if (!zone) return { ...c, farmZoneId: null, profession: null }
      assigned.set(c.farmZoneId, (assigned.get(c.farmZoneId) ?? 0) + 1)
      return { ...c, profession: 'farmer' as const }
    }
    return c
  })

  // ── 1. Fill vacant farm zones (up to 3 workers each) ─────────────────────
  const FARM_MAX_WORKERS = 3
  const vacantZones: typeof ctx.farmZones = []
  for (const z of ctx.farmZones) {
    const count = assigned.get(z.id) ?? 0
    if (count >= FARM_MAX_WORKERS) continue
    let hasRoad = false
    for (let dx = 0; dx <= 1 && !hasRoad; dx++)
      for (let dy = 0; dy <= 1 && !hasRoad; dy++)
        if (adjacentHasRoad(s.roads, z.x + dx, z.y + dy)) hasRoad = true
    if (!hasRoad) continue
    // push one slot per missing worker
    for (let n = count; n < FARM_MAX_WORKERS; n++) vacantZones.push(z)
  }
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
    if (!buildingHasRoadAccess(s.roads, b)) continue
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
