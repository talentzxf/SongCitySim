/**
 * Temple (寺庙) — behavior
 *
 * Service effect (culture + safety within serviceRadius) is declared in
 * config.json → needBonus + serviceRadius and applied by citizenStatusRoutine
 * via BUILDING_REGISTRY.
 *
 * onDayStart: monks provide a calm bonus proportional to attendance
 *   (future — requires citizen visit tracking).
 *
 * onMonthEnd: optional — trigger a festival event once per year.
 */
import type { BuildingLifecycle } from '../_lifecycle'

export const behavior: BuildingLifecycle = {
  // Area service effect (culture: +0.025, safety: +0.01) is data-driven via
  // config.json → needBonus and picked up by citizenStatusRoutine.
  // Add runtime hooks here for event triggers, upgrade effects, etc.
}

