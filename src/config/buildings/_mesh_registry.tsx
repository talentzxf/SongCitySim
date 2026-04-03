/**
 * Building mesh registry.
 *
 * Maps building ID → React mesh component.
 * Adding a new building: create src/config/buildings/{id}/mesh.tsx and add one
 * line here.  No changes needed in MapScene.tsx.
 */
import type { BuildingMeshComponent } from './_mesh_types'

import HouseMesh      from './house/mesh'
import MarketMesh     from './market/mesh'
import GranaryMesh    from './granary/mesh'
import BlacksmithMesh from './blacksmith/mesh'
import MineMesh       from './mine/mesh'
import TeahouseMesh   from './teahouse/mesh'
import TavernMesh     from './tavern/mesh'
import TempleMesh     from './temple/mesh'
import AcademyMesh    from './academy/mesh'
import PharmacyMesh   from './pharmacy/mesh'

export const BUILDING_MESH_REGISTRY: Record<string, BuildingMeshComponent> = {
  house:       HouseMesh,
  market:      MarketMesh,
  granary:     GranaryMesh,
  blacksmith:  BlacksmithMesh,
  mine:        MineMesh,
  teahouse:    TeahouseMesh,
  tavern:      TavernMesh,
  temple:      TempleMesh,
  academy:     AcademyMesh,
  pharmacy:    PharmacyMesh,
}

