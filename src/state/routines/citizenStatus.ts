/** Citizen state machine + needs hierarchy -> satisfaction update each tick. */
import type { CitizenStatus, NeedContext } from '../types'
import type { TickRoutine } from './types'
import { SAT_DELTA, BOREDOM, updateNeedsAndDelta } from '../needs'
import { CROP_KEYS, clamp01, distance, adjacentHasRoad, getResidentData } from '../helpers'
export const citizenStatusRoutine: TickRoutine = (ctx) => {
  const { s, houseMap, workplacePos, buildings } = ctx

  // Precompute servant counts per manor building id
  const manorServantCount = new Map<string, number>()
  for (const c of ctx.citizens) {
    const house = houseMap.get(c.houseId)
    if (house && (house.type as string) === 'manor' && c.workplaceId === house.id) {
      manorServantCount.set(house.id, (manorServantCount.get(house.id) ?? 0) + 1)
    }
  }

  ctx.citizens = ctx.citizens.map(c => {
    const house = houseMap.get(c.houseId); if (!house) return c

    const rd       = getResidentData(buildings, c.houseId)
    const prevFood = rd.food
    const starving = prevFood <= 0.05
    // sickness onset / recovery
    let isSick = c.isSick
    if (starving && !isSick && Math.random() < 0.003) isSick = true
    if (!starving && isSick && prevFood > 2 && Math.random() < 0.0025) isSick = false
    const sickTicks = isSick ? (c.sickTicks ?? 0) + 1 : 0
    // determine status from motion or location
    const motion = c.motion
    let status: CitizenStatus
    if      (isSick)  status = 'sick'
    else if (motion)  status = motion.purpose === 'toShop' ? 'shopping' : motion.purpose === 'fromShop' ? 'returning' : 'commuting'
    else if (!c.isAtHome) status = c.farmZoneId ? 'farming' : 'working'
    else              status = 'idle'
    const statusChanged = status !== (c.status ?? 'idle')
    const statusTicks   = statusChanged ? 0 : (c.statusTicks ?? 0) + 1
    // build needs context
    const hasRoad     = adjacentHasRoad(s.roads, house.x, house.y)
    const hc          = rd.crops
    const dietVariety = hc ? CROP_KEYS.filter(k => hc[k] > 0.1).length : 0
    const hasTea      = hc ? (hc.tea ?? 0) > 0.1 : false
    const hasJob      = Boolean(c.workplaceId || c.farmZoneId)
    const savings     = rd.savings
    const cheb        = (bx: number, by: number) => Math.max(Math.abs(bx - house.x), Math.abs(by - house.y))
    const nearMarket        = s.buildings.some(b => b.type === 'market'                                                       && cheb(b.x, b.y) <= 10)
    const nearAcademy       = dietVariety >= 2 && s.buildings.some(b => (b.type as string) === 'academy'                      && cheb(b.x, b.y) <= 15)
    const nearEntertainment = s.buildings.some(b => ((b.type as string) === 'tavern' || (b.type as string) === 'teahouse')    && cheb(b.x, b.y) <= 8)
    const nearTemple        = s.buildings.some(b => (b.type as string) === 'temple'                                           && cheb(b.x, b.y) <= 12)
    const nearCulturalVenue = s.buildings.some(b => ((b.type as string) === 'academy' || (b.type as string) === 'papermill')  && cheb(b.x, b.y) <= 15)
    const isManor   = (house.type as string) === 'manor'
    const isServant = isManor && c.workplaceId === house.id
    const isGentry  = isManor && !isServant
    const residentTier = isServant ? 'servant' : isGentry ? 'gentry' : 'common'
    const servantCnt   = manorServantCount.get(house.id) ?? 0
    const needCtx: NeedContext = {
      food: prevFood, hasRoad, dietVariety, hasJob, savings,
      nearMarket, nearAcademy, nearEntertainment,
      nearTemple, nearCulturalVenue,
      isGentry, manorServantCount: servantCnt, hasTea,
    }
    const idleMult = (status === 'idle' && hasJob) ? 1.6 : 1
    let satDelta = SAT_DELTA[status] * idleMult
    const boredom = BOREDOM[status]
    if (boredom && statusTicks >= boredom.threshold) satDelta -= boredom.extra
    const { updatedUnmetTicks, satDelta: needsDelta } = updateNeedsAndDelta(c.needUnmetTicks ?? {}, needCtx)
    satDelta += needsDelta
    const satisfaction = Math.round(Math.max(0, Math.min(100, c.satisfaction + satDelta)))
    const nearWork    = workplacePos.some(p => distance(p, house) <= 8) && !isSick
    const safetyScore = rd.safety
    const isWellFed   = prevFood >= 8
    const n = { ...c.needs }
    n.food    = clamp01(n.food + (starving ? -0.04 : (nearWork ? 0.015 : -0.01)))
    if (isWellFed) {
      n.safety = clamp01(n.safety + (safetyScore > 0.4 ? 0.012 : hasRoad ? -0.006 : -0.016))
    } else {
      n.safety = clamp01(n.safety + (hasRoad ? 0.004 : -0.008))
    }
    n.culture = clamp01(n.culture + (workplacePos.length > 0 ? 0.006 : -0.008))
    if (!c.workplaceId && !c.farmZoneId) n.culture = clamp01(n.culture - 0.005)
    if (isSick) { n.food = clamp01(n.food - 0.01); n.safety = clamp01(n.safety - 0.004) }
    return { ...c, needs: n, needUnmetTicks: updatedUnmetTicks, isSick, sickTicks, status, statusTicks, satisfaction, residentTier }
  })
  return ctx
}
