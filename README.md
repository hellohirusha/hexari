# Hexari

> A browser-based strategy companion for analyzing hex boards and improving
> play, with Forge, a fast two-player strategy game.
> Built with React, TypeScript, Vite, PixiJS, and Node.js.

## How it works

Hexari brings board analysis, game tracking, trading, and coaching together
around one shared board configuration. Forge is a separate game with its own
fixed board and simplified rules.

| Surface                | Route    | What you can do                                                                              |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------- |
| **Board analyzer**     | `/`      | Configure tiles, number tokens, and ports; rank and compare starting intersections           |
| **Strategy workspace** | `/tools` | Track a session, evaluate trades, request coaching, and explore board statistics             |
| **Forge**              | `/forge` | Play a two-player game against a bot, on one device, or online with a configured game server |

The Hexari workflow:

```text
                      +--> Analyze and compare settlement positions
                      |
Configure one board --+--> Track games and evaluate trades
                      |
                      +--> Ask the coach and explore statistics
                      |
                      +--> Share the board through its URL hash
```

The analyzer scores 54 intersections on a standard 19-tile board using
production, resource diversity, ports, and the selected strategy. It can filter
second placements using the distance rule and compare up to three corners. The
board balancer evaluates candidate boards with a simulated opening draft.

In Forge, each player begins with a settlement and one of each resource on a
fixed 37-tile board. Roll, collect, trade, and build towards **five victory
points**. Turns have a two-minute timer; the hand limit is seven cards. Forge
has no robber, and building ends the turn. Farms and markets add rules specific
to this variant.

## Status

| Goal                                   | Status                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| Board editor, sharing, and rankings    | Implemented                                                  |
| Opening comparison and board balancing | Implemented with heuristic scoring and simulated drafts      |
| Session tracker and trade calculator   | Implemented                                                  |
| Statistics and strategy simulation     | Implemented with simplified models                           |
| AI coach in Hexari and Forge           | Implemented; requires a working function and provider key    |
| Forge against a bot or on one device   | Implemented with local save and resume                       |
| Invite-based online Forge              | Implemented; requires a separately hosted WebSocket service  |
| Automated checks and deployment        | CI and Vercel workflows configured; deployment needs secrets |
| Multiplayer validation                 | Test each deployment across devices                          |

**Production application**

