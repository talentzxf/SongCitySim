import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SIM_TICK_MS } from '../config/simulation'
import worldGenConfig from '../config/world-gen'
// --- Re-export sub-modules so existing imports stay unchanged -------------
export * from './types'
export * from './needs'
export * from './worldgen'
export * from './helpers'
// --- Local imports (to use internally) -----------------------------------
import type { BuildingType, CropType, CropInventory, MarketConfig, Tool, CityState } from './types'
import { ALL_BUILDING_TYPES } from './types'
import { isMountainAt, isRiverAt, isOreVeinAt, isForestAt, isNearRiverFive, getMountainHeight, MAP_SIZE_X, MAP_SIZE_Y, ORE_VEIN_TILES, FOREST_TILES, GRASSLAND_TILES, MOUNTAIN_FOREST_TILES, isAnyForestAt, isMountainForestAt } from './worldgen'
import {
  BUILDING_DEFS, DEFAULT_MARKET_CFG, BRIDGE_BASE_COST, FOREST_CLEAR_COST, CROP_KEYS,
  clampFood, clampCrop, createEmptyInventory,
  isRoadAt, adjacentHasRoad, farmZoneAt, tileInFarmZone, isBuildingAt, getBridgeSpan,
  isNearRiver, cropForTile,
  ENTRY_TILE, HIGHWAY_MAIN_PATH, createHighwayRoads,
  getBuildingSize,
  ORE_VEIN_INITIAL_HEALTH, FOREST_TILE_INITIAL_HEALTH, GRASSLAND_TILE_INITIAL_HEALTH,
} from './helpers'
// --- IoC: Chain of Responsibility tick engine -----------------------------
import { buildTickContext, runTickChain, applyTickResult } from './routines'

// --- Initial state --------------------------------------------------------
const initial: CityState = {
  money: 5000, population: 0, tick: 0, running: false,
  buildings: [],
  roads: createHighwayRoads(),
  farmZones: [],
  selectedBuildingType: null, selectedTool: 'pan', selectedBuildingId: null,
  selectedCitizenId: null, selectedFarmZoneId: null, selectedTerrainTile: null,
  selectedRoadMode: 'around',
  lastAction: null, lastBuildAttempt: null,
  citizens: [],
  houseFood: {}, houseCrops: {}, houseSavings: {},
  taxRates: { ding: 5, tian: 0.10, shang: 0.05 },
  monthlyFarmOutput: 0, monthlyFarmValue: 0, monthlyMarketSales: 0,
  lastMonthlyFarmValue: 0, lastMonthlyMarketSales: 0,
  lastTaxBreakdown: { ding: 0, tian: 0, shang: 0 },
  lastMonthlyExpenseBreakdown: { yangmin: 0, jianshe: 0, total: 0 },
  monthlyConstructionCost: 0,
  mineInventory: 0, smithInventory: 0, timberInventory: 0, houseTools: {},
  oreVeinHealth:   Object.fromEntries(ORE_VEIN_TILES.map(t => [`${t.x},${t.y}`, ORE_VEIN_INITIAL_HEALTH])),
  forestHealth:    Object.fromEntries(
    [...FOREST_TILES, ...MOUNTAIN_FOREST_TILES].map(t => [`${t.x},${t.y}`, FOREST_TILE_INITIAL_HEALTH])
  ),
  grasslandHealth: Object.fromEntries(GRASSLAND_TILES.map(t => [`${t.x},${t.y}`, GRASSLAND_TILE_INITIAL_HEALTH])),
  farmInventory: createEmptyInventory(),
  granaryInventory: createEmptyInventory(),
  marketInventory: { rice: 10, millet: 0, wheat: 0, soybean: 0, vegetable: 0, tea: 0 },
  migrants: [], walkers: [], peddlers: [],
  farmPiles: [], oxCarts: [], marketBuyers: [],
  marketConfig: {},
  peddlerTripLog: {},
  month: 1, dayTime: 0.5, dayCount: 1,
  lastHouseholdBuyDay: 0,
  lastMonthlyTax: 0, avgSatisfaction: 71, needPressure: { food: 32, safety: 28, culture: 44 },
  houseDead: {},
  simSpeed: 1,
  houseSafety: {},
  cityWenmai: 0,
  cityShangmai: 0,
}

