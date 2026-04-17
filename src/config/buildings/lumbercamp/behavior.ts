/**
 * 采木场 — behavior
 * onDayStart: 伐木工采伐周边（Chebyshev ≤6 格）林地，耗尽即停工。
 * 林地储量归零时，地图上的树木消失。
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { FOREST_TILES, MOUNTAIN_FOREST_TILES } from '../../../state/worldgen'

const LUMBER_CAPACITY_PER    = 80   // 每座采木场的木材库存上限
const TIMBER_PER_LOGGER_DAY  = 2    // 每名伐木工每日产出木材量
const HARVEST_RADIUS = 6   // Chebyshev 采伐半径距离

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return

    const { x: bx, y: by } = ctx.building

    // 找出周边有剩余储量的林地格（平地林地 + 山地松柏均可采伐）
    const allForestTiles = [...FOREST_TILES, ...MOUNTAIN_FOREST_TILES]
    const nearby = allForestTiles.filter(t => {
      if (Math.max(Math.abs(t.x - bx), Math.abs(t.y - by)) > HARVEST_RADIUS) return false
      return ctx.terrainHealth(`${t.x},${t.y}`, 'forest') > 0
    })
    if (!nearby.length) return   // 周边林木已耗尽

    const totalCamps = ctx.cityBuildings.filter(b => b.type === 'lumbercamp').length
    const cap        = totalCamps * LUMBER_CAPACITY_PER
    const current    = ctx.cityUnit('lumbercamp', 'timber')
    const room       = Math.max(0, cap - current)
    const produced   = Math.min(workers.length * TIMBER_PER_LOGGER_DAY, room)
    if (produced <= 0) return

    // 均匀分摊到周边各林地格
    const perTile = produced / nearby.length
    for (const t of nearby) {
      ctx.depleteTerrainHealth(`${t.x},${t.y}`, 'forest', perTile)
    }
    ctx.produceUnit('timber', produced)
  },
}
