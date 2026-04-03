import type { BuildingDef } from '../_def_types'
import config from './config.json'
import HouseMesh from './mesh'

const def: BuildingDef = { config: config as any, Mesh: HouseMesh }
export default def

