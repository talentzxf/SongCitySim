import type { BuildingDef } from '../_def_types'
import config from './config.json'
import TempleMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: TempleMesh, behavior }
export default def

