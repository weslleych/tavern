# Project roadmap & scope

Tavern gives friends a simple way to play tabletop RPGs over a classic pixel-art world. Story and rules stay with the party.

## Phase 1: foundations and editor — implemented

- [x] Next.js App Router, strict TypeScript, ESLint, Tailwind.
- [x] Create/join hub, invite links, browser-local recent tables.
- [x] GM/player layout, scene sidebar, creation, rename, switching.
- [x] Configurable bounded Canvas 2D grid and original procedural terrain.
- [x] Paint, erase, blocking metadata, collision overlay.
- [x] Pan, zoom, fit, keyboard painting, touch, responsive layouts.

## Phase 2: authoritative synchronization — implemented

- [x] Socket.io on the shared Node server.
- [x] Isolated room channels and authenticated private sessions.
- [x] Server-side GM checks, validated paint, confirmed broadcasts.
- [x] Scene synchronization across the party.
- [x] Live presence, automatic reconnect, GM retention after refresh.
- [x] Input limits and tests for forged access and invalid coordinates.

## Phase 3: persistence and portability — implemented

- [x] MongoDB rooms, panels, and hashed sessions.
- [x] Durable local file store for zero-configuration use.
- [x] Persistence before acknowledgement.
- [x] Versioned JSON map import/export.
- [x] Domain, persistence, Socket.io, and browser workflow checks.
- [x] Documentation matching the running application.

The MVP covers phases 1–3. Blocking remains metadata until movement exists. Hosting requires one persistent Node process; see [architecture](architecture.md).

## Phase 4: richer play

- [ ] Draggable player tokens with collision-aware movement.
- [ ] Dice overlay.
- [ ] GM-controlled visibility/fog of war.
- [ ] More terrain variants and optional custom sprites.
- [ ] Scene ordering, duplication, removal.

## Operational follow-ups

- [ ] GM recovery or role transfer.
- [ ] Session lifecycle and room archival.
- [ ] Transactional MongoDB writes and interrupted-write recovery.
- [ ] Incremental persistence and scalable room loading.
- [ ] Multi-process coordination and deployment automation.

## Out of scope

- Complex accounts, passwords, OAuth, email verification.
- Embedded RPG rules or automated combat/stat/spell mechanics.
- Built-in voice/video; use your preferred communication app.
