/** Disease: citizens who have been sick too long die; nearby households may catch it. */
import type { TickRoutine } from './types'
import { SICK_DEATH_TICKS, DEAD_SPREAD_THRESHOLD, DEAD_SPREAD_RADIUS, DEAD_SPREAD_CHANCE } from '../helpers'
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
  ctx.citizens  = citizens
  ctx.houseDead = houseDead
  return ctx
}
