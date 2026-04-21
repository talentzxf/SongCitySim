/**
 * TypeScript schema for building metadata.
 * Each building lives in its own folder: src/config/buildings/{id}/config.json
 * Addons live in:                        src/config/buildings/{id}/addons/{addonId}/config.json
 */

export type BuildingCategory =
  | 'residential'   // 居住：民居、四合院等
  | 'commercial'    // 商业：集市、茶坊、酒肆等
  | 'industrial'    // 工业/生产：铁匠铺、冶铁厂等
  | 'cultural'      // 文化/宗教：寺庙、书院等
  | 'civic'         // 公共设施：药铺等
  | 'storage'       // 仓储：粮仓等
  | 'farming'       // 农业：粮田、茶园等

/** Grid footprint in tiles. 1×1 is the default single tile. */
export type Footprint = {
  w: number   // width in tiles (east-west)
  h: number   // height in tiles (north-south)
}

/** A profession slot requirement for this building. */
export type JobSlot = {
  jobId: string   // references src/config/jobs/{jobId}/config.json
  slots: number   // how many workers of this type
}

/** A goods I/O entry (input consumed or output produced per in-game day). */
export type IOEntry = {
  goodId: string         // references src/config/goods/{goodId}/config.json
  amountPerDay: number   // units per in-game day at full staffing
  optional?: boolean     // if true, building still operates without this good (at reduced efficiency)
  condition?: string     // free-text runtime condition, e.g. "ore_vein_present"
}

/** Nearby building requirement for prerequisites. */
export type NearbyBuildingReq = {
  buildingId: string   // references another building id
  radiusTiles: number  // search radius in tiles
  minCount?: number    // minimum count (default 1)
}

/** Prerequisites that must be satisfied before the building can be placed/unlocked. */
export type BuildingPrerequisites = {
  nearbyBuildings?: NearbyBuildingReq[]  // must have these building types within radius
  minCityPopulation?: number             // city-wide population threshold
  minCityMoney?: number                  // treasury threshold
  techNodes?: string[]                   // technology IDs that must be researched first
  terrain?: string[]                     // tile must be ON one of these terrain types
  notTerrain?: string[]                  // tile must NOT be on any of these terrain types
}

/**
 * Asset references for the renderer (paths relative to the config.json folder).
 *
 * ⚠️  CURRENT STATE: These files do NOT yet exist.
 *     All buildings are currently rendered via procedural Three.js geometry
 *     defined in src/scene/MapScene.tsx (BlacksmithMesh, MineMesh, etc.).
 *
 * FUTURE: When a model.glb is placed in the building folder, the renderer
 *     will automatically prefer it over the procedural fallback mesh.
 */
export type RenderAssets = {
  model?: string     // 3D model file, e.g. "./model.glb"  (glTF 2.0, Y-up, 1 tile = 1 unit)
  texture?: string   // PBR albedo texture, e.g. "./texture.png"  (512×512 PNG)
  iconSvg?: string   // SVG icon for HUD panels, e.g. "./icon.svg"
}

// ─── Addon ────────────────────────────────────────────────────────────────────

/**
 * An optional add-on module that can be attached to a parent building.
 * Each addon occupies its own grid tile(s) adjacent to the parent.
 * Config lives in:  buildings/{parentId}/addons/{addonId}/config.json
 */
export type AddonConfig = {
  id: string
  parentBuildingId: string       // which building this attaches to
  label: string                  // Chinese display name
  labelEn: string                // English name
  cost: number                   // construction cost (文)
  maintenanceCostPerMonth: number
  footprint: Footprint           // addon occupies its own separate tile(s)
  extraWorkerSlots: number       // additional worker slots contributed
  extraJobs: JobSlot[]           // profession types for the extra slots
  inputs: IOEntry[]              // additional inputs consumed
  outputs: IOEntry[]             // additional goods produced
  prerequisites: BuildingPrerequisites
  desc: string
  icon: string                   // emoji or relative asset path
  renderAssets?: RenderAssets
}

// ─── Building ─────────────────────────────────────────────────────────────────

/**
 * Full metadata for a single building type.
 * Config lives in:  buildings/{id}/config.json
 */
export type BuildingConfig = {
  id: string
  label: string                  // Chinese display name, e.g. "铁匠铺"
  labelEn: string                // English name, e.g. "Blacksmith"
  category: BuildingCategory
  tier: number                   // unlock tier (1 = available from start)
  cost: number                   // construction cost (文)
  maintenanceCostPerMonth: number // monthly upkeep cost (文)
  footprint: Footprint           // grid cells this building occupies
  capacity: number               // housing capacity (0 for non-residential)
  workerSlots: number            // total worker slots (sum of all job slots)
  jobs: JobSlot[]                // profession breakdown for worker slots
  prerequisites: BuildingPrerequisites
  inputs: IOEntry[]              // goods consumed per day (at full operation)
  outputs: IOEntry[]             // goods produced per day (at full operation)
  addons: string[]               // available addon IDs (see addons/ subfolder)
  serviceRadius: number          // radius in tiles for service coverage (0 = no area service)
  needBonus: Partial<Record<'food' | 'safety' | 'culture', number>>  // per-tick need satisfaction bonus
  desc: string                   // Chinese description shown in UI
  icon: string                   // emoji or relative asset path
  renderAssets?: RenderAssets
  paletteRef?: string            // key into src/theme/palette for renderer color lookup
}

