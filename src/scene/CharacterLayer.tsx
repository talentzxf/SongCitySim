/**
 * CharacterLayer — renders all mobile entities: walkers, migrants, residents,
 * peddlers, ox carts, market buyers.
 */
import React from 'react'
import {
  logicalMigrantPos, logicalMotionPos, logicalAgentPos, logicalPeddlerStatePos,
  type Citizen, type Migrant, type BuildingAgent, type PeddlerState, type CitizenMotion,
} from '../state/simulation'
import MigrantHorse    from '../config/characters/migrant'
import CommutingWalker from '../config/characters/walker'
import ResidentAvatar  from '../config/characters/resident'
import PeddlerMesh     from '../config/characters/peddler'
import OxCartMesh      from '../config/characters/oxcart'
import MarketBuyerMesh from '../config/characters/marketbuyer'

export type ResidentRenderItem = { id: string; x: number; y: number; seed: number }

export interface CharacterLayerProps {
  /** Citizens with motion !== null */
  walkers:       { id: string; motion: CitizenMotion }[]
  migrants:      Migrant[]
  residents:     ResidentRenderItem[]
  /** Building agents with kind='oxcart' */
  oxCarts:       BuildingAgent[]
  /** Building agents with kind='marketbuyer' */
  marketBuyers:  BuildingAgent[]
  /** Citizens with peddlerState !== null */
  peddlers:      { id: string; peddlerState: PeddlerState }[]
  selectedCitizenId: string | null
  onCitizenClick: (citizenId: string, e: any) => void
}

export function CharacterLayer({
  walkers, migrants, residents, oxCarts, marketBuyers, peddlers,
  selectedCitizenId, onCitizenClick,
}: CharacterLayerProps) {
  return (
    <>
      {oxCarts.map(c => {
        const p = logicalAgentPos(c)
        return <OxCartMesh key={c.id} x={p.x} y={p.y} loaded={c.pickedUp} />
      })}
      {marketBuyers.map(mb => {
        const p = logicalAgentPos(mb)
        return <MarketBuyerMesh key={mb.id} x={p.x} y={p.y} loaded={mb.pickedUp} />
      })}
      {migrants.map(m => {
        const p = logicalMigrantPos(m)
        return <MigrantHorse key={m.id} x={p.x} y={p.y} />
      })}
      {walkers.map(w => {
        const p = logicalMotionPos(w.motion)
        return (
          <CommutingWalker
            key={w.id} x={p.x} y={p.y} purpose={w.motion.purpose}
            selected={selectedCitizenId === w.id}
            onClick={(e: any) => onCitizenClick(w.id, e)} />
        )
      })}
      {residents.map(r => (
        <ResidentAvatar
          key={r.id} x={r.x} y={r.y} seed={r.seed}
          selected={selectedCitizenId === r.id}
          onClick={(e: any) => onCitizenClick(r.id, e)} />
      ))}
      {peddlers.map(p => {
        const pos = logicalPeddlerStatePos(p.peddlerState)
        return <PeddlerMesh key={p.id} x={pos.x} y={pos.y} />
      })}
    </>
  )
}
