/**
 * RoadLayer — roads (flat + mountain + highway), bridges, road A* preview,
 * and the placement ghost overlay for buildings / farm zones.
 */
import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { isRiverAt, isMountainAt, isOreVeinAt, isForestAt, isMountainForestAt, isNearRiverFive, getMountainHeight } from '../state/worldgen'
import worldGenConfig from '../config/world-gen'
import { palette } from '../theme/palette'
import { tileH } from '../config/characters/_shared'
import { BUILDING_COST, ALL_BUILDING_TYPES, getBuildingSize, type BuildingType, type Tool, type CityState } from '../state/simulation'
import { FlatInstances, VariableHeightFlatInstances } from './MapPrimitives'

// ─── Bridge ────────────────────────────────────────────────────────────────

function BridgeInstances({ bridges }: { bridges: Array<{ x: number; y: number }> }) {
  const railNeg = React.useMemo(() => bridges.map(b => ({ x: b.x, y: b.y - 0.43 })), [bridges])
  const railPos = React.useMemo(() => bridges.map(b => ({ x: b.x, y: b.y + 0.43 })), [bridges])
  if (!bridges.length) return null
  // renderOrder=2: bridges must render AFTER the water ribbon (renderOrder=1, depthWrite=false)
  return (
    <>
      <FlatInstances items={bridges}  y={0.075} size={[0.96, 0.96]} color={palette.map.bridgeDeck}   renderOrder={2} />
      <FlatInstances items={bridges}  y={0.080} size={[0.82, 0.11]} color={palette.map.bridgePlank} opacity={0.75} renderOrder={2} />
      <FlatInstances items={railNeg}  y={0.085} size={[0.9,  0.07]} color={palette.map.bridgeRail}   renderOrder={2} />
      <FlatInstances items={railPos}  y={0.085} size={[0.9,  0.07]} color={palette.map.bridgeRail}   renderOrder={2} />
    </>
  )
}

// ─── Terrain-conforming mountain road helpers ─────────────────────────────
//
// The smooth mountain terrain mesh (SmoothMountainMesh in TerrainLayer) places
// each vertex at world position (vx-0.5, h, vy-0.5) where
//   h = avg of the four mountain-tile heights sharing corner (vx, vy).
// Mountain roads must use the SAME corner heights so they sit flush on the
// terrain surface — no floating planes, no holes, no visible grid edges.

const _MTILE_SCALE_R = worldGenConfig.mountain.tileScale

/** Raw mountain tile height used by the terrain mesh (0 for non-mountain). */
function _tileH(tx: number, ty: number): number {
  const mh = getMountainHeight(tx, ty)
  return mh > 0 ? 0.04 + mh * _MTILE_SCALE_R : 0
}

/** Height of terrain mesh vertex at integer corner (vx, vy). */
function terrainVtxH(vx: number, vy: number): number {
  return (_tileH(vx - 1, vy - 1) + _tileH(vx, vy - 1) +
          _tileH(vx - 1, vy)     + _tileH(vx, vy)) / 4
}

/** Height of terrain mesh surface at tile centre (tx, ty). */
function terrainCentreH(tx: number, ty: number): number {
  return (terrainVtxH(tx, ty) + terrainVtxH(tx + 1, ty) +
          terrainVtxH(tx, ty + 1) + terrainVtxH(tx + 1, ty + 1)) / 4
}

/**
 * Build a single BufferGeometry whose quads conform exactly to the smooth
 * mountain terrain surface.  Adjacent tiles share corner vertices → no seams,
 * no grid-step artefacts along the road.
 *
 * @param yOffset  Small positive value to lift road above terrain (prevents z-fight).
 */
