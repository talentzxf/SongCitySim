/** Disease: citizens who have been sick too long die; nearby households may catch it. */
import type { TickRoutine } from './types'
import { SICK_DEATH_TICKS, DEAD_SPREAD_THRESHOLD, DEAD_SPREAD_RADIUS, DEAD_SPREAD_CHANCE, PROFESSION_BY_BUILDING } from '../helpers'
export const diseaseRoutine: TickRoutine = (ctx) => {
  const { houseMap, houses } = ctx
  let citizens  = ctx.citizens
  let houseDead = ctx.houseDead
  // remove citizens who exceeded the max sick duration
  const dying = citizens.filter(c => c.sickTicks >= SICK_DEATH_TICKS)
  if (dying.length > 0) {
    citizens  = citizens.filter(c => c.sickTicks < SICK_DEATH_TICKS)
    houseDead = { ...houseDead }
    for (const dead of dying)
      houseDead[dead.houseId] = (houseDead[dead.houseId] ?? 0) + 1
  }
  // houses with too many recent deaths spread disease to nearby households
  for (const h of houses) {
    if ((houseDead[h.id] ?? 0) < DEAD_SPREAD_THRESHOLD) continue
    citizens = citizens.map(c => {
      if (c.isSick) return c
      const nh = houseMap.get(c.houseId); if (!nh || nh.id === h.id) return c
      if (Math.abs(nh.x - h.x) > DEAD_SPREAD_RADIUS || Math.abs(nh.y - h.y) > DEAD_SPREAD_RADIUS) return c
      return Math.random() < DEAD_SPREAD_CHANCE ? { ...c, isSick: true } : c
    })
  }

  // ── 每日：把集市/茶坊中生病的坐贾/行商踢出，补入健康的闲散居民 ──────────────
  if (ctx.isNewDay) {
    // 对商业类建筑（集市、茶坊）做员工替换
    const COMMERCIAL_TYPES = new Set(['market', 'teahouse'])
    const commercialBldgs = ctx.s.buildings.filter(b => COMMERCIAL_TYPES.has(b.type as string))
    for (const bldg of commercialBldgs) {
      // 找到在此建筑中生病的员工
      const sickWorkers = citizens.filter(c => c.workplaceId === bldg.id && c.isSick)
      if (!sickWorkers.length) continue
      // 将生病员工解雇（workplaceId 清空）
      const sickIds = new Set(sickWorkers.map(sw => sw.id))
      citizens = citizens.map(c => sickIds.has(c.id) ? { ...c, workplaceId: null, profession: null } : c)
      // 计算空缺名额
      const activeCount = citizens.filter(c => c.workplaceId === bldg.id).length
      const needed = Math.max(0, bldg.workerSlots - activeCount)
      if (needed <= 0) continue
      // 找健康的、空闲的、在家的、无工作的居民来顶替
      const profession = PROFESSION_BY_BUILDING[bldg.type as keyof typeof PROFESSION_BY_BUILDING] ?? null
      const candidates = citizens.filter(c => !c.workplaceId && !c.farmZoneId && !c.isSick && c.isAtHome)
      const toHire = candidates.slice(0, needed)
      if (!toHire.length) continue
      const hireIds = new Set(toHire.map(c => c.id))
      citizens = citizens.map(c => hireIds.has(c.id) ? { ...c, workplaceId: bldg.id, profession } : c)
    }
  }

  ctx.citizens  = citizens
  ctx.houseDead = houseDead
  return ctx
}
