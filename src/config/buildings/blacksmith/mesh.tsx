import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 铁匠铺
 * Night effect: forge glow intensifies (smiths work by firelight)
 */
export default function BlacksmithMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const forgeRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const sparkRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef   = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(({ clock }) => {
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    if (forgeRef.current) {
      forgeRef.current.emissive.setHex(0xff4400)
      forgeRef.current.emissiveIntensity = 0.8 + depth
    }
    if (sparkRef.current) {
      const flicker = Math.abs(Math.sin(clock.elapsedTime * 8)) * 0.7
      sparkRef.current.emissive.setHex(0xff6600)
      sparkRef.current.emissiveIntensity = depth * (0.5 + flicker)
    }
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 主体 */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.85, 0.44, 0.85]} />
        <meshStandardMaterial color={palette.building.blacksmithBody} />
      </mesh>

      {/* 烟囱 */}
      <mesh position={[0.25, 0.65, 0.25]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.18]} />
        <meshStandardMaterial color={palette.building.blacksmithChimney} />
      </mesh>

      {/* 炉火 */}
      <mesh position={[0, 0.18, 0.45]} renderOrder={1000}>
        <boxGeometry args={[0.3, 0.22, 0.04]} />
        <meshStandardMaterial ref={forgeRef} color="#ff6600" depthTest={false} />
      </mesh>

      {/* 烟囱火星 */}
      <mesh position={[0.25, 0.93, 0.25]} renderOrder={1000}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial ref={sparkRef} color="#ff8800" depthTest={false} />
      </mesh>
    </group>
  )
}
