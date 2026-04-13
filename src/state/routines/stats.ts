/** Aggregate population count, average satisfaction, need pressure bars, and city vitality indices. */
import type { TickRoutine } from './types'
export const statsRoutine: TickRoutine = (ctx) => {
  const { citizens } = ctx
  const population      = citizens.length
  const avgSatisfaction = population > 0
    ? Math.round(citizens.reduce((s, c) => s + c.satisfaction, 0) / population)
    : 0
  const avgNeed = citizens.reduce(
    (a, c) => ({ food: a.food + c.needs.food, safety: a.safety + c.needs.safety, culture: a.culture + c.needs.culture }),
    { food: 0, safety: 0, culture: 0 },
  )
  const needPressure = population > 0
    ? {
        food:    Math.round((1 - avgNeed.food    / population) * 100),
        safety:  Math.round((1 - avgNeed.safety  / population) * 100),
        culture: Math.round((1 - avgNeed.culture / population) * 100),
      }
    : { food: 0, safety: 0, culture: 0 }

  // ─── 文脉指数（Wénmài）: 0-100 ─────────────────────────────────────────
  // 由书院、造纸坊、寺庙等文教建筑 + 学子数量驱动
  const buildings = ctx.s.buildings
  const academyCount   = buildings.filter(b => (b.type as string) === 'academy').length
  const papermillCount = buildings.filter(b => (b.type as string) === 'papermill').length
  const templeCount    = buildings.filter(b => (b.type as string) === 'temple').length
  const scholarCount   = citizens.filter(c => c.profession === 'scholar').length
  const wenmai = Math.min(100, Math.round(
    academyCount   * 12 +
    papermillCount * 6  +
    templeCount    * 8  +
    scholarCount   * 3  +
    (needPressure.culture < 40 ? (40 - needPressure.culture) * 0.5 : 0)
  ))

  // ─── 商脉指数（Shāngmài）: 0-100 ────────────────────────────────────────
  // 由集市、月度销售额、商贩数量驱动
  const marketCount    = buildings.filter(b => (b.type as string) === 'market').length
  const merchantCount  = citizens.filter(c => c.profession === 'merchant').length
  const granaryCount   = buildings.filter(b => (b.type as string) === 'granary').length
  const monthSales     = ctx.monthlyMarketSales
  const shangmai = Math.min(100, Math.round(
    marketCount   * 12 +
    granaryCount  * 4  +
    merchantCount * 3  +
    Math.min(30, monthSales * 0.1)
  ))

  ctx.population      = population
  ctx.avgSatisfaction = avgSatisfaction
  ctx.needPressure    = needPressure
  ctx.cityWenmai      = wenmai
  ctx.cityShangmai    = shangmai
  return ctx
}
