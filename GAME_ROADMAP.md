# Browser Game Roadmap: Local Multiplayer + Phone Controllers + Secret Interactions

> Inline note: This document defines the implementation roadmap for a shared-screen browser game where players use phones as controllers, including hidden player-specific interactions.

## 1) Vision and Core Experience

Build a browser game where:
- One **host/game instance** runs on a large display (TV/projector/monitor).
- Multiple players join via phone browsers and use their phones as controllers.
- Each player has:
  - **Public interactions** visible on the shared screen.
  - **Secret interactions** delivered privately on their own phone UI.

Primary design goals:
- Fast join/setup (<60 seconds from QR scan to gameplay).
- Responsive controls under typical local Wi-Fi latency.
- Clear separation between public and private information.

---

## 2) Gameplay Interaction Model

### Public (Shared-Screen) Interactions
- Movement, aiming, dashing, grabbing, triggering map elements.
- Visible actions that all players can react to in real time.
- Score/events feedback shown on the big display.

### Secret (Phone-Only) Interactions
- Private missions/objectives.
- Hidden inventory cards/items.
- Bluff/traitor role prompts.
- Silent voting or prediction choices.

### Design Rule
- Any secret interaction must:
  1. Be sent only to the intended player phone.
  2. Avoid leaks through host logs/URLs/UI.
  3. Have a meaningful gameplay effect without exposing exact private state.

---

## 3) System Architecture

### Clients
1. **Host Client (Big Screen)**
   - Renders main game world and all public state.
   - Runs game loop (or receives authoritative state).

2. **Controller Client (Phone)**
   - Input controls (virtual joystick/buttons/gestures).
   - Private UI layer for secret info and decisions.

### Backend / Realtime Layer
- Room/session management.
- Player join/auth tokens.
- Realtime message routing (public + private channels).
- Optional authoritative simulation logic.

### Recommended Transport
- **WebSockets** for low-latency bidirectional messaging.
- Optional fallback transport (long polling) only if necessary.

---

## 4) Session and Join Flow

1. Host opens game URL and creates room.
2. Host screen shows QR code + short room code.
3. Players scan QR or enter room code on phone.
4. Phone registers player name/color/avatar.
5. Server assigns player ID + session token.
6. Phone enters controller UI; host lobby updates live.
7. Host starts match when minimum players joined.

### Reconnect Behavior
- If phone disconnects briefly, allow rejoin with same token.
- If reconnect timeout exceeds threshold, mark player inactive and optionally bot-fill.

---

## 5) Networking and State Sync Plan

### Authority Model (Recommended)
- Server-authoritative game state for fairness and anti-cheat.
- Phones send input intents only.
- Host displays state snapshots/deltas.

### Message Categories
- `room:*` (join, leave, ready, start)
- `input:*` (move, action, interact)
- `state:*` (snapshot, delta, tick)
- `private:*` (mission, secret prompt, hidden result)
- `event:*` (round end, score update, elimination)

### Tick / Update Strategy
- Fixed simulation tick (e.g., 20–30Hz server-side).
- Render interpolation on clients for smooth visuals.
- Input buffering + sequence numbers for ordering.

---

## 6) Secret Interaction Security Plan

### Security Principles
- Use per-connection authenticated sessions.
- Private events routed by player ID and validated server-side.
- Never trust phone-reported secret outcomes without validation.

### Practical Safeguards
- Short-lived join tokens.
- Signed room join payloads.
- Rate-limiting input spam.
- Basic anti-replay checks with nonce/sequence.

### Privacy UX Safeguards
- Secret prompts appear only on phone.
- Shared screen shows neutral placeholder (e.g., “Player deciding…”).
- Delay/reveal mechanics to reduce inference from timing.

---

## 7) Game State and Data Model (Draft)

### Core Entities
- `Room`: code, host connection, phase, settings.
- `Player`: id, name, connection, public stats, private state reference.
- `Match`: timer, map, round, scores.
- `PrivateState`: role, secret objectives, hidden inventory.

### Persistence Scope
- In-memory for active matches.
- Optional lightweight storage for:
  - analytics,
  - player preferences,
  - post-match summaries.

