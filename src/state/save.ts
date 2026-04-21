/**
 * Save / Load utilities for CitySimWeb.
 *
 * File format (.citysave):
 *   gzip-compressed UTF-8 JSON — native browser CompressionStream, no deps.
 *   Backward-compat: plain JSON files are auto-detected by the missing gzip
 *   magic bytes (0x1f 0x8b) and read as-is.
 *
 * What is saved:
 *   All of CityState EXCEPT the 10 pure-UI fields listed in UIOnlyKey.
 *   Every new game-state field added to CityState is automatically included.
 *
 * Cross-seed restore:
 *   Saved seed ≠ current WORLD_SEED → stash in sessionStorage, redirect to
 *   ?seed=<saved>. Next page load calls consumePendingSave() to rehydrate.
 */

import { WORLD_SEED } from './worldgen'
import worldGenConfig from '../config/world-gen'
import type { CityState } from './types'

// ─── Version ─────────────────────────────────────────────────────────────────

export const SAVE_VERSION = 1

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The only fields excluded from saves — all pure UI / transient.
 * Everything else in CityState is automatically included.
 */
type UIOnlyKey =
  | 'running'
  | 'selectedBuildingType'
  | 'selectedTool'
  | 'selectedRoadMode'
  | 'selectedBuildingId'
  | 'selectedCitizenId'
  | 'selectedFarmZoneId'
  | 'selectedTerrainTile'
  | 'lastAction'
  | 'lastBuildAttempt'

export type SavedGameState = Omit<CityState, UIOnlyKey>

export type SaveFile = {
  version: typeof SAVE_VERSION
  savedAt: string
  worldSeed: number
  worldGenConfig: typeof worldGenConfig
  state: SavedGameState
}

// ─── Session-storage key ──────────────────────────────────────────────────────

const PENDING_KEY = '__CITYSIM_PENDING_LOAD_V1__'

// ─── Compression ─────────────────────────────────────────────────────────────

/** Compress a UTF-8 string to gzip bytes (native browser API, no deps). */
async function gzipCompress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Decompress gzip bytes back to a UTF-8 string. */
async function gzipDecompress(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Create a SaveFile from the current CityState.
 * All game state is included automatically via `...rest`.
 * Only the UIOnlyKey fields are stripped.
 */
export function createSaveFile(state: CityState): SaveFile {
  const {
    running,
    selectedBuildingType, selectedTool, selectedRoadMode,
    selectedBuildingId, selectedCitizenId, selectedFarmZoneId, selectedTerrainTile,
    lastAction, lastBuildAttempt,
    ...rest
  } = state

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    worldSeed: WORLD_SEED,
    worldGenConfig,
    state: rest,
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Serialize → gzip → download as .citysave binary file.
 * Call stop() before this to pause the simulation.
 */
export async function downloadSave(state: CityState): Promise<void> {
  const save = createSaveFile(state)
  const json = JSON.stringify(save)           // compact (no pretty-print)
  const bytes = await gzipCompress(json)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `城市存档_第${state.dayCount}天_月${state.month}.citysave`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Parsing / validation ─────────────────────────────────────────────────────

/** Parse and structurally validate a save JSON string.  Throws on error. */
export function parseSaveFile(json: string): SaveFile {
  let data: unknown
  try { data = JSON.parse(json) } catch {
    throw new Error('存档文件无法解析（JSON 格式错误）')
  }
  if (!data || typeof data !== 'object') throw new Error('存档文件格式无效')
  const d = data as Record<string, unknown>
  if (d['version'] !== SAVE_VERSION) {
    throw new Error(
      `存档版本不兼容（期望 v${SAVE_VERSION}，实际 v${d['version'] ?? '?'}）`,
    )
  }
  if (typeof d['worldSeed'] !== 'number') throw new Error('存档缺少 worldSeed')
  if (!d['state'] || typeof d['state'] !== 'object') throw new Error('存档缺少 state')
  return data as SaveFile
}

// ─── Load flow ────────────────────────────────────────────────────────────────

/**
 * Decode an ArrayBuffer from a .citysave (gzip) or legacy .json file.
 * Auto-detects format by gzip magic bytes 0x1f 0x8b.
 *
 * Returns:
 *  - The `SaveFile` when the world seed already matches.
 *  - `'redirecting'` when the page is being reloaded with the correct seed.
 *
 * Throws on corrupt / incompatible data.
 */
export async function applySaveFile(data: ArrayBuffer): Promise<SaveFile | 'redirecting'> {
  const bytes = new Uint8Array(data)
  // Detect gzip magic bytes vs plain JSON
  const json = (bytes[0] === 0x1f && bytes[1] === 0x8b)
    ? await gzipDecompress(bytes)
    : new TextDecoder().decode(bytes)
  const save = parseSaveFile(json)

  if (save.worldSeed === WORLD_SEED) {
    // Log a warning if worldGenConfig changed since this save was created.
    // We can't re-run worldgen here (it's a module-level IIFE), but the
    // mismatch is surfaced so the developer is aware.
    const savedCfg = JSON.stringify(save.worldGenConfig)
    const curCfg   = JSON.stringify(worldGenConfig)
    if (savedCfg !== curCfg) {
      console.warn(
        '[save] worldGenConfig changed since this save was created. ' +
        'Terrain layout may differ slightly despite matching worldSeed.',
      )
    }
    return save
  }

  // Different seed → stash and redirect so terrain is regenerated
  try {
    sessionStorage.setItem(PENDING_KEY, json)
    const url = new URL(window.location.href)
    url.searchParams.set('seed', String(save.worldSeed))
    window.location.replace(url.toString())
  } catch (e) {
    console.error('[save] redirect failed', e)
    throw new Error('无法切换地图种子，请手动刷新页面')
  }
  return 'redirecting'
}

/**
 * Called once on app startup to check for a pending cross-seed restore.
 * Returns the SaveFile and removes it from sessionStorage, or null if none.
 */
export function consumePendingSave(): SaveFile | null {
  let raw: string | null = null
  try { raw = sessionStorage.getItem(PENDING_KEY) } catch { return null }
  if (!raw) return null
  try { sessionStorage.removeItem(PENDING_KEY) } catch { /* best-effort */ }
  try {
    const save = parseSaveFile(raw)
    if (save.worldSeed !== WORLD_SEED) {
      console.warn('[save] pending save seed mismatch – discarding')
      return null
    }
    return save
  } catch (e) {
    console.error('[save] failed to parse pending save:', e)
    return null
  }
}

