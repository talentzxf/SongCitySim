/**
 * Unified building definition — mesh + behavior + config in one place.
 * Each building folder exports a default BuildingDef from its def.tsx.
 */
import type { BuildingMeshComponent } from './_mesh_types'
import type { BuildingLifecycle } from './_lifecycle'
import type { BuildingConfig } from './_schema'

export interface BuildingDef {
  /** Static config (from config.json) */
  config: BuildingConfig
  /** Three.js mesh component */
  Mesh: BuildingMeshComponent
  /** Optional tick-based behavior hooks */
  behavior?: BuildingLifecycle
}