---

## 8) Tech Stack Recommendation

### Frontend
- Host: Canvas/WebGL framework (Phaser or Pixi + custom loop).
- Controller: Mobile-first web UI (React/Vue/Svelte acceptable).

### Backend
- Node.js + WebSocket library (Socket.IO or ws).
- Optional Redis adapter for scaling rooms across instances.

### Infrastructure
- HTTPS required for reliable mobile browser compatibility.
- Single domain for host/controller routes simplifies session handling.

---

## 9) Milestone Roadmap

### Milestone 1 — Vertical Slice (Foundation)
- Create room + QR join.
- Connect 2–4 phone controllers.
- Basic movement/actions shown on host screen.
- End-to-end latency target validated on local Wi-Fi.

### Milestone 2 — Lobby + Match Loop
- Ready checks and start flow.
- Round timer, win condition, rematch flow.
- Reconnect and disconnect handling.

### Milestone 3 — Secret Interaction Layer
- Private mission delivery.
- Hidden choice prompts.
- Secret outcome affects public game state.

### Milestone 4 — Balance + UX Polish
- Tune control feel and readability on big screen.
- Improve phone ergonomics and accessibility.
- Add tutorials/onboarding micro-prompts.

### Milestone 5 — Hardening + Launch Prep
- Load tests for max intended players.
- Anti-cheat and abuse mitigation pass.
- Telemetry dashboards and crash/error monitoring.

---

## 10) QA and Testing Roadmap

### Functional Testing
- Join flow across iOS/Android browsers.
- Host recovery and room lifecycle edge cases.
- Secret event isolation verification.

### Network Testing
- Simulate jitter/packet loss.
- Validate behavior at 100ms+ latency.
- Ensure no desync over longer rounds.

### Security Testing
- Attempt unauthorized private message subscriptions.
- Token reuse/replay attempts.
- Input flooding and rate-limit validation.

---

## 11) Delivery Plan for Coding Work

1. Scaffold host and controller routes/apps.
2. Implement room service + realtime gateway.
3. Build controller input protocol and host renderer binding.
4. Implement lobby/match state machine.
5. Add private messaging channel + secret mechanics.
6. Add reconnect/resume logic.
7. Add observability (logs/metrics/traces).
8. Run multi-device QA and optimize latency.

---

## 12) Open Questions (Resolve Before Full Build)

- Maximum supported players per room target?
- Preferred game genre (arena brawler, party mini-games, social deduction, etc.)?
- Session duration target per match?
- Is internet access required, or should LAN-only fallback be supported?
- Do we need spectator mode?

---

## 13) Definition of Done (Roadmap Complete)

The roadmap is successfully executed when:
- Players can join quickly from phones and control characters smoothly.
- Public and secret interactions both function reliably.
- Secret info remains private by design and by implementation.
- Match flow is stable under realistic local network conditions.

---

## 14) Active Planning Loop

### Overall Idea

Build the first playable version of the shared-screen browser game: a host display creates a room, players join from phones, and phone inputs drive visible gameplay while private prompts stay on each player's device.

The first game concept is a social-deduction infection game inspired by Among Us-style hidden-role play. Players are secretly assigned as infected or non-infected. Infected players spread infection through proximity and exposure time, while non-infected players do not know who is infected unless the game later adds private discovery mechanics.

### Known Details

