import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import { useBuildingFacing } from '../_useBuildingFacing'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 茶馆
 * Night effect: red lantern brightens — the more welcoming it is at night
 */
export default function TeahouseMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const rotY = useBuildingFacing(x, y)
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.8) * 0.15
    matRef.current.emissive.setHex(0xff2200)
    matRef.current.emissiveIntensity = (0.3 + depth * 1.6) * pulse
  })

  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 主体 */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.82, 0.6, 0.82]} />
        <meshStandardMaterial color={palette.building.teahouseBody} />
      </mesh>

      {/* 屋顶（八角） */}
      <mesh position={[0, 0.75, 0]} rotation={[0, Math.PI / 8, 0]}>
        <coneGeometry args={[0.65, 0.5, 8]} />
        <meshStandardMaterial color={palette.building.teahouseRoof} />
      </mesh>

      {/* 红灯笼 */}
      <mesh position={[0.1, 0.85, 0.1]} renderOrder={1000}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ff4400" depthTest={false} />
      </mesh>
    </group>
  )
}
