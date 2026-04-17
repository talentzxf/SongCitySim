/**
 * Blacksmith (铁匠铺) — behavior
 *
 * onDayStart:
 *   Active smiths consume iron ore from the city pool and produce iron tools.
 *   Output is capped at SMITH_CAPACITY_PER * total_blacksmith_count.
 *   If the ore pool runs dry, production halts — no ore, no tools.
 */
import type { BuildingLifecycle } from '../_lifecycle'

/** Exported so peddler routine can cap unsold-tool returns. */
export const SMITH_CAPACITY_PER = 20   // 每座铁匠铺的农具库存上限
const ORE_PER_TOOL          = 2    // 每件农具消耗的矿石量

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const activeSmiths = ctx.workers  // already excludes sick workers
    if (!activeSmiths.length) return

    const totalSmiths = ctx.cityBuildings.filter(b => b.type === 'blacksmith').length
    const totalCap    = totalSmiths * SMITH_CAPACITY_PER
    const toolsCurrent = ctx.cityUnit('blacksmith', 'ironTools')
    const toolHeadroom = Math.max(0, totalCap - toolsCurrent)
    if (toolHeadroom <= 0) return  // smith inventory full

    const oreAvailable = ctx.cityUnit('mine', 'ironOre')
    if (oreAvailable <= 0) return  // no raw material

    // Each smith can process ORE_PER_TOOL ore per day
    const oreWanted  = activeSmiths.length * ORE_PER_TOOL
    const oreToUse   = Math.min(oreWanted, oreAvailable)
    const toolsMade  = Math.min(Math.floor(oreToUse / ORE_PER_TOOL), toolHeadroom)

    if (toolsMade > 0) {
      ctx.consumeUnit('mine', 'ironOre', toolsMade * ORE_PER_TOOL)
      ctx.produceUnit('ironTools', toolsMade)
    }
  },
}