- The game is browser-based.
- The host screen and phone controller clients are separate experiences.
- Players should join quickly through QR code or room code.
- Realtime control should use WebSockets or an equivalent low-latency transport.
- Secret interactions must be routed privately and validated server-side.
- The first implementation should focus on a small vertical slice before full polish.
- The first playable genre is hidden-role social deduction.
- Secret roles are `infected` and `non-infected`.
- Infected players can infect non-infected players through proximity plus exposure time.
- Infected players have a phone-only action: "infect this room".
- A room infected from the phone becomes contagious for a limited duration.
- Infection state, room contamination, and infected-player actions must remain hidden from non-infected players.
- The shared host screen must not show clues that reveal infected players, infection attempts, or contaminated rooms.
- Current win-condition idea is under review because "infect everyone" vs "cure everyone" can collapse into a simple all-or-nothing ending.
- Infected win-condition candidate: spread infection enough to control the match before the cure/vote system stops them.
- Non-infected win-condition candidate: identify, cure, quarantine, or neutralize the active infected before they reach control.
- Core design risk: if infection automatically switches a player's team, a newly infected player may lose motivation to help their original side.
- Preferred design direction: separate `team allegiance` from `infection status`.
- A player's original side can remain fixed while infection changes their private condition, abilities, scoring, or pressure.
- Selected motivation direction: use a corruption track so infection progresses through stages before a player is fully infected.
- Fully infected players should eventually die and be removed from active play after a timed period.
- Prototype corruption track: healthy, exposed, symptomatic, contagious, critical.
- Prototype timing target: roughly 2.5 minutes from first exposure to death if nobody intervenes.
- Flu shots are the primary counterplay tool: they cure corrupted players and can remove or neutralize infected threats.
- Flu shots should be limited resources, not unlimited vote actions.
- Flu shots may be found on the map, respawn after a timer, require player work/tasks to generate, or combine those systems.
- Selected flu shot acquisition loop: hybrid map pickup plus task generation.
- Flu shot use requires a group vote.
- The game assumes players are physically together and can talk to each other in person.
- Meetings are player-requested from phones and only start if enough players accept the request.
- Meeting acceptance threshold: majority of active players.
- Once a meeting is accepted, all active shared-screen characters automatically walk to a central meeting location and phone movement controls are disabled.
- Meeting timer: 5 minutes total.
- Players can vote at any time during the meeting and can end the meeting early if the vote is complete.
- Meeting early-end rule: majority of active eligible players can end the meeting early.
- First prototype supports up to 10 players.
- First prototype can start with 1 player minimum.
- Starting true infected count scales by lobby size: 1 true infected at 1-5 players, 3 true infected at 10 players.
- Full match length target: 10 minutes.
- First prototype map theme: hospital.
- Hospital map should be compact to maximize shared-screen readability and keep all key action visible.
- Compact hospital map room count: 9 rooms.
- Prototype hospital rooms: Lobby, Triage, Ward A, Ward B, Pharmacy, Laboratory, Storage, Isolation, Meeting Hall.
- Players should spawn spread across hospital rooms at match start so the first true infected does not immediately expose the whole lobby.
- Selected win model: cure race with infection-overwhelm pressure.
- Infection-overwhelm condition: too many player deaths cause the hospital to close down.
- Planning status: finalized for the first working prototype.

### Collected Answers

- Planning loop started from the existing roadmap.
- The game should use an Among Us-style hidden-role structure with infected and non-infected players.
- Infection spreads by proximity and exposure duration.
- Infected players can secretly contaminate a room from their phone for a timed period.
- Non-infected players should not receive clues about infection state or infected actions, including on the shared screen.
- Infected win condition: infect every player.
- Non-infected win condition: vote infected players to receive a flu shot.
- The first win-condition idea needs revision because it may make the end state feel like nobody individually wins or loses.
- Player motivation concern: if non-infected players become fully infected-team players after exposure, the game may stop having meaningful commitment to one side.
- Player motivation decision: use the corruption track model.
- Fully infected players should not stay active forever; after a period of time at the final infection stage, they die and are out of the game.
- The first prototype should use designer-chosen corruption stages and timers rather than waiting on exact balancing.
- Flu shot direction: flu shots remain the main way to cure infected players and the main route for non-infected players to beat the infection.
- Flu shot economy direction: limited supply, with possible map pickups, respawns, and/or task-based generation.
- Flu shot economy decision: use the recommended hybrid loop for the first prototype.
- Flu shot usage decision: using a flu shot requires group agreement through voting.
- Social assumption: players can discuss accusations, suspicions, and strategy out loud in the room.
- Meeting decision: a player can request a meeting from their phone; other requested/eligible active players can accept; if enough accept, the meeting begins.
- Meeting threshold decision: a simple majority of active players must accept the meeting request.
- Meeting staging decision: after acceptance, characters path/move automatically to a central meeting point while players lose movement control.
- Meeting timer decision: 5 minutes total, combining discussion and voting.
- Voting opens immediately when the meeting begins.
- The meeting can end early when voting is complete or the group confirms they are done.
- Meeting early-end decision: a majority vote can close the meeting before the 5-minute timer expires.
- Planning direction: stop expanding meeting rules for now and move to less-defined core game areas.
- Player count decision: support up to 10 players in the first prototype.
- Player count decision: 1-player minimum, 10-player maximum.
- Starting role count decision: 1 true infected in a 1-5 player match, 3 true infected in a 10-player match.
- Match length decision: 10 minutes.
- Map theme decision: hospital.
- Map layout decision: compact hospital layout optimized for the shared screen.
- Map room count decision: 9 rooms.
- Room list delegated to implementation: Lobby, Triage, Ward A, Ward B, Pharmacy, Laboratory, Storage, Isolation, Meeting Hall.
- Spawn decision: distribute players across non-meeting hospital rooms at match start, separating starting true infected from non-infected where possible.
- Win model decision: cure race with infection-overwhelm pressure.
- Infection-overwhelm decision: infected side wins if too many active players die, justified as the hospital being closed down.
- Planning finalized; implementation should now build the working local prototype.

