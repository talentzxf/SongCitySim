import type { BuildingDef } from '../_def_types'
import config from './config.json'
import WatchpostMesh from './mesh'

const def: BuildingDef = { config: config as any, Mesh: WatchpostMesh }
export default def

