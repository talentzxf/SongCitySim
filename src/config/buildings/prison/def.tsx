import type { BuildingDef } from '../_def_types'
import config from './config.json'
import PrisonMesh from './mesh'

const def: BuildingDef = { config: config as any, Mesh: PrisonMesh }
export default def

