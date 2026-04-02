/**
 * Academy (书院) — behavior
 *
 * Service effect (culture within serviceRadius) is data-driven via
 * config.json → needBonus + serviceRadius.
 *
 * Future onDayStart:
 *   - Raise city literacy rate slowly while scholars work here
 *   - Unlock tech nodes when literacy crosses thresholds
 */
import type { BuildingLifecycle } from '../_lifecycle'

export const behavior: BuildingLifecycle = {
  // Area culture effect is data-driven via config.json → needBonus.
  // Extend here for literacy growth and tech unlock triggers.
}

