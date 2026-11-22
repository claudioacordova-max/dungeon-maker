# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of friends playing together, each on their own phone (portrait), joined to one room by a code. One player is the **Maestro** (dungeon master); one to four others are **héroes**. Sessions are short and social, often played side by side in the same place. Desktop with mouse must also be playable, but the phone is the focus.

## Product Purpose

Dungeon Maker is an asymmetric multiplayer dungeon game: the Maestro builds the dungeon in real time while a cooperative party of heroes clears it. Success is that all players feel they are inside the same match. The heroes' side (action combat) already works; the open problem is the Maestro's side: today the Maestro is too busy building to watch or interact with the heroes.

## Positioning

A "Mario Maker in real time": the level is designed by a live opponent while the party plays it, with mobile action-game feel (Brawl Stars style controls and look).

## Operating Context

- The Maestro works under time pressure: the next room must be ready before the heroes clear the current one, so every build action must be fast, reachable with thumbs and readable at a glance.
- Approved next version (see `DESIGN.md`): 5 rooms plus a predesigned boss room; a narrative intro the heroes read while the Maestro starts building; an Observar view where the Maestro watches a room with heroes, possesses an enemy (joystick + attack) and summons a slime; the Maestro controls the boss after a short cinematic; a Maestro character model.

## Capabilities and Constraints

- Stack: TypeScript, React, React Three Fiber, three.js, Vite; Cloudflare Worker with a Durable Object per room.
- Mobile portrait stage scaled with `--ui-px` (design pixels); the 3D scene sits behind DOM overlays. Must stay smooth on a phone.
- Building a room today: floor shape (Entera, Orillas, Cruz, Puente), a spikes pack, 0 to N chests, enemies (slime, lanzador, ogro) placed by tapping the floor, a shared difficulty cap per room, "Sala lista", "Quitar sala", back to the map.
- Terminology (Spanish UI): Maestro, héroes, sala, sala del jefe, pinchos, cofres, dificultad, «Sala lista».
- `DESIGN.md` in this repository is the **game design document** (the designer's rules and numbers), not a visual design system. Never overwrite or restructure it as a visual DESIGN.md; visual decisions live in code and in `.impeccable/` artifacts.

## Brand Commitments

- Look: mobile action game in the style of Brawl Stars; menus in purple stone with gold trim and torches, paper cards, Lilita One type, chunky ink-outlined buttons (`src/ui/*.css`, `public/ui/`).
- The Maestro is a dark lord, not a king (no crowns). Purple is the Maestro's color.
- Clean HUD: no extra bars or lists over the game view beyond what is needed.

## Evidence on Hand

3D models and effects in `src/models/`, menu art in `public/ui/`. No real player metrics; playtests are the designer's own sessions with friends.

## Product Principles

1. Everyone plays the same match: the Maestro's actions must be felt by the heroes, and the Maestro must be able to watch them.
2. Fast over complete: fewer taps and clear priority beat more options.
3. The designer's rules and numbers are law; no silent mechanic changes.
4. Phone first, thumbs first.