### Prototype Hospital Map

- Lobby: central circulation and player spawn.
- Triage: compact high-traffic room near the center.
- Ward A: patient room and hiding/movement node.
- Ward B: second patient room for route choice.
- Pharmacy: likely flu-shot pickup or task location.
- Laboratory: likely flu-shot task generation location.
- Storage: secondary pickup/task room.
- Isolation: high-risk room for cure, quarantine, or infection tension.
- Meeting Hall: central automatic gathering point for meetings.

### Prototype Corruption Track

1. Healthy.
   - Default state.
   - Player has no infection timer and does not spread infection.

2. Exposed.
   - Trigger: 8 total seconds near a contagious player or inside a contagious room.
   - Duration: 25 seconds.
   - Phone-only effect: "You feel exposed. Find help soon."
   - Gameplay effect: player does not spread infection yet.

3. Symptomatic.
   - Duration: 30 seconds.
   - Phone-only effect: stronger warning, subtle private symptoms, possible control pulse or heartbeat feedback.
   - Gameplay effect: player still does not spread infection, but is close to becoming dangerous.

4. Contagious.
   - Duration: 45 seconds.
   - Phone-only effect: player is warned that they can infect others.
   - Gameplay effect: proximity to this player can expose others; they may still want their original team to win.

5. Critical.
   - Duration: 45 seconds.
   - Phone-only effect: final countdown.
   - Gameplay effect: player remains contagious and must be cured before the timer ends.
   - Failure state: when the timer ends, the player dies and leaves active play.

### Flu Shot Prototype Effect

- Flu shot on exposed: returns player to healthy.
- Flu shot on symptomatic: returns player to healthy.
- Flu shot on contagious: returns player to exposed.
- Flu shot on critical: returns player to symptomatic.
- Flu shot on original/true infected: removes or neutralizes that infected threat for win-condition purposes.
- Dead players cannot be restored in the first prototype.

### Flu Shot Economy Candidates

1. Map pickup model.
   - Flu shots spawn in visible pickup locations on the map.
   - Any player can collect one and privately hold it on their phone.
   - Respawn timer creates movement pressure and conflict.

2. Task generation model.
   - Non-infected players complete objectives to manufacture flu shots.
   - Infected players can delay, contaminate, or camp task rooms without revealing themselves.
   - This gives non-infected players a proactive objective beyond voting.

3. Hybrid model.
   - A small number of flu shots spawn on the map.
   - More can be generated by completing tasks.
   - This provides immediate counterplay and a longer-term comeback path.

### Recommended Prototype Flu Shot Loop

- Start with the hybrid model at low complexity.
- Spawn 1 flu shot at match start.
- Respawn a flu shot every 60 seconds at a random eligible room if fewer than 2 are currently available on the map.
- Add one simple task station that creates a flu shot after 20 seconds of combined player interaction.
- Let players hold at most 1 flu shot at a time.
- This hybrid loop is selected for the first prototype.

