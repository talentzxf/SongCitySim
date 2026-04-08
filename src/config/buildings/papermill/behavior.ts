/**
 * 造纸坊 — behavior
 * onDayStart: 工人消耗木材，维持书院所需纸张供应
 * 若无木材则停工
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { PAPERMILL_CONSUME_PER_DAY } from '../../../state/helpers'

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return
    const timber  = ctx.pool.get('lumber.timber')
    const consume = Math.min(workers.length * PAPERMILL_CONSUME_PER_DAY, timber)
    if (consume > 0) ctx.pool.mutate('lumber.timber', -consume)
  },
}

