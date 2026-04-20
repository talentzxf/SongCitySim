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
  logicalMigrantPos, logicalMotionPos, logicalAgentPos, logicalPeddlerStatePos,
  RIVER_TILES, RIVER_CENTER_LINE,
  MOUNTAIN_TILES, ORE_VEIN_TILES, FOREST_TILES, GRASSLAND_TILES, MOUNTAIN_FOREST_TILES,
  isRiverAt, isNearRiverFive, isMountainAt, isForestAt, isGrasslandAt, isOreVeinAt, isMountainForestAt,
  MAP_SIZE_X, MAP_SIZE_Y,
  ALL_BUILDING_TYPES, type BuildingType, type Building,
  FOREST_CLEAR_COST, ORE_VEIN_INITIAL_HEALTH, FOREST_TILE_INITIAL_HEALTH, GRASSLAND_TILE_INITIAL_HEALTH, resourceInitialHealth,
} from '../state/simulation'
import type { ResourceOverlayTile } from './TerrainLayer'
import { tileH } from '../config/characters/_shared'
import { SpatialBST, type RangeRect } from './spatialBst'
import { BuildingGLBRenderer, hasBuildingGLB } from './BuildingRenderer'
import { BUILDING_MESH_REGISTRY } from '../config/buildings/_registry'
// message API is bridged via window.__MESSAGE_API__ (set by MessageBridge in App.tsx)
// --- Layer components ------------------------------------------------------
import { DayNightLighting, NightOverlay } from './DayNight'
import { TerrainLayer } from './TerrainLayer'
import { RoadLayer } from './RoadLayer'
import { FarmLayer, type FarmerItem } from './FarmLayer'
import { OverlayLayer, type RingInfo, type SickHouseInfo } from './OverlayLayer'
import { CharacterLayer, type ResidentRenderItem } from './CharacterLayer'
// --- Level context ---------------------------------------------------------
import { useLevelContext } from '../levels/LevelContext'
// --- Pathfinding ------------------------------------------------------------
import { astarRoad, rasterLine, expandToFourNeighborPath } from './pathfinding'

// ===========================================================================
// CompassArrow — Genshin-style bouncing navigation marker for ore veins
// ===========================================================================
function CompassArrow({ x, y }: { x: number; y: number }) {
  const groupRef    = React.useRef<THREE.Group>(null)
  const ringMeshRef = React.useRef<THREE.Mesh>(null)
  const mat1Ref     = React.useRef<THREE.MeshStandardMaterial>(null)
  const mat2Ref     = React.useRef<THREE.MeshStandardMaterial>(null)
  const mat3Ref     = React.useRef<THREE.MeshStandardMaterial>(null)
  const ringMatRef  = React.useRef<THREE.MeshStandardMaterial>(null)
  const ageRef      = React.useRef(0)
  const baseH       = tileH(x, y)
  const FLOAT_H     = baseH + 3.2
  const DURATION    = 6 // seconds before the arrow fades away

  useFrame((_, delta) => {
    ageRef.current += delta
    const age = ageRef.current
    if (!groupRef.current) return

    // Bouncing: two harmonics for a natural spring feel
    const bounce = Math.sin(age * 5.5) * 0.42 + Math.sin(age * 11) * 0.10
    groupRef.current.position.y = FLOAT_H + bounce

    // Fade out in last 1.5 seconds
    const opacity = age < DURATION - 1.5 ? 1.0 : Math.max(0, (DURATION - age) / 1.5)
    const mats = [mat1Ref.current, mat2Ref.current, mat3Ref.current]
    for (const mat of mats) {
      if (!mat) continue
      mat.opacity = opacity
      mat.emissiveIntensity = 1.4 * opacity
    }
    if (ringMatRef.current)  ringMatRef.current.opacity = opacity * 0.75
    // Pulsing ground ring
    if (ringMeshRef.current) {
      const scale = 1 + Math.sin(age * 2.8) * 0.22
      ringMeshRef.current.scale.setScalar(scale)
    }
  })

  return (
    <>
      {/* Triple-chevron bouncing arrow (three downward cones) */}
      <group ref={groupRef} position={[x + 0.5, FLOAT_H, y + 0.5]}>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
          <coneGeometry args={[0.58, 0.92, 4]} />
          <meshStandardMaterial ref={mat1Ref} color="#ffd700" emissive="#ff9900" emissiveIntensity={1.4} transparent />
        </mesh>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, 0.80, 0]}>
          <coneGeometry args={[0.58, 0.92, 4]} />
          <meshStandardMaterial ref={mat2Ref} color="#ffd700" emissive="#ff9900" emissiveIntensity={1.4} transparent />
        </mesh>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, 1.60, 0]}>
          <coneGeometry args={[0.58, 0.92, 4]} />
          <meshStandardMaterial ref={mat3Ref} color="#ffd700" emissive="#ff9900" emissiveIntensity={1.4} transparent />
        </mesh>
      </group>
      {/* Pulsing ground ring */}
      <mesh ref={ringMeshRef} rotation={[-Math.PI / 2, 0, 0]} position={[x + 0.5, baseH + 0.06, y + 0.5]}>
        <ringGeometry args={[0.60, 1.05, 32]} />
        <meshStandardMaterial ref={ringMatRef} color="#ffd700" emissive="#ff9900" emissiveIntensity={0.9}
          transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  )
}

