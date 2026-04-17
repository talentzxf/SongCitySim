/// <reference types="vite/client" />
/**
 * Dynamically loads job behavior modules using Vite's import.meta.glob.
 *
 * Only job folders that contain a behavior.ts file are registered —
 * data-only jobs (farmer, smith, etc.) need no behavior.ts.
 *
 * Usage:
 *   import { JOB_BEHAVIOR_REGISTRY } from '../../config/jobs/_behavior_loader'
 */
import type { JobBehavior } from '../../state/engine/types'

// Vite resolves the glob at build time; `import: 'behavior'` extracts the
// named export directly, giving Record<path, JobBehavior | undefined>.
const _behaviorModules = import.meta.glob<JobBehavior>('./*/behavior.ts', {
  eager:  true,
  import: 'behavior',
})

export const JOB_BEHAVIOR_REGISTRY: Record<string, JobBehavior> = {}

for (const [path, mod] of Object.entries(_behaviorModules)) {
  // path looks like  "./patroller/behavior.ts"
  const jobId = path.replace(/^\.\//, '').replace(/\/behavior\.ts$/, '')
  if (mod) JOB_BEHAVIOR_REGISTRY[jobId] = mod
}

