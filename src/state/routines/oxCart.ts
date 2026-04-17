/** Ox-cart logistics: now stored as Building.agents on granary buildings. */
import type { BuildingAgent, CropType } from '../types'
import type { TickRoutine } from './types'
import { OX_CART_SPEED, SIM_TICK_MS, MORNING_START, EVENING_START } from '../../config/simulation'
import { GRANARY_CAPACITY_PER, clampCrop, inventoryTotal, buildOxCartRoute, getAggregateCrops, addBldgCrop } from '../helpers'

export const oxCartRoutine: TickRoutine = (ctx) => {
  const { nextTick } = ctx
  const { granaries } = ctx
  let buildings = ctx.buildings
  let farmZones = ctx.farmZones
  const allPiles = farmZones.flatMap(z => z.piles)
  const arrived: BuildingAgent[] = []

  // Advance every ox-cart agent along its route
  buildings = buildings.map(b => {
    if (!b.agents.some(a => a.kind === 'oxcart')) return b
    const updatedAgents: BuildingAgent[] = []
    for (let cart of b.agents.filter(a => a.kind === 'oxcart')) {
      cart = { ...cart, route: cart.route.map(p => ({ ...p })) }
      let rem = cart.speed * (SIM_TICK_MS / 1000)
      while (rem > 0 && cart.routeIndex < cart.route.length - 1) {
        const seg = 1 - cart.routeT
        if (rem < seg) { cart.routeT += rem; rem = 0 }
        else { rem -= seg; cart.routeIndex += 1; cart.routeT = 0 }
      }
      // Pick up pile at the waypoint
      if (cart.pileWaypointIndex !== undefined && cart.routeIndex >= cart.pileWaypointIndex && !cart.pickedUp) {
        const pile = allPiles.find(p => p.id === cart.pileId)
        if (pile) {
          cart = { ...cart, cargoAmount: pile.amount, cargoType: pile.cropType as CropType }
          // Remove pile from its zone
          farmZones = farmZones.map(z => ({
            ...z, piles: z.piles.filter(p => p.id !== cart.pileId),
          }))
        }
        cart = { ...cart, pickedUp: true }
      }
      if (cart.routeIndex >= cart.route.length - 1) {
        arrived.push(cart)
      } else {
        updatedAgents.push(cart)
      }
    }
    return { ...b, agents: [...b.agents.filter(a => a.kind !== 'oxcart'), ...updatedAgents] }
  })

  // Deposit cargo at granary on arrival
  for (const cart of arrived) {
    if (cart.cargoAmount > 0) {
      const grInv  = getAggregateCrops(granaries)
      const cap    = granaries.reduce((sum, g) => sum + GRANARY_CAPACITY_PER * (g.level ?? 1), 0)
      const canAdd = Math.max(0, cap - inventoryTotal(grInv))
      if (canAdd > 0 && cart.granaryId) {
        buildings = addBldgCrop(
          buildings, cart.granaryId, cart.cargoType as CropType,
          Math.min(cart.cargoAmount, canAdd),
        )
      }
    }
    // Ensure the pile is removed even if not picked up
    farmZones = farmZones.map(z => ({ ...z, piles: z.piles.filter(p => p.id !== cart.pileId) }))
  }

  // Spawn new carts for uncollected piles during daytime
  const isDaytime = ctx.s.dayTime >= MORNING_START && ctx.s.dayTime <= EVENING_START
  if (isDaytime) {
    const allPilesNow   = farmZones.flatMap(z => z.piles)
    const assignedPiles = new Set(
      buildings.flatMap(b => b.agents.filter(a => a.kind === 'oxcart').map(a => a.pileId)),
    )
    for (const pile of allPilesNow) {
      if (assignedPiles.has(pile.id) || !granaries.length) continue
      const activeGranaries = granaries.filter(
        g => ctx.citizens.some(c => c.workplaceId === g.id && !c.isSick),
      )
      if (!activeGranaries.length) continue
      const g = activeGranaries.reduce((b, gr) =>
        (gr.x - pile.x) ** 2 + (gr.y - pile.y) ** 2 <
        (b.x  - pile.x) ** 2 + (b.y  - pile.y) ** 2 ? gr : b)
      const cartRoute = buildOxCartRoute(g, pile, ctx.s.roads)
      if (!cartRoute) continue
      const newCart: BuildingAgent = {
        id: `cart-${nextTick}-${pile.id.slice(-5)}`,
        kind: 'oxcart',
        pileId: pile.id, granaryId: g.id,
        route: cartRoute.route, routeIndex: 0, routeT: 0,
        speed: OX_CART_SPEED, pickedUp: false,
        cargoType: pile.cropType, cargoAmount: 0,
        pileWaypointIndex: cartRoute.pileWaypointIndex,
      }
      buildings = buildings.map(b => b.id === g.id ? { ...b, agents: [...b.agents, newCart] } : b)
      assignedPiles.add(pile.id)
    }
  }

  ctx.buildings = buildings
  ctx.farmZones = farmZones
  return ctx
}
