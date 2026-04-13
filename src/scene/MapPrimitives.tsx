/**
 * Shared instanced-mesh primitives used by multiple scene layers.
 * Keep these small and dependency-free (React + THREE + palette only).
 */
import React from 'react'
import * as THREE from 'three'
import { palette } from '../theme/palette'

// ─── Flat instanced quads (all same y) ────────────────────────────────────

export function FlatInstances({
  items, y = 0, size = [1, 1] as [number, number],
  color, opacity = 1, rotationZ = 0, renderOrder = 0,
}: {
  items: Array<{ x: number; y: number }>
  y?: number; size?: [number, number]; color: string; opacity?: number; rotationZ?: number
  renderOrder?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current; const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      temp.position.set(items[i].x, y, items[i].y)
      temp.rotation.set(-Math.PI / 2, 0, rotationZ)
      temp.scale.set(1, 1, 1); temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items, y, rotationZ])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false} renderOrder={renderOrder}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={renderOrder === 0} />
    </instancedMesh>
  )
}

// ─── Variable-height flat instances (each item has its own y) ─────────────

export function VariableHeightFlatInstances({
  items, size, color, opacity = 1,
}: {
  items: Array<{ x: number; y: number; h: number }>
  size: [number, number]; color: string; opacity?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current || items.length === 0) return
    const mesh = ref.current; const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      temp.position.set(items[i].x, items[i].h, items[i].y)
      temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1); temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items])
  if (items.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  )
}

// ─── Circle (disc) instances ───────────────────────────────────────────────

export function CircleInstances({
  items, y = 0, radius = 0.1, color, opacity = 1,
}: {
  items: Array<{ x: number; y: number }>
  y?: number; radius?: number; color: string; opacity?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current; const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      temp.position.set(items[i].x, y, items[i].y)
      temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1); temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items, y])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <circleGeometry args={[radius, 10]} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </instancedMesh>
  )
}

// ─── Tile instanced mesh (checkerboard ground) ─────────────────────────────

export function TileInstances({ tiles }: { tiles: [number, number][] }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current; const temp = new THREE.Object3D(); const color = new THREE.Color()
    mesh.count = tiles.length
    for (let i = 0; i < tiles.length; i++) {
      const [x, y] = tiles[i]
      temp.position.set(x, 0, y); temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1); temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
      color.set((x + y) % 2 === 0 ? palette.map.tileLight : palette.map.tileDark)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [tiles])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(tiles.length, 1)]} frustumCulled={false}>
      <planeGeometry args={[0.98, 0.98]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

// ─── Selection ring ────────────────────────────────────────────────────────

export function SelectionRingMesh({ x, y, color = '#faad14', r = 0.52 }: {
  x: number; y: number; color?: string; r?: number
}) {
  return (
    <group>
      <mesh position={[x, 0.04, y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.55, r * 1.22, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[x, 0.07, y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.70, r, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  )
}

