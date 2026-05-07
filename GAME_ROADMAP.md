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
