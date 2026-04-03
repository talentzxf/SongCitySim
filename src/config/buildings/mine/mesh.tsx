import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 冶铁厂（矿山）
 * Night effect: tunnel entrance glow (lantern inside mine)
 */
export default function MineMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0xff8800)
    matRef.current.emissiveIntensity = depth * 0.5
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 矿洞主体 — 深灰石块 */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.9, 0.36, 0.9]} />
        <meshStandardMaterial color="#6b5a4e" roughness={0.95} />
      </mesh>

      {/* 矿洞入口（夜间洞口有提灯微光） */}
      <mesh position={[0, 0.18, 0.46]}>
        <boxGeometry args={[0.38, 0.3, 0.04]} />
        <meshStandardMaterial ref={matRef} color="#1a1008" />
      </mesh>

      {/* 矿石堆 */}
      <mesh position={[-0.28, 0.08, -0.28]} castShadow>
        <boxGeometry args={[0.26, 0.16, 0.26]} />
        <meshStandardMaterial color="#7a3a2a" roughness={1} />
      </mesh>

      {/* 木架横梁 */}
      <mesh position={[0, 0.42, 0.44]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
      <mesh position={[-0.22, 0.3, 0.44]} castShadow>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
      <mesh position={[0.22, 0.3, 0.44]} castShadow>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
    </group>
  )
}
