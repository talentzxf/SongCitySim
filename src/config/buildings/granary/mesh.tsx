import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 粮仓 — sturdy storage, minimal night effect (just a guard lamp)
 */
export default function GranaryMesh({ x, y, baseY }: BuildingMeshProps) {
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
    matRef.current.emissiveIntensity = depth * 1.0
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 仓体 */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color={palette.building.granaryBody} />
      </mesh>

      {/* 屋顶 */}
      <mesh position={[0, 0.75, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.74, 0.45, 4]} />
        <meshStandardMaterial color={palette.building.granaryRoof} />
      </mesh>

      {/* 通气筒 */}
      <mesh position={[0.32, 0.2, 0.32]}>
        <cylinderGeometry args={[0.06, 0.06, 0.18, 8]} />
        <meshStandardMaterial color="#f0d98a" />
      </mesh>

      {/* 守仓灯 */}
      <mesh position={[0, 0.6, 0.46]} renderOrder={1000}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ffaa00" depthTest={false} />
      </mesh>
    </group>
  )
}
