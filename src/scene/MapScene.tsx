/**
 * MapScene - pure scene orchestrator.
 *
 * Owns:  viewport culling, user input, pathfinding dispatch, building mesh dispatch
 * Delegates rendering to dedicated layer components:
 *   DayNightLighting / NightOverlay  - lighting + sky
 *   TerrainLayer                     - tiles, mountains, river, ore veins
 *   RoadLayer                        - roads, bridges, placement ghost, A* preview
 *   FarmLayer                        - farm zones, crop piles, farmers
 *   OverlayLayer                     - sick markers, selection rings
 *   CharacterLayer                   - walkers, migrants, residents, ox carts, peddlers
 */
import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  useSimulation,
  logicalMigrantPos, logicalWalkerPos, logicalOxCartPos, logicalMarketBuyerPos, logicalPeddlerPos,
  RIVER_TILES, RIVER_CENTER_LINE,
  MOUNTAIN_TILES, ORE_VEIN_TILES, FOREST_TILES, GRASSLAND_TILES, MOUNTAIN_FOREST_TILES,
  isRiverAt, isNearRiverFive, isMountainAt, isForestAt, isGrasslandAt, isOreVeinAt,
  MAP_SIZE_X, MAP_SIZE_Y,
  ALL_BUILDING_TYPES, type BuildingType, type CityState,
  FOREST_CLEAR_COST, ORE_VEIN_INITIAL_HEALTH, FOREST_TILE_INITIAL_HEALTH, GRASSLAND_TILE_INITIAL_HEALTH,
} from '../state/simulation'
import type { ResourceOverlayTile } from './TerrainLayer'
import { tileH } from '../config/characters/_shared'
import { SpatialBST, type RangeRect } from './spatialBst'
import { BuildingGLBRenderer, hasBuildingGLB } from './BuildingRenderer'
import { BUILDING_MESH_REGISTRY } from '../config/buildings/_registry'
import { message } from 'antd'
// --- Layer components ------------------------------------------------------
import { DayNightLighting, NightOverlay } from './DayNight'
import { TerrainLayer } from './TerrainLayer'
import { RoadLayer } from './RoadLayer'
import { FarmLayer, type FarmerItem } from './FarmLayer'
import { OverlayLayer, type RingInfo, type SickHouseInfo } from './OverlayLayer'
import { CharacterLayer, type ResidentRenderItem } from './CharacterLayer'
// --- Pathfinding ------------------------------------------------------------
import { astarRoad, rasterLine, expandToFourNeighborPath } from './pathfinding'

// --- Module-level window globals (read by Playwright e2e tests) ------------
if (typeof window !== 'undefined') {
  ;(window as any).__RIVER_CENTER_LINE__ = RIVER_CENTER_LINE
  ;(window as any).__RIVER_TILES__       = RIVER_TILES
  ;(window as any).__MAP_DEBUG__         = (window as any).__MAP_DEBUG__ || {}
}

// ===========================================================================
// MapScene
// ===========================================================================

