import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

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

  useFrame(() => {
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth   = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    const applyMat = (mat: THREE.MeshStandardMaterial | null) => {
      if (!mat) return
      if (isNight && occRef.current > 0) {
        mat.emissive.setHex(0xffcc44)
        mat.emissiveIntensity = depth * 3.5
      } else {
        mat.emissiveIntensity = 0
      }
    }
    applyMat(matRef.current)
    applyMat(matRef2.current)
    // 烟囱: 夜晚有人 → 微弱橘红炉火感
    if (chimneyMatRef.current) {
      if (isNight && occRef.current > 0) {
        chimneyMatRef.current.emissive.setHex(0xff5500)
        chimneyMatRef.current.emissiveIntensity = depth * 1.8
      } else {
        chimneyMatRef.current.emissiveIntensity = 0
      }
    }
  })

  const winColor = occupants > 0 ? '#ffe8a0' : '#555'

  // ── 门朝向：优先对着相邻的路，无路则默认朝 z+ (south) ──
  const doorRotY = React.useMemo(() => {
    const r = state.roads
    const has = (dx: number, dy: number) => r.some(t => t.x === x + dx && t.y === y + dy)
    if (has( 0,  1)) return 0               // south (z+) — 默认
    if (has( 1,  0)) return -Math.PI / 2    // east  (x+)
    if (has( 0, -1)) return Math.PI         // north (z-)
    if (has(-1,  0)) return  Math.PI / 2    // west  (x-)
    return 0
  }, [state.roads, x, y])

  return (
    <group position={[x, baseY, y]}>
      {/* ── 墙体 ── */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.7, 0.8]} />
        <meshStandardMaterial color={palette.building.houseBody} />
      </mesh>

      {/* ── 屋顶 ── */}
      <mesh position={[0, 0.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.7, 0.55, 4]} />
        <meshStandardMaterial color={palette.building.houseRoof} />
      </mesh>

      {/* ── 门 — 整体旋转朝向最近道路 ── */}
      <group rotation={[0, doorRotY, 0]}>
        {/* 门板 */}
        <mesh position={[-0.18, 0.19, 0.41]} castShadow>
          <boxGeometry args={[0.18, 0.30, 0.025]} />
          <meshStandardMaterial color="#5a3010" />
        </mesh>
        {/* 门楣 */}
        <mesh position={[-0.18, 0.355, 0.41]}>
          <boxGeometry args={[0.22, 0.045, 0.025]} />
          <meshStandardMaterial color="#7a4820" />
        </mesh>
        {/* 门槛石 */}
        <mesh position={[-0.18, 0.02, 0.46]}>
          <boxGeometry args={[0.24, 0.04, 0.12]} />
          <meshStandardMaterial color={palette.map.bridgeDeck} />
        </mesh>
      </group>

      {/* ── 前窗灯 (右侧) ── */}
      <mesh position={[0.15, 0.42, 0.41]} renderOrder={1000}>
        <boxGeometry args={[0.22, 0.16, 0.02]} />
        <meshStandardMaterial ref={matRef} color={winColor} />
      </mesh>

      {/* ── 后窗灯 ── */}
      <mesh position={[-0.15, 0.42, -0.41]} renderOrder={1000}>
        <boxGeometry args={[0.22, 0.16, 0.02]} />
        <meshStandardMaterial ref={matRef2} color={winColor} />
      </mesh>

      {/* ── 烟囱 — 偏向右后角，矮而内敛 ── */}
      <mesh position={[0.21, 0.99, -0.16]} castShadow>
        <boxGeometry args={[0.10, 0.22, 0.10]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      {/* 烟囱帽 */}
      <mesh position={[0.21, 1.11, -0.16]}>
        <boxGeometry args={[0.15, 0.04, 0.15]} />
        <meshStandardMaterial ref={chimneyMatRef} color="#444444" />
      </mesh>
    </group>
  )
}
