/// <reference types="vite/client" />
// Behavior loader — scans every  buildings/{id}/behavior.ts  at build time.
// Adding behavior to a building = create behavior.ts in its folder.
// No manual registration needed.
import type { BuildingLifecycle } from './_lifecycle'

const _modules = import.meta.glob('./*/behavior.ts', { eager: true })

export const BEHAVIOR_REGISTRY: Record<string, BuildingLifecycle> = Object.fromEntries(
  Object.entries(_modules)
    .map(([path, mod]) => {
      const id       = path.split('/')[1]                               // './blacksmith/behavior.ts' → 'blacksmith'
      const behavior = (mod as { behavior?: BuildingLifecycle }).behavior
      return behavior ? ([id, behavior] as [string, BuildingLifecycle]) : null
    })
    .filter((e): e is [string, BuildingLifecycle] => e !== null),
)

/** Returns the lifecycle object for a given building type, or undefined. */
export function getBehavior(buildingType: string): BuildingLifecycle | undefined {
  return BEHAVIOR_REGISTRY[buildingType]
}

/** All building IDs that have a behavior.ts registered. */
export const BUILDINGS_WITH_BEHAVIOR: string[] = Object.keys(BEHAVIOR_REGISTRY).sort()


