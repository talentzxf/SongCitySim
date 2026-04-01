/** Aggregate population count, average satisfaction, and need pressure bars. */
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
  ctx.population      = population
  ctx.avgSatisfaction = avgSatisfaction
  ctx.needPressure    = needPressure
  return ctx
}
