/**
 * Granary (粮仓) — behavior stub
 *
 * Current logistics (ox-cart pickup, wholesale to market) is handled by
 * oxCartRoutine and marketBuyerRoutine.
 *
 * onMonthEnd: deduct maintenance cost (future — requires city money mutation API).
 *
 * Future onDayStart ideas:
 *   - Spoilage: reduce perishable goods (vegetable) daily
 *   - Drought bonus: reduce transfer rate if nearby river is dry
 */
import type { BuildingLifecycle } from '../_lifecycle'

/** 每座常平仓的粮食库存上限（每升级一级叠加）。*/
export const GRANARY_CAPACITY_PER = 200

export const behavior: BuildingLifecycle = {
  // Placeholder — logistics handled by ox-cart and market-buyer routines.
  // Add hooks here when per-building granary capacity or spoilage is implemented.
}

