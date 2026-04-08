import type { BuildingDef } from '../_def_types'
import config from './config.json'
import LumbercampMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: LumbercampMesh, behavior }
export default def

