/** Disease: citizens who have been sick too long die; nearby households may catch it. */
import type { TickRoutine } from './types'
import { SICK_DEATH_TICKS, DEAD_SPREAD_THRESHOLD, DEAD_SPREAD_RADIUS, DEAD_SPREAD_CHANCE, PROFESSION_BY_BUILDING, updateResidentData, getResidentData } from '../helpers'
export const diseaseRoutine: TickRoutine = (ctx) => {
  const { houseMap, houses } = ctx
  let citizens  = ctx.citizens
  let buildings = ctx.buildings
  // remove citizens who exceeded the max sick duration; increment dead count on their house
  const dying = citizens.filter(c => c.sickTicks >= SICK_DEATH_TICKS)
  if (dying.length > 0) {
    citizens = citizens.filter(c => c.sickTicks < SICK_DEATH_TICKS)
    for (const dead of dying) {
      const cur = getResidentData(buildings, dead.houseId).dead
      buildings = updateResidentData(buildings, dead.houseId, { dead: cur + 1 })
    }
  }
  // houses with too many recent deaths spread disease to nearby households
  for (const h of houses) {
    if (getResidentData(buildings, h.id).dead < DEAD_SPREAD_THRESHOLD) continue
    citizens = citizens.map(c => {
      if (c.isSick) return c
      const nh = houseMap.get(c.houseId); if (!nh || nh.id === h.id) return c
      if (Math.abs(nh.x - h.x) > DEAD_SPREAD_RADIUS || Math.abs(nh.y - h.y) > DEAD_SPREAD_RADIUS) return c
      return Math.random() < DEAD_SPREAD_CHANCE ? { ...c, isSick: true } : c
    })
  }
  // ── 每日：把集市/茶坊中生病的坐贾/行商踢出，补入健康的闲散居民 ──────────────
  if (ctx.isNewDay) {
    const COMMERCIAL_TYPES = new Set(['market', 'teahouse'])
    const commercialBldgs = ctx.s.buildings.filter(b => COMMERCIAL_TYPES.has(b.type as string))
    for (const bldg of commercialBldgs) {
      const sickWorkers = citizens.filter(c => c.workplaceId === bldg.id && c.isSick)
      if (!sickWorkers.length) continue
      const sickIds = new Set(sickWorkers.map(sw => sw.id))
      citizens = citizens.map(c => sickIds.has(c.id) ? { ...c, workplaceId: null, profession: null } : c)
      const activeCount = citizens.filter(c => c.workplaceId === bldg.id).length
      const needed = Math.max(0, bldg.workerSlots - activeCount)
      if (needed <= 0) continue
      const profession = PROFESSION_BY_BUILDING[bldg.type as keyof typeof PROFESSION_BY_BUILDING] ?? null
      const candidates = citizens.filter(c => !c.workplaceId && !c.farmZoneId && !c.isSick && c.isAtHome)
      const toHire = candidates.slice(0, needed)
      if (!toHire.length) continue
      const hireIds = new Set(toHire.map(c => c.id))
      citizens = citizens.map(c => hireIds.has(c.id) ? { ...c, workplaceId: bldg.id, profession } : c)
    }
  }
  ctx.citizens  = citizens
  ctx.buildings = buildings
  return ctx
}