export default function MapScene() {
  const halfX = Math.floor(MAP_SIZE_X / 2)
  const halfY = Math.floor(MAP_SIZE_Y / 2)

  // All tile coords (constant, depends only on map size)
  const tiles = React.useMemo<[number, number][]>(() => {
    const all: [number, number][] = []
    for (let i = -halfX; i < halfX; i++)
      for (let j = -halfY; j < halfY; j++) all.push([i, j])
    return all
  }, [])  // MAP_SIZE constants are module-level - no deps needed

  const {
    state,
    placeBuilding, placeRoad, removeBuilding, removeRoad,
    placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectTool, selectFarmZone,
    selectTerrainTile,
  } = useSimulation()
  const { gl, camera, scene } = useThree()

  // --- Stable refs (prevent event-listener re-registration on every render) -
  const stateRef   = React.useRef(state)
  const actionsRef = React.useRef({
    placeBuilding, placeRoad, removeBuilding, removeRoad,
    placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone,
    selectTerrainTile,
  })
  const dragRef          = React.useRef({ active: false, didDrag: false, lastTileKey: '',
                                          lastTile: null as null | { x: number; y: number } })
  const objectClickedRef = React.useRef(false)

  // Road drag-preview (React state for rendering, ref for event handlers)
  const [roadPreview, setRoadPreview]    = React.useState<{ x: number; y: number }[]>([])
  const roadPreviewRef                   = React.useRef<{ x: number; y: number }[]>([])
  const roadDragStartRef                 = React.useRef<{ x: number; y: number } | null>(null)

  // Ghost placement mouse tracking
  const mouseNDCRef      = React.useRef({ x: 0, y: 0 })
  const mouseOnCanvasRef = React.useRef(false)

  // Viewport rect updated by useFrame -> drives all visible* memos
  const [viewRect, setViewRect] = React.useState<RangeRect>({ minX: -16, maxX: 16, minY: -12, maxY: 12 })
  const cullMargin = 3.5

  // --- Spatial BSTs ----------------------------------------------------------
  const tileTree     = React.useMemo(() => SpatialBST.fromItems(tiles.map(t => ({ x: t[0], y: t[1], value: t }))), [tiles])
  const roadTree     = React.useMemo(() => SpatialBST.fromItems(state.roads.map(r => ({ x: r.x, y: r.y, value: r }))), [state.roads])
  const buildingTree = React.useMemo(() => SpatialBST.fromItems(state.buildings.map(b => ({ x: b.x, y: b.y, value: b }))), [state.buildings])
  const mountainTree   = React.useMemo(() => SpatialBST.fromItems(MOUNTAIN_TILES.map(t => ({ x: t.x, y: t.y, value: [t.x, t.y] as [number, number] }))), [])
  const oreVeinTree    = React.useMemo(() => SpatialBST.fromItems(ORE_VEIN_TILES.map(t => ({ x: t.x, y: t.y, value: t }))), [])
  const forestTree     = React.useMemo(() => SpatialBST.fromItems(FOREST_TILES.map(t => ({ x: t.x, y: t.y, value: t }))), [])
  const grassTree      = React.useMemo(() => SpatialBST.fromItems(GRASSLAND_TILES.map(t => ({ x: t.x, y: t.y, value: t }))), [])
  const mtnForestTree  = React.useMemo(() => SpatialBST.fromItems(MOUNTAIN_FOREST_TILES.map(t => ({ x: t.x, y: t.y, value: t }))), [])

  // Resident render list (citizens currently at home)
  const houseMap = React.useMemo(
    () => new Map(state.buildings.filter(b => b.type === 'house').map(h => [h.id, h] as const)),
    [state.buildings],
  )
  const residentItems = React.useMemo<ResidentRenderItem[]>(() =>
    state.citizens
      .filter(c => c.isAtHome)
      .map(c => {
        const house = houseMap.get(c.houseId)
        if (!house) return null
        let hash = 0
        for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) | 0
        return { id: c.id, x: house.x, y: house.y, seed: Math.abs(hash % 1000) + 1 }
      })
      .filter((v): v is ResidentRenderItem => Boolean(v)),
    [state.citizens, houseMap],
  )
  const residentTree = React.useMemo(
    () => SpatialBST.fromItems(residentItems.map(r => ({ x: r.x, y: r.y, value: r }))),
    [residentItems],
  )

  // --- Cull rect -------------------------------------------------------------
  const cullRect = React.useMemo<RangeRect>(() => ({
    minX: viewRect.minX - cullMargin, maxX: viewRect.maxX + cullMargin,
    minY: viewRect.minY - cullMargin, maxY: viewRect.maxY + cullMargin,
  }), [viewRect])

  // --- Visible entity sets ---------------------------------------------------
  const visibleTiles          = React.useMemo(() => tileTree.rangeQuery(cullRect), [tileTree, cullRect])
  const visibleRoads          = React.useMemo(() => roadTree.rangeQuery(cullRect), [roadTree, cullRect])
  const visibleBridges        = React.useMemo(() => visibleRoads.filter(r => isRiverAt(r.x, r.y)), [visibleRoads])
  const visibleNonBridgeRoads = React.useMemo(() => visibleRoads.filter(r => !isRiverAt(r.x, r.y)), [visibleRoads])
  const visibleBuildings      = React.useMemo(() => buildingTree.rangeQuery(cullRect), [buildingTree, cullRect])
  const visibleResidents      = React.useMemo(() => residentTree.rangeQuery(cullRect), [residentTree, cullRect])
  const visibleMountainTiles  = React.useMemo(() => mountainTree.rangeQuery(cullRect), [mountainTree, cullRect])
  const visibleOreVeinTiles   = React.useMemo(() =>
    oreVeinTree.rangeQuery(cullRect).filter(t =>
      !state.buildings.some(b => b.x === t.x && b.y === t.y) &&
      (state.oreVeinHealth[`${t.x},${t.y}`] ?? ORE_VEIN_INITIAL_HEALTH) > 0),
    [oreVeinTree, cullRect, state.buildings, state.oreVeinHealth],
  )
  const visibleForestTiles    = React.useMemo(() =>
    forestTree.rangeQuery(cullRect).filter(t =>
      !state.buildings.some(b => b.x === t.x && b.y === t.y) &&
      !state.roads.some(r => r.x === t.x && r.y === t.y) &&
      (state.forestHealth[`${t.x},${t.y}`] ?? FOREST_TILE_INITIAL_HEALTH) > 0),
    [forestTree, cullRect, state.buildings, state.roads, state.forestHealth],
  )
  const visibleGrasslandTiles = React.useMemo(() =>
    grassTree.rangeQuery(cullRect).filter(t =>
      !state.buildings.some(b => b.x === t.x && b.y === t.y) &&
      !state.roads.some(r => r.x === t.x && r.y === t.y) &&
      (state.grasslandHealth[`${t.x},${t.y}`] ?? GRASSLAND_TILE_INITIAL_HEALTH) > 0),
    [grassTree, cullRect, state.buildings, state.roads, state.grasslandHealth],
  )

  const visibleMountainForestTiles = React.useMemo(() =>
    mtnForestTree.rangeQuery(cullRect).filter(t =>
      !state.buildings.some(b => b.x === t.x && b.y === t.y) &&
      !state.roads.some(r => r.x === t.x && r.y === t.y)),
    [mtnForestTree, cullRect, state.buildings, state.roads],
  )

  // Resource health overlay (shown when mine or lumbercamp is selected)
  const selectedBuilding = React.useMemo(
    () => state.buildings.find(b => b.id === state.selectedBuildingId),
    [state.buildings, state.selectedBuildingId],
  )
  const resourceOverlay = React.useMemo<ResourceOverlayTile[] | null>(() => {
    // ── Building-selected overlay (shows ALL tiles of type) ────────────────
    if (selectedBuilding) {
      if (selectedBuilding.type === 'mine') {
        return oreVeinTree.rangeQuery(cullRect).map(t => ({
          x: t.x, y: t.y,
          pct: (state.oreVeinHealth[`${t.x},${t.y}`] ?? ORE_VEIN_INITIAL_HEALTH) / ORE_VEIN_INITIAL_HEALTH,
        }))
      }
      if ((selectedBuilding.type as string) === 'lumbercamp') {
        return forestTree.rangeQuery(cullRect).map(t => ({
          x: t.x, y: t.y,
          pct: (state.forestHealth[`${t.x},${t.y}`] ?? FOREST_TILE_INITIAL_HEALTH) / FOREST_TILE_INITIAL_HEALTH,
        }))
      }
      return null
    }
    // ── Terrain-tile-selected overlay — 只高亮选中的那一格 ─────────────────
    const tt = state.selectedTerrainTile
    if (tt) {
      if (tt.kind === 'ore') {
        return [{ x: tt.x, y: tt.y,
          pct: (state.oreVeinHealth[`${tt.x},${tt.y}`] ?? ORE_VEIN_INITIAL_HEALTH) / ORE_VEIN_INITIAL_HEALTH,
        }]
      }
      if (tt.kind === 'forest') {
        return [{ x: tt.x, y: tt.y,
          pct: (state.forestHealth[`${tt.x},${tt.y}`] ?? FOREST_TILE_INITIAL_HEALTH) / FOREST_TILE_INITIAL_HEALTH,
        }]
      }
      if (tt.kind === 'grassland') {
        return [{ x: tt.x, y: tt.y,
          pct: (state.grasslandHealth[`${tt.x},${tt.y}`] ?? GRASSLAND_TILE_INITIAL_HEALTH) / GRASSLAND_TILE_INITIAL_HEALTH,
        }]
      }
    }
    return null
  }, [selectedBuilding, state.selectedTerrainTile, oreVeinTree, forestTree, cullRect, state.oreVeinHealth, state.forestHealth, state.grasslandHealth])

  // 粮田可开垦标记（河流三格内平地，去除道路、山地；仅粮田工具时显示）
  const visibleArableTiles = React.useMemo(() =>
    state.selectedTool === 'farmZone'
      ? visibleTiles
          .filter(t =>
            isNearRiverFive(t[0], t[1]) && !isMountainAt(t[0], t[1]) &&
            !state.roads.some(r => r.x === t[0] && r.y === t[1]))
          .map(t => ({ x: t[0], y: t[1] }))
      : [],
    [visibleTiles, state.roads, state.selectedTool],
  )
  // 茶园可开垦标记（山地，去除建筑与道路；仅茶园工具时显示）
  const visibleMountainArableTiles = React.useMemo(() =>
    state.selectedTool === 'teaZone'
      ? visibleMountainTiles
          .filter(([x, y]) =>
            !state.buildings.some(b => b.x === x && b.y === y) &&
            !state.roads.some(r => r.x === x && r.y === y))
          .map(([x, y]) => ({ x, y }))
      : [],
    [visibleMountainTiles, state.buildings, state.roads, state.selectedTool],
  )
  const visibleWalkers = React.useMemo(() => state.walkers.filter(w => {
    const p = logicalWalkerPos(w)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.walkers, cullRect])
  const visibleMigrants = React.useMemo(() => state.migrants.filter(m => {
    const p = logicalMigrantPos(m)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.migrants, cullRect])
  const visibleOxCarts = React.useMemo(() => state.oxCarts.filter(c => {
    const p = logicalOxCartPos(c)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.oxCarts, cullRect])
  const visibleMarketBuyers = React.useMemo(() => state.marketBuyers.filter(mb => {
    const p = logicalMarketBuyerPos(mb)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.marketBuyers, cullRect])
  const visiblePeddlers = React.useMemo(() => state.peddlers.filter(p => {
    const pos = logicalPeddlerPos(p)
    return pos.x >= cullRect.minX && pos.x <= cullRect.maxX && pos.y >= cullRect.minY && pos.y <= cullRect.maxY
  }), [state.peddlers, cullRect])
  const visibleFarmPiles = React.useMemo(() =>
    state.farmPiles.filter(p =>
      p.x >= cullRect.minX - 1 && p.x <= cullRect.maxX + 1 &&
      p.y >= cullRect.minY - 1 && p.y <= cullRect.maxY + 1,
    ), [state.farmPiles, cullRect],
  )

  // --- Farm derived data -----------------------------------------------------
  const visibleFarmZones = React.useMemo(() =>
    state.farmZones.filter(z =>
      z.x + 1 >= cullRect.minX && z.x <= cullRect.maxX &&
      z.y + 1 >= cullRect.minY && z.y <= cullRect.maxY,
    ), [state.farmZones, cullRect],
  )
  const farmersAtFarm = React.useMemo<FarmerItem[]>(() => {
    const walkerIds = new Set(state.walkers.map(w => w.citizenId))
    return state.citizens
      .filter(c => c.farmZoneId && !c.isAtHome && !walkerIds.has(c.id))
      .flatMap(c => {
        const zone = state.farmZones.find(z => z.id === c.farmZoneId)
        if (!zone) return []
        if (zone.x + 1 < cullRect.minX || zone.x > cullRect.maxX ||
            zone.y + 1 < cullRect.minY || zone.y > cullRect.maxY) return []
        let hash = 0
        for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) | 0
        return [{ id: c.id, x: zone.x + 0.5, y: zone.y + 0.5, seed: Math.abs(hash % 1000) + 1 }]
      })
  }, [state.citizens, state.farmZones, state.walkers, cullRect])

  const selectedFarmZoneTiles = React.useMemo(() => {
    const zone = state.selectedFarmZoneId
      ? state.farmZones.find(z => z.id === state.selectedFarmZoneId) : null
    if (!zone) return []
    return [
      { x: zone.x,     y: zone.y },     { x: zone.x + 1, y: zone.y },
      { x: zone.x,     y: zone.y + 1 }, { x: zone.x + 1, y: zone.y + 1 },
    ]
  }, [state.farmZones, state.selectedFarmZoneId])

  // --- Overlay derived data --------------------------------------------------
  const sickHouses = React.useMemo<SickHouseInfo[]>(() => {
    const sickHouseIds = new Set(state.citizens.filter(c => c.isSick).map(c => c.houseId))
    const deadEntries  = state.houseDead ?? {}
    const deadHouseIds = new Set(Object.entries(deadEntries).filter(([, v]) => v > 0).map(([k]) => k))
    const allAffected  = new Set([...sickHouseIds, ...deadHouseIds])
    return state.buildings
      .filter(b =>
        b.type === 'house' && allAffected.has(b.id) &&
        b.x + 1 >= cullRect.minX && b.x <= cullRect.maxX &&
        b.y + 1 >= cullRect.minY && b.y <= cullRect.maxY,
      )
      .map(b => ({ id: b.id, x: b.x, y: b.y, deadCount: deadEntries[b.id] ?? 0 }))
  }, [state.citizens, state.buildings, state.houseDead, cullRect])

  const selectedBuildingRing = React.useMemo<RingInfo | null>(() => {
    const b = state.selectedBuildingId
      ? state.buildings.find(x => x.id === state.selectedBuildingId) : null
    return b ? { x: b.x, y: b.y, color: '#faad14', r: 0.56 } : null
  }, [state.selectedBuildingId, state.buildings])

  const selectedCitizenRing = React.useMemo<RingInfo | null>(() => {
    const cid = state.selectedCitizenId
    if (!cid) return null
    const walker = state.walkers.find(w => w.citizenId === cid)
    if (walker) {
      const p = logicalWalkerPos(walker)
      return { x: p.x, y: p.y, color: '#69c0ff', r: 0.34 }
    }
    const farmer = farmersAtFarm.find(f => f.id === cid)
    if (farmer) return { x: farmer.x, y: farmer.y, color: '#69c0ff', r: 0.34 }
    const resident = visibleResidents.find(r => r.id === cid)
    if (resident) {
      const ox = Math.sin(resident.seed) * 0.22
      const oz = Math.cos(resident.seed * 1.7) * 0.22
      return { x: resident.x + ox, y: resident.y + oz, color: '#69c0ff', r: 0.34 }
    }
    // Fallback: citizen home position
    const citizen = state.citizens.find(c => c.id === cid)
    if (citizen) {
      const house = state.buildings.find(b => b.id === citizen.houseId)
      if (house) return { x: house.x, y: house.y, color: '#69c0ff', r: 0.34 }
    }
    return null
  }, [state.selectedCitizenId, state.walkers, farmersAtFarm, visibleResidents, state.citizens, state.buildings])

  // --- Effects: keep refs current --------------------------------------------
  React.useEffect(() => { stateRef.current = state }, [state])
  React.useEffect(() => {
    actionsRef.current = {
      placeBuilding, placeRoad, removeBuilding, removeRoad,
      placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone,
      selectTerrainTile,
    }
  }, [placeBuilding, placeRoad, removeBuilding, removeRoad, placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone, selectTerrainTile])

  // --- Effects: e2e test globals ---------------------------------------------
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).__ASTAR_ROAD__     = astarRoad
    ;(window as any).__IS_MOUNTAIN_AT__ = isMountainAt
  }, [])
  React.useEffect(() => {
    try {
      ;(window as any).__THREE_CAMERA__  = camera
      ;(window as any).__THREE_SCENE__   = scene
      ;(window as any).__MAP_TO_SCREEN__ = (x: number, y: number) => {
        const rect = gl.domElement.getBoundingClientRect()
        const proj = new THREE.Vector3(x, 0, y).project(camera as THREE.Camera)
        return {
          x: ((proj.x + 1) / 2) * rect.width  + rect.left,
          y: ((-proj.y + 1) / 2) * rect.height + rect.top,
        }
      }
    } catch {}
  }, [camera, scene, gl])

  // --- useFrame: viewport culling (10 Hz) ------------------------------------
  const cullClockRef = React.useRef(0)
  const planeRef     = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const raycasterRef = React.useRef(new THREE.Raycaster())
  const hitRef       = React.useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    cullClockRef.current += delta
    if (cullClockRef.current < 0.1) return
    cullClockRef.current = 0
    const rect = gl.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    const pts: { x: number; y: number }[] = []
    for (const [ndcX, ndcY] of corners) {
      raycasterRef.current.setFromCamera({ x: ndcX, y: ndcY } as any, camera as THREE.Camera)
      const ray = raycasterRef.current.ray
      const hit = ray.intersectPlane(planeRef.current, hitRef.current)
      if (!hit) {
        const { origin: o, direction: d } = ray
        let t: number
        const tY = Math.abs(d.y) > 1e-6 ? -o.y / d.y : -1
        if (tY > 0 && isFinite(tY) && tY < 1e7) { t = tY }
        else { t = Math.max(50, Math.min(10000, ((camera as any).far ?? 2000) * 0.5)) }
        ray.at(t, hitRef.current)
      }
      pts.push({ x: hitRef.current.x, y: hitRef.current.z })
    }

    const finitePts  = pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    const MAP_MIN_X  = -halfX, MAP_MAX_X = halfX - 1
    const MAP_MIN_Y  = -halfY, MAP_MAX_Y = halfY - 1
    let minX: number, maxX: number, minY: number, maxY: number

    if (finitePts.length >= 3) {
      minX = Math.floor(Math.min(...finitePts.map(p => p.x)))
      maxX = Math.ceil( Math.max(...finitePts.map(p => p.x)))
      minY = Math.floor(Math.min(...finitePts.map(p => p.y)))
      maxY = Math.ceil( Math.max(...finitePts.map(p => p.y)))
    } else {
      const rc = raycasterRef.current
      rc.setFromCamera({ x: 0, y: 0 } as any, camera as THREE.Camera)
      const ok = rc.ray.intersectPlane(planeRef.current, hitRef.current)
      const cx = ok ? hitRef.current.x : (camera.position.x ?? 0)
      const cy = ok ? hitRef.current.z : (camera.position.z ?? 0)
      const W  = Math.max(8,  Math.floor((MAP_MAX_X - MAP_MIN_X) * 0.2))
      const H  = Math.max(6,  Math.floor((MAP_MAX_Y - MAP_MIN_Y) * 0.15))
      minX = Math.floor(cx - W); maxX = Math.ceil(cx + W)
      minY = Math.floor(cy - H); maxY = Math.ceil(cy + H)
    }
    minX = Math.max(minX, MAP_MIN_X); maxX = Math.min(maxX, MAP_MAX_X)
    minY = Math.max(minY, MAP_MIN_Y); maxY = Math.min(maxY, MAP_MAX_Y)
    if (minX > maxX || minY > maxY) {
      const cx = Math.round((MAP_MIN_X + MAP_MAX_X) / 2)
      const cy = Math.round((MAP_MIN_Y + MAP_MAX_Y) / 2)
      minX = cx - 16; maxX = cx + 16; minY = cy - 12; maxY = cy + 12
    }
    setViewRect(prev => {
      if (Math.abs(prev.minX - minX) < 1 && Math.abs(prev.maxX - maxX) < 1 &&
          Math.abs(prev.minY - minY) < 1 && Math.abs(prev.maxY - maxY) < 1) return prev
      return { minX, maxX, minY, maxY }
    })
  })

  // --- Interaction effect (stable - only re-runs when gl / camera change) ----
  React.useEffect(() => {
    const plane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const raycaster  = new THREE.Raycaster()
    const intersectPt = new THREE.Vector3()

    function stopDrag() {
      dragRef.current.active = false
      dragRef.current.lastTileKey = ''
      dragRef.current.lastTile = null
    }

    /** Terrain-aware ray -> tile coord (handles mountain geometry via ray-march). */
    function getTile(e: MouseEvent): { x: number; y: number } | null {
      const rect = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera({
        x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      } as any, camera as THREE.Camera)
      const { origin: ro, direction: rd } = raycaster.ray
      if (rd.y >= 0) return null
      const STEP = 0.35
      for (let i = 1; i <= 700; i++) {
        const t  = i * STEP
        const px = ro.x + rd.x * t, py = ro.y + rd.y * t, pz = ro.z + rd.z * t
        const cx = Math.round(px), cz = Math.round(pz)
        if (py <= 0) {
          const t0 = -ro.y / rd.y
          return { x: Math.round(ro.x + rd.x * t0), y: Math.round(ro.z + rd.z * t0) }
        }
        const terrainH = isMountainAt(cx, cz) ? tileH(cx, cz) : 0
        if (py <= terrainH) return { x: cx, y: cz }
      }
      if (!raycaster.ray.intersectPlane(plane, intersectPt)) return null
      return { x: Math.round(intersectPt.x), y: Math.round(intersectPt.z) }
    }

    function applyTool(wx: number, wy: number) {
      const s    = stateRef.current
      const tool = s.selectedTool
      if (tool === 'pan') {
        const fz = s.farmZones.find(z => wx >= z.x && wx <= z.x + 1 && wy >= z.y && wy <= z.y + 1)
        if (fz) { actionsRef.current.selectFarmZone(fz.id); return }
        // ── Terrain tile selection ─────────────────────────────────────────
        if (isOreVeinAt(wx, wy)) { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'ore' }); return }
        if (isForestAt(wx, wy))  { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'forest' }); return }
        if (isGrasslandAt(wx, wy)) { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'grassland' }); return }
        actionsRef.current.selectBuilding(null)
        actionsRef.current.selectCitizen(null)
        actionsRef.current.selectFarmZone(null)
        actionsRef.current.selectTerrainTile(null)
        return
      }
      if (ALL_BUILDING_TYPES.includes(tool as BuildingType)) {
        const action = actionsRef.current.placeBuilding(wx, wy, tool as BuildingType)
        if (action && !action.success) {
          const reasonMap: Record<string, string> = {
            'no-build-type-selected': 'Please select a building type first.',
            'insufficient-funds':     'Not enough funds to build.',
            'tile-occupied':          'This tile is already occupied.',
            'road-occupied':          'A road exists here - bulldoze it first.',
            'river-occupied':         'Cannot build on a river tile.',
            'no-ore-vein':            'No ore vein here - iron mines must be on ore tiles.',
            'no-forest':              'No forest here - lumber camps must be on forest tiles.',
            'no-papermill':           'No paper mill within range - academy requires a 造纸坊 within 20 tiles.',
          }
          try { message.warning(reasonMap[action.reason] ?? action.reason) } catch {}
        }
      } else if (tool === 'road') {
        const isForest = isForestAt(wx, wy) && !stateRef.current.roads.some(r => r.x === wx && r.y === wy)
        actionsRef.current.placeRoad(wx, wy)
        if (isForest) {
          try { message.warning({ content: `🌲 伐木清路 · 额外耗费 ¥${FOREST_CLEAR_COST} 文`, duration: 2 }) } catch {}
        }
      } else if (tool === 'farmZone') {
        actionsRef.current.placeFarmZone(wx, wy, 'grain')
      } else if (tool === 'teaZone') {
        actionsRef.current.placeFarmZone(wx, wy, 'tea')
      } else if (tool === 'bulldoze') {
        const b = s.buildings.find(b => {
          const bw = b.w ?? 1, bh = b.h ?? 1
          return wx >= b.x && wx < b.x + bw && wy >= b.y && wy < b.y + bh
        })
        if (b) { actionsRef.current.removeBuilding(b.id); return }
        if (s.roads.some(r => r.x === wx && r.y === wy))       actionsRef.current.removeRoad(wx, wy)
        if (s.farmZones.some(z => z.x === wx && z.y === wy))   actionsRef.current.removeFarmZone(wx, wy)
      }
    }

    function paintRoad(tile: { x: number; y: number }) {
      const s = stateRef.current
      if (s.buildings.some(b => b.x === tile.x && b.y === tile.y)) return
      if (s.farmZones.some(z => tile.x >= z.x && tile.x <= z.x + 1 && tile.y >= z.y && tile.y <= z.y + 1)) return
      actionsRef.current.placeRoad(tile.x, tile.y)
    }
    function paintFarmZone(tile: { x: number; y: number }) {
      const s = stateRef.current
      if (s.buildings.some(b => b.x === tile.x && b.y === tile.y)) return
      if (s.roads.some(r => r.x === tile.x && r.y === tile.y)) return
      const zt = s.selectedTool === 'teaZone' ? 'tea' : 'grain'
      actionsRef.current.placeFarmZone(tile.x, tile.y, zt)
    }

    function onClick(e: MouseEvent) {
      if (objectClickedRef.current) { objectClickedRef.current = false; return }
      const tool = stateRef.current.selectedTool
      if ((tool === 'road' || tool === 'farmZone' || tool === 'teaZone') && dragRef.current.didDrag) {
        dragRef.current.didDrag = false; return
      }
      const t = getTile(e); if (t) applyTool(t.x, t.y)
    }

    function onMouseDown(e: MouseEvent) {
      const tool = stateRef.current.selectedTool
      if (tool !== 'road' && tool !== 'farmZone' && tool !== 'teaZone') return
      dragRef.current.active = true; dragRef.current.lastTileKey = ''; dragRef.current.lastTile = null
      const t = getTile(e); if (!t) return
      dragRef.current.lastTileKey = `${t.x},${t.y}`
      if (tool === 'road') {
        dragRef.current.didDrag  = false
        roadDragStartRef.current = t
        const preview = [t]; setRoadPreview(preview); roadPreviewRef.current = preview
      } else {
        dragRef.current.didDrag = true; dragRef.current.lastTile = t; paintFarmZone(t)
      }
    }

    function onMouseMove(e: MouseEvent) {
      const tool = stateRef.current.selectedTool
      if (!dragRef.current.active) return
      const t = getTile(e); if (!t) return
      const key = `${t.x},${t.y}`; if (key === dragRef.current.lastTileKey) return
      dragRef.current.lastTileKey = key

      if (tool === 'road' && roadDragStartRef.current) {
        dragRef.current.didDrag = true
        const start        = roadDragStartRef.current
        const endOnMtn     = isMountainAt(t.x, t.y)
        const startOnMtn   = isMountainAt(start.x, start.y)
        const s            = stateRef.current
        const blockedTiles = new Set<string>([
          ...s.buildings.map(b => `${b.x},${b.y}`),
          ...s.farmZones.flatMap(z => [
            `${z.x},${z.y}`, `${z.x+1},${z.y}`, `${z.x},${z.y+1}`, `${z.x+1},${z.y+1}`,
          ]),
        ])
        const path = astarRoad(start, t, !endOnMtn && !startOnMtn, blockedTiles)
        setRoadPreview(path); roadPreviewRef.current = path

      } else if (tool === 'farmZone' || tool === 'teaZone') {
        const from = dragRef.current.lastTile ?? t
        expandToFourNeighborPath(rasterLine(from, t)).forEach(paintFarmZone)
        dragRef.current.lastTile = t; dragRef.current.didDrag = true
      }
    }

    function onMouseUp() {
      if (dragRef.current.active && stateRef.current.selectedTool === 'road') {
        if (dragRef.current.didDrag && roadPreviewRef.current.length > 0) {
          for (const tile of roadPreviewRef.current) paintRoad(tile)
        }
        setRoadPreview([]); roadPreviewRef.current = []; roadDragStartRef.current = null
      }
      stopDrag()
    }

    function onMouseMoveGhost(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect()
      mouseNDCRef.current = {
        x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      }
      mouseOnCanvasRef.current = true
    }
    function onMouseLeaveGhost() { mouseOnCanvasRef.current = false }

    const c = gl.domElement
    c.addEventListener('click',      onClick)
    c.addEventListener('mousedown',  onMouseDown)
    c.addEventListener('mousemove',  onMouseMoveGhost)
    c.addEventListener('mouseleave', onMouseLeaveGhost)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    window.addEventListener('blur',      stopDrag)
    return () => {
      c.removeEventListener('click',      onClick)
      c.removeEventListener('mousedown',  onMouseDown)
      c.removeEventListener('mousemove',  onMouseMoveGhost)
      c.removeEventListener('mouseleave', onMouseLeaveGhost)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      window.removeEventListener('blur',      stopDrag)
      setRoadPreview([]); roadPreviewRef.current = []; roadDragStartRef.current = null
      stopDrag()
    }
  }, [gl, camera])

  // --- Building mesh dispatch ------------------------------------------------
  function buildingMesh(b: CityState['buildings'][number]) {
    const baseY = isMountainAt(b.x, b.y) ? tileH(b.x, b.y) : 0
    if (hasBuildingGLB(b.type))
      return <BuildingGLBRenderer key={b.id} type={b.type} x={b.x} y={b.y} baseY={baseY} />
    const Mesh = BUILDING_MESH_REGISTRY[b.type]
    if (!Mesh) return null
    return <Mesh key={b.id} x={b.x} y={b.y} baseY={baseY} level={b.level ?? 1} occupants={b.occupants} dayTime={state.dayTime} />
  }

  // --- Shared citizen-click handler ------------------------------------------
  function handleCitizenClick(citizenId: string, e: any) {
    e.stopPropagation()
    objectClickedRef.current = true
    selectTool('pan')
    selectBuilding(null)
    selectCitizen(state.selectedCitizenId === citizenId ? null : citizenId)
  }

  // --- Render ----------------------------------------------------------------
  return (
    <group>
      {/* Lighting + sky */}
      <DayNightLighting />
      <NightOverlay />

      {/* Ground, mountains, river, ore veins, arable overlay */}
      <TerrainLayer
        visibleTiles={visibleTiles}
        visibleMountainTiles={visibleMountainTiles}
        visibleOreVeinTiles={visibleOreVeinTiles}
        visibleForestTiles={visibleForestTiles}
        visibleMountainForestTiles={visibleMountainForestTiles}
        visibleGrasslandTiles={visibleGrasslandTiles}
        visibleArableTiles={visibleArableTiles}
        visibleMountainArableTiles={visibleMountainArableTiles}
        showTerrainOverlay={state.selectedTool === 'farmZone' || state.selectedTool === 'teaZone'}
        resourceOverlay={resourceOverlay}
      />

      {/* Farm zones, crop piles, farmers at work */}
      <FarmLayer
        farmZones={visibleFarmZones}
        selectedFarmZoneTiles={selectedFarmZoneTiles}
        farmersAtFarm={farmersAtFarm}
        farmPiles={visibleFarmPiles}
        selectedCitizenId={state.selectedCitizenId}
        onFarmerClick={handleCitizenClick}
      />

      {/* Roads, bridges, A* ghost preview, placement ghost */}
      <RoadLayer
        roads={visibleNonBridgeRoads}
        bridges={visibleBridges}
        roadPreview={roadPreview}
        tool={state.selectedTool}
        stateRef={stateRef}
        mouseNDCRef={mouseNDCRef}
        mouseOnCanvasRef={mouseOnCanvasRef}
      />

      {/* Buildings - click-interactive, objectClickedRef guard lives here */}
      {visibleBuildings.map(b => (
        <group key={b.id} onClick={(e: any) => {
          e.stopPropagation()
          objectClickedRef.current = true
          if (stateRef.current.selectedTool === 'bulldoze') {
            actionsRef.current.removeBuilding(b.id); return
          }
          selectTool('pan')
          selectCitizen(null)
          selectBuilding(state.selectedBuildingId === b.id ? null : b.id)
        }}>
          {buildingMesh(b)}
        </group>
      ))}

      {/* Sick markers + selection rings */}
      <OverlayLayer
        sickHouses={sickHouses}
        selectedBuildingRing={selectedBuildingRing}
        selectedCitizenRing={selectedCitizenRing}
      />

      {/* All mobile entities */}
      <CharacterLayer
        walkers={visibleWalkers}
        migrants={visibleMigrants}
        residents={visibleResidents}
        oxCarts={visibleOxCarts}
        marketBuyers={visibleMarketBuyers}
        peddlers={visiblePeddlers}
        selectedCitizenId={state.selectedCitizenId}
        onCitizenClick={handleCitizenClick}
      />
    </group>
  )
}

