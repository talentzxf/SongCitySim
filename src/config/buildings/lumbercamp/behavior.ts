/**
 * 采木场 — behavior
 * onDayStart: 伐木工采伐周边（Chebyshev ≤6 格）林地，耗尽即停工。
 * 林地储量归零时，地图上的树木消失。
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { LUMBER_CAPACITY_PER, TIMBER_PER_LOGGER_DAY } from '../../../state/helpers'
import { FOREST_TILES } from '../../../state/worldgen'

const HARVEST_RADIUS = 6   // Chebyshev 距离

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return

    const { x: bx, y: by } = ctx.building

    // 找出周边有剩余储量的林地格
    const nearby = FOREST_TILES.filter(t => {
      if (Math.max(Math.abs(t.x - bx), Math.abs(t.y - by)) > HARVEST_RADIUS) return false
      return ctx.pool.get(`forest.health.${t.x},${t.y}`) > 0
    })
    if (!nearby.length) return   // 周边林木已耗尽

    const totalCamps = ctx.cityBuildings.filter(b => b.type === 'lumbercamp').length
    const cap        = totalCamps * LUMBER_CAPACITY_PER
    const current    = ctx.pool.get('lumber.timber')
    const room       = Math.max(0, cap - current)
    const produced   = Math.min(workers.length * TIMBER_PER_LOGGER_DAY, room)
    if (produced <= 0) return

    // 均匀分摊到周边各林地格
    const perTile = produced / nearby.length
    for (const t of nearby) {
      ctx.pool.mutate(`forest.health.${t.x},${t.y}`, -perTile)
    }
    ctx.pool.mutate('lumber.timber', produced)
  },
}
