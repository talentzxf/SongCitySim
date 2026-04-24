import React from 'react'
import * as THREE from 'three'
import type { BuildingMeshProps } from '../_mesh_types'
import { useBuildingFacing } from '../_useBuildingFacing'

/**
 * 采木场 — 伐木工棚 + 原木堆
 */
export default function LumbercampMesh({ x, y, baseY }: BuildingMeshProps) {
  const rotY = useBuildingFacing(x, y)
  return (
    <group position={[x, baseY, y]} rotation={[0, rotY, 0]}>
      {/* 工棚主体 */}
      <mesh position={[0, 0.20, 0]} castShadow>
        <boxGeometry args={[0.80, 0.40, 0.70]} />
        <meshStandardMaterial color="#8b6914" roughness={0.9} />
      </mesh>
      {/* 棚顶（斜面草屋） */}
      <mesh position={[0, 0.46, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.60, 0.28, 4]} />
        <meshStandardMaterial color="#5a4010" roughness={1} />
      </mesh>
      {/* 原木堆 ×3 */}
      {[[-0.28, 0], [0, 0], [0.28, 0]].map(([ox, oz], i) => (
        <mesh key={i} position={[ox as number, 0.08, (oz as number) + 0.38]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.55, 8]} />
          <meshStandardMaterial color="#a0622a" roughness={0.95} />
        </mesh>
      ))}
      {/* 横放原木 */}
      <mesh position={[0, 0.16, 0.38]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.72, 8]} />
        <meshStandardMaterial color="#b07a38" roughness={0.9} />
      </mesh>
      {/* 斧头 */}
      <mesh position={[0.38, 0.22, -0.20]} rotation={[0, 0.5, 0.4]} castShadow>
        <boxGeometry args={[0.06, 0.26, 0.04]} />
        <meshStandardMaterial color="#6a6a72" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}
