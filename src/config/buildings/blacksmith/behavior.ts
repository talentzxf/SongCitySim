/**
 * Blacksmith (铁匠铺) — behavior
 *
 * onDayStart:
 *   Active smiths consume iron ore from the city pool and produce iron tools.
 *   Output is capped at SMITH_CAPACITY_PER * total_blacksmith_count.
 *   If the ore pool runs dry, production halts — no ore, no tools.
 */
import type { BuildingLifecycle } from '../_lifecycle'
import { SMITH_CAPACITY_PER, ORE_PER_TOOL } from '../../../state/helpers'

export const behavior: BuildingLifecycle = {
  onDayStart(ctx) {
    const activeSmiths = ctx.workers  // already excludes sick workers
    if (!activeSmiths.length) return

    const totalSmiths = ctx.cityBuildings.filter(b => b.type === 'blacksmith').length
    const totalCap    = totalSmiths * SMITH_CAPACITY_PER
    const toolsCurrent = ctx.pool.get('smith.tools')
    const toolHeadroom = Math.max(0, totalCap - toolsCurrent)
    if (toolHeadroom <= 0) return  // smith inventory full

    const oreAvailable = ctx.pool.get('mine.ore')
    if (oreAvailable <= 0) return  // no raw material

    // Each smith can process ORE_PER_TOOL ore per day
    const oreWanted  = activeSmiths.length * ORE_PER_TOOL
    const oreToUse   = Math.min(oreWanted, oreAvailable)
    const toolsMade  = Math.min(Math.floor(oreToUse / ORE_PER_TOOL), toolHeadroom)

    if (toolsMade > 0) {
      ctx.pool.mutate('mine.ore',    -(toolsMade * ORE_PER_TOOL))
      ctx.pool.mutate('smith.tools',   toolsMade)
    }
  },
}

