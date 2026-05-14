# JDM Coffee Drift

AI-only 2D drift racing mini game for a team coffee bet. Players enter names, pick cars, and watch the broadcast camera follow an automated touge race. The last finisher buys coffee.

## Features

- 2 to 8 local participants
- Multiplayer lobby flow with create room, join room list/code, ready state, and host start
- 8 real-model-inspired cars with data-driven stats and custom non-logo silhouettes
- 10 random road maps across mountain, coast, country, and city themes
- AI path following, drift SP gain, automatic special items, hazards, and comeback effects
- Broadcast-style camera that jumps to drifts, items, hits, overtakes, and finishes
- GitHub Pages deployment workflow

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Multiplayer Backend

GitHub Pages is static hosting, so online rooms need a small realtime data backend. This project uses Firebase Realtime Database through REST when `VITE_FIREBASE_DATABASE_URL` is set.

1. Create a Firebase project and Realtime Database.
2. Copy `.env.example` to `.env` for local development.
3. Set `VITE_FIREBASE_DATABASE_URL` to the database URL, for example `https://your-project-id-default-rtdb.firebaseio.com`.
4. In GitHub, add the same value as a repository variable named `VITE_FIREBASE_DATABASE_URL`.

For a quick private MVP, Realtime Database test rules work, but do not leave public write rules open for a public long-running game. If the variable is missing, the app falls back to `LOCAL TEST` mode, which is useful for UI work but does not sync across different devices.

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`. After pushing to `main`, enable Pages with GitHub Actions as the source in the repository settings. The workflow builds `dist` and deploys it.

## Project Shape

- `src/data`: extendable cars and tracks
- `src/gameplay`: deterministic RNG, track path sampling, and race simulation
- `src/scenes`: Phaser race rendering and camera work
- `src/multiplayer.ts`: room creation, room list/code join, ready state, and Firebase/local room store
- `src/ui`: reserved for future UI modules
- `docs`: development workflow, QA, and Codex chat split

## Adding Cars

Add one entry to `src/data/cars.ts`. Keep the stat fields in the 1 to 10 range and include `specialBias` entries from `banana`, `rocket`, `turbo`, `shield`, `smoke`, and `lineDisrupt`.

## Adding Tracks

Add one entry to `src/data/tracks.ts`. Tracks are closed Catmull-Rom routes. Use `points` for the racing line, `driftCorners` as indexes into those points, and set `laps` so the race finishes near 90 to 120 seconds.
