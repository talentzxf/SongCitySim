/**
 * 造纸坊 — behavior
 * onDayStart: 工人消耗木材，维持书院所需纸张供应
 * 若无木材则停工
 */
import type { BuildingLifecycle } from '../_lifecycle'

const PAPERMILL_CONSUME_PER_DAY = 1  // 造纸坊每日消耗木材量

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return
    const timber  = ctx.cityUnit('lumbercamp', 'timber')
    const consume = Math.min(workers.length * PAPERMILL_CONSUME_PER_DAY, timber)
    if (consume > 0) ctx.consumeUnit('lumbercamp', 'timber', consume)
  },
}

