# Crownwake

Crownwake is a fully browser-playable 3D tactical swarm game. Select a company, issue grid-based movement orders, divide growing armies into new commands, and fight rival swarms across an endless streamed battlefield.

## Run locally

Requirements: Node.js 18 or newer.

```powershell
npm install
npm run build
npm run dev
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

## Verify

```powershell
npm test
npm run verify
npm run smoke:local
```

`npm run smoke:local` expects the local server to be running.

## Project structure

- `game.js` — Three.js scene, rendering, controls, and live game integration
- `src/sim.js` — testable combat, movement, formation, and campaign rules
- `tests/` — deterministic simulation tests
- `assets/` and `Models/` — audio, images, and 3D game assets
- `tools/` — build, local server, smoke, and project verification scripts
- `design/` — gameplay plan, glossary, thresholds, and asset inventory

The generated immutable simulation runtime imported by `game.js` is committed so the same files can be hosted directly on any static web host.
