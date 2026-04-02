/// <reference types="vite/client" />
/**
 * Dynamically loads all building configs using Vite's import.meta.glob.
 * Adding a new building only requires creating a new folder + config.json —
 * no changes needed here.
 *
 * Usage:
 *   import { BUILDING_REGISTRY, ADDON_REGISTRY, getBuildingAddons } from '../config/buildings/_loader'
 */
import type { BuildingConfig, AddonConfig } from './_schema'

// ── Building root configs  ────────────────────────────────────────────────────
// Vite resolves this glob at build time.
const _buildingModules = import.meta.glob('./*/config.json', { eager: true, import: 'default' })

export const BUILDING_REGISTRY: Record<string, BuildingConfig> = Object.fromEntries(
  Object.entries(_buildingModules).map(([, cfg]) => [(cfg as BuildingConfig).id, cfg as BuildingConfig]),
)

// ── Addon configs  ────────────────────────────────────────────────────────────
const _addonModules = import.meta.glob('./*/addons/*/config.json', { eager: true, import: 'default' })

export const ADDON_REGISTRY: Record<string, AddonConfig> = Object.fromEntries(
  Object.entries(_addonModules).map(([, cfg]) => [(cfg as AddonConfig).id, cfg as AddonConfig]),
)

// ── Helpers  ──────────────────────────────────────────────────────────────────

/** Returns all addon configs for a given parent building. */
export function getBuildingAddons(buildingId: string): AddonConfig[] {
  return Object.values(ADDON_REGISTRY).filter(a => a.parentBuildingId === buildingId)
}

/** Returns a building config by ID, throws if not found. */
export function getBuilding(id: string): BuildingConfig {
  const cfg = BUILDING_REGISTRY[id]
  if (!cfg) throw new Error(`[buildings/_loader] Unknown building id: "${id}"`)
  return cfg
}

/** Sorted list of all building IDs. */
export const ALL_BUILDING_IDS: string[] = Object.keys(BUILDING_REGISTRY).sort()

