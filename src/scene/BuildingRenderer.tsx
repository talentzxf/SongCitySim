/// <reference types="vite/client" />
/**
 * Building render adapter.
 *
 * Strategy
 * ────────
 * 1. At build time, Vite scans src/config/buildings/ for any model.glb files.
 *    Any file that physically exists is registered in BUILDING_GLB_URLS.
 * 2. At runtime, BuildingGLBMesh loads the GLB via useGLTF (drei).
 * 3. If NO GLB exists for a building type (current state for all buildings),
 *    the caller falls back to the existing procedural Three.js mesh.
 *
 * Adding a real model
 * ───────────────────
 * Drop model.glb into  src/config/buildings/{id}/model.glb
 * That is it — no code changes needed.
 * The next vite build / HMR will pick it up automatically.
 */
import React, { Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import type { BuildingType } from '../state/types'

// ── GLB asset registry ────────────────────────────────────────────────────────
// Vite resolves this glob at build time.
// query: '?url' makes each value a resolved public URL string.
// Currently empty ({}) because no model.glb files have been created yet.
const _glbUrls = import.meta.glob<string>(
  '../config/buildings/*/model.glb',
  { eager: true, query: '?url', import: 'default' },
)

/** buildingId → resolved asset URL  (e.g. "/assets/blacksmith/model-AbCd1234.glb") */
export const BUILDING_GLB_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(_glbUrls).map(([path, url]) => {
    // '../config/buildings/blacksmith/model.glb' → 'blacksmith'
    const id = path.split('/').at(-2) ?? ''
    return [id, url]
  }),
)

/** Returns true if a real GLB model exists for the given building type. */
export function hasBuildingGLB(type: string): boolean {
  return type in BUILDING_GLB_URLS
}

// ── GLB mesh component ────────────────────────────────────────────────────────

interface GLBMeshProps {
  url: string
  x: number
  y: number
  baseY?: number
}

/**
 * Loads and renders a single building GLB.
 * - scene is cloned so multiple instances don't share the same object.
 * - Wrapped in <Suspense> by the parent so missing files don't crash.
 */
function GLBMesh({ url, x, y, baseY = 0 }: GLBMeshProps) {
  const { scene } = useGLTF(url)
  return <primitive object={scene.clone()} position={[x, baseY, y]} />
}

// ── Public API ────────────────────────────────────────────────────────────────

interface BuildingGLBRendererProps {
  type: BuildingType
  x: number
  y: number
  baseY?: number
}

/**
 * Renders the GLB model for a building if one exists; returns null otherwise.
 *
 * Usage in MapScene.tsx:
 *   if (hasBuildingGLB(b.type)) return <BuildingGLBRenderer ... />
 *   // else fall through to procedural mesh switch
 */
export function BuildingGLBRenderer({ type, x, y, baseY }: BuildingGLBRendererProps) {
  const url = BUILDING_GLB_URLS[type]
  if (!url) return null
  return (
    <Suspense fallback={null}>
      <GLBMesh url={url} x={x} y={y} baseY={baseY} />
    </Suspense>
  )
}

// Pre-warm useGLTF cache for any registered GLBs so first render is instant.
if (Object.keys(BUILDING_GLB_URLS).length > 0) {
  useGLTF.preload(Object.values(BUILDING_GLB_URLS))
}



