/// <reference types="vite/client" />
/**
 * Dynamically loads all goods configs using Vite's import.meta.glob.
 * Adding a new good only requires creating a new folder + config.json.
 *
 * Usage:
 *   import { GOODS_REGISTRY, getGood } from '../config/goods/_loader'
 */
import type { GoodsConfig } from './_schema'

const _goodsModules = import.meta.glob('./*/config.json', { eager: true, import: 'default' })

export const GOODS_REGISTRY: Record<string, GoodsConfig> = Object.fromEntries(
  Object.entries(_goodsModules).map(([, cfg]) => [(cfg as GoodsConfig).id, cfg as GoodsConfig]),
)

// ── Helpers  ──────────────────────────────────────────────────────────────────

/** Returns a goods config by ID, throws if not found. */
export function getGood(id: string): GoodsConfig {
  const cfg = GOODS_REGISTRY[id]
  if (!cfg) throw new Error(`[goods/_loader] Unknown good id: "${id}"`)
  return cfg
}

/** Returns all goods that can be produced by a given building or zone. */
export function goodsProducedBy(buildingOrZoneId: string): GoodsConfig[] {
  return Object.values(GOODS_REGISTRY).filter(g => g.producedBy.includes(buildingOrZoneId))
}

/** Returns all goods of a given category. */
export function goodsByCategory(category: GoodsConfig['category']): GoodsConfig[] {
  return Object.values(GOODS_REGISTRY).filter(g => g.category === category)
}

/** Sorted list of all good IDs. */
export const ALL_GOOD_IDS: string[] = Object.keys(GOODS_REGISTRY).sort()