### Voting Prototype Rules

- A flu shot can only be used after a group vote.
- Players discuss in person before voting.
- Voting happens privately on phones so the final decision is clean and machine-readable.
- The shared screen may show neutral meeting state, vote countdown, and final selected target, but must not reveal infection status.
- If the vote targets a corrupted player, the flu shot applies according to the corruption-stage rules.
- If the vote targets an original/true infected player, that infected threat is neutralized for win-condition purposes.
- If the vote targets a healthy/non-infected player, the flu shot is wasted unless later balancing adds protective immunity.
- A player must physically hold a flu shot resource for the vote to be actionable.

### Meeting Request Prototype Rules

- Any active player can request a meeting from their phone.
- The meeting request appears on eligible active players' phones.
- Players can accept the meeting request privately from their phones.
- If a majority of active players accept, the game enters meeting transition state.
- During meeting transition state, phone movement/action controls are disabled.
- All active characters on the shared screen automatically walk to a central meeting location on the map.
- Once all active characters arrive, or after a short timeout, the game enters meeting discussion state.
- During meeting discussion state, movement/action gameplay remains paused or locked down.
- Players discuss in person while voting is available on phones.
- The meeting lasts up to 5 minutes total.
- Players can vote at any time during the meeting window.
- The meeting can end early when a majority of active eligible players vote to end it.
- The shared screen may show neutral meeting status, acceptance count, and vote countdown, but must not reveal infection status or private symptoms.
- Meeting requests should have a cooldown to prevent spam.

### Player Motivation Models

1. Fixed allegiance, changing infection status.
   - Players keep their starting team for win purposes.
   - Infection becomes a condition: sick, contagious, limited, compromised, or secretly pressured.
   - An infected non-infected player still wants the non-infected side to win, but must hide symptoms or seek a cure.
   - This is the strongest model for preserving player commitment.

2. Carrier model.
   - Exposed non-infected players become contagious carriers but do not join the infected team.
   - Their phone privately warns them that they are spreading infection unless cured.
   - They now have a tense personal problem while still wanting the non-infected side to succeed.

3. Corruption track model.
   - Infection builds through stages: exposed, symptomatic, contagious, lost.
   - Team switch only happens at the final stage, giving players time to resist and giving the group time to cure them.
   - This adds drama without instantly deleting original motivation.
   - Selected for the current design direction.
   - Fully infected players enter a final timer; if not cured or rescued before the timer ends, they die and leave active play.

4. Secret contract model.
   - When infected, a player receives a private side objective for bonus points, but their main team win stays the same.
   - Example: "Stay near two players for 20 seconds" earns personal points but does not make them fully infected-team.
   - This works best with short-round scoring.

5. True conversion model.
   - Infection fully switches the player to the infected team.
   - This is simple and chaotic, but it weakens long-term commitment unless the game is short and score-based.
   - Use only if the design intentionally wants shifting alliances.

### Research Notes

- Among Us uses dual pressure: crewmates can win by completing tasks or ejecting impostors, while impostors create pressure through kills, sabotage, deception, and framing.
- Werewolf-style games often end when the hidden enemy reaches parity with the visible majority, not when literally everyone is eliminated.
- Secret Hitler uses multiple win paths and a late-game trigger, which keeps the table tense even before the final elimination.
- Pandemic separates "finding a cure" from clearing every infection, which suggests non-infected players do not need to cure every infected person to win.

### Candidate Win Models

1. Parity control model.
   - Infected win when active infected players are equal to or greater than non-infected players.
   - Non-infected win when all active infected are cured or quarantined.
   - Flu shot effect: a correctly targeted infected player becomes cured, immune, and loses infection abilities.
   - Best with fixed allegiance or corruption track; weaker with instant team conversion.

2. Cure race model.
   - Non-infected players complete hidden or public tasks to unlock enough flu-shot doses.
   - Infected win if infection reaches a threshold before the cure is ready.
   - Flu shot effect: cures one player, but doses are limited or require task progress.
   - Best with carrier or corruption track, because infected players can still want to be cured.

