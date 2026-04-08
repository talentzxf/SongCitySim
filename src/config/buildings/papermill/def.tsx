import type { BuildingDef } from '../_def_types'
import config from './config.json'
import PapermillMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: PapermillMesh, behavior }
export default def

