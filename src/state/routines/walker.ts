/**
 * Motion routine — advances every citizen that has motion ≠ null.
 * Handles shop arrivals, fromShop cargo delivery, commute arrivals.
 * (Walker was a separate entity; it is now Citizen.motion.)
 */
import type { CitizenStatus, CitizenMotion } from '../types'
import type { TickRoutine } from './types'
import { WALKER_SPEED, SIM_TICK_MS } from '../../config/simulation'
import {
  CROP_KEYS, FARM_TOOL_PRICE, TOOL_DURABILITY_MAX, TOOL_DURABILITY_LOW,
  clampCrop, clampFood, cropPrice, createEmptyInventory, isRoadAt,
  getResidentData, updateResidentData, getAggregateCrops, addBldgCrop,
  getAggregateBldgUnit, addBldgUnit,
} from '../helpers'

export const walkerRoutine: TickRoutine = (ctx) => {
  const { nextTick, houseMap } = ctx
  let citizens  = ctx.citizens
  let buildings = ctx.buildings

  citizens = citizens.map(c => {
    if (!c.motion) return c
    let m: CitizenMotion = { ...c.motion, route: c.motion.route.map(p => ({ ...p })) }
    // ── Patrol random walk ──────────────────────────────────────────────────
    if (m.purpose === 'patrol') {
      let rem = m.speed * (SIM_TICK_MS / 1000)
      while (rem > 0 && m.routeIndex < m.route.length - 1) {
        const seg = 1 - m.routeT
        if (rem < seg) { m.routeT += rem; rem = 0 }
        else { rem -= seg; m.routeIndex += 1; m.routeT = 0 }
      }
      if (m.routeIndex >= m.route.length - 1) {
        const stepsLeft = (m.stepsLeft ?? 0) - 1
        if (stepsLeft > 0) {
          const cur = m.route[m.route.length - 1]
          const adj = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
            .map(d => ({ x: cur.x + d.x, y: cur.y + d.y }))
            .filter(t => isRoadAt(ctx.s.roads, t.x, t.y))
          const prev = m.route.length >= 2 ? m.route[m.route.length - 2] : null
          const pool = prev ? adj.filter(t => !(t.x === prev.x && t.y === prev.y)) : adj
          const candidates = pool.length > 0 ? pool : adj
          const nextTile = candidates[Math.floor(Math.random() * candidates.length)]
          if (nextTile) {
            return { ...c, motion: { ...m, route: [cur, nextTile], routeIndex: 0, routeT: 0, stepsLeft } }
          }
        }
        return { ...c, motion: null }
      }
      return { ...c, motion: m }
    }
    // ── Regular motion step ──────────────────────────────────────────────────
    let rem = m.speed * (SIM_TICK_MS / 1000)
    while (rem > 0 && m.routeIndex < m.route.length - 1) {
      const seg = 1 - m.routeT
      if (rem < seg) { m.routeT += rem; rem = 0 }
      else { rem -= seg; m.routeIndex += 1; m.routeT = 0 }
    }
    if (m.routeIndex < m.route.length - 1) return { ...c, motion: m }
    // ── Arrived ──────────────────────────────────────────────────────────────
    if (m.purpose === 'toShop') {
      const houseId = c.houseId
      const rd      = getResidentData(buildings, houseId)
      const hcNow   = { ...(rd.crops ?? createEmptyInventory()) }
      const stored  = CROP_KEYS.reduce((s, k) => s + hcNow[k], 0)
      const demand  = Math.max(0, Math.min(10, 30 - stored))
      const basket  = createEmptyInventory()
      let totalCost = 0
      if (demand > 0) {
        const marketInv  = getAggregateCrops(ctx.marketsList)
        const available  = CROP_KEYS.filter(k => marketInv[k] > 0)
        if (available.length > 0) {
          const perCrop = demand / available.length
          for (const k of available) {
            const take = Math.min(marketInv[k], perCrop)
            basket[k] = clampCrop(basket[k] + take)
            totalCost += take * cropPrice(k)
            // Deduct from market building with most of this crop
            const mkWithCrop = ctx.marketsList.filter(mkt => (mkt.inventory?.crops[k] ?? 0) > 0)
            if (mkWithCrop.length > 0) buildings = addBldgCrop(buildings, mkWithCrop[0].id, k, -take)
          }
        }
      }
      buildings = updateResidentData(buildings, houseId, { savings: Math.max(0, rd.savings - totalCost) })
      // Buy tools if farmer and tools low
      const smithTotal = getAggregateBldgUnit(ctx.smithBldgs, 'ironTools')
      if (c.farmZoneId && smithTotal > 0 && (rd.tools ?? 0) < TOOL_DURABILITY_LOW) {
        const savingsNow = getResidentData(buildings, houseId).savings
        if (savingsNow >= FARM_TOOL_PRICE) {
          if (ctx.smithBldgs[0]) buildings = addBldgUnit(buildings, ctx.smithBldgs[0].id, 'ironTools', -1)
          buildings = updateResidentData(buildings, houseId, { savings: Math.max(0, savingsNow - FARM_TOOL_PRICE), tools: TOOL_DURABILITY_MAX })
        }
      }
      const house  = houseMap.get(houseId)
      const market = m.targetId ? ctx.s.buildings.find(b => b.id === m.targetId) : null
      if (house && market) {
        const returnMotion: CitizenMotion = {
          route: [{ x: market.x, y: market.y }, { x: house.x, y: house.y }],
          routeIndex: 0, routeT: 0, speed: WALKER_SPEED, purpose: 'fromShop', cargo: basket,
        }
        return { ...c, motion: returnMotion, status: 'returning' as CitizenStatus, statusTicks: 0 }
      }
      return { ...c, motion: null }
    } else if (m.purpose === 'fromShop') {
      if (m.cargo) {
        const rd = getResidentData(buildings, c.houseId)
        const hc = { ...(rd.crops ?? createEmptyInventory()) }
        for (const k of CROP_KEYS) hc[k] = clampCrop(hc[k] + (m.cargo[k] ?? 0))
        buildings = updateResidentData(buildings, c.houseId, {
          crops: hc,
          food: clampFood(CROP_KEYS.reduce((s, k) => s + hc[k], 0)),
        })
      }
      return { ...c, motion: null, isAtHome: true, status: 'idle' as CitizenStatus, statusTicks: 0 }
    } else {
      const newStatus: CitizenStatus = m.purpose === 'toWork'
        ? (c.farmZoneId ? 'farming' : 'working')
        : 'idle'
      return { ...c, motion: null, isAtHome: m.purpose === 'toHome', status: newStatus, statusTicks: 0 }
    }
  })

  ctx.citizens  = citizens
  ctx.buildings = buildings
  return ctx
}
