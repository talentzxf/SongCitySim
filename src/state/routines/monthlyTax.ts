/** Monthly settlement: collect taxes, deduct expenses, reset monthly accumulators. */
import type { TickRoutine } from './types'
import { MONTH_TICKS } from '../../config/simulation'
export const monthlyTaxRoutine: TickRoutine = (ctx) => {
  const { nextTick, citizens, s } = ctx
  const monthlyDue = nextTick % MONTH_TICKS === 0
  let lastTaxBreakdown            = s.lastTaxBreakdown
  let totalMonthlyTax             = 0
  let lastMonthlyFarmValue        = s.lastMonthlyFarmValue
  let lastMonthlyMarketSales      = s.lastMonthlyMarketSales
  let lastMonthlyExpenseBreakdown = s.lastMonthlyExpenseBreakdown
  let nextMonthlyFarmOutput       = ctx.monthlyFarmOutput
  let nextMonthlyFarmValue        = ctx.monthlyFarmValue
  let nextMonthlyMarketSales      = ctx.monthlyMarketSales
  const yangminCost = monthlyDue ? Math.floor(citizens.length * 2) : 0
  if (monthlyDue) {
    // three tax types: per-head (ding), farmland yield (tian), market sales (shang)
    const dingTax  = Math.floor(s.taxRates.ding * citizens.length)
    const tianTax  = Math.floor(ctx.monthlyFarmValue * s.taxRates.tian)
    const shangTax = Math.floor(ctx.monthlyMarketSales * s.taxRates.shang)
    totalMonthlyTax = dingTax + tianTax + shangTax
    lastTaxBreakdown            = { ding: dingTax, tian: tianTax, shang: shangTax }
    lastMonthlyExpenseBreakdown = {
      yangmin: yangminCost,
      jianshe: s.monthlyConstructionCost,
      total:   yangminCost + s.monthlyConstructionCost,
    }
    lastMonthlyFarmValue   = ctx.monthlyFarmValue
    lastMonthlyMarketSales = ctx.monthlyMarketSales
    // reset accumulators for next month
    nextMonthlyFarmOutput  = 0
    nextMonthlyFarmValue   = 0
    nextMonthlyMarketSales = 0
    // Decay dead count monthly so disease spread risk reduces over time
    ctx.buildings = ctx.buildings.map(b => {
      if (!b.residentData || b.residentData.dead <= 0) return b
      return { ...b, residentData: { ...b.residentData, dead: b.residentData.dead - 1 } }
    })
  }
  ctx.monthlyDue                 = monthlyDue
  ctx.lastTaxBreakdown           = lastTaxBreakdown
  ctx.totalMonthlyTax            = totalMonthlyTax
  ctx.lastMonthlyFarmValue       = lastMonthlyFarmValue
  ctx.lastMonthlyMarketSales     = lastMonthlyMarketSales
  ctx.lastMonthlyExpenseBreakdown = lastMonthlyExpenseBreakdown
  ctx.nextMonthlyFarmOutput      = nextMonthlyFarmOutput
  ctx.nextMonthlyFarmValue       = nextMonthlyFarmValue
  ctx.nextMonthlyMarketSales     = nextMonthlyMarketSales
  return ctx
}
