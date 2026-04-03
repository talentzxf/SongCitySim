import type { BuildingDef } from '../_def_types'
import config from './config.json'
import AcademyMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: AcademyMesh, behavior }
export default def

