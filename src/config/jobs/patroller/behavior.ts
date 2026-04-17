/**
 * 弓手（Patroller）职业行为
 * ─────────────────────────────────────────────────────────────────────────────
 * Config / Engine 隔离约束：
 *  - 本文件只从 state/engine/types 导入接口，绝不直接操作 TickContext。
 *  - 所有仿真副作用均通过 JobEngineAPI 回调引擎实现（Strategy / IoC 模式）。
 *  - 不得从 state/routines/*、state/helpers.*、state/types.* 导入任何内容。
 */
import type { JobBehavior } from '../../../state/engine/types'

// ── 职业参数 ────────────────────────────────────────────────────────────────
// 可移入 config.json 的扩展字段；目前作为模块常量，修改无需重建整个 registry。
const PATROL_SPEED  = 3.5    // tiles / s
const PATROL_STEPS  = 24     // 每次巡逻行走的步数上限
const PATROL_BOOST  = 0.10   // 每步对周边民居的治安加成
const PATROL_RADIUS = 3      // 巡逻影响半径（Chebyshev 距离，格）
const SAFETY_DECAY  = 0.9994 // 每 tick 衰减系数（约 5 min 半衰期 @100ms/tick）

export const behavior: JobBehavior = {

  // ── 全局 tick：治安衰减 + 在外巡逻兵的实时覆盖加成 ──────────────────────
  onGlobalTick(engine) {
    // 1. 所有民居治安覆盖度自然衰减
    engine.decayAreaEffect('houseSafety', SAFETY_DECAY)

    // 2. 每个正在巡逻的兵对当前位置周边民居施加加成
    for (const pos of engine.getWalkerPositions('patrol')) {
      engine.boostAreaEffect('houseSafety', pos, PATROL_RADIUS, PATROL_BOOST)
    }
  },

  // ── 每巡检司建筑 tick：清晨新的一天派出巡逻兵 ──────────────────────────
  onWorkplaceTick(engine, workplace) {
    // 仅在清晨跨越时触发（一天一次）
    if (!engine.crossedMorning || !engine.isNewDay) return

    const startRoads = engine.getRoadsAdjacentTo(workplace.x, workplace.y)
    if (!startRoads.length) return

    const available  = workplace.workers.filter(w => w.isAtHome && !w.isSick)
    const patrolCount = Math.max(1, Math.floor(available.length / 2))

    for (let i = 0; i < patrolCount; i++) {
      const start    = startRoads[i % startRoads.length]
      const next     = startRoads[(i + 1) % startRoads.length] ?? start
      // 确保路线至少有两个不同的格，否则走到旁边一格
      const nextTile = (next.x !== start.x || next.y !== start.y)
        ? next
        : { x: start.x + 1, y: start.y }

      engine.spawnWalker({
        id:        `patrol-${engine.nextTick}-${workplace.id}-${i}`,
        citizenId: `patrol-npc-${workplace.id}-${i}`,
        route:     [start, nextTile],
        speed:     PATROL_SPEED,
        purpose:   'patrol',
        stepsLeft: PATROL_STEPS,
      })
    }
  },
}

