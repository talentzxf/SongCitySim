/**
 * 铁矿坑（Mine）— behavior
 * onDayStart: 矿工产出矿石，同时消耗本格矿脉储量。
 * 矿脉枯竭后停止产出，矿石图标消失。
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { tileKey } from '../../../state/helpers'

const MINE_CAPACITY_PER  = 60   // 每座矿山的铁矿石库存上限
const ORE_PER_MINER_DAY  = 3    // 每名矿工每天产出矿石量

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const workers = ctx.workers
    if (!workers.length) return

    // 检查本格矿脉储量
    const key    = tileKey(ctx.building.x, ctx.building.y)
    const health = ctx.terrainHealth(key, 'ore')
    if (health <= 0) return   // 矿脉已枯竭

    const totalMines = ctx.cityBuildings.filter(b => b.type === 'mine').length
    const totalCap   = totalMines * MINE_CAPACITY_PER
    const current    = ctx.cityUnit('mine', 'ironOre')
    const headroom   = Math.max(0, totalCap - current)
    const produced   = Math.min(workers.length * ORE_PER_MINER_DAY, headroom, health)

    if (produced > 0) {
      ctx.produceUnit('ironOre', produced)
      ctx.depleteTerrainHealth(key, 'ore', produced)
    }
  },
}
