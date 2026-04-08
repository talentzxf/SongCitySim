/** Citizen state machine + needs hierarchy -> satisfaction update each tick. */
import type { CitizenStatus, NeedContext } from '../types'
import type { TickRoutine } from './types'
import { SAT_DELTA, BOREDOM, updateNeedsAndDelta } from '../needs'
import { CROP_KEYS, clamp01, distance, adjacentHasRoad } from '../helpers'
export const citizenStatusRoutine: TickRoutine = (ctx) => {
  const { s, houseMap, workplacePos, walkers, houseFood, houseCrops, houseSavings } = ctx
  const walkerByCitizen = new Map(walkers.map(w => [w.citizenId, w]))
  ctx.citizens = ctx.citizens.map(c => {
    const house = houseMap.get(c.houseId); if (!house) return c
    const prevFood = houseFood[c.houseId] ?? 0
    const starving = prevFood <= 0.05
    // sickness onset / recovery
    let isSick = c.isSick
    if (starving && !isSick && Math.random() < 0.003) isSick = true
    if (!starving && isSick && prevFood > 2 && Math.random() < 0.0025) isSick = false
    const sickTicks = isSick ? (c.sickTicks ?? 0) + 1 : 0
    // determine status from active walker or location
    const aw = walkerByCitizen.get(c.id)
    let status: CitizenStatus
    if      (isSick)      status = 'sick'
    else if (aw)          status = aw.purpose === 'toShop' ? 'shopping' : aw.purpose === 'fromShop' ? 'returning' : 'commuting'
    else if (!c.isAtHome) status = c.farmZoneId ? 'farming' : 'working'
    else                  status = 'idle'
    const statusChanged = status !== (c.status ?? 'idle')
    const statusTicks   = statusChanged ? 0 : (c.statusTicks ?? 0) + 1
    // build needs context
    const hasRoad     = adjacentHasRoad(s.roads, house.x, house.y)
    const hc          = houseCrops[c.houseId]
    const dietVariety = hc ? CROP_KEYS.filter(k => hc[k] > 0.1).length : 0
    const hasJob      = Boolean(c.workplaceId || c.farmZoneId)
    const savings     = houseSavings[c.houseId] ?? 0
    const cheb        = (bx: number, by: number) => Math.max(Math.abs(bx - house.x), Math.abs(by - house.y))
    const nearMarket        = s.buildings.some(b => b.type === 'market'                                                       && cheb(b.x, b.y) <= 10)
    const nearAcademy       = dietVariety >= 2 && s.buildings.some(b => (b.type as string) === 'academy'                      && cheb(b.x, b.y) <= 15)
    const nearEntertainment = s.buildings.some(b => ((b.type as string) === 'tavern' || (b.type as string) === 'teahouse')    && cheb(b.x, b.y) <= 8)
    const needCtx: NeedContext = { food: prevFood, hasRoad, dietVariety, hasJob, savings, nearMarket, nearAcademy, nearEntertainment }
    // satisfaction delta: status machine + boredom penalty + needs hierarchy
    const idleMult = (status === 'idle' && hasJob) ? 1.6 : 1
    let satDelta = SAT_DELTA[status] * idleMult
    const boredom = BOREDOM[status]
    if (boredom && statusTicks >= boredom.threshold) satDelta -= boredom.extra
    const { updatedUnmetTicks, satDelta: needsDelta } = updateNeedsAndDelta(c.needUnmetTicks ?? {}, needCtx)
    satDelta += needsDelta
    const satisfaction = Math.round(Math.max(0, Math.min(100, c.satisfaction + satDelta)))
    // legacy needs vector (used by HUD pressure bars)
    const nearWork = workplacePos.some(p => distance(p, house) <= 8) && !isSick
    const n = { ...c.needs }
    n.food    = clamp01(n.food    + (starving ? -0.04 : (nearWork ? 0.015 : -0.01)))
    n.safety  = clamp01(n.safety  + (hasRoad  ?  0.008 : -0.012))
    n.culture = clamp01(n.culture + (workplacePos.length > 0 ? 0.006 : -0.008))
    if (!c.workplaceId && !c.farmZoneId) n.culture = clamp01(n.culture - 0.005)
    if (isSick) { n.food = clamp01(n.food - 0.01); n.safety = clamp01(n.safety - 0.004) }
    return { ...c, needs: n, needUnmetTicks: updatedUnmetTicks, isSick, sickTicks, status, statusTicks, satisfaction }
  })
  return ctx
}
