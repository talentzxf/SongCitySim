/**
 * CharacterLayer — renders all mobile entities: walkers, migrants, residents,
 * peddlers, ox carts, market buyers.
 */
import React from 'react'
import { SIM_TICK_MS } from '../config/simulation'
import {
  logicalMigrantPosAhead, logicalMotionPosAhead, logicalAgentPosAhead, logicalPeddlerStatePosAhead,
  type Migrant, type BuildingAgent, type PeddlerState, type CitizenMotion,
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

const AHEAD_S = SIM_TICK_MS / 1000  // look 1 tick ahead for smooth animation

export function CharacterLayer({
  walkers, migrants, residents, oxCarts, marketBuyers, peddlers,
  selectedCitizenId, onCitizenClick,
}: CharacterLayerProps) {
  return (
    <>
      {oxCarts.map(c => {
        const p = logicalAgentPosAhead(c, AHEAD_S)
        return <OxCartMesh key={c.id} x={p.x} y={p.y} loaded={c.pickedUp} />
      })}
      {marketBuyers.map(mb => {
        const p = logicalAgentPosAhead(mb, AHEAD_S)
        return <MarketBuyerMesh key={mb.id} x={p.x} y={p.y} loaded={mb.pickedUp} />
      })}
      {migrants.map(m => {
        const p = logicalMigrantPosAhead(m, AHEAD_S)
        return <MigrantHorse key={m.id} x={p.x} y={p.y} seed={m.seed ?? 0} />
      })}
      {walkers.map(w => {
        const p = logicalMotionPosAhead(w.motion, AHEAD_S)
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
        const pos = logicalPeddlerStatePosAhead(p.peddlerState, AHEAD_S)
        return <PeddlerMesh key={p.id} x={pos.x} y={pos.y} />
      })}
    </>
  )
}