// --- Module-level window globals (read by Playwright e2e tests) ------------
if (typeof window !== 'undefined') {
  ;(window as any).__RIVER_CENTER_LINE__ = RIVER_CENTER_LINE
  ;(window as any).__RIVER_TILES__       = RIVER_TILES
  ;(window as any).__MAP_DEBUG__         = (window as any).__MAP_DEBUG__ || {}
}

// ===========================================================================
// BoundsOverlay — screen-space fragment shader that darkens everything outside
// the playable area.  A full-screen quad is rendered in clip/NDC space so it
// is completely independent of the camera orientation.  The frag shader
// reconstructs the world XZ position for each pixel by ray-casting through the
// inverse view-projection matrix and intersecting with the y=0 ground plane.
// ===========================================================================
interface FogBounds { minX: number; maxX: number; minY: number; maxY: number }

const BOUNDS_VERT = /* glsl */`
attribute vec3 position;
void main() {
  // Bypass all camera transforms — output NDC directly.
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`

const BOUNDS_FRAG = /* glsl */`
precision mediump float;
uniform mat4  uInvViewProj;
uniform vec2  uResolution;
uniform float uMinX;
uniform float uMaxX;
uniform float uMinZ;
uniform float uMaxZ;

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;

  vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 farH  = uInvViewProj * vec4(ndc,  1.0, 1.0);
  vec3 nearW = nearH.xyz / nearH.w;
  vec3 farW  = farH.xyz  / farH.w;
  vec3 dir   = farW - nearW;

  if (abs(dir.y) > 0.0001) {
    float t = -nearW.y / dir.y;
    if (t > 0.0) {
      vec3 hit = nearW + dir * t;

      // Signed distance to each edge (positive = inside)
      float dx = min(hit.x - uMinX, uMaxX - hit.x);
      float dz = min(hit.z - uMinZ, uMaxZ - hit.z);
      float dist = min(dx, dz);  // positive inside, negative outside

      // Fully inside → transparent
      if (dist >= 0.0) discard;

      // Soft edge: fade from 0 at boundary to full opacity at FADE units outside
      const float FADE = 5.0;
      float alpha = 0.75 * smoothstep(0.0, FADE, -dist);  // 0 at boundary, 0.75 far out
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      return;
    }
  }

  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.75);
}
`

