import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 巡检司 — 宋代地方治安衙门
 * 夜间大门有红灯笼微光
 */
export default function WatchpostMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const lanternRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!lanternRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    lanternRef.current.emissive.setHex(0xff3300)
    lanternRef.current.emissiveIntensity = depth * 1.2
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 主体院墙 */}
      <mesh position={[0, 0.20, 0]} castShadow>
        <boxGeometry args={[0.88, 0.40, 0.88]} />
        <meshStandardMaterial color="#c09060" roughness={0.8} />
      </mesh>
      {/* 屋顶 */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.94, 0.10, 0.94]} />
        <meshStandardMaterial color="#8b1a1a" roughness={0.7} />
      </mesh>
      {/* 大门 */}
      <mesh position={[0, 0.18, 0.45]}>
        <boxGeometry args={[0.30, 0.28, 0.04]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.9} />
      </mesh>
      {/* 左灯笼 */}
      <mesh position={[-0.14, 0.42, 0.44]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial ref={lanternRef} color="#cc2200" emissive="#cc2200" emissiveIntensity={0} />
      </mesh>
      {/* 右灯笼 */}
      <mesh position={[0.14, 0.42, 0.44]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#cc2200" emissive="#cc2200" emissiveIntensity={0} />
      </mesh>
      {/* 旗杆 */}
      <mesh position={[0.38, 0.55, 0]} castShadow>
        <boxGeometry args={[0.04, 0.72, 0.04]} />
        <meshStandardMaterial color="#6b4c1e" />
      </mesh>
      {/* 旗帜 */}
      <mesh position={[0.52, 0.84, 0]}>
        <boxGeometry args={[0.22, 0.16, 0.02]} />
        <meshStandardMaterial color="#cc1111" roughness={0.6} />
      </mesh>
    </group>
  )
}