3. Timed survival model.
   - Non-infected win if at least one non-infected player survives until extraction, rescue, or end-of-shift.
   - Infected win if all non-infected are infected before the timer ends.
   - Flu shot effect: buys time by curing or temporarily immunizing a player.

4. Objective sabotage model.
   - Non-infected win by completing map objectives that identify or suppress infection.
   - Infected win by contaminating enough rooms, sabotaging key rooms, or delaying objectives until time expires.
   - Flu shot effect: removes one infected threat but does not end the game by itself.

5. Score/round model.
   - Run several short rounds.
   - Players earn points for surviving, infecting, curing, correct votes, and successful deception.
   - Flu shot effect: creates round points instead of immediately deciding the whole match.
   - Best if infection can fully switch teams, because individual score preserves motivation across changing sides.

### Win Model Decision Guide

- Parity control is clean for social deduction, but it can be awkward with the corruption track because infected status is not always the same as team allegiance.
- Cure race fits the hospital theme and flu-shot economy best: non-infected players are trying to identify, produce, and correctly use limited cures before infection overwhelms the map.
- Timed survival is easy to understand, but it can make players hide or stall instead of investigating and debating.
- Objective sabotage gives infected players active goals beyond spreading infection, but it adds more systems before the core infection loop is proven.
- Short-round scoring handles changing motivations well, but it makes the game feel more like a party score game than a single tense social-deduction match.
- Recommended first prototype model: cure race with an infection threshold fail state.
  - Non-infected win by neutralizing all starting true infected with voted flu shots before the 10-minute timer ends.
  - Infected win if infection overwhelms the hospital before that happens.
  - "Overwhelms the hospital" means too many players die, forcing the hospital to close down.
  - This keeps flu shots, meetings, corruption, and hospital tasks all pointed at one central game loop.
- This model is selected for the first prototype.

### Final Prototype Win Rules

- Non-infected win by neutralizing all starting true infected with voted flu shots before the match ends.
- Infected win if the hospital closes down after too many player deaths.
- Infected also win if the 10-minute timer ends while any starting true infected remains active.
- Death threshold for the first prototype: 3 deaths in 4-6 player matches, 4 deaths in 7-10 player matches.
- True infected players do not die from their own infection track in the first prototype; they are neutralized only by voted flu shots.
- Corrupted non-infected players can die if they reach the end of the critical timer.

### Implementation Plan

1. Build a dependency-free local Node server that hosts the shared screen and phone controller routes.
2. Add room creation, room-code join, player registration, and reconnect-tolerant player IDs.
3. Render a compact 9-room hospital map on the shared screen.
4. Let phones control player movement between rooms.
5. Assign roles at match start using the 1-10 player scaling rule.
6. Implement private phone-only role and corruption state.
7. Implement exposure from contagious players and contagious rooms.
8. Implement the true infected phone action to contaminate the current room.
9. Implement hybrid flu-shot resources: pickup spawns, timed respawn, and a laboratory generation task.
10. Implement meeting requests, majority acceptance, automatic gathering, and 5-minute meeting voting.
11. Apply voted flu shots to cure corruption stages or neutralize true infected.
12. End the match on non-infected win, hospital closure, or timer expiry.

### Acceptance Criteria

- A host can create a room and show the shared hospital screen.
- Phones can join with a room code and control individual players.
- The game supports 1-10 players.
- Roles and infection state are only visible on the relevant phone.
- The shared screen never reveals true infected, corruption stage, contaminated rooms, or private symptoms.
- Meetings are requested and accepted from phones by majority.
- During meetings, player control locks and characters gather at the Meeting Hall.
- Flu shots are limited and can be picked up or generated.
- A voted flu shot can cure corruption or neutralize a true infected.
- The match can end with either side winning.

### Intermediate Steps

1. Build the local prototype server and browser routes.
2. Implement room, lobby, and match lifecycle.
3. Implement shared-screen hospital rendering.
4. Implement phone controls and private phone state.
5. Implement infection, contamination, flu shots, meetings, voting, and win conditions.
6. Run local smoke tests and launch the dev server.

### Current Open Question

None - planning finalized.
