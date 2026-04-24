import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import { useBuildingFacing } from '../_useBuildingFacing'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 造纸坊 — 竹帘水槽 + 晾纸架
 * 夜间有纸坊灯光（工人夜间也要晾纸）
 */
export default function PapermillMesh({ x, y, baseY, occupants }: BuildingMeshProps) {
  const { state } = useSimulation()
  const rotY = useBuildingFacing(x, y)
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0xffe0a0)
    matRef.current.emissiveIntensity = (occupants ?? 0) > 0 ? depth * 1.2 : depth * 0.3
  })

  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 主体坊屋 */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.88, 0.44, 0.80]} />
        <meshStandardMaterial color={palette.building.academyBody} roughness={0.8} />
      </mesh>
      {/* 坡屋顶 */}
      <mesh position={[0, 0.50, 0]}>
        <boxGeometry args={[1.0, 0.10, 0.92]} />
        <meshStandardMaterial color={palette.building.academyRoof} />
      </mesh>
      {/* 水槽（蓝色） */}
      <mesh position={[0.30, 0.06, 0]} castShadow>
        <boxGeometry args={[0.28, 0.12, 0.58]} />
        <meshStandardMaterial color="#4a8ab0" roughness={0.4} />
      </mesh>
      {/* 晾纸架 竖杆 */}
      {[-0.22, 0, 0.22].map((oz, i) => (
        <mesh key={i} position={[-0.42, 0.38, oz]} castShadow>
          <boxGeometry args={[0.04, 0.52, 0.04]} />
          <meshStandardMaterial color="#c8a060" />
        </mesh>
      ))}
      {/* 晾纸（白色薄片） */}
      {[-0.22, 0.22].map((oz, i) => (
        <mesh key={i} position={[-0.42, 0.46, oz + 0.11]}>
          <planeGeometry args={[0.36, 0.28]} />
          <meshStandardMaterial color="#f8f4e8" side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* 坊灯 */}
      <mesh position={[0, 0.44, 0.42]} renderOrder={1000}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ffe0a0" depthTest={false} />
      </mesh>
    </group>
  )
}