// Starter house adjacent to highway so migrants can spawn on day 1
try {
  if (Array.isArray(HIGHWAY_MAIN_PATH) && HIGHWAY_MAIN_PATH.length > 0 && initial.buildings.length === 0) {
    const hp = HIGHWAY_MAIN_PATH[Math.max(0, Math.floor(HIGHWAY_MAIN_PATH.length / 2))]
    const halfX = Math.floor(MAP_SIZE_X / 2), halfY = Math.floor(MAP_SIZE_Y / 2)
    const MAP_MIN_X = -halfX, MAP_MAX_X = halfX - 1, MAP_MIN_Y = -halfY, MAP_MAX_Y = halfY - 1
    function isClearTile(x: number, y: number) {
      if (x < MAP_MIN_X || x > MAP_MAX_X || y < MAP_MIN_Y || y > MAP_MAX_Y) return false
      return !isRiverAt(x, y) && !isMountainAt(x, y) && !isRoadAt(initial.roads, x, y) &&
        !initial.buildings.some(b => b.x === x && b.y === y)
    }
    const preferred = { x: hp.x + 1, y: hp.y }
    let chosen: { x: number; y: number } | null = isClearTile(preferred.x, preferred.y) ? preferred : null
    if (!chosen) {
      const q: { x: number; y: number }[] = [preferred]
      const seen = new Set<string>([`${preferred.x},${preferred.y}`])
      while (q.length > 0 && !chosen) {
        const cur = q.shift()!
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
          const nx = cur.x + dx, ny = cur.y + dy, key = `${nx},${ny}`
          if (seen.has(key)) continue; seen.add(key)
          if (nx < MAP_MIN_X || nx > MAP_MAX_X || ny < MAP_MIN_Y || ny > MAP_MAX_Y) continue
          if (isClearTile(nx, ny)) { chosen = { x: nx, y: ny }; break }
          q.push({ x: nx, y: ny })
        }
      }
    }
    const { x: bx, y: by } = chosen ?? preferred
    const bid = 'b-house-init'
    initial.buildings = [{ id: bid, type: 'house', x: bx, y: by, w: 1, h: 1, level: 1, capacity: 6, occupants: 0, workerSlots: 0, cost: 100 }]
    initial.houseFood    = { [bid]: 15 }
    initial.houseCrops   = { [bid]: { rice: 15, millet: 0, wheat: 0, soybean: 0, vegetable: 0, tea: 0 } }
    initial.houseSavings = { [bid]: 50 }
  }
} catch { /* ignore � best-effort for tests */ }

// --- Context --------------------------------------------------------------
const SimulationContext = createContext<{
  state: CityState; start: () => void; stop: () => void
  setSimSpeed: (v: number) => void
  setMoney: (v: number) => void; setPopulation: (v: number) => void
  placeBuilding: (x: number, y: number, type?: BuildingType) => any
  removeBuilding: (id: string) => void; selectBuildingType: (t: BuildingType | null) => void
  placeRoad: (x: number, y: number) => any; removeRoad: (x: number, y: number) => void
  placeFarmZone: (x: number, y: number, zoneType?: 'grain' | 'tea') => void; removeFarmZone: (x: number, y: number) => void
  selectFarmZone: (id: string | null) => void; setFarmCrop: (id: string, crop: CropType) => void
  setTaxRates: (rates: { ding: number; tian: number; shang: number }) => void
  selectTool: (t: Tool) => void; selectBuilding: (id: string | null) => void
  selectCitizen: (id: string | null) => void
  setMarketConfig: (id: string, cfg: MarketConfig) => void
  selectRoadMode: (mode: 'around' | 'over') => void
  upgradeBuilding: (id: string) => void
  selectTerrainTile: (t: { x: number; y: number; kind: 'forest' | 'grassland' | 'ore' | 'mountainForest' } | null) => void
}>({
  state: initial, start: () => {}, stop: () => {}, setSimSpeed: () => {}, setMoney: () => {}, setPopulation: () => {},
  placeBuilding: () => {}, removeBuilding: () => {}, selectBuildingType: () => {},
  placeRoad: () => {}, removeRoad: () => {}, placeFarmZone: () => {}, removeFarmZone: () => {},
  selectFarmZone: () => {}, setFarmCrop: () => {}, setTaxRates: () => {},
  selectTool: () => {}, selectBuilding: () => {}, selectCitizen: () => {},
  setMarketConfig: () => {}, selectRoadMode: () => {}, upgradeBuilding: () => {},
  selectTerrainTile: () => {},
})

