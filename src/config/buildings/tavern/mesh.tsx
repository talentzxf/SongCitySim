import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import { useBuildingFacing } from '../_useBuildingFacing'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 酒肆
 * Night effect: banner lantern glows, sign post light on
 */
export default function TavernMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const rotY = useBuildingFacing(x, y)
  const bannerRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const signRef   = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef    = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    if (bannerRef.current) { bannerRef.current.emissive.setHex(0xcc0000); bannerRef.current.emissiveIntensity = depth * 1.0 }
    if (signRef.current)   { signRef.current.emissive.setHex(0xff8800);   signRef.current.emissiveIntensity   = depth * 1.3 }
  })

  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 主体 */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color={palette.building.tavernBody} />
      </mesh>

      {/* 横幅 */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.0, 0.12, 0.12]} />
        <meshStandardMaterial ref={bannerRef} color={palette.building.tavernBanner} />
      </mesh>

      {/* 旗杆 */}
      <mesh position={[0.5, 0.55, 0]}>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color="#5a3010" />
      </mesh>

      {/* 旗灯 */}
      <mesh position={[0.5, 0.82, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial ref={signRef} color="#ffaa00" />
      </mesh>
    </group>
  )
}
