/**
 * 盗贼系统
 * - 无业游民（无工位、无农田）满意度过低时有概率沦为盗贼
 * - 盗贼影响周边民居的治安
 * - 系狱者每天累计服刑，到期后获释
 * - 仅对无工作、无农田的市民生效
 */
import type { TickRoutine } from './types'
import { DAY_TICKS } from '../../config/simulation'

const THIEF_CHANCE_PER_DAY = 0.025   // 满足条件的闲人每天变盗贼概率
const THIEF_SAT_THRESHOLD  = 28      // 满意度低于此值时才会变盗贼
const THIEF_IDLE_DAYS      = 20      // 连续无业超过此天数才考虑
const JAIL_DAYS            = 30      // 系狱天数（改造期）
const THIEF_SAFETY_DRAIN   = 0.06    // 每 tick 盗贼对周边民居治安的消耗（衰减已由 patrol 处理，这里是额外惩罚）
const THIEF_RADIUS         = 4       // 盗贼影响半径

export const thiefRoutine: TickRoutine = (ctx) => {
  const { isNewDay } = ctx
  let citizens    = ctx.citizens
  let houseSafety = ctx.houseSafety
  const houses    = ctx.s.buildings.filter(b => b.type === 'house' || (b.type as string) === 'manor')

  // ── 1. 盗贼降低附近民居治安 ─────────────────────────────────────────────
  for (const c of citizens) {
    if (c.status !== 'thief') continue
    const thiefHouse = houses.find(h => h.id === c.houseId)
    if (!thiefHouse) continue
    for (const h of houses) {
      const dist = Math.max(Math.abs(h.x - thiefHouse.x), Math.abs(h.y - thiefHouse.y))
      if (dist <= THIEF_RADIUS) {
        const cur = houseSafety[h.id] ?? 0
        houseSafety = { ...houseSafety, [h.id]: Math.max(0, cur - THIEF_SAFETY_DRAIN * 0.01) }
      }
    }
  }

  if (!isNewDay) {
    ctx.citizens    = citizens
    ctx.houseSafety = houseSafety
    return ctx
  }

  // ── 2. 每日：系狱者服刑计时，到期释放 ──────────────────────────────────
  citizens = citizens.map(c => {
    if (c.status !== 'jailed') return c
    const jailTicks = (c.jailTicks ?? 0) + 1
    if (jailTicks >= JAIL_DAYS) {
      // 刑满释放，重归闲居
      return { ...c, status: 'idle' as const, jailTicks: 0, jailPrisonId: undefined, satisfaction: Math.max(20, c.satisfaction) }
    }
    return { ...c, jailTicks }
  })

  // ── 3. 每日：无业低满意度市民有概率沦为盗贼 ─────────────────────────────
  citizens = citizens.map(c => {
    if (c.status === 'thief' || c.status === 'jailed' || c.status === 'sick') return c
    if (c.workplaceId || c.farmZoneId) return c  // 有工作的不会变盗贼
    if (c.satisfaction >= THIEF_SAT_THRESHOLD) return c
    // 连续无业 statusTicks 超过阈值才考虑
    const idleDays = (c.statusTicks ?? 0) / DAY_TICKS
    if (idleDays < THIEF_IDLE_DAYS) return c
    if (Math.random() < THIEF_CHANCE_PER_DAY) {
      return { ...c, status: 'thief' as const, statusTicks: 0 }
    }
    return c
  })

  ctx.citizens    = citizens
  ctx.houseSafety = houseSafety
  return ctx
}

