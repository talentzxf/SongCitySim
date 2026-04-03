import type { BuildingDef } from '../_def_types'
import config from './config.json'
import TavernMesh from './mesh'

const def: BuildingDef = { config: config as any, Mesh: TavernMesh }
export default def

