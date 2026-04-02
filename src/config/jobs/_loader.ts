/// <reference types="vite/client" />
/**
 * Dynamically loads all job configs using Vite's import.meta.glob.
 * Adding a new job only requires creating a new folder + config.json.
 *
 * Usage:
 *   import { JOB_REGISTRY, getJob } from '../config/jobs/_loader'
 */
import type { JobConfig } from './_schema'

const _jobModules = import.meta.glob('./*/config.json', { eager: true, import: 'default' })

export const JOB_REGISTRY: Record<string, JobConfig> = Object.fromEntries(
  Object.entries(_jobModules).map(([, cfg]) => [(cfg as JobConfig).id, cfg as JobConfig]),
)

// ── Helpers  ──────────────────────────────────────────────────────────────────

/** Returns a job config by ID, throws if not found. */
export function getJob(id: string): JobConfig {
  const cfg = JOB_REGISTRY[id]
  if (!cfg) throw new Error(`[jobs/_loader] Unknown job id: "${id}"`)
  return cfg
}

/** Returns all jobs that work in a given building. */
export function jobsForBuilding(buildingId: string): JobConfig[] {
  return Object.values(JOB_REGISTRY).filter(j => j.buildingIds.includes(buildingId))
}

/** Sorted list of all job IDs. */
export const ALL_JOB_IDS: string[] = Object.keys(JOB_REGISTRY).sort()

