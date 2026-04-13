/**
 * 巡检司（Watchpost）巡逻系统
 * - 每天从巡检司派出巡逻兵沿道路随机游走
 * - 经过附近的民居时，提升该院落的治安覆盖度
 * - 发现盗贼时，若附近有囹圄（大牢），则将其收押
 * - 各院落治安覆盖度每 tick 自然衰减
 */
import type { TickRoutine } from './types'
import { SIM_TICK_MS } from '../../config/simulation'
import { isRoadAt } from '../helpers'

const PATROL_SPEED         = 3.5   // tiles/s
const PATROL_STEPS         = 24    // 每次巡逻走的步数
const PATROL_BOOST         = 0.10  // 每步对周边民居的治安加成
const PATROL_RADIUS        = 3     // 巡逻影响半径（格）
const SAFETY_DECAY         = 0.9994 // 每 tick 衰减系数（约 5 min 半衰期）
const ARREST_RADIUS        = 3     // 逮捕半径

export const patrolRoutine: TickRoutine = (ctx) => {
  const { s, nextTick, crossedMorning, isNewDay } = ctx
  let walkers    = ctx.walkers
  let citizens   = ctx.citizens
  let houseSafety = ctx.houseSafety

  // ── 1. 衰减所有民居的治安覆盖度 ────────────────────────────────────────
  const decayedSafety: Record<string, number> = {}
  for (const [k, v] of Object.entries(houseSafety)) {
    const decayed = v * SAFETY_DECAY
    decayedSafety[k] = decayed < 0.001 ? 0 : decayed
  }
  houseSafety = decayedSafety

  // ── 2. 每日早晨，巡检司派出巡逻兵 ─────────────────────────────────────
  if (crossedMorning && isNewDay) {
    const watchposts = s.buildings.filter(b => (b.type as string) === 'watchpost')
    for (const wp of watchposts) {
      // 从巡检司附近找一条路出发
      const startRoads = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx, dy]) => ({ x: wp.x + dx, y: wp.y + dy }))
        .filter(t => isRoadAt(s.roads, t.x, t.y))
      if (!startRoads.length) continue

      // 每两名工人派一个巡逻兵
      const workers = citizens.filter(c => c.workplaceId === wp.id && c.isAtHome && !c.isSick && c.status !== 'thief' && c.status !== 'jailed')
      const patrolCount = Math.max(1, Math.floor(workers.length / 2))

      for (let i = 0; i < patrolCount; i++) {
        const start = startRoads[i % startRoads.length]
        const next  = startRoads[(i + 1) % startRoads.length]
        walkers = [...walkers, {
          id: `patrol-${nextTick}-${wp.id}-${i}`,
          citizenId: `patrol-npc-${wp.id}-${i}`,  // synthetic, no real citizen
          route: [start, next.x !== start.x || next.y !== start.y ? next : { x: start.x + 1, y: start.y }],
          routeIndex: 0, routeT: 0, speed: PATROL_SPEED,
          purpose: 'patrol' as const,
          stepsLeft: PATROL_STEPS,
        }]
      }
    }
  }

  // ── 3. 巡逻兵走每一步时：提升治安，发现盗贼则逮捕 ──────────────────────
  // (这在 walkerRoutine 中处理；此处仅处理治安提升）
  // 找出当前所有巡逻兵的位置，对附近民居加成
  const houses = s.buildings.filter(b => b.type === 'house' || (b.type as string) === 'manor')
  for (const w of walkers) {
    if (w.purpose !== 'patrol') continue
    const pos = w.route[w.routeIndex] ?? w.route[0]
    for (const h of houses) {
      const dist = Math.max(Math.abs(h.x - pos.x), Math.abs(h.y - pos.y))
      if (dist <= PATROL_RADIUS) {
        const cur = houseSafety[h.id] ?? 0
        houseSafety = { ...houseSafety, [h.id]: Math.min(1.0, cur + PATROL_BOOST * (1 - dist / (PATROL_RADIUS + 1))) }
      }
    }
  }

  // ── 4. 盗贼逮捕 ─────────────────────────────────────────────────────────
  const prisons = s.buildings.filter(b => (b.type as string) === 'prison')
  if (prisons.length > 0) {
    const thieves = citizens.filter(c => c.status === 'thief')
    for (const thief of thieves) {
      const thiefHouse = s.buildings.find(b => b.id === thief.houseId)
      if (!thiefHouse) continue
      // 判断是否有巡逻兵在附近
      const nearPatrol = walkers.some(w => {
        if (w.purpose !== 'patrol') return false
        const pos = w.route[w.routeIndex] ?? w.route[0]
        return Math.max(Math.abs(thiefHouse.x - pos.x), Math.abs(thiefHouse.y - pos.y)) <= ARREST_RADIUS
      })
      if (!nearPatrol) continue
      // 选最近的囹圄
      const prison = prisons.reduce((best, p) => {
        const db = Math.hypot(best.x - thiefHouse.x, best.y - thiefHouse.y)
        const dp = Math.hypot(p.x - thiefHouse.x, p.y - thiefHouse.y)
        return dp < db ? p : best
      })
      citizens = citizens.map(c =>
        c.id === thief.id
          ? { ...c, status: 'jailed' as const, jailTicks: 0, jailPrisonId: prison.id, isAtHome: true }
          : c
      )
    }
  }

  ctx.walkers     = walkers
  ctx.citizens    = citizens
  ctx.houseSafety = houseSafety
  return ctx
}

