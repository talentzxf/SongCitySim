import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

// ── 六种宋代民居风格（墙色、瓦色、烟囱色、屋高变化） ──────────────────────────
const HOUSE_STYLES = [
  { wall: '#e8dbc0', roof: '#4a4655', chimney: '#555560', wallH: 0.70, roofH: 0.55, roofR: 0.70 }, // 白墙灰瓦
  { wall: '#d4a87a', roof: '#5a3a18', chimney: '#503010', wallH: 0.68, roofH: 0.50, roofR: 0.68 }, // 土黄褐瓦
  { wall: '#c8c8c0', roof: '#2e3535', chimney: '#333340', wallH: 0.72, roofH: 0.62, roofR: 0.72 }, // 灰白黑瓦
  { wall: '#e0d0a0', roof: '#5a4028', chimney: '#4a3018', wallH: 0.66, roofH: 0.48, roofR: 0.66 }, // 米色暗棕瓦
  { wall: '#d0c098', roof: '#404848', chimney: '#383e3e', wallH: 0.70, roofH: 0.58, roofR: 0.68 }, // 沙黄青灰瓦
  { wall: '#c8d0c8', roof: '#3a4a3a', chimney: '#304030', wallH: 0.74, roofH: 0.60, roofR: 0.73 }, // 苍白深绿瓦
] as const

/**
 * 民居
 * Night effect: warm window-glow emissive + chimney glow when occupants > 0
 */
export default function HouseMesh({ x, y, baseY, occupants }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef        = React.useRef<THREE.MeshStandardMaterial>(null)
  const matRef2       = React.useRef<THREE.MeshStandardMaterial>(null)
  const chimneyMatRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef  = React.useRef(state.dayTime)
  const occRef  = React.useRef(occupants)

  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])
  React.useEffect(() => { occRef.current = occupants },     [occupants])

  // 基于坐标的确定性变体，同一格子颜色固定
  const style = HOUSE_STYLES[((x * 7 + y * 13 + Math.abs(x - y) * 3) & 0x7fffffff) % HOUSE_STYLES.length]
  const wH = style.wallH, rH = style.roofH, rR = style.roofR

  useFrame(() => {
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth   = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    const applyMat = (mat: THREE.MeshStandardMaterial | null) => {
      if (!mat) return
      if (isNight && occRef.current > 0) { mat.emissive.setHex(0xffcc44); mat.emissiveIntensity = depth * 3.5 }
      else { mat.emissiveIntensity = 0 }
    }
    applyMat(matRef.current); applyMat(matRef2.current)
    if (chimneyMatRef.current) {
      if (isNight && occRef.current > 0) { chimneyMatRef.current.emissive.setHex(0xff5500); chimneyMatRef.current.emissiveIntensity = depth * 1.8 }
      else { chimneyMatRef.current.emissiveIntensity = 0 }
    }
  })

  const winColor = occupants > 0 ? '#ffe8a0' : '#555'

  // Rotate the WHOLE building to face the nearest road.
  // Positive Y rotation (CCW from above) maps +Z→+X, so:
  //   0      = south face (z+) faces road at y+1
  //   Math.PI = north face (z-) faces road at y-1
  //   Math.PI/2  = east face (x+) faces road at x+1   ← was -π/2 (swapped)
  //   -Math.PI/2 = west face (x-) faces road at x-1   ← was +π/2 (swapped)
  const buildingRotY = React.useMemo(() => {
    const r = state.roads
    const has = (dx: number, dy: number) => r.some(t => t.x === x + dx && t.y === y + dy)
    if (has( 0,  1)) return 0                // south (z+)
    if (has( 0, -1)) return Math.PI          // north (z-)
    if (has( 1,  0)) return  Math.PI / 2    // east  (x+)
    if (has(-1,  0)) return -Math.PI / 2    // west  (x-)
    return 0
  }, [state.roads, x, y])

  // 烟囱偏向（基于坐标偶奇交替）
  const chimneyX = ((x + y) & 1) ? 0.21 : -0.21

  return (
    <group position={[x, baseY, y]} rotation={[0, buildingRotY, 0]}>
      {/* 墙体 */}
      <mesh position={[0, wH * 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.80, wH, 0.80]} />
        <meshStandardMaterial color={style.wall} />
      </mesh>

      {/* 屋顶 */}
      <mesh position={[0, wH + rH * 0.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[rR, rH, 4]} />
        <meshStandardMaterial color={style.roof} />
      </mesh>

      {/* 门（跟随整体旋转，朝向道路） */}
      <mesh position={[-0.18, wH * 0.27, 0.41]} castShadow>
        <boxGeometry args={[0.18, wH * 0.43, 0.025]} />
        <meshStandardMaterial color="#5a3010" />
      </mesh>
      <mesh position={[-0.18, wH * 0.51, 0.41]}>
        <boxGeometry args={[0.22, 0.045, 0.025]} />
        <meshStandardMaterial color="#7a4820" />
      </mesh>
      <mesh position={[-0.18, 0.02, 0.46]}>
        <boxGeometry args={[0.24, 0.04, 0.12]} />
        <meshStandardMaterial color="#c8a060" />
      </mesh>

      {/* 前窗（与门同面，随整体旋转） */}
      <mesh position={[0.15, wH * 0.60, 0.41]} renderOrder={1000}>
        <boxGeometry args={[0.22, 0.16, 0.02]} />
        <meshStandardMaterial ref={matRef} color={winColor} />
      </mesh>
      {/* 后窗 */}
      <mesh position={[-0.15, wH * 0.60, -0.41]} renderOrder={1000}>
        <boxGeometry args={[0.22, 0.16, 0.02]} />
        <meshStandardMaterial ref={matRef2} color={winColor} />
      </mesh>

      {/* 烟囱 */}
      <mesh position={[chimneyX, wH + rH * 0.55, -0.16]} castShadow>
        <boxGeometry args={[0.10, 0.22, 0.10]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      <mesh position={[chimneyX, wH + rH * 0.55 + 0.13, -0.16]}>
        <boxGeometry args={[0.15, 0.04, 0.15]} />
        <meshStandardMaterial ref={chimneyMatRef} color={style.chimney} />
      </mesh>
    </group>
  )
}
