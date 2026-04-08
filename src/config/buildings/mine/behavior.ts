/**
 * 铁矿坑（Mine）— behavior
 * onDayStart: 矿工产出矿石，同时消耗本格矿脉储量。
 * 矿脉枯竭后停止产出，矿石图标消失。
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { MINE_CAPACITY_PER, ORE_PER_MINER_DAY } from '../../../state/helpers'

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return

    // 检查本格矿脉储量
    const tileKey = `${ctx.building.x},${ctx.building.y}`
    const health  = ctx.pool.get(`ore.health.${tileKey}`)
    if (health <= 0) return   // 矿脉已枯竭

    const totalMines = ctx.cityBuildings.filter(b => b.type === 'mine').length
    const totalCap   = totalMines * MINE_CAPACITY_PER
    const current    = ctx.pool.get('mine.ore')
    const headroom   = Math.max(0, totalCap - current)
    const produced   = Math.min(workers.length * ORE_PER_MINER_DAY, headroom, health)

    if (produced > 0) {
      ctx.pool.mutate('mine.ore',               produced)
      ctx.pool.mutate(`ore.health.${tileKey}`, -produced)
    }
  },
}
