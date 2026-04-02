/**
 * Mine (冶铁厂) — behavior
 *
 * onDayStart: healthy miners produce iron ore into the city ore pool.
 * Pool is capped at MINE_CAPACITY_PER * total_mine_count.
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { MINE_CAPACITY_PER, ORE_PER_MINER_DAY } from '../../../state/helpers'

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const activeMiners = ctx.workers  // already excludes sick workers
    if (!activeMiners.length) return

    const totalMines = ctx.cityBuildings.filter(b => b.type === 'mine').length
    const totalCap   = totalMines * MINE_CAPACITY_PER
    const current    = ctx.pool.get('mine.ore')
    const headroom   = Math.max(0, totalCap - current)
    const produced   = Math.min(activeMiners.length * ORE_PER_MINER_DAY, headroom)

    if (produced > 0) ctx.pool.mutate('mine.ore', produced)
  },
}