function buildConformingRoadGeo(
  tiles: Array<{ x: number; y: number }>,
  yOffset: number,
): THREE.BufferGeometry | null {
  if (!tiles.length) return null

  // Collect unique corner vertices (same pattern as SmoothMountainMesh)
  const vtxSet = new Set<string>()
  for (const { x, y } of tiles)
    for (let dx = 0; dx <= 1; dx++)
      for (let dy = 0; dy <= 1; dy++)
        vtxSet.add(`${x + dx},${y + dy}`)

  const vtxKeys = Array.from(vtxSet)
  const vtxIdx  = new Map<string, number>()
  vtxKeys.forEach((k, i) => vtxIdx.set(k, i))
  const N = vtxKeys.length

  const positions = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const [vx, vy] = vtxKeys[i].split(',').map(Number)
    const h = terrainVtxH(vx, vy) + yOffset
    positions[i * 3]     = vx - 0.5
    positions[i * 3 + 1] = h
    positions[i * 3 + 2] = vy - 0.5
  }

  // Same CCW winding as SmoothMountainMesh
  const indices: number[] = []
  for (const { x, y } of tiles) {
    const tl = vtxIdx.get(`${x},${y}`)!
    const tr = vtxIdx.get(`${x + 1},${y}`)!
    const bl = vtxIdx.get(`${x},${y + 1}`)!
    const br = vtxIdx.get(`${x + 1},${y + 1}`)!
    indices.push(tl, bl, br,  tl, br, tr)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Mountain road surface + stripe markers that sit flush on the terrain mesh. */
function MountainRoadMesh({ roads }: { roads: Array<{ x: number; y: number }> }) {
  const roadGeo = React.useMemo(() => buildConformingRoadGeo(roads, 0.012), [roads])

  // Stripes are small centred squares — use tile-centre height (flat, tiny, barely visible tilt)
  const stripeItems = React.useMemo(
    () => roads.map(r => ({ x: r.x, y: r.y, h: terrainCentreH(r.x, r.y) + 0.016 })),
    [roads],
  )

  React.useEffect(() => () => { roadGeo?.dispose() }, [roadGeo])

  if (!roads.length) return null
  return (
    <>
      {roadGeo && (
        <mesh geometry={roadGeo} frustumCulled={false}>
          <meshStandardMaterial color={palette.map.mountainRoad} roughness={0.85} metalness={0.05} />
        </mesh>
      )}
      <VariableHeightFlatInstances items={stripeItems} size={[0.32, 0.32]} color={palette.map.roadDust} opacity={0.9} />
    </>
  )
}

// ─── Road instances ────────────────────────────────────────────────────────

function RoadInstances({ roads }: { roads: Array<{ x: number; y: number }> }) {
  const highwayRoads = React.useMemo(() => roads.filter(r => r.y === 0 && r.x <= -6), [roads])
  // Flat + mountain road base colours live in UnifiedTerrainMesh vertex colours.
  // Only highway decorative details are rendered here as separate geometry.
  return (
    <>
      {highwayRoads.length > 0 && (
        <>
          <FlatInstances items={highwayRoads} y={0.042} size={[1.22, 1.22]} color={palette.map.highwayEdge} />
          <FlatInstances items={highwayRoads} y={0.048} size={[0.94, 0.94]} color={palette.map.highway} />
          <FlatInstances items={highwayRoads.map(r => ({ x: r.x, y: r.y - 0.18 }))} y={0.052} size={[0.2, 0.7]} color={palette.map.roadDust} />
          <FlatInstances items={highwayRoads.map(r => ({ x: r.x, y: r.y + 0.18 }))} y={0.052} size={[0.2, 0.7]} color={palette.map.roadDust} />
        </>
      )}
    </>
  )
}

// ─── Road ghost preview ────────────────────────────────────────────────────

function RoadPreviewInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const flatFree   = React.useMemo(() => tiles.filter(t => !isMountainAt(t.x, t.y) && !isForestAt(t.x, t.y)), [tiles])
  const flatForest = React.useMemo(() => tiles.filter(t => !isMountainAt(t.x, t.y) &&  isForestAt(t.x, t.y)), [tiles])
  const mtnTiles   = React.useMemo(() => tiles.filter(t => isMountainAt(t.x, t.y)), [tiles])
  const mtnGeo     = React.useMemo(() => buildConformingRoadGeo(mtnTiles, 0.05), [mtnTiles])
  React.useEffect(() => () => { mtnGeo?.dispose() }, [mtnGeo])
  if (!tiles.length) return null
  return (
    <>
      {flatFree.length   > 0 && <FlatInstances items={flatFree}   y={0.09} size={[0.88, 0.88]} color="#1890ff" opacity={0.60} />}
      {flatForest.length > 0 && <FlatInstances items={flatForest} y={0.09} size={[0.88, 0.88]} color="#fa8c16" opacity={0.75} />}
      {mtnGeo && (
        <mesh geometry={mtnGeo} frustumCulled={false}>
          {/* Yellow = mountain road costs more (警示：山地修路费用更高) */}
          <meshBasicMaterial color="#faad14" transparent opacity={0.70} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

// ─── Placement ghost ──────────────────────────────────────────────────────

function PlacementGhost({ tool, stateRef, mouseNDCRef, mouseOnCanvasRef }: {
  tool: Tool
  stateRef: React.RefObject<CityState>
  mouseNDCRef: React.RefObject<{ x: number; y: number }>
  mouseOnCanvasRef: React.RefObject<boolean>
}) {
  const { camera } = useThree()
  const buildingRef = React.useRef<THREE.Mesh>(null)
  const farmRef     = React.useRef<THREE.Mesh>(null)
  const raycaster   = React.useRef(new THREE.Raycaster())
  const plane       = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hit         = React.useRef(new THREE.Vector3())
  const isBuildingTool = ALL_BUILDING_TYPES.includes(tool as BuildingType)
  const isFarmTool     = tool === 'farmZone'

  useFrame(() => {
    const show = mouseOnCanvasRef.current && (isBuildingTool || isFarmTool)
    if (!show) { if (buildingRef.current) buildingRef.current.visible = false; if (farmRef.current) farmRef.current.visible = false; return }
    raycaster.current.setFromCamera(mouseNDCRef.current as any, camera as THREE.Camera)
    if (!raycaster.current.ray.intersectPlane(plane.current, hit.current)) {
      if (buildingRef.current) buildingRef.current.visible = false; if (farmRef.current) farmRef.current.visible = false; return
    }
    const tx = Math.round(hit.current.x), ty = Math.round(hit.current.z)
    const s = stateRef.current; if (!s) return

    // Level bounds check — marks ghost red if tile is outside the playable area
    const lb = (window as any).__LEVEL_BOUNDS__ as { minX: number; maxX: number; minY: number; maxY: number } | undefined
    const outOfBounds = lb ? (tx < lb.minX || tx > lb.maxX || ty < lb.minY || ty > lb.maxY) : false

    if (isBuildingTool) {
      const mesh = buildingRef.current; if (!mesh) return
      const bt = tool as BuildingType
      const { w: bw, h: bh } = getBuildingSize(bt)
      const isMtn = isMountainAt(tx, ty)
      // Only houses are penalised on mountain terrain
      const isMtnPenalized   = isMtn && bt === 'house'
      const mountainMultiplier = worldGenConfig.building?.mountainMultiplier || 1
      const effectiveCost = Math.ceil(BUILDING_COST[bt] * (isMtnPenalized ? mountainMultiplier : 1))
      // check all footprint tiles
      let valid = !outOfBounds && s.money >= effectiveCost && !isRiverAt(tx, ty)
      for (let dx = 0; dx < bw && valid; dx++) {
        for (let dy = 0; dy < bh && valid; dy++) {
          const tx2 = tx + dx, ty2 = ty + dy
          if (lb && (tx2 < lb.minX || tx2 > lb.maxX || ty2 < lb.minY || ty2 > lb.maxY)) { valid = false; break }
          if (isRiverAt(tx2, ty2)) valid = false
          if (s.buildings.some(b => { const bw2 = b.w??1, bh2 = b.h??1; return tx2>=b.x&&tx2<b.x+bw2&&ty2>=b.y&&ty2<b.y+bh2 })) valid = false
          if (s.roads.some(r => r.x === tx2 && r.y === ty2)) valid = false
          if (s.farmZones.some(z => z.x === tx2 && z.y === ty2)) valid = false
        }
      }
      if (bt === 'mine'       && !isOreVeinAt(tx, ty)) valid = false
      if (bt === 'lumbercamp' && !isForestAt(tx, ty) && !isMountainForestAt(tx, ty))  valid = false
      if ((bt as string) === 'papermill' && !isNearRiverFive(tx, ty)) valid = false
      if (bt === 'academy') {
        const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - tx), Math.abs(by - ty))
        if (!s.buildings.some(b => b.type === 'papermill' && cheb(b.x, b.y) <= 20)) valid = false
      }
      // position ghost at footprint center
      mesh.position.set(tx + (bw - 1) * 0.5, (isMtn ? tileH(tx, ty) : 0) + 0.32, ty + (bh - 1) * 0.5)
      mesh.scale.set(bw, 1, bh)
      mesh.visible = true
      // green = valid, yellow = valid but mountain penalty (costs 3×), red = invalid / out of bounds
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(
        !valid ? '#ff4d4f' : isMtnPenalized ? '#faad14' : '#52c41a'
      )
    }
    if (isFarmTool) {
      const mesh = farmRef.current; if (!mesh) return
      const fp = [{ x: tx, y: ty }, { x: tx+1, y: ty }, { x: tx, y: ty+1 }, { x: tx+1, y: ty+1 }]
      const valid = !outOfBounds &&
        fp.every(t =>
          (!lb || (t.x >= lb.minX && t.x <= lb.maxX && t.y >= lb.minY && t.y <= lb.maxY)) &&
          !isRiverAt(t.x, t.y) && !isMountainAt(t.x, t.y) &&
          !s.buildings.some(b => b.x === t.x && b.y === t.y) &&
          !s.roads.some(r => r.x === t.x && r.y === t.y) &&
          !s.farmZones.some(z => t.x >= z.x && t.x <= z.x+1 && t.y >= z.y && t.y <= z.y+1)
        ) && fp.some(t => isNearRiverFive(t.x, t.y))
      mesh.position.set(tx + 0.5, 0.016, ty + 0.5); mesh.visible = true
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(valid ? '#52c41a' : '#ff4d4f')
    }
  })

  if (!isBuildingTool && !isFarmTool) return null
  return (
    <group>
      {isBuildingTool && <mesh ref={buildingRef} visible={false}><boxGeometry args={[0.88, 0.55, 0.88]} /><meshBasicMaterial transparent opacity={0.42} depthWrite={false} /></mesh>}
      {isFarmTool     && <mesh ref={farmRef} rotation={[-Math.PI/2,0,0]} visible={false}><planeGeometry args={[1.96, 1.96]} /><meshBasicMaterial transparent opacity={0.45} depthWrite={false} /></mesh>}
    </group>
  )
}

// ─── Public layer component ────────────────────────────────────────────────

export interface RoadLayerProps {
  roads: Array<{ x: number; y: number }>
  bridges: Array<{ x: number; y: number }>
  roadPreview: Array<{ x: number; y: number }>
  tool: Tool
  stateRef: React.RefObject<CityState>
  mouseNDCRef: React.RefObject<{ x: number; y: number }>
  mouseOnCanvasRef: React.RefObject<boolean>
}

export function RoadLayer({ roads, bridges, roadPreview, tool, stateRef, mouseNDCRef, mouseOnCanvasRef }: RoadLayerProps) {
  return (
    <>
      <RoadInstances roads={roads} />
      <BridgeInstances bridges={bridges} />
      <RoadPreviewInstances tiles={roadPreview} />
      <PlacementGhost tool={tool} stateRef={stateRef} mouseNDCRef={mouseNDCRef} mouseOnCanvasRef={mouseOnCanvasRef} />
    </>
  )
}

