/**
 * TypeScript schema for jobs / profession metadata.
 * Each job lives in its own folder: src/config/jobs/{id}/config.json
 */

/** Prerequisites a citizen must meet to be assigned this job. */
export type JobPrerequisites = {
  minCultureScore?: number   // minimum city culture score (0–100)
  minLiteracyRate?: number   // minimum city literacy rate (0–1)
  minAge?: number            // minimum citizen age
  maxAge?: number            // maximum citizen age
  techNodes?: string[]       // tech IDs that must be researched first
  requiredTraits?: string[]  // citizen trait IDs (future system)
}

/** Numerical attributes of the job. */
export type JobAttributes = {
  dailyIncome: number         // base wages per in-game day (文)
  satisfactionBonus: number   // flat satisfaction bonus while employed (0–100 scale)
  productivityBase: number    // base productivity multiplier (1.0 = normal)
  skillGrowthRate?: number    // productivity gain per in-game day of work
}

/** Asset references relative to the config.json folder. */
export type JobRenderAssets = {
  portrait?: string   // citizen portrait variant, e.g. "./portrait.png"
  iconSvg?: string    // SVG icon for UI, e.g. "./icon.svg"
}

/**
 * Full metadata for a single profession / job.
 * Config lives in:  jobs/{id}/config.json
 */
export type JobConfig = {
  id: string
  label: string                // Chinese display name, e.g. "铁匠"
  labelEn: string              // English name, e.g. "Blacksmith"
  buildingIds: string[]        // building IDs where this job is performed
  prerequisites: JobPrerequisites
  attributes: JobAttributes
  desc: string                 // Chinese description shown in citizen/building panels
  icon: string                 // emoji or relative asset path
  renderAssets?: JobRenderAssets
}

