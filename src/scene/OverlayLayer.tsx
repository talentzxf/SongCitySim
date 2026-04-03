/**
 * OverlayLayer — selection rings, disease markers, building health overlays.
 */
import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SelectionRingMesh } from './MapPrimitives'

// ─── Sick-house marker (floating cross + skull) ───────────────────────────

function SickHouseMarker({ x, y, deadCount }: { x: number; y: number; deadCount: number }) {
  const groupRef = React.useRef<THREE.Group>(null)
  const matH     = React.useRef<THREE.MeshStandardMaterial>(null)
  const matV     = React.useRef<THREE.MeshStandardMaterial>(null)
  const timeRef  = React.useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (groupRef.current) groupRef.current.position.y = 1.45 + Math.sin(timeRef.current * 2.5) * 0.08
    const intensity = 0.5 + Math.abs(Math.sin(timeRef.current * 3)) * 0.5
    if (matH.current) matH.current.emissiveIntensity = intensity
    if (matV.current) matV.current.emissiveIntensity = intensity
  })

  const crossColor = deadCount > 0 ? '#8b0000' : '#ff2200'
  const glowColor  = deadCount > 0 ? '#cc0000' : '#ff6600'

  return (
    <group position={[x, 0, y]}>
      <group ref={groupRef} position={[0, 1.45, 0]}>
        <mesh><boxGeometry args={[0.24, 0.07, 0.07]} /><meshStandardMaterial ref={matH} color={crossColor} emissive={glowColor} emissiveIntensity={0.6} /></mesh>
        <mesh><boxGeometry args={[0.07, 0.24, 0.07]} /><meshStandardMaterial ref={matV} color={crossColor} emissive={glowColor} emissiveIntensity={0.6} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.16, 0.21, 18]} /><meshBasicMaterial color={glowColor} transparent opacity={0.55} /></mesh>
      </group>
      {deadCount > 0 && (
        <group position={[0, 1.1, 0]}>
          <mesh><sphereGeometry args={[0.075, 8, 8]} /><meshStandardMaterial color="#1a0505" emissive="#660000" emissiveIntensity={0.4} /></mesh>
          <mesh position={[-0.028, 0.018, 0.068]}><sphereGeometry args={[0.016, 6, 6]} /><meshBasicMaterial color="#000000" /></mesh>
          <mesh position={[ 0.028, 0.018, 0.068]}><sphereGeometry args={[0.016, 6, 6]} /><meshBasicMaterial color="#000000" /></mesh>
          {Array.from({ length: Math.min(deadCount, 5) }).map((_, i) => (
            <mesh key={i} position={[-0.04 + i * 0.02, -0.1, 0]}>
              <boxGeometry args={[0.012, 0.012, 0.012]} /><meshBasicMaterial color="#ff0000" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// ─── Public layer component ────────────────────────────────────────────────

export interface SickHouseInfo { id: string; x: number; y: number; deadCount: number }
export interface RingInfo { x: number; y: number; color: string; r: number }

export interface OverlayLayerProps {
  sickHouses: SickHouseInfo[]
  selectedBuildingRing: RingInfo | null
  selectedCitizenRing: RingInfo | null
}

export function OverlayLayer({ sickHouses, selectedBuildingRing, selectedCitizenRing }: OverlayLayerProps) {
  return (
    <>
      {sickHouses.map(h => <SickHouseMarker key={`sick-${h.id}`} x={h.x} y={h.y} deadCount={h.deadCount} />)}
      {selectedBuildingRing && <SelectionRingMesh {...selectedBuildingRing} />}
      {selectedCitizenRing  && <SelectionRingMesh {...selectedCitizenRing} />}
    </>
  )
}

