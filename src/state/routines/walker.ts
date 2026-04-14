/** Advance walkers each tick; handle shop, return-home, and commute arrivals. */
import type { CitizenStatus } from '../types'
import type { TickRoutine } from './types'
import { WALKER_SPEED, SIM_TICK_MS } from '../../config/simulation'
import { CROP_KEYS, FARM_TOOL_PRICE, TOOL_DURABILITY_MAX, TOOL_DURABILITY_LOW, clampCrop, clampFood, cropPrice, createEmptyInventory, isRoadAt } from '../helpers'
export const walkerRoutine: TickRoutine = (ctx) => {
  const { nextTick, houseMap } = ctx
  let citizens        = ctx.citizens
  let houseCrops      = ctx.houseCrops
  let houseFood       = ctx.houseFood
  let houseSavings    = ctx.houseSavings
  let houseTools      = ctx.houseTools
  let smithInventory  = ctx.smithInventory
  let marketInventory = ctx.marketInventory
  const aliveIds = new Set(citizens.map(c => c.id))
  const arrived: typeof ctx.walkers = []
  // Keep patrol walkers even without real citizen backing
  let walkers = ctx.walkers
    .filter(w => w.purpose === 'patrol' || aliveIds.has(w.citizenId))
    .map(w => ({ ...w, route: w.route.map(p => ({ ...p })) }))

  const newPatrolWalkers: typeof ctx.walkers = []

  walkers = walkers.filter(w => {
    let rem = w.speed * (SIM_TICK_MS / 1000)
    while (rem > 0 && w.routeIndex < w.route.length - 1) {
      const seg = 1 - w.routeT
      if (rem < seg) { w.routeT += rem; rem = 0 }
      else { rem -= seg; w.routeIndex += 1; w.routeT = 0 }
    }
    if (w.routeIndex >= w.route.length - 1) {
      // ── 巡逻兵到达一步，继续随机行走 ──────────────────────────────────
      if (w.purpose === 'patrol') {        const stepsLeft = (w.stepsLeft ?? 0) - 1
        if (stepsLeft > 0) {
          const cur = w.route[w.route.length - 1]
          const adj = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
            .map(d => ({ x: cur.x + d.x, y: cur.y + d.y }))
            .filter(t => isRoadAt(ctx.s.roads, t.x, t.y))
          const prev = w.route.length >= 2 ? w.route[w.route.length - 2] : null
          const pool = prev ? adj.filter(t => !(t.x === prev.x && t.y === prev.y)) : adj
          const candidates = pool.length > 0 ? pool : adj
          const nextTile = candidates[Math.floor(Math.random() * candidates.length)]
          if (nextTile) {
            newPatrolWalkers.push({ ...w, route: [cur, nextTile], routeIndex: 0, routeT: 0, stepsLeft })
          }
        }
        arrived.push(w); return false
      }
      arrived.push(w); return false
    }
    return true
  })

  walkers = [...walkers, ...newPatrolWalkers]

  for (const w of arrived) {
    if (w.purpose === 'patrol') continue
    const idx = citizens.findIndex(c => c.id === w.citizenId); if (idx < 0) continue
    if (w.purpose === 'toShop') {
      const houseId = citizens[idx].houseId
      const hcNow   = houseCrops[houseId] ?? createEmptyInventory()
      const stored  = CROP_KEYS.reduce((s, k) => s + hcNow[k], 0)
      const demand  = Math.max(0, Math.min(10, 30 - stored))
      const basket  = createEmptyInventory()
      let totalCost = 0
      if (demand > 0) {
        const available = CROP_KEYS.filter(k => marketInventory[k] > 0)
        if (available.length > 0) {
          const perCrop = demand / available.length
          for (const k of available) {
            const take = Math.min(marketInventory[k], perCrop)
            marketInventory = { ...marketInventory, [k]: clampCrop(marketInventory[k] - take) }
            basket[k] = clampCrop(basket[k] + take)
            totalCost += take * cropPrice(k)
          }
        }
      }
      houseSavings = { ...houseSavings, [houseId]: Math.max(0, (houseSavings[houseId] ?? 0) - totalCost) }
      if (citizens[idx].farmZoneId && smithInventory > 0 && (houseTools[houseId] ?? 0) < TOOL_DURABILITY_LOW) {
        const savingsNow = houseSavings[houseId] ?? 0
        if (savingsNow >= FARM_TOOL_PRICE) {
          smithInventory = Math.max(0, smithInventory - 1)
          houseSavings   = { ...houseSavings, [houseId]: Math.max(0, savingsNow - FARM_TOOL_PRICE) }
          houseTools     = { ...houseTools,   [houseId]: TOOL_DURABILITY_MAX }
        }
      }
      const house  = houseMap.get(houseId)
      const market = w.targetId ? ctx.s.buildings.find(b => b.id === w.targetId) : null
      if (house && market)
        walkers = [...walkers, {
          id: `w-${nextTick}-${citizens[idx].id}-home`, citizenId: citizens[idx].id,
          route: [{ x: market.x, y: market.y }, { x: house.x, y: house.y }],
          routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'fromShop', cargo: basket,
        }]
      citizens = citizens.map((c, i) => i === idx ? { ...c, status: 'returning' as CitizenStatus, statusTicks: 0 } : c)
    } else if (w.purpose === 'fromShop') {
      const houseId = citizens[idx].houseId
      if (w.cargo) {
        const hc = { ...(houseCrops[houseId] ?? createEmptyInventory()) }
        for (const k of CROP_KEYS) hc[k] = clampCrop(hc[k] + (w.cargo[k] ?? 0))
        houseCrops = { ...houseCrops, [houseId]: hc }
        houseFood  = { ...houseFood,  [houseId]: clampFood(CROP_KEYS.reduce((s, k) => s + hc[k], 0)) }
      }
      citizens = citizens.map((c, i) => i === idx ? { ...c, isAtHome: true, status: 'idle' as CitizenStatus, statusTicks: 0 } : c)
    } else {
      const newStatus: CitizenStatus = w.purpose === 'toWork'
        ? (citizens[idx].farmZoneId ? 'farming' : 'working')
        : 'idle'
      citizens = citizens.map((c, i) =>
        i === idx ? { ...c, isAtHome: w.purpose === 'toHome', status: newStatus, statusTicks: 0 } : c)
    }
  }
  ctx.walkers         = walkers
  ctx.citizens        = citizens
  ctx.houseCrops      = houseCrops
  ctx.houseFood       = houseFood
  ctx.houseSavings    = houseSavings
  ctx.houseTools      = houseTools
  ctx.smithInventory  = smithInventory
  ctx.marketInventory = marketInventory
  return ctx
}