// --- Provider -------------------------------------------------------------
export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CityState>(initial)
  const interval = useRef<number | null>(null)

  useEffect(() => {
    if (state.running && interval.current == null) {
      interval.current = window.setInterval(() => {
        setState(s => applyTickResult(runTickChain(buildTickContext(s))))
      }, Math.round(SIM_TICK_MS / state.simSpeed))
    }
    if (!state.running && interval.current != null) { window.clearInterval(interval.current); interval.current = null }
    return () => { if (interval.current != null) { window.clearInterval(interval.current); interval.current = null } }
  }, [state.running, state.simSpeed])

  function start()  { setState(s => ({ ...s, running: true })) }
  function stop()   { setState(s => ({ ...s, running: false })) }
  function setSimSpeed(v: number) { setState(s => ({ ...s, simSpeed: v })) }
  function setMoney(v: number)    { setState(s => ({ ...s, money: v })) }
  function setPopulation(v: number) { setState(s => ({ ...s, population: v })) }

  function placeBuilding(x: number, y: number, type?: BuildingType) {
    const action = { type: 'placeBuilding', x, y, buildType: type ?? null, success: false, reason: '' }
    try {
      setState(s => {
        const bt = type ?? s.selectedBuildingType
        const ba = { success: false, reason: '', buildType: bt, x, y, ts: Date.now() }
        if (!bt) { action.reason = 'no-build-type-selected'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        const def = BUILDING_DEFS[bt]
        if (!def) { action.reason = 'no-build-type-selected'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        const { w: bw, h: bh } = getBuildingSize(bt)
        const isMtn = isMountainAt(x, y)
        // 只有民居在山地建造才翻倍；矿山、采木场等山地专属建筑不受惩罚
        const isMtnPenalized = isMtn && bt === 'house'
        const mountainMultiplier = (worldGenConfig.building?.mountainMultiplier) || 1
        const effectiveCost = Math.ceil(def.cost * (isMtnPenalized ? mountainMultiplier : 1))
        if (s.money < effectiveCost) { action.reason = 'insufficient-funds'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        // check every tile of footprint
        for (let dx = 0; dx < bw; dx++) {
          for (let dy = 0; dy < bh; dy++) {
            const tx = x + dx, ty = y + dy
            if (isBuildingAt(s.buildings, tx, ty))                       { action.reason = 'tile-occupied';  return { ...s, lastBuildAttempt: { ...ba, reason: 'tile-occupied' } } }
            if (isRoadAt(s.roads, tx, ty))                               { action.reason = 'road-occupied';  return { ...s, lastBuildAttempt: { ...ba, reason: 'road-occupied' } } }
            if (isRiverAt(tx, ty))                                       { action.reason = 'river-occupied'; return { ...s, lastBuildAttempt: { ...ba, reason: 'river-occupied' } } }
            if (s.farmZones.some(z => z.x === tx && z.y === ty))         { action.reason = 'tile-occupied';  return { ...s, lastBuildAttempt: { ...ba, reason: 'tile-occupied' } } }
          }
        }
        if (bt === 'mine'                  && !isOreVeinAt(x, y))  { action.reason = 'no-ore-vein';     return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        if ((bt as string) === 'lumbercamp' && !isAnyForestAt(x, y))  { action.reason = 'no-forest';       return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        if ((bt as string) === 'papermill'  && !isNearRiverFive(x, y)) { action.reason = 'no-river-access'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        if ((bt as string) === 'manor') {
          if (s.cityWenmai < 30) { action.reason = 'no-wenmai'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
          if (s.cityShangmai < 30) { action.reason = 'no-shangmai'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } } }
        }
        if ((bt as string) === 'academy') {
          const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - x), Math.abs(by - y))
          if (!s.buildings.some(b => (b.type as string) === 'papermill' && cheb(b.x, b.y) <= 20)) {
            action.reason = 'no-papermill'; return { ...s, lastBuildAttempt: { ...ba, reason: action.reason } }
          }
        }
        const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
        const newB = { id, type: bt, x, y, w: bw, h: bh, level: 1, capacity: def.capacity, occupants: 0, workerSlots: def.workerSlots, cost: effectiveCost }
        const isResidential = bt === 'house' || bt === 'manor'
        const houseFood    = isResidential ? { ...s.houseFood,    [id]: bt === 'manor' ? 30 : 15 }  : s.houseFood
        const houseCrops   = isResidential ? { ...s.houseCrops,   [id]: { rice: bt === 'manor' ? 30 : 15, millet: 0, wheat: 0, soybean: 0, vegetable: 0, tea: 0 } } : s.houseCrops
        const houseSavings = isResidential ? { ...s.houseSavings, [id]: bt === 'manor' ? 200 : 50 } : s.houseSavings
        const houseTools   = isResidential ? { ...s.houseTools,   [id]: 0 }                          : s.houseTools
        const houseDead    = isResidential ? { ...s.houseDead,    [id]: 0 }                          : s.houseDead
        const marketConfig = bt === 'market' ? { ...s.marketConfig, [id]: { ...DEFAULT_MARKET_CFG } } : s.marketConfig
        // 新建集市时，注入启动库存（米 30 担），让集市开业即有货
        const marketInventory = bt === 'market'
          ? { ...s.marketInventory, rice: clampCrop(s.marketInventory.rice + 30) }
          : s.marketInventory
        // 新建粮仓时，注入启动库存，避免粮仓一开始空空如也
        const granaryInventory = bt === 'granary'
          ? { ...s.granaryInventory, rice: clampCrop(s.granaryInventory.rice + 50), wheat: clampCrop(s.granaryInventory.wheat + 20) }
          : s.granaryInventory
        action.success = true
        return { ...s, buildings: [...s.buildings, newB], houseFood, houseCrops, houseSavings, houseTools, houseDead, marketConfig, marketInventory, granaryInventory, money: s.money - effectiveCost, monthlyConstructionCost: s.monthlyConstructionCost + effectiveCost, lastBuildAttempt: { ...ba, success: true } }
      })
    } finally { try { (window as any).__LAST_ACTION__ = action } catch { /* */ } }
    return action
  }

  function removeBuilding(id: string) {
    setState(s => {
      const bldg = s.buildings.find(b => b.id === id); if (!bldg) return s
      const isHouse = bldg.type === 'house' || bldg.type === 'manor'
      const houseFood:    Record<string, number>        = { ...s.houseFood }
      const houseCrops:   Record<string, CropInventory> = Object.fromEntries(Object.entries(s.houseCrops).map(([k, v]) => [k, { ...v }]))
      const houseSavings: Record<string, number>        = { ...s.houseSavings }
      const houseTools:   Record<string, number>        = { ...s.houseTools }
      const houseDead:    Record<string, number>        = { ...s.houseDead }
      const { [id]: _mc, ...marketConfig } = s.marketConfig
      const migrants = s.migrants.filter(m => m.targetHouseId !== id)
      const peddlers = s.peddlers.filter(p => p.marketId !== id)
      let citizens = s.citizens.map(c => ({ ...c }))
      let walkers  = s.walkers
      const evictedIds = new Set<string>()
      if (isHouse) {
        const displaced = s.citizens.filter(c => c.houseId === id)
        const otherHouses = s.buildings.filter(h => h.type === 'house' && h.id !== id)
        const occByHouse = new Map<string, number>()
        for (const c of s.citizens) { if (c.houseId !== id) occByHouse.set(c.houseId, (occByHouse.get(c.houseId) ?? 0) + 1) }
        const n = displaced.length || 1
        const foodShare = (houseFood[id] ?? 0) / n, savingsShare = (houseSavings[id] ?? 0) / n
        const cropsSource = houseCrops[id]; let toolsToGive = houseTools[id] ?? 0
        for (const c of displaced) {
          const found = otherHouses.filter(h => (occByHouse.get(h.id) ?? 0) < h.capacity).sort((a, z) => (z.capacity-(occByHouse.get(z.id)??0)) - (a.capacity-(occByHouse.get(a.id)??0)))[0] ?? null
          if (found) {
            const idx = citizens.findIndex(x => x.id === c.id)
            if (idx >= 0) citizens[idx] = { ...citizens[idx], houseId: found.id }
            occByHouse.set(found.id, (occByHouse.get(found.id) ?? 0) + 1)
            houseFood[found.id]    = clampFood((houseFood[found.id] ?? 0) + foodShare)
            houseSavings[found.id] = (houseSavings[found.id] ?? 0) + savingsShare
            if (cropsSource) {
              const hc = houseCrops[found.id] ?? createEmptyInventory()
              for (const k of CROP_KEYS) hc[k] = clampCrop(hc[k] + (cropsSource[k] / n))
              houseCrops[found.id] = hc
            }
            if (toolsToGive > 0) { houseTools[found.id] = (houseTools[found.id] ?? 0) + toolsToGive; toolsToGive = 0 }
          } else { evictedIds.add(c.id) }
        }
        citizens = citizens.filter(c => !evictedIds.has(c.id))
        walkers  = walkers.filter(w => !evictedIds.has(w.citizenId))
      } else {
        citizens = citizens.map(c => c.workplaceId === id ? { ...c, workplaceId: null, profession: null, isAtHome: true } : c)
        const workerIds = new Set(s.citizens.filter(c => c.workplaceId === id).map(c => c.id))
        walkers = walkers.filter(w => !(workerIds.has(w.citizenId) && w.purpose === 'toWork'))
      }
      delete houseFood[id]; delete houseCrops[id]; delete houseSavings[id]; delete houseTools[id]; delete houseDead[id]
      return { ...s, buildings: s.buildings.filter(b => b.id !== id), citizens, migrants, walkers, peddlers, houseFood, houseCrops, houseSavings, houseTools, houseDead, marketConfig, population: citizens.length, selectedBuildingId: null, selectedCitizenId: s.selectedCitizenId && !citizens.some(c => c.id === s.selectedCitizenId) ? null : s.selectedCitizenId }
    })
  }

  function selectBuildingType(t: BuildingType | null) { setState(s => ({ ...s, selectedBuildingType: t })) }
  function selectBuilding(id: string | null) { setState(s => ({ ...s, selectedBuildingId: id, selectedCitizenId: id ? null : s.selectedCitizenId, selectedFarmZoneId: id ? null : s.selectedFarmZoneId, selectedTerrainTile: null })) }
  function selectCitizen(id: string | null) { setState(s => ({ ...s, selectedCitizenId: id, selectedBuildingId: id ? null : s.selectedBuildingId, selectedFarmZoneId: id ? null : s.selectedFarmZoneId, selectedTerrainTile: null })) }
  function selectFarmZone(id: string | null) { setState(s => ({ ...s, selectedFarmZoneId: id, selectedBuildingId: id ? null : s.selectedBuildingId, selectedCitizenId: id ? null : s.selectedCitizenId, selectedTerrainTile: null })) }
  function selectTerrainTile(t: { x: number; y: number; kind: 'forest' | 'grassland' | 'ore' | 'mountainForest' } | null) {
    setState(s => ({ ...s, selectedTerrainTile: t, selectedBuildingId: null, selectedCitizenId: null, selectedFarmZoneId: null }))
  }
  function setTaxRates(rates: { ding: number; tian: number; shang: number }) { setState(s => ({ ...s, taxRates: rates })) }
  function setMarketConfig(id: string, cfg: MarketConfig) { setState(s => ({ ...s, marketConfig: { ...s.marketConfig, [id]: cfg } })) }
  function setFarmCrop(id: string, crop: CropType) {
    setState(s => ({ ...s, farmZones: s.farmZones.map(z => {
      if (z.id !== id) return z
      return z.growthProgress === 0 ? { ...z, cropType: crop, pendingCropType: undefined } : { ...z, pendingCropType: crop }
    }) }))
  }
  function placeRoad(x: number, y: number) {
    const action = { type: 'placeRoad', x, y, success: false, reason: '' }
    try {
      setState(s => {
        if (isRoadAt(s.roads, x, y) || isBuildingAt(s.buildings, x, y)) { action.reason = 'tile-occupied'; return s }
        if (tileInFarmZone(s.farmZones, x, y)) { action.reason = 'tile-occupied'; return s }
        if (isRiverAt(x, y)) {
          const span = getBridgeSpan(s.roads, x, y), cost = BRIDGE_BASE_COST * span
          if (s.money < cost) { action.reason = 'insufficient-funds'; return s }
          action.success = true
          return { ...s, roads: [...s.roads, { x, y }], money: s.money - cost, monthlyConstructionCost: s.monthlyConstructionCost + cost }
        }
        if (isMountainAt(x, y)) {
          const per  = (worldGenConfig.road?.mountainPerTileCost)        || 120
          const mult = (worldGenConfig.road?.mountainCostMultiplier) || 3
          const cost = Math.ceil(per + per * mult * (getMountainHeight(x, y) || 0))
          if (s.money < cost) { action.reason = 'insufficient-funds'; return s }
          action.success = true
          return { ...s, roads: [...s.roads, { x, y }], money: s.money - cost, monthlyConstructionCost: s.monthlyConstructionCost + cost }
        }
        // 平地修路：若为林地则额外收伐木费
        if (isForestAt(x, y)) {
          if (s.money < FOREST_CLEAR_COST) { action.reason = 'insufficient-funds'; return s }
          action.success = true
          return { ...s, roads: [...s.roads, { x, y }], money: s.money - FOREST_CLEAR_COST, monthlyConstructionCost: s.monthlyConstructionCost + FOREST_CLEAR_COST }
        }
        action.success = true
        return { ...s, roads: [...s.roads, { x, y }] }
      })
    } finally { try { (window as any).__LAST_ACTION__ = action } catch { /* */ } }
    return (window as any).__LAST_ACTION__
  }
  function removeRoad(x: number, y: number) { setState(s => ({ ...s, roads: s.roads.filter(r => !(r.x === x && r.y === y)) })) }
  function placeFarmZone(x: number, y: number, zoneType: 'grain' | 'tea' = 'grain') {
    setState(s => {
      const footprint = [{ x, y }, { x: x+1, y }, { x, y: y+1 }, { x: x+1, y: y+1 }]
      for (const t of footprint) {
        if (isRiverAt(t.x, t.y)) return s
        if (isBuildingAt(s.buildings, t.x, t.y) || isRoadAt(s.roads, t.x, t.y) || tileInFarmZone(s.farmZones, t.x, t.y)) return s
      }
      if (zoneType === 'tea') {
        // ── 茶园：2×2 必须全为山地 ────────────────────────────────────────
        if (!footprint.every(t => isMountainAt(t.x, t.y))) return s
        const id = `fz-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        return { ...s, farmZones: [...s.farmZones, { id, x, y, zoneType: 'tea' as const, cropType: 'tea' as const, growthProgress: 0 }] }
      } else {
        // ── 粮田：不能有山地，必须在河流三格之内 ─────────────────────────
        if (footprint.some(t => isMountainAt(t.x, t.y))) return s
        if (!footprint.some(t => isNearRiverFive(t.x, t.y))) return s
        const nearRiverAdj = footprint.some(t => isNearRiver(t.x, t.y))
        const cropType: CropType = nearRiverAdj ? 'rice' : cropForTile(x, y)
        const id = `fz-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        return { ...s, farmZones: [...s.farmZones, { id, x, y, zoneType: 'grain' as const, cropType, growthProgress: 0 }] }
      }
    })
  }
  function removeFarmZone(x: number, y: number) {
    setState(s => {
      const zone = farmZoneAt(s.farmZones, x, y); if (!zone) return s
      const farmerIds = new Set(s.citizens.filter(c => c.farmZoneId === zone.id).map(c => c.id))
      return {
        ...s,
        farmZones: s.farmZones.filter(z => z.id !== zone.id),
        citizens: s.citizens.map(c => c.farmZoneId === zone.id ? { ...c, farmZoneId: null, profession: null, isAtHome: true } : c),
        walkers: s.walkers.filter(w => !(farmerIds.has(w.citizenId) && w.purpose === 'toWork')),
        selectedFarmZoneId: s.selectedFarmZoneId === zone.id ? null : s.selectedFarmZoneId,
      }
    })
  }
  function selectTool(t: Tool) {
    const isBT = ALL_BUILDING_TYPES.includes(t as BuildingType)
    const keepSelection = t === 'pan' || t === 'farmZone' || t === 'teaZone'
    setState(s => ({ ...s, selectedTool: t, selectedBuildingType: isBT ? (t as BuildingType) : null, selectedBuildingId: keepSelection ? s.selectedBuildingId : null, selectedCitizenId: keepSelection ? s.selectedCitizenId : null, selectedFarmZoneId: keepSelection ? s.selectedFarmZoneId : null, selectedTerrainTile: keepSelection ? s.selectedTerrainTile : null }))
  }
  function selectRoadMode(mode: 'around' | 'over') { setState(s => ({ ...s, selectedRoadMode: mode })) }

  // ── 升级建筑 ──────────────────────────────────────────────────────────────
  const UPGRADE_TABLE: Partial<Record<string, { maxLevel: number; costs: number[]; workerSlots: number[] }>> = {
    market:  { maxLevel: 2, costs: [800], workerSlots: [12] },
    granary: { maxLevel: 2, costs: [600], workerSlots: [6]  },
  }
  /** 各建筑升到下一等级所需的前置建筑类型（key=当前建筑类型，value=每次升级的前置列表） */
  const UPGRADE_PREREQS: Partial<Record<string, string[][]>> = {
    // 常平仓→太仓：须有书院（需要懂算账的人才管理大型储粮）
    granary: [['academy']],
  }
  function upgradeBuilding(id: string) {
    setState(s => {
      const b = s.buildings.find(b => b.id === id); if (!b) return s
      const info = UPGRADE_TABLE[b.type]; if (!info) return s
      const cur = b.level ?? 1; if (cur >= info.maxLevel) return s
      // 前置条件检查
      const prereqList = UPGRADE_PREREQS[b.type]?.[cur - 1] ?? []
      for (const req of prereqList) {
        if (!s.buildings.some(bd => (bd.type as string) === req)) return s
      }
      const cost = info.costs[cur - 1] ?? 0
      if (s.money < cost) return s
      return {
        ...s,
        buildings: s.buildings.map(bd => bd.id === id
          ? { ...bd, level: cur + 1, workerSlots: info.workerSlots[cur - 1] ?? bd.workerSlots }
          : bd),
        money: s.money - cost,
        monthlyConstructionCost: s.monthlyConstructionCost + cost,
      }
    })
  }

  try { if (typeof window !== 'undefined') (window as any).__CITY_STATE__ = state } catch { /* */ }

  useLayoutEffect(() => {
    try {
      ;(window as any).__CITY_STATE__     = state
      ;(window as any).__GET_CITY_STATE__ = () => state
      ;(window as any).__LAST_ACTION__    = (window as any).__LAST_ACTION__ || null
      ;(window as any).__TEST_API__ = {
        placeBuilding: (x: number, y: number) => { placeBuilding(x, y); return (window as any).__LAST_ACTION__ },
        placeRoad:     (x: number, y: number) => { placeRoad(x, y); return true },
        placeFarmZone: (x: number, y: number) => { placeFarmZone(x, y); return true },
        selectTool:    (t: Tool) => { selectTool(t); return true },
        setMoney:      (v: number) => { setMoney(v); return true },
        setDayTime:    (v: number) => { setState(s => ({ ...s, dayTime: Math.max(0, Math.min(0.999, v)) })); return true },
        setHouseFood:  (houseId: string, v: number) => { setState(s => ({ ...s, houseFood: { ...s.houseFood, [houseId]: v } })); return true },
        selectBuilding:(id: string | null) => { selectBuilding(id); return true },
        selectCitizen: (id: string | null) => { selectCitizen(id); return true },
        applyToolAt:   (x: number, y: number, tool?: Tool) => {
          const at = tool ?? state.selectedTool
          if (ALL_BUILDING_TYPES.includes(at as BuildingType)) {
            const bt = at as BuildingType
            const action = { type: 'placeBuilding', x, y, buildType: bt, success: false, reason: '' }
            setState(s => {
              const def = BUILDING_DEFS[bt]
              if (s.money < def.cost || isBuildingAt(s.buildings, x, y) || isRoadAt(s.roads, x, y) || s.farmZones.some(z => z.x === x && z.y === y)) return s
              const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
              const { w: bw2, h: bh2 } = getBuildingSize(bt)
              const isRes = bt === 'house' || bt === 'manor'
              const houseFood = isRes ? { ...s.houseFood, [id]: bt === 'manor' ? 30 : 15 } : s.houseFood
              action.success = true
              return { ...s, buildings: [...s.buildings, { id, type: bt, x, y, w: bw2, h: bh2, level: 1, capacity: def.capacity, occupants: 0, workerSlots: def.workerSlots, cost: def.cost }], houseFood, money: s.money - def.cost, monthlyConstructionCost: s.monthlyConstructionCost + def.cost }
            })
            try { (window as any).__LAST_ACTION__ = action } catch { /* */ }
            return action
          }
          if (at === 'road') { placeRoad(x, y); return true }
          if (at === 'farmZone') { placeFarmZone(x, y); return true }
          if (at === 'bulldoze') {
            const snap = state
            const b = snap.buildings.find(v => v.x === x && v.y === y)
            if (b) { removeBuilding(b.id); return true }
            if (snap.roads.some(r => r.x === x && r.y === y)) { removeRoad(x, y); return true }
            if (farmZoneAt(snap.farmZones, x, y)) { removeFarmZone(x, y); return true }
            return true
          }
          return true
        },
        getState: () => state,
      }
    } catch { /* */ }
  }, [state])

  return (
    <SimulationContext.Provider value={{ state, start, stop, setSimSpeed, setMoney, setPopulation, placeBuilding, removeBuilding, selectBuildingType, placeRoad, removeRoad, placeFarmZone, removeFarmZone, selectFarmZone, setFarmCrop, setTaxRates, setMarketConfig, selectTool, selectBuilding, selectCitizen, selectRoadMode, upgradeBuilding, selectTerrainTile }}>
      {children}
    </SimulationContext.Provider>
  )
}

export function useSimulation() { return useContext(SimulationContext) }

