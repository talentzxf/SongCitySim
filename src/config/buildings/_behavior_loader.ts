/// <reference types="vite/client" />
// Backward-compat shim — canonical source is _registry.tsx
export { getBehavior, BUILDINGS_WITH_BEHAVIOR } from './_registry'
export type { BuildingLifecycle } from './_lifecycle'

import { BUILDING_DEF_REGISTRY } from './_registry'
export const BEHAVIOR_REGISTRY = Object.fromEntries(
  Object.entries(BUILDING_DEF_REGISTRY)
    .filter(([, d]) => d.behavior)
    .map(([id, d]) => [id, d.behavior!]),
)
