/// <reference types="vite/client" />
/**
 * Unified building registry.
 * Auto-discovers all buildings via their def.tsx using Vite glob.
 * Single source of truth — replaces _mesh_registry.tsx + _behavior_loader.ts.
 */
import type { BuildingDef } from './_def_types'
import type { BuildingMeshComponent } from './_mesh_types'
import type { BuildingLifecycle } from './_lifecycle'

const _defModules = import.meta.glob('./*/def.tsx', { eager: true, import: 'default' })

export const BUILDING_DEF_REGISTRY: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(_defModules)
    .map(([, def]) => {
      const d = def as BuildingDef
      return d?.config?.id ? ([d.config.id, d] as [string, BuildingDef]) : null
    })
    .filter((e): e is [string, BuildingDef] => e !== null),
)

/** buildingId → Mesh component */
export const BUILDING_MESH_REGISTRY: Record<string, BuildingMeshComponent> = Object.fromEntries(
  Object.entries(BUILDING_DEF_REGISTRY).map(([id, d]) => [id, d.Mesh]),
)

/** Returns behavior lifecycle for a building type, or undefined. */
export function getBehavior(buildingType: string): BuildingLifecycle | undefined {
  return BUILDING_DEF_REGISTRY[buildingType]?.behavior
}

export const BUILDINGS_WITH_BEHAVIOR: string[] = Object.entries(BUILDING_DEF_REGISTRY)
  .filter(([, d]) => Boolean(d.behavior))
  .map(([id]) => id)
  .sort()

