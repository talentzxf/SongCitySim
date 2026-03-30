export const SIM_TICK_MS = 100
export const MONTH_TICKS = Math.round(30_000 / SIM_TICK_MS)
export const MIGRANT_TILES_PER_SECOND = 2.8
export const DAY_TICKS = 480        // one in-game day = 48 real seconds
export const MORNING_START = 0.25   // 6:00 start work
export const EVENING_START = 0.75   // 18:00 go home
export const WALKER_SPEED = 4.5     // tiles/s for daily commuters
export const OX_CART_SPEED = 1.8    // 牛车（粮仓 → 农田 → 粮仓）
export const MARKET_BUYER_SPEED = 3.2  // 行商（集市 → 粮仓 → 集市）
// 宋代旬休制度：每旬（10天）休息一天，即每月 10、20、30 日
export const SHOP_INTERVAL_DAYS = 10
