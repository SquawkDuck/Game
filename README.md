# Hospital Infection Prototype

A local shared-screen browser game prototype where one host display shows a compact hospital map and players use phones as private controllers.

## Run

```bash
npm start
```

Open the host screen at:

```text
http://localhost:3000
```

Create a room on the host screen, then join from phones using the room code or the controller URL shown on the host.

## Prototype Rules

- 4-10 players.
- 10-minute matches.
- 1 true infected at 4-5 players, 2 at 6-8, 3 at 9-10.
- Non-infected win by voting flu shots onto all true infected.
- Infected win if too many players die and the hospital closes, or if time expires while a true infected remains active.
- Infection state and true infected roles are private to phone screens.
- The shared screen stays neutral and shows only public movement, room layout, items, meetings, and match state.

## Local Routes

- `/` creates or joins a room.
- `/host?room=CODE` opens the shared screen.
- `/controller?room=CODE` opens the phone controller join flow.

The prototype uses only Node built-in modules. No package installation is required.
