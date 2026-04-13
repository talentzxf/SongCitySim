import type { BuildingDef } from '../_def_types'
import config from './config.json'
import ManorMesh from './mesh'

const def: BuildingDef = { config: config as any, Mesh: ManorMesh }
export default def

