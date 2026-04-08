/**
 * RoadLayer — roads (flat + mountain + highway), bridges, road A* preview,
 * and the placement ghost overlay for buildings / farm zones.
 */
import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { isRiverAt, isMountainAt, isOreVeinAt, isForestAt, isNearRiverFive } from '../state/worldgen'
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
  return (
    <>
      <FlatInstances items={bridges}  y={0.058} size={[0.96, 0.96]} color={palette.map.bridgeDeck} />
      <FlatInstances items={bridges}  y={0.062} size={[0.82, 0.11]} color={palette.map.bridgePlank} opacity={0.75} />
      <FlatInstances items={railNeg}  y={0.07}  size={[0.9,  0.07]} color={palette.map.bridgeRail} />
      <FlatInstances items={railPos}  y={0.07}  size={[0.9,  0.07]} color={palette.map.bridgeRail} />
    </>
  )
}

// ─── Road instances ────────────────────────────────────────────────────────

function RoadInstances({ roads }: { roads: Array<{ x: number; y: number }> }) {
  const normalRoads   = React.useMemo(() => roads.filter(r => !(r.y === 0 && r.x <= -6)), [roads])
  const mountainRoads = React.useMemo(() => normalRoads.filter(r => isMountainAt(r.x, r.y)),  [normalRoads])
  const flatRoads     = React.useMemo(() => normalRoads.filter(r => !isMountainAt(r.x, r.y)), [normalRoads])
  const highwayRoads  = React.useMemo(() => roads.filter(r => r.y === 0 && r.x <= -6), [roads])
  const mtnRoadItems   = React.useMemo(() => mountainRoads.map(r => ({ x: r.x, y: r.y, h: tileH(r.x, r.y) + 0.010 })), [mountainRoads])
  const mtnStripeItems = React.useMemo(() => mountainRoads.map(r => ({ x: r.x, y: r.y, h: tileH(r.x, r.y) + 0.014 })), [mountainRoads])
  return (
    <>
      {flatRoads.length > 0 && <FlatInstances items={flatRoads} y={0.05} size={[0.98, 0.98]} color={palette.map.road} />}
      {mtnRoadItems.length > 0 && (
        <>
          <VariableHeightFlatInstances items={mtnRoadItems}   size={[0.98, 0.98]} color={palette.map.mountainRoad} />
          <VariableHeightFlatInstances items={mtnStripeItems} size={[0.32, 0.32]} color={palette.map.roadDust} opacity={0.9} />
        </>
      )}
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
  const mtnItems   = React.useMemo(() =>
    tiles.filter(t => isMountainAt(t.x, t.y)).map(t => ({ x: t.x, y: t.y, h: tileH(t.x, t.y) + 0.05 })),
    [tiles])
  if (!tiles.length) return null
  return (
    <>
      {flatFree.length   > 0 && <FlatInstances items={flatFree}   y={0.09} size={[0.88, 0.88]} color="#1890ff" opacity={0.60} />}
      {flatForest.length > 0 && <FlatInstances items={flatForest} y={0.09} size={[0.88, 0.88]} color="#fa8c16" opacity={0.75} />}
      {mtnItems.length   > 0 && <VariableHeightFlatInstances items={mtnItems} size={[0.88, 0.88]} color="#fa8c16" opacity={0.65} />}
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

    if (isBuildingTool) {
      const mesh = buildingRef.current; if (!mesh) return
      const bt = tool as BuildingType
      const { w: bw, h: bh } = getBuildingSize(bt)
      const isMtn = isMountainAt(tx, ty)
      const mountainMultiplier = worldGenConfig.building?.mountainMultiplier || 1
      const effectiveCost = Math.ceil(BUILDING_COST[bt] * (isMtn ? mountainMultiplier : 1))
      // check all footprint tiles
      let valid = s.money >= effectiveCost && !isRiverAt(tx, ty)
      for (let dx = 0; dx < bw && valid; dx++) {
        for (let dy = 0; dy < bh && valid; dy++) {
          const tx2 = tx + dx, ty2 = ty + dy
          if (isRiverAt(tx2, ty2)) valid = false
          if (s.buildings.some(b => { const bw2 = b.w??1, bh2 = b.h??1; return tx2>=b.x&&tx2<b.x+bw2&&ty2>=b.y&&ty2<b.y+bh2 })) valid = false
          if (s.roads.some(r => r.x === tx2 && r.y === ty2)) valid = false
          if (s.farmZones.some(z => z.x === tx2 && z.y === ty2)) valid = false
        }
      }
      if (bt === 'mine'       && !isOreVeinAt(tx, ty)) valid = false
      if (bt === 'lumbercamp' && !isForestAt(tx, ty))  valid = false
      if ((bt as string) === 'papermill' && !isNearRiverFive(tx, ty)) valid = false
      if (bt === 'academy') {
        const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - tx), Math.abs(by - ty))
        if (!s.buildings.some(b => b.type === 'papermill' && cheb(b.x, b.y) <= 20)) valid = false
      }
      // position ghost at footprint center
      mesh.position.set(tx + (bw - 1) * 0.5, (isMtn ? tileH(tx, ty) : 0) + 0.32, ty + (bh - 1) * 0.5)
      mesh.scale.set(bw, 1, bh)
      mesh.visible = true
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(valid ? '#52c41a' : '#ff4d4f')
    }
    if (isFarmTool) {
      const mesh = farmRef.current; if (!mesh) return
      const fp = [{ x: tx, y: ty }, { x: tx+1, y: ty }, { x: tx, y: ty+1 }, { x: tx+1, y: ty+1 }]
      const valid = fp.every(t => !isRiverAt(t.x, t.y) && !isMountainAt(t.x, t.y) &&
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

