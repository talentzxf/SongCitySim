import type { BuildingDef } from '../_def_types'
import config from './config.json'
import BlacksmithMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: BlacksmithMesh, behavior }
export default def

