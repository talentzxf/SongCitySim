import type { BuildingDef } from '../_def_types'
import config from './config.json'
import MarketMesh from './mesh'
import { behavior } from './behavior'

const def: BuildingDef = { config: config as any, Mesh: MarketMesh, behavior }
export default def

