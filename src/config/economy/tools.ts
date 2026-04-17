/**
 * Iron-tool economic chain
 * ────────────────────────
 * Constants that govern the blacksmith → peddler → farmer → household
 * tool life-cycle.  They belong here (not in engine helpers) because they
 * are pure gameplay tuning numbers that have no meaning outside this chain.
 */

/** 农具购买价格（文）。行商、市民买工具时使用。*/
export const FARM_TOOL_PRICE      = 40

/** 工具加成：拥有工具的农夫产量倍率。*/
export const TOOL_EFFICIENCY_BONUS = 1.5

/** 工具满耐久值（新工具出厂值）。*/
export const TOOL_DURABILITY_MAX  = 100

/** 每天农业生产消耗的工具耐久。*/
export const TOOL_WEAR_PER_DAY    = 4

/** 工具耐久低于此值时，农夫将主动购买新工具。*/
export const TOOL_DURABILITY_LOW  = 20

