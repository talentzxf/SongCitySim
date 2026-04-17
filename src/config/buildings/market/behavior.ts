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

// ── 草市容量 ──────────────────────────────────────────────────────────────
/** 每个草市的摊位总数上限。*/
export const MARKET_TOTAL_SLOTS  = 6
/** 每个摊位可以承载的商品量（担）。*/
export const MARKET_CAP_PER_SHOP = 25

// ── 商贩（行商）参数 ──────────────────────────────────────────────────────
/** 行商每次出行的最大步数（格）。*/
export const PEDDLER_MAX_STEPS   = 30
/** 行商在道路上的移动速度（格/秒）。*/
export const PEDDLER_SPEED       = 3.5
/** 行商每次出行最多携带的粮食量（担）。*/
export const PEDDLER_CARRY_FOOD  = 10
/** 行商每次出行最多携带的农具件数。*/
export const PEDDLER_CARRY_TOOLS = 2
/** 行商每次向一户出售的最大粮食量（担）。*/
export const PEDDLER_SELL_FOOD   = 5
/** 户粮低于此值时，行商优先补给该户。*/
export const PEDDLER_FOOD_THRESH = 10

export const behavior: BuildingLifecycle = {
  // Core trading logic lives in peddlerRoutine / marketBuyerRoutine.
  // Extend here for price dynamics, event bonuses, or trade taxes.
}

