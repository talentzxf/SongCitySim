import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 药铺
 * Night effect: herb lamp glow (pharmacist prepares medicine by lamplight)
 */
export default function PharmacyMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0x44ff44)
    matRef.current.emissiveIntensity = depth * 1.0
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 主体 */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.75, 0.56, 0.75]} />
        <meshStandardMaterial color={palette.building.pharmacyBody} />
      </mesh>

      {/* 屋顶 */}
      <mesh position={[0, 0.72, 0]}>
        <coneGeometry args={[0.6, 0.45, 4]} />
        <meshStandardMaterial color={palette.building.pharmacyRoof} />
      </mesh>

      {/* 药臼 */}
      <mesh position={[0, 0.12, 0.42]}>
        <cylinderGeometry args={[0.09, 0.11, 0.1, 8]} />
        <meshStandardMaterial color="#8b7355" />
      </mesh>

      {/* 草药灯 */}
      <mesh position={[0, 0.56, 0.4]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#aaffaa" />
      </mesh>
    </group>
  )
}
