import React from 'react'
import type { BuildingMeshProps } from '../_mesh_types'
import { useBuildingFacing } from '../_useBuildingFacing'

/**
 * 囹圄（大牢）— 宋代监狱
 * 阴暗石砌方院，四角有望楼
 */
export default function PrisonMesh({ x, y, baseY }: BuildingMeshProps) {
  const rotY = useBuildingFacing(x, y)
  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 主体石砌墙 */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.90, 0.36, 0.90]} />
        <meshStandardMaterial color="#5a5a5a" roughness={0.95} />
      </mesh>
      {/* 屋顶 */}
      <mesh position={[0, 0.40, 0]} castShadow>
        <boxGeometry args={[0.96, 0.08, 0.96]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
      {/* 铁栅门 */}
      <mesh position={[0, 0.16, 0.46]}>
        <boxGeometry args={[0.28, 0.24, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" roughness={1} metalness={0.6} />
      </mesh>
      {/* 左前望楼 */}
      <mesh position={[-0.40, 0.52, 0.40]} castShadow>
        <boxGeometry args={[0.16, 0.28, 0.16]} />
        <meshStandardMaterial color="#4a4040" roughness={0.9} />
      </mesh>
      {/* 右前望楼 */}
      <mesh position={[0.40, 0.52, 0.40]} castShadow>
        <boxGeometry args={[0.16, 0.28, 0.16]} />
        <meshStandardMaterial color="#4a4040" roughness={0.9} />
      </mesh>
    </group>
  )
}