- Hexari: [hexari.hirusha.space](https://hexari.hirusha.space/)
- Forge: [hexari.hirusha.space/forge](https://hexari.hirusha.space/forge)

## Architecture

```text
Browser (React + TypeScript)
|
+-- Hexari
|   |
|   +-- Analyzer and strategy workspace
|   +-- Shared board, resources, and strategy engines
|
+-- Forge UI, game engine, and bot
|
+-- POST /api/coach --> Node function --> Gemini / Groq
|
+-- WebSocket /forge --> Multiplayer service --> In-memory rooms
```

Hexari stores its board configuration in the browser and reuses it across the
analyzer and workspace. Forge uses its own board and game state. The coach
validates the submitted state, calls a server-side model provider, and streams
advice back to the browser. Provider keys stay on the server.

The online service owns the game state, validates player commands, and hides
the opponent's hand in each player's view. Rooms live in server memory, expire
after two hours, and close when a player disconnects. A server restart removes
active rooms.

## Stack

| Layer           | Technology                  | Notes                                                  |
| --------------- | --------------------------- | ------------------------------------------------------ |
| Frontend        | React 18, TypeScript, Vite  | Combined Hexari app and standalone Forge entry point   |
| Board rendering | PixiJS 8 and SVG            | Terrain rendering with accessible interaction controls |
| Strategy        | TypeScript                  | Board scoring, tracking, trades, and simulations       |
| AI coach        | Vercel Node function        | Gemini, optional Groq backup, server-sent events       |
| Multiplayer     | Node.js and `ws`            | Separate WebSocket process for online Forge            |
| Persistence     | Browser local storage       | Boards, local sessions, settings, and coach history    |
| Testing         | Vitest and Node test runner | Unit, integration, and two-client multiplayer tests    |
| Quality and CI  | ESLint, Prettier, Actions   | Lint, format, tests, and both application builds       |

## Project structure

```text
hexari/
|-- api/coach.ts              Coach HTTP function
|-- apps/forge/               Standalone Forge HTML and entry point
|-- server/multiplayer.mjs    Online Forge WebSocket service
|-- src/
|   |-- forge/                Game UI, rules, bot, online session, and assets
|   |-- hexari/               Analyzer, workspace, and strategy engines
|   |-- server/               Coach streaming and local Vite middleware
|   +-- shared/               Board model, rendering, resources, and shared UI
|-- tests/                    Unit, integration, and multiplayer tests
|-- .github/workflows/        CI and Vercel deployment workflows
|-- vite.config.ts            Combined application configuration
|-- vite.forge.config.ts      Standalone Forge configuration
+-- vercel.json               Vercel routes and Git deployment settings
```

## Prerequisites

- Node.js 22.12 or later in the Node 22 release line, Node 24, or Node 26+,
  with npm. CI runs on Node 22 and 26. The multiplayer service uses Node's
  TypeScript type stripping.
- A modern browser. No database is needed for local play.
- A Gemini or Groq API key only if you want AI coaching.
- A running WebSocket service only if you want online Forge.

## Quick start (Windows / PowerShell)

```powershell
git clone https://github.com/hellohirusha/hexari.git
cd hexari
npm ci

# Optional: configure a provider for AI coaching
Copy-Item .env.example .env.local
# Add GEMINI_API_KEY or GROQ_API_KEY to .env.local.

# Start the combined application
npm run dev
```

Open the URL printed by Vite. The analyzer is at `/`, the workspace at
`/tools`, and Forge at `/forge`. On macOS or Linux, replace `Copy-Item` with
`cp`. Restart the development server after changing environment variables.

To run Forge on its own, use `npm run dev:forge` and open the printed URL.
The standalone development app serves Forge at `/`.

### Walk through the product

1. Open the analyzer and configure the terrain, number tokens, and ports to
   match a board.
2. Choose a strategy, select an intersection, and use **Compare** to inspect
   up to three starting positions. The URL hash carries the board configuration.
3. Open `/tools` to record a session, compare a trade, or review the statistics
   for that board. The tracker depends on the events you enter.
4. With a provider configured, enter the visible position and request advice in
   the workspace. Forge also has a coach for its current game state.
5. Open `/forge`, select **Start game**, then choose a bot or local two-player
   game. Roll before trading or building, and race to five points.

### Play Forge online locally

Run these commands in separate terminals from the repository root:

```powershell
# Terminal 1: browser app
npm run dev

# Terminal 2: multiplayer service
npm run multiplayer
```

Open Forge, select **Online 1 vs. 1**, create a game, and open the invite in a
second browser window. By default, the client on `localhost` or `127.0.0.1`
connects to `ws://localhost:8787/forge`. These localhost links work on the
same computer. For different devices, configure a reachable app URL and
WebSocket endpoint for both players.

## Environment variables

### Coach server (`.env.local` or deployment environment)

| Variable         | Required       | Purpose                                                |
| ---------------- | -------------- | ------------------------------------------------------ |
| `GEMINI_API_KEY` | One key needed | Gemini credential; preferred when present              |
| `GEMINI_MODEL`   | No             | Gemini model override; default `gemini-3.8-flash`      |
| `GROQ_API_KEY`   | One key needed | Groq credential; can be the sole provider or a backup  |
| `GROQ_MODEL`     | No             | Groq model override; default `llama-3.3-70b-versatile` |

`.env.example` lists the provider key fields. Either provider key is enough;
the model variables are optional. The local Vite middleware reads these values
on startup. For Vercel, set server-side environment variables in the relevant
project environment and redeploy after changing them. Do not put provider keys
in client code or variables prefixed with `VITE_`.

### Online Forge

| Variable                | Used by             | Purpose                                            |
| ----------------------- | ------------------- | -------------------------------------------------- |
| `VITE_FORGE_SERVER_URL` | Vite client         | Full WebSocket address, including `/forge`         |
| `PORT`                  | Multiplayer process | HTTP and WebSocket port; default `8787`            |
| `FORGE_ALLOWED_ORIGINS` | Multiplayer process | Comma-separated browser origins allowed to connect |

The service defaults to allowing `http://localhost:5173` and
`http://127.0.0.1:5173`. Add the actual browser origin when the app runs on a
different port or domain. Set `VITE_FORGE_SERVER_URL` before starting Vite or
building the client. An HTTPS-hosted app needs a reachable secure `wss://`
endpoint.

## API overview

| Endpoint          | Service                | Purpose                                                             |
| ----------------- | ---------------------- | ------------------------------------------------------------------- |
| `POST /api/coach` | Vercel function / Vite | Validate game state and return model advice, optionally as a stream |
| `GET /health`     | Multiplayer service    | Return `ok` when the process is running                             |
| `WS /forge`       | Multiplayer service    | Create or join a room and exchange game commands and state          |

Coach requests contain the board, question, turn, points, hand, buildings,
and visible opponent information. The endpoint validates the payload and
rejects cross-site browser requests. The current implementation requests at
most five advice points of up to 12 words each and filters oversized points.
It does not provide a global usage or spending cap.

The multiplayer `/health` and `/forge` endpoints belong to the separate Node
process, usually on port `8787`; they are not part of the Vercel coach function.

## Documentation

- [Board model](src/shared/board.ts) - terrain, geometry, ports, and scoring.
- [Hexari strategy engines](src/hexari/engine/) - analysis, session tracking,
  trade evaluation, and simulations.
- [Forge rules and game state](src/forge/engine.ts) - game transitions, costs,
  building legality, and scoring.
- [Coach function](api/coach.ts) and [streaming implementation](src/server/coachStream.ts).
- [Multiplayer service](server/multiplayer.mjs) and
  [online session rules](src/forge/online/session.ts).
- [Audio credits](src/forge/assets/audio/CREDITS.md).

## Testing

```powershell
npm run lint
npm run format
npm test
npm run test:multiplayer
npm run build
npm run build:forge
```

| Command                    | What it checks                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run lint`             | ESLint and TypeScript                                              |
| `npm run format`           | Prettier formatting                                                |
| `npm test`                 | Vitest unit and integration suites                                 |
| `npm run test:multiplayer` | Two WebSocket clients joining, playing, trading, and disconnecting |
| `npm run build`            | Type-check and build the combined application into `dist/`         |
| `npm run build:forge`      | Type-check and build standalone Forge into `dist-forge/`           |

CI runs these checks on pushes and pull requests using Node 22 and 26. Coach
integration tests use simulated provider responses; they do not prove a live
provider key, model, or deployment is working. The multiplayer test exercises
two clients against a local service; it is not a cross-device browser test.

### End-to-end checks

For a manual check, configure a provider, run the app, and request advice in
Forge. Start the multiplayer service and join an invite from a second browser
window. Repeat online testing with two devices and the actual hosted service
before relying on a deployment. Use playtests to assess Forge's balance and
game duration.

## Deployment

### Combined app and coach on Vercel

The combined application builds with `npm run build` into `dist/`. Vercel uses
the repository-root `api/coach.ts` function; `vercel.json` rewrites `/tools`
and `/forge` to the app entry point. Configure at least one provider key for
the target Vercel environment and redeploy after changing it.

The [deployment workflow](.github/workflows/cd.yml) runs after successful CI on
the repository's default branch. It pulls production settings, builds with the
Vercel CLI, and deploys the verified commit if the branch has not moved. It
requires `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` as GitHub
Actions secrets. Check the workflow and Vercel project settings for the current
deployment state.

### Online multiplayer

Host `server/multiplayer.mjs` as a separate long-running Node process that
supports WebSockets. Set its allowed browser origins and expose a secure
endpoint. Build the browser app with `VITE_FORGE_SERVER_URL` pointing to that
endpoint. Vercel's static app and coach function do not start this service.

### Standalone Forge

Use the repository root as the project root, `npm run build:forge` as the
build command, and `dist-forge` as the output directory. The repository-root
coach function must also be included if coaching is needed. Verify that the
standalone deployment includes the function before relying on coaching.

### Post-deploy smoke test

1. Open `/`, `/tools`, and `/forge` directly and confirm each page loads.
2. Request coach advice and check the Vercel function logs if it fails. A GET
   request to `/api/coach` should receive a `405` JSON response when the
   function is running; an actual coaching request uses POST.
3. If multiplayer is configured, check the separate service's `/health`, then
   create and join a game from two devices using the deployed URLs.

## Development notes

- `npm run preview:forge` previews static files and does not provide the local
  coach middleware. Use `npm run dev` or `npm run dev:forge` to test the coach
  locally.
- Board configurations, local games, settings, tracker events, and Hexari
  coaching history are stored in browser local storage. They are specific to
  the browser and origin and can be lost when that storage is cleared.
- Coaching sends the submitted game state to the configured AI provider. Forge
  sends the current player's hand and visible board information.
- Placement scores, trade evaluations, hand estimates, board balancing, and
  strategy races are heuristics or simulations. They are not observed win
  rates or guarantees of fairness. Dice rolls are independent: past results do
  not change the next roll's probability.
- Configure and test rate limiting and provider usage or spending controls
  before exposing a public coach endpoint. Protect and operate the multiplayer
  service separately.

## License

Hexari is licensed under the [MIT License](LICENSE). See the
[audio credits](src/forge/assets/audio/CREDITS.md) for sound attribution.
