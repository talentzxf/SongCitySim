import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

export default function MarketMesh({ x, y, baseY, occupants, level }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  const occRef = React.useRef(occupants)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])
  React.useEffect(() => { occRef.current = occupants }, [occupants])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(level >= 2 ? 0xffaa00 : 0xff3300)
    matRef.current.emissiveIntensity = (occRef.current > 0 ? depth * 1.6 : depth * 0.4)
  })

  if (level >= 2) {
    // ── 牙市（Level 2）：官府认可的牙行，两层楼，更宏大 ──
    return (
      <group position={[x + 0.5, baseY, y + 0.5]}>
        {/* 底层宽体主楼 */}
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[1.88, 0.64, 1.88]} />
          <meshStandardMaterial color="#e8b458" />
        </mesh>
        {/* 二层楼阁（略小） */}
        <mesh position={[0, 0.84, 0]} castShadow>
          <boxGeometry args={[1.20, 0.48, 1.20]} />
          <meshStandardMaterial color="#d4983c" />
        </mesh>
        {/* 底层飞檐 */}
        <mesh position={[0, 0.68, 0]}>
          <boxGeometry args={[2.08, 0.10, 2.08]} />
          <meshStandardMaterial color="#c07020" />
        </mesh>
        {/* 顶层屋顶 */}
        <mesh position={[0, 1.16, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.80, 0.40, 4]} />
          <meshStandardMaterial color="#8b2000" />
        </mesh>
        {/* 四角旗帜 */}
        {[[-0.90, -0.90], [0.90, -0.90], [-0.90, 0.90], [0.90, 0.90]].map(([fx, fz], i) => (
          <mesh key={i} position={[fx as number, 1.10, fz as number]}>
            <cylinderGeometry args={[0.025, 0.025, 0.60, 6]} />
            <meshStandardMaterial color="#c8a050" />
          </mesh>
        ))}
        {/* 牌匾（正面） */}
        <mesh position={[0, 0.92, 0.62]}>
          <boxGeometry args={[0.62, 0.22, 0.04]} />
          <meshStandardMaterial color="#3a1a08" />
        </mesh>
        {/* 门口金灯×2 */}
        {[[-0.28, 0.62], [0.28, 0.62]].map(([lx, lz], i) => (
          <mesh key={i} position={[lx as number, 0.55, lz as number]} renderOrder={1000}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial ref={i === 0 ? matRef : undefined} color="#ffaa00" depthTest={false} />
          </mesh>
        ))}
      </group>
    )
  }

  // ── 草市（Level 1） ──
  return (
    <group position={[x + 0.5, baseY, y + 0.5]}>
      <mesh position={[0, 0.30, 0]} castShadow>
        <boxGeometry args={[1.80, 0.60, 1.80]} />
        <meshStandardMaterial color={palette.building.marketBody} />
      </mesh>
      {[[-0.72, 0.72], [0.72, 0.72], [-0.72, -0.72], [0.72, -0.72]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx as number, 0.22, cz as number]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.44, 8]} />
          <meshStandardMaterial color="#c8901a" />
        </mesh>
      ))}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[2.0, 0.12, 2.0]} />
        <meshStandardMaterial color={palette.building.marketAccent} />
      </mesh>
      <mesh position={[0, 0.86, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.10, 0.32, 4]} />
        <meshStandardMaterial color="#c04010" />
      </mesh>
      {[[0.92, 0], [-0.92, 0], [0, 0.92], [0, -0.92]].map(([fx, fz], i) => (
        <mesh key={i} position={[fx as number, 0.60, fz as number]}>
          <boxGeometry args={[0.08, 0.30, 0.22]} />
          <meshStandardMaterial ref={i === 0 ? matRef : undefined} color="#cc2200" />
        </mesh>
      ))}
      {[[-0.36, 0.92], [0.36, 0.92]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx as number, 0.52, lz as number]} renderOrder={1000}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#ff5500" depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
