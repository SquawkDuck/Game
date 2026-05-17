# Plan

## Overall Idea

Add a character movement system where each player controls their in-game character from the phone using touch slide controls that feel like fake thumbsticks.

## Known Details

- The game is a shared-screen hospital infection prototype with phone controllers.
- The current controller supports button-based movement between named rooms.
- The host screen renders a compact hospital map with room cards and player tokens.
- The new control should be touch-friendly on phones.
- The requested input style is slide/thumbstick-style controls rather than simple directional buttons.
- Movement should be continuous across the hospital map.
- The existing room-to-room button movement system should be replaced, not extended.
- Characters should physically move from one room area to another.
- Movement should be blocked by walls and furniture.
- Doorways or open paths should be the only ways to move between rooms.
- The simple 3x3 room grid should be replaced by the supplied illustrated hospital map image.
- Location areas should match the room labels and wall boundaries visible in the map image.
- Blocking volumes should cover walls and furniture visible in the map image.

## Collected Answers

- User wants phone-controlled character movement using fake thumbsticks.
- User chose continuous movement and wants to scrap room-to-room movement.
- User wants collision against walls and furniture.
- User supplied a hospital floorplan image and wants it used as the shared-screen map.

## Intermediate Steps

1. Add the supplied hospital map image as a public asset.
2. Replace the generated 3x3 host grid with the illustrated map and player overlays.
3. Replace room-to-room movement with continuous player positions on the map.
4. Define room polygons according to the image labels and wall boundaries.
5. Define blocking volumes for walls and major furniture.
6. Add a phone thumbstick UI that sends continuous movement vectors.
7. Validate movement server-side against map bounds and blocking volumes.
8. Derive current room, pickups, lab work, infection proximity, and meetings from physical position.
9. Verify host rendering, controller movement, collision, and production behavior.

## Current Open Question

None - implementation requested with supplied hospital map.
