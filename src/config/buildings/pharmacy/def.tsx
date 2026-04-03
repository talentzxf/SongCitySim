import type { BuildingDef } from '../_def_types'
import config from './config.json'
import PharmacyMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: PharmacyMesh, behavior }
export default def

