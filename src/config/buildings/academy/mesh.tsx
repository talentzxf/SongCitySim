import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import { useBuildingFacing } from '../_useBuildingFacing'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 书院
 * Night effect: study lamp glows (scholars work late)
 */
export default function AcademyMesh({ x, y, baseY, occupants }: BuildingMeshProps) {
  const { state } = useSimulation()
  const rotY = useBuildingFacing(x, y, 2, 1)
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  const occRef = React.useRef(occupants)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])
  React.useEffect(() => { occRef.current = occupants },     [occupants])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0xffcc66)
    matRef.current.emissiveIntensity = occRef.current > 0 ? depth * 1.5 : depth * 0.5
  })

  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 大殿 */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.95, 0.6, 0.75]} />
        <meshStandardMaterial color={palette.building.academyBody} />
      </mesh>

      {/* 侧廊 */}
      <mesh position={[-0.55, 0.22, 0]} castShadow>
        <boxGeometry args={[0.2, 0.44, 0.5]} />
        <meshStandardMaterial color={palette.building.academyBody} />
      </mesh>

      {/* 飞檐屋顶 */}
      <mesh position={[0, 0.76, 0]}>
        <boxGeometry args={[1.1, 0.12, 0.9]} />
        <meshStandardMaterial color={palette.building.academyRoof} />
      </mesh>

      {/* 读书灯 */}
      <mesh position={[0.3, 0.45, 0.39]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ffe8b0" />
      </mesh>
    </group>
  )
}