function BoundsOverlay({ bounds }: { bounds: FogBounds }) {
  const { camera, gl } = useThree()
  const matRef = React.useRef<THREE.RawShaderMaterial | null>(null)

  const uniforms = React.useMemo(() => ({
    uInvViewProj: { value: new THREE.Matrix4() },
    uResolution:  { value: new THREE.Vector2() },
    uMinX: { value: bounds.minX - 0.5 },
    uMaxX: { value: bounds.maxX + 0.5 },
    uMinZ: { value: bounds.minY - 0.5 },
    uMaxZ: { value: bounds.maxY + 0.5 },
  }), [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])

  // Update bounds uniforms when they change
  React.useEffect(() => {
    uniforms.uMinX.value = bounds.minX - 0.5
    uniforms.uMaxX.value = bounds.maxX + 0.5
    uniforms.uMinZ.value = bounds.minY - 0.5
    uniforms.uMaxZ.value = bounds.maxY + 0.5
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, uniforms])

  // Update matrix + resolution every frame
  useFrame(() => {
    const mat = matRef.current
    if (!mat) return
    const vp = new THREE.Matrix4().multiplyMatrices(
      (camera as THREE.PerspectiveCamera).projectionMatrix,
      camera.matrixWorldInverse,
    )
    mat.uniforms.uInvViewProj.value.copy(vp).invert()
    const size = gl.getSize(new THREE.Vector2())
    mat.uniforms.uResolution.value.set(size.x * gl.getPixelRatio(), size.y * gl.getPixelRatio())
  })

  return (
    <mesh renderOrder={100} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <rawShaderMaterial
        ref={matRef}
        vertexShader={BOUNDS_VERT}
        fragmentShader={BOUNDS_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

// ===========================================================================
// PlayableBorder — thin gold outline at ground level showing the area boundary.
// ===========================================================================

function PlayableBorder({ bounds }: { bounds: FogBounds }) {
  const { minX, maxX, minY, maxY } = bounds
  const left  = minX - 0.5
  const right = maxX + 0.5
  const near  = minY - 0.5
  const far   = maxY + 0.5
  const Y = 0.15

  const geo = React.useMemo(() => {
    const pts = new Float32Array([
      left,  Y, near,
      right, Y, near,
      right, Y, far,
      left,  Y, far,
      left,  Y, near,
    ])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    return g
  }, [left, right, near, far])

  const mat = React.useMemo(
    () => new THREE.LineBasicMaterial({ color: '#c8a040', transparent: true, opacity: 0.85 }),
    [],
  )

  return <primitive object={new THREE.Line(geo, mat)} />
}

// --- Module-level static set: tiles truly covered by the visual river ribbon ---
// isRiverAt() includes edge tiles that the smooth curve doesn't visually reach;
// this set restricts bridges to tiles within 1.4 tiles of any river centre-line point.
const VISUAL_BRIDGE_TILE_SET: Set<string> = (() => {
  const out = new Set<string>()
  for (const { x, y } of RIVER_CENTER_LINE) {
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        if (Math.hypot(dx, dy) <= 1.4 && isRiverAt(x + dx, y + dy))
          out.add(`${x + dx},${y + dy}`)
  }
  return out
})()

// ===========================================================================
// MapScene
// ===========================================================================

export default function MapScene() {
  const halfX = Math.floor(MAP_SIZE_X / 2)
  const halfY = Math.floor(MAP_SIZE_Y / 2)

  // Level bounds (null = sandbox = full map)
  const { level } = useLevelContext()
  const levelBounds = level?.mapBounds ?? null
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

  // --- Compass marker (ore-vein navigator) -----------------------------------
  const [compassMarker, setCompassMarker] = React.useState<{ x: number; y: number } | null>(null)
  const lastCompassIdRef = React.useRef<number>(-1)
  const flyToRef         = React.useRef<{ x: number; y: number } | null>(null)
  // Auto-clear marker after 6 seconds
  React.useEffect(() => {
    if (!compassMarker) return
    const tid = setTimeout(() => setCompassMarker(null), 6200)
    return () => clearTimeout(tid)
  }, [compassMarker])

  const dragRef          = React.useRef({ active: false, didDrag: false, lastTileKey: '',
                                          lastTile: null as null | { x: number; y: number } })
  const objectClickedRef = React.useRef(false)

  // Road drag-preview (React state for rendering, ref for event handlers)
  const [roadPreview, setRoadPreview]    = React.useState<{ x: number; y: number }[]>([])
  const roadPreviewRef                   = React.useRef<{ x: number; y: number }[]>([])
  const roadDragStartRef                 = React.useRef<{ x: number; y: number } | null>(null)

  // Clear road preview + cancel drag when switching away from road tool
  React.useEffect(() => {
    if (state.selectedTool !== 'road') {
      setRoadPreview([])
      roadPreviewRef.current = []
      roadDragStartRef.current = null
      dragRef.current.active = false
      dragRef.current.didDrag = false
    }
    // Hide placement ghost immediately when switching to pan/non-building tool
    if (state.selectedTool === 'pan' || state.selectedTool === 'bulldoze') {
      mouseOnCanvasRef.current = false
    }
  }, [state.selectedTool])

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

  // --- O(1) tile-occupancy sets (only rebuild when buildings/roads actually change) ----
  const buildingTileSet = React.useMemo(
    () => new Set(state.buildings.map(b => `${b.x},${b.y}`)),
    [state.buildings],
  )
  const roadTileSet = React.useMemo(
    () => new Set(state.roads.map(r => `${r.x},${r.y}`)),
    [state.roads],
  )

  // --- Visible entity sets ---------------------------------------------------
  const visibleTiles          = React.useMemo(() => tileTree.rangeQuery(cullRect), [tileTree, cullRect])
  const visibleRoads          = React.useMemo(() => roadTree.rangeQuery(cullRect), [roadTree, cullRect])
  const visibleBridges        = React.useMemo(() => visibleRoads.filter(r => VISUAL_BRIDGE_TILE_SET.has(`${r.x},${r.y}`)), [visibleRoads])
  const visibleNonBridgeRoads = React.useMemo(() => visibleRoads.filter(r => !isRiverAt(r.x, r.y)), [visibleRoads])
  const visibleBuildings      = React.useMemo(() => buildingTree.rangeQuery(cullRect), [buildingTree, cullRect])
  const visibleResidents      = React.useMemo(() => residentTree.rangeQuery(cullRect), [residentTree, cullRect])
  const visibleMountainTiles  = React.useMemo(() => mountainTree.rangeQuery(cullRect), [mountainTree, cullRect])
  const visibleOreVeinTiles   = React.useMemo(() =>
    oreVeinTree.rangeQuery(cullRect).filter(t =>
      !buildingTileSet.has(`${t.x},${t.y}`) &&
      (state.terrainResources['ore']?.[`${t.x},${t.y}`] ?? ORE_VEIN_INITIAL_HEALTH) > 0),
    [oreVeinTree, cullRect, buildingTileSet, state.terrainResources],
  )
  const visibleForestTiles    = React.useMemo(() =>
    forestTree.rangeQuery(cullRect).filter(t =>
      !buildingTileSet.has(`${t.x},${t.y}`) &&
      !roadTileSet.has(`${t.x},${t.y}`) &&
      (state.terrainResources['forest']?.[`${t.x},${t.y}`] ?? FOREST_TILE_INITIAL_HEALTH) > 0),
    [forestTree, cullRect, buildingTileSet, roadTileSet, state.terrainResources],
  )
  const visibleGrasslandTiles = React.useMemo(() =>
    grassTree.rangeQuery(cullRect).filter(t =>
      !buildingTileSet.has(`${t.x},${t.y}`) &&
      !roadTileSet.has(`${t.x},${t.y}`) &&
      (state.terrainResources['grassland']?.[`${t.x},${t.y}`] ?? GRASSLAND_TILE_INITIAL_HEALTH) > 0),
    [grassTree, cullRect, buildingTileSet, roadTileSet, state.terrainResources],
  )
  const visibleMountainForestTiles = React.useMemo(() =>
    mtnForestTree.rangeQuery(cullRect).filter(t =>
      !buildingTileSet.has(`${t.x},${t.y}`) &&
      !roadTileSet.has(`${t.x},${t.y}`) &&
      (state.terrainResources['forest']?.[`${t.x},${t.y}`] ?? FOREST_TILE_INITIAL_HEALTH) > 0),
    [mtnForestTree, cullRect, buildingTileSet, roadTileSet, state.terrainResources],
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
          pct: (state.terrainResources['ore']?.[`${t.x},${t.y}`] ?? ORE_VEIN_INITIAL_HEALTH) / ORE_VEIN_INITIAL_HEALTH,
        }))
      }
      if ((selectedBuilding.type as string) === 'lumbercamp') {
        return forestTree.rangeQuery(cullRect).map(t => ({
          x: t.x, y: t.y,
          pct: (state.terrainResources['forest']?.[`${t.x},${t.y}`] ?? FOREST_TILE_INITIAL_HEALTH) / FOREST_TILE_INITIAL_HEALTH,
        }))
      }
      return null
    }
    // ── Terrain-tile-selected overlay — 只高亮选中的那一格 ─────────────────
    const tt = state.selectedTerrainTile
    if (tt) {
      const kind = tt.kind === 'mountainForest' ? 'forest' : tt.kind
      const initialHealth = (state.terrainResources[kind] !== undefined)
        ? Object.values(state.terrainResources[kind])[0] !== undefined
          ? resourceInitialHealth(kind)
          : resourceInitialHealth(kind)
        : resourceInitialHealth(kind)
      return [{ x: tt.x, y: tt.y,
        pct: (state.terrainResources[kind]?.[`${tt.x},${tt.y}`] ?? initialHealth) / initialHealth,
      }]
    }
    return null
  }, [selectedBuilding, state.selectedTerrainTile, oreVeinTree, forestTree, cullRect, state.terrainResources])

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
  const visibleWalkers = React.useMemo(() => {
    const walkers = state.citizens.filter(c => c.motion !== null) as { id: string; motion: NonNullable<typeof state.citizens[0]['motion']> }[]
    return walkers.filter(w => {
      const p = logicalMotionPos(w.motion)
      return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
    })
  }, [state.citizens, cullRect])
  const visibleMigrants = React.useMemo(() => state.migrants.filter(m => {
    const p = logicalMigrantPos(m)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.migrants, cullRect])
  const visibleOxCarts = React.useMemo(() => {
    const allCarts = state.buildings.flatMap(b => b.agents.filter(a => a.kind === 'oxcart'))
    return allCarts.filter(c => {
      const p = logicalAgentPos(c)
      return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
    })
  }, [state.buildings, cullRect])
  const visibleMarketBuyers = React.useMemo(() => {
    const allBuyers = state.buildings.flatMap(b => b.agents.filter(a => a.kind === 'marketbuyer'))
    return allBuyers.filter(mb => {
      const p = logicalAgentPos(mb)
      return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
    })
  }, [state.buildings, cullRect])
  const visiblePeddlers = React.useMemo(() => {
    const peddlerCitizens = state.citizens.filter(c => c.peddlerState !== null) as { id: string; peddlerState: NonNullable<typeof state.citizens[0]['peddlerState']> }[]
    return peddlerCitizens.filter(p => {
      const pos = logicalPeddlerStatePos(p.peddlerState)
      return pos.x >= cullRect.minX && pos.x <= cullRect.maxX && pos.y >= cullRect.minY && pos.y <= cullRect.maxY
    })
  }, [state.citizens, cullRect])
  const visibleFarmPiles = React.useMemo(() => {
    const allPiles = state.farmZones.flatMap(z => z.piles)
    return allPiles.filter(p =>
      p.x >= cullRect.minX - 1 && p.x <= cullRect.maxX + 1 &&
      p.y >= cullRect.minY - 1 && p.y <= cullRect.maxY + 1,
    )
  }, [state.farmZones, cullRect])

  // --- Farm derived data -----------------------------------------------------
  const visibleFarmZones = React.useMemo(() =>
    state.farmZones.filter(z =>
      z.x + 1 >= cullRect.minX && z.x <= cullRect.maxX &&
      z.y + 1 >= cullRect.minY && z.y <= cullRect.maxY,
    ), [state.farmZones, cullRect],
  )
  const farmersAtFarm = React.useMemo<FarmerItem[]>(() => {
    const movingIds = new Set(state.citizens.filter(c => c.motion !== null).map(c => c.id))
    return state.citizens
      .filter(c => c.farmZoneId && !c.isAtHome && !movingIds.has(c.id))
      .flatMap(c => {
        const zone = state.farmZones.find(z => z.id === c.farmZoneId)
        if (!zone) return []
        if (zone.x + 1 < cullRect.minX || zone.x > cullRect.maxX ||
            zone.y + 1 < cullRect.minY || zone.y > cullRect.maxY) return []
        let hash = 0
        for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) | 0
        return [{ id: c.id, x: zone.x + 0.5, y: zone.y + 0.5, seed: Math.abs(hash % 1000) + 1 }]
      })
  }, [state.citizens, state.farmZones, cullRect])

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
    // derive dead counts from building.residentData.dead
    const deadEntries: Record<string, number> = Object.fromEntries(
      state.buildings.filter(b => b.residentData && (b.residentData.dead ?? 0) > 0)
        .map(b => [b.id, b.residentData!.dead])
    )
    const deadHouseIds = new Set(Object.keys(deadEntries))
    const allAffected  = new Set([...sickHouseIds, ...deadHouseIds])
    return state.buildings
      .filter(b =>
        b.type === 'house' && allAffected.has(b.id) &&
        b.x + 1 >= cullRect.minX && b.x <= cullRect.maxX &&
        b.y + 1 >= cullRect.minY && b.y <= cullRect.maxY,
      )
      .map(b => ({ id: b.id, x: b.x, y: b.y, deadCount: deadEntries[b.id] ?? 0 }))
  }, [state.citizens, state.buildings, cullRect])

  const selectedBuildingRing = React.useMemo<RingInfo | null>(() => {
    const b = state.selectedBuildingId
      ? state.buildings.find(x => x.id === state.selectedBuildingId) : null
    return b ? { x: b.x, y: b.y, color: '#faad14', r: 0.56 } : null
  }, [state.selectedBuildingId, state.buildings])

  const selectedCitizenRing = React.useMemo<RingInfo | null>(() => {
    const cid = state.selectedCitizenId
    if (!cid) return null
    const walkerCitizen = state.citizens.find(c => c.id === cid && c.motion !== null)
    if (walkerCitizen && walkerCitizen.motion) {
      const p = logicalMotionPos(walkerCitizen.motion)
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
  }, [state.selectedCitizenId, state.citizens, farmersAtFarm, visibleResidents, state.buildings])

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
    // --- Compass fly-to (runs every frame, before culling throttle) ----------
    const newCompassTarget = (window as any).__ORE_COMPASS_TARGET__
    if (newCompassTarget && typeof newCompassTarget.id === 'number' &&
        newCompassTarget.id !== lastCompassIdRef.current) {
      lastCompassIdRef.current = newCompassTarget.id
      setCompassMarker({ x: newCompassTarget.x, y: newCompassTarget.y })
      flyToRef.current = { x: newCompassTarget.x, y: newCompassTarget.y }
    }
    if (flyToRef.current) {
      const ctrl = (window as any).__THREE_CONTROLS__
      if (ctrl?.target) {
        const tx = flyToRef.current.x + 0.5, tz = flyToRef.current.y + 0.5
        const dt = Math.min(1, delta * 3.5)
        const dx = (tx - ctrl.target.x) * dt
        const dz = (tz - ctrl.target.z) * dt
        ctrl.target.x += dx; ctrl.target.z += dz
        if (ctrl.object) { ctrl.object.position.x += dx; ctrl.object.position.z += dz }
        if (typeof ctrl.update === 'function') ctrl.update()
        if (Math.hypot(tx - ctrl.target.x, tz - ctrl.target.z) < 0.15) flyToRef.current = null
      }
    }
    // --- Culling (10 Hz) -----------------------------------------------------
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
    function getTileAt(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera({
        x:  ((clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((clientY - rect.top)  / rect.height) * 2 + 1,
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
    function getTile(e: MouseEvent): { x: number; y: number } | null {
      return getTileAt(e.clientX, e.clientY)
    }

    function applyTool(wx: number, wy: number) {
      const s    = stateRef.current
      const tool = s.selectedTool

      // ── Level bounds check ──────────────────────────────────────────────────
      const lb = (window as any).__LEVEL_BOUNDS__ as { minX: number; maxX: number; minY: number; maxY: number } | undefined
      if (lb && (wx < lb.minX || wx > lb.maxX || wy < lb.minY || wy > lb.maxY)) {
        if (tool !== 'pan') {
          try { (window as any).__MESSAGE_API__?.warning({ content: '⛔ 此地尚未开辟，无法操作', duration: 1.5 }) } catch {}
        }
        // For pan, silently deselect
        actionsRef.current.selectBuilding(null)
        actionsRef.current.selectCitizen(null)
        actionsRef.current.selectFarmZone(null)
        actionsRef.current.selectTerrainTile(null)
        return
      }
      if (tool === 'pan') {
        const fz = s.farmZones.find(z => wx >= z.x && wx <= z.x + 1 && wy >= z.y && wy <= z.y + 1)
        if (fz) { actionsRef.current.selectFarmZone(fz.id); return }
        // ── Terrain tile selection ─────────────────────────────────────────
        if (isOreVeinAt(wx, wy)) { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'ore' }); return }
        if (isForestAt(wx, wy))  { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'forest' }); return }
        if (isGrasslandAt(wx, wy)) { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'grassland' }); return }
        if (isMountainForestAt(wx, wy)) { actionsRef.current.selectTerrainTile({ x: wx, y: wy, kind: 'mountainForest' }); return }
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
            'no-build-type-selected': '请先选择建造类型。',
            'insufficient-funds':     '资金不足，无法建造。',
            'tile-occupied':          '格子已被建筑占用。',
            'road-occupied':          '格子已有道路，请先拆除。',
            'river-occupied':         '该处为河流，无法建造。',
            'no-ore-vein':            '此处无铁矿脉，铁矿须建于矿脉格上。',
            'no-forest':              '此处无林地，伐木场须建于林地格上。',
            'no-papermill':           '附近无造纸坊，书院须在造纸坊二十格内。',
          }
          const msg = reasonMap[action.reason] ?? action.reason
          if (msg) try { (window as any).__MESSAGE_API__?.warning(msg) } catch {}
        }
      } else if (tool === 'road') {
        const isForest = isForestAt(wx, wy) && !stateRef.current.roads.some(r => r.x === wx && r.y === wy)
        actionsRef.current.placeRoad(wx, wy)
        if (isForest) {
          try { (window as any).__MESSAGE_API__?.warning({ content: `🌲 伐木清路 · 额外耗费 ¥${FOREST_CLEAR_COST} 文`, duration: 2 }) } catch {}
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

    // ── Touch handlers (for road/build drag on mobile) ──────────────────────
    // We capture in capture-phase so we fire before OrbitControls' bubble listeners.
    let touchDownPos: { clientX: number; clientY: number } | null = null

    function onTouchStart(e: TouchEvent) {
      const tool = stateRef.current.selectedTool
      if (tool === 'pan' || e.touches.length !== 1) return
      // Prevent OrbitControls from starting a pan when we own this gesture
      e.preventDefault()
      e.stopPropagation()
      const touch = e.touches[0]
      touchDownPos = { clientX: touch.clientX, clientY: touch.clientY }

      // Drag tools: initialise drag state immediately
      if (tool === 'road' || tool === 'farmZone' || tool === 'teaZone') {
        dragRef.current.active = true; dragRef.current.lastTileKey = ''; dragRef.current.lastTile = null
        const t = getTileAt(touch.clientX, touch.clientY); if (!t) return
        dragRef.current.lastTileKey = `${t.x},${t.y}`
        if (tool === 'road') {
          dragRef.current.didDrag  = false
          roadDragStartRef.current = t
          const preview = [t]; setRoadPreview(preview); roadPreviewRef.current = preview
        } else {
          dragRef.current.didDrag = true; dragRef.current.lastTile = t; paintFarmZone(t)
        }
      }
      // Building types / bulldoze: no drag state needed — placement fires in onTouchEnd
    }

    function onTouchMove(e: TouchEvent) {
      const tool = stateRef.current.selectedTool
      if (tool === 'pan' || !dragRef.current.active || e.touches.length !== 1) return
      e.preventDefault()
      e.stopPropagation()
      const touch = e.touches[0]
      const t = getTileAt(touch.clientX, touch.clientY); if (!t) return
      const key = `${t.x},${t.y}`; if (key === dragRef.current.lastTileKey) return
      dragRef.current.lastTileKey = key

      if (tool === 'road' && roadDragStartRef.current) {
        dragRef.current.didDrag = true
        const start      = roadDragStartRef.current
        const endOnMtn   = isMountainAt(t.x, t.y)
        const startOnMtn = isMountainAt(start.x, start.y)
        const s          = stateRef.current
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

    function onTouchEnd(e: TouchEvent) {
      const tool = stateRef.current.selectedTool
      if (tool === 'pan') return

      if (tool === 'road' && dragRef.current.active) {
        // Commit road drag (or single tap = place one tile)
        if (dragRef.current.didDrag && roadPreviewRef.current.length > 0) {
          for (const tile of roadPreviewRef.current) paintRoad(tile)
        } else if (touchDownPos) {
          // single tap on road tool — place one tile
          const t = getTileAt(touchDownPos.clientX, touchDownPos.clientY)
          if (t) paintRoad(t)
        }
        setRoadPreview([]); roadPreviewRef.current = []; roadDragStartRef.current = null
        stopDrag()
      } else if (tool === 'farmZone' || tool === 'teaZone') {
        stopDrag()
      } else {
        // Building types, bulldoze, or any other tool: treat as tap → applyTool
        if (touchDownPos) {
          const t = getTileAt(touchDownPos.clientX, touchDownPos.clientY)
          if (t) applyTool(t.x, t.y)
        }
      }
      touchDownPos = null
    }

    const c = gl.domElement
    c.addEventListener('click',      onClick)
    c.addEventListener('mousedown',  onMouseDown)
    c.addEventListener('mousemove',  onMouseMoveGhost)
    c.addEventListener('mouseleave', onMouseLeaveGhost)
    // Touch: use capture so we intercept before OrbitControls, passive:false to allow preventDefault
    c.addEventListener('touchstart', onTouchStart, { capture: true, passive: false })
    c.addEventListener('touchmove',  onTouchMove,  { capture: true, passive: false })
    c.addEventListener('touchend',   onTouchEnd,   { capture: true, passive: false })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    window.addEventListener('blur',      stopDrag)
    return () => {
      c.removeEventListener('click',      onClick)
      c.removeEventListener('mousedown',  onMouseDown)
      c.removeEventListener('mousemove',  onMouseMoveGhost)
      c.removeEventListener('mouseleave', onMouseLeaveGhost)
      c.removeEventListener('touchstart', onTouchStart)
      c.removeEventListener('touchmove',  onTouchMove)
      c.removeEventListener('touchend',   onTouchEnd)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      window.removeEventListener('blur',      stopDrag)
      setRoadPreview([]); roadPreviewRef.current = []; roadDragStartRef.current = null
      stopDrag()
    }
  }, [gl, camera])

  // --- Building mesh dispatch ------------------------------------------------
  function buildingMesh(b: Building) {
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
        roads={state.roads}
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

      {/* Ore-compass bouncing arrow */}
      {compassMarker && <CompassArrow key={`${compassMarker.x},${compassMarker.y}`} x={compassMarker.x} y={compassMarker.y} />}

      {/* Playable area: screen-space dark overlay + ground border */}
      {levelBounds && <BoundsOverlay bounds={levelBounds} />}
      {levelBounds && <PlayableBorder bounds={levelBounds} />}
    </group>
  )
}

