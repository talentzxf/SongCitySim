/**
 * Market (集市) — behavior stub
 *
 * Peddler dispatch and wholesale buying are handled by
 * peddlerRoutine and marketBuyerRoutine.
 *
 * Future onDayStart ideas:
 *   - Price fluctuation: adjust good prices based on supply/demand ratio
 *   - Tax collection: collect shang-tax on each sale transaction
 *   - Festival bonus: increase sales speed during festival events
 */
import type { BuildingLifecycle } from '../_lifecycle'

export const behavior: BuildingLifecycle = {
  // Core trading logic lives in peddlerRoutine / marketBuyerRoutine.
  // Extend here for price dynamics, event bonuses, or trade taxes.
}

