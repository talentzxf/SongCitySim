(updated)

Added roads and tools to the MVP: pan/road/house/market/bulldoze. Map click places roads when Road tool selected, or places selected building when House/Market tool selected. Buildings cannot overlap roads.

Files changed:
- src/state/simulation.tsx (roads, tools, population growth linked to road adjacency)
- src/scene/MapScene.tsx (render roads, tool-aware click handling)
- src/ui/HUD.tsx (tool buttons)

Behavioral notes:
- Houses gain population each tick only if adjacent to a road (simple connectivity rule)
- Markets provide a small growth bonus
- Bulldoze currently not fully implemented (placeholder)
