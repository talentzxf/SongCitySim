/**
 * Central barrel export for all meta-data registries.
 *
 * Usage:
 *   import { BUILDING_REGISTRY, GOODS_REGISTRY, JOB_REGISTRY } from '../config/meta'
 *   import { getBuilding, getGood, getJob }                    from '../config/meta'
 *   import type { BuildingConfig, GoodsConfig, JobConfig }     from '../config/meta'
 */

// ── Buildings ─────────────────────────────────────────────────────────────────
export type { BuildingConfig, AddonConfig, BuildingCategory, Footprint, JobSlot, IOEntry, BuildingPrerequisites, RenderAssets } from './buildings/_schema'
export { BUILDING_REGISTRY, ADDON_REGISTRY, getBuildingAddons, getBuilding, ALL_BUILDING_IDS } from './buildings/_loader'

// ── Building lifecycle (SDK + behavior registry) ──────────────────────────────
export type { BuildingLifecycle, BuildingTickContext, BuildingHousehold, UnitField } from './buildings/_lifecycle'
export { BEHAVIOR_REGISTRY, getBehavior, BUILDINGS_WITH_BEHAVIOR } from './buildings/_behavior_loader'

// ── Goods ─────────────────────────────────────────────────────────────────────
export type { GoodsConfig, GoodsCategory, GoodsFunction, GoodsEffect, CropData, ToolData } from './goods/_schema'
export { GOODS_REGISTRY, getGood, goodsProducedBy, goodsByCategory, ALL_GOOD_IDS } from './goods/_loader'

// ── Jobs ──────────────────────────────────────────────────────────────────────
export type { JobConfig, JobPrerequisites, JobAttributes } from './jobs/_schema'
export { JOB_REGISTRY, getJob, jobsForBuilding, ALL_JOB_IDS } from './jobs/_loader'

