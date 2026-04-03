import type { BuildingDef } from '../_def_types'
import config from './config.json'
import GranaryMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: GranaryMesh, behavior }
export default def

