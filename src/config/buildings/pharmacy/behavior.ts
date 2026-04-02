/**
 * Pharmacy (药铺) — behavior
 *
 * Service effect (safety/health within serviceRadius) is data-driven via
 * config.json → needBonus + serviceRadius.
 *
 * Future onDayStart:
 *   - Reduce sick-spread chance for citizens near an active pharmacy
 *   - Accelerate recovery for sick citizens within service radius
 *   - Herbalists with high skill reduce disease mortality rate
 */
import type { BuildingLifecycle } from '../_lifecycle'

export const behavior: BuildingLifecycle = {
  // Area safety effect is data-driven via config.json → needBonus.
  // Extend here for disease reduction, sick recovery acceleration, etc.
}

