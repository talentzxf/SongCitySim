/**
 * 巡检司（Watchpost）巡逻系统
 * - 每天从巡检司派出巡逻兵沿道路随机游走
 * - 经过附近的民居时，提升该院落的治安覆盖度
 * - 各院落治安覆盖度每 tick 自然衰减
 */
import type { TickRoutine } from './types'
import { isRoadAt } from '../helpers'

const PATROL_SPEED    = 3.5   // tiles/s
const PATROL_STEPS    = 24    // 每次巡逻走的步数
const PATROL_BOOST    = 0.10  // 每步对周边民居的治安加成
const PATROL_RADIUS   = 3     // 巡逻影响半径（格）
const SAFETY_DECAY    = 0.9994 // 每 tick 衰减系数（约 5 min 半衰期）

export const patrolRoutine: TickRoutine = (ctx) => {
  const { s, nextTick, crossedMorning, isNewDay } = ctx
  let walkers     = ctx.walkers
  const citizens  = ctx.citizens

  // ── 1. 衰减所有民居的治安覆盖度 ────────────────────────────────────────
  const decayedSafety: Record<string, number> = {}
  for (const [k, v] of Object.entries(ctx.houseSafety)) {
    const d = v * SAFETY_DECAY
    if (d >= 0.001) decayedSafety[k] = d
  }
  let houseSafety = decayedSafety

  // ── 2. 每日早晨，巡检司派出巡逻兵 ─────────────────────────────────────
  if (crossedMorning && isNewDay) {
    const watchposts = s.buildings.filter(b => (b.type as string) === 'watchpost')
    for (const wp of watchposts) {
      const startRoads = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx, dy]) => ({ x: wp.x + dx, y: wp.y + dy }))
        .filter(t => isRoadAt(s.roads, t.x, t.y))
      if (!startRoads.length) continue

      const workers = citizens.filter(c =>
        c.workplaceId === wp.id && c.isAtHome && !c.isSick)
      const patrolCount = Math.max(1, Math.floor(workers.length / 2))

      for (let i = 0; i < patrolCount; i++) {
        const start = startRoads[i % startRoads.length]
        const next  = startRoads[(i + 1) % startRoads.length] ?? start
        walkers = [...walkers, {
          id: `patrol-${nextTick}-${wp.id}-${i}`,
          citizenId: `patrol-npc-${wp.id}-${i}`,
          route: [start, (next.x !== start.x || next.y !== start.y) ? next : { x: start.x + 1, y: start.y }],
          routeIndex: 0, routeT: 0, speed: PATROL_SPEED,
          purpose: 'patrol' as const,
          stepsLeft: PATROL_STEPS,
        }]
      }
    }
  }

  // ── 3. 巡逻兵当前位置对附近民居加成治安 ────────────────────────────────
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

  ctx.walkers     = walkers
  ctx.houseSafety = houseSafety
  return ctx
}
