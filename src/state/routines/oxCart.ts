/** Ox-cart logistics: move carts along their routes, pick up farm piles, deliver to granary. */
import type { OxCart } from '../types'
import type { TickRoutine } from './types'
import { OX_CART_SPEED, SIM_TICK_MS, MORNING_START, EVENING_START } from '../../config/simulation'
import { GRANARY_CAPACITY_PER, clampCrop, inventoryTotal, buildOxCartRoute } from '../helpers'
export const oxCartRoutine: TickRoutine = (ctx) => {
  const { s, nextTick } = ctx
  let farmPiles        = ctx.farmPiles
  let granaryInventory = ctx.granaryInventory
  const { granaries }  = ctx
  const arrived: OxCart[] = []
  let oxCarts = ctx.oxCarts.map(c => ({ ...c, route: c.route.map(p => ({ ...p })) }))
  // advance every cart along its route
  oxCarts = oxCarts.filter(cart => {
    let rem = cart.speed * (SIM_TICK_MS / 1000)
    while (rem > 0 && cart.routeIndex < cart.route.length - 1) {
      const seg = 1 - cart.routeT
      if (rem < seg) { cart.routeT += rem; rem = 0 }
      else { rem -= seg; cart.routeIndex += 1; cart.routeT = 0 }
    }
    // pick up pile when the cart reaches the pile waypoint
    if (cart.routeIndex >= cart.pileWaypointIndex && !cart.pickedUp) {
      const idx = farmPiles.findIndex(p => p.id === cart.pileId)
      if (idx >= 0) {
        cart.cargoAmount = farmPiles[idx].amount
        cart.cargoType   = farmPiles[idx].cropType
        farmPiles        = farmPiles.filter((_, i) => i !== idx)
      }
      cart.pickedUp = true
    }
    if (cart.routeIndex >= cart.route.length - 1) { arrived.push(cart); return false }
    return true
  })
  // deposit cargo into granary on arrival
  for (const cart of arrived) {
    if (cart.cargoAmount > 0) {
      const cap      = granaries.length * GRANARY_CAPACITY_PER
      const canStore = Math.max(0, cap - inventoryTotal(granaryInventory))
      if (canStore > 0) {
        granaryInventory = {
          ...granaryInventory,
          [cart.cargoType]: clampCrop(
            granaryInventory[cart.cargoType] + Math.min(cart.cargoAmount, canStore),
          ),
        }
      }
    }
    farmPiles = farmPiles.filter(p => p.id !== cart.pileId)
  }
  // spawn new carts for uncollected piles during daytime
  const isDaytime       = s.dayTime >= MORNING_START && s.dayTime <= EVENING_START
  const assignedPileIds = new Set(oxCarts.map(c => c.pileId))
  if (isDaytime) {
    for (const pile of farmPiles) {
      if (assignedPileIds.has(pile.id) || !granaries.length) continue
      const activeGranaries = granaries.filter(
        g => ctx.citizens.some(c => c.workplaceId === g.id && !c.isSick),
      )
      if (!activeGranaries.length) continue
      const g = activeGranaries.reduce((b, gr) =>
        (gr.x - pile.x) ** 2 + (gr.y - pile.y) ** 2 <
        (b.x  - pile.x) ** 2 + (b.y  - pile.y) ** 2 ? gr : b)
      const cartRoute = buildOxCartRoute(g, pile, s.roads)
      if (!cartRoute) continue
      oxCarts = [...oxCarts, {
        id: `cart-${nextTick}-${pile.id.slice(-5)}`,
        pileId: pile.id, granaryId: g.id,
        route: cartRoute.route, routeIndex: 0, routeT: 0,
        speed: OX_CART_SPEED, pickedUp: false,
        cargoType: pile.cropType, cargoAmount: 0,
        pileWaypointIndex: cartRoute.pileWaypointIndex,
      }]
      assignedPileIds.add(pile.id)
    }
  }
  ctx.oxCarts          = oxCarts
  ctx.farmPiles        = farmPiles
  ctx.granaryInventory = granaryInventory
  return ctx
}
