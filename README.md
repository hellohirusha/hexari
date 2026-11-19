# Hexari

Hexari is a browser-based strategy companion for Catan and Colonist players. It helps players examine a board, compare settlement positions, record a game, and evaluate trades. It also includes Forge, a two-player speed variant built around a fixed starting board and a five-point target.

The tools are intended for players learning the relationship between placement, production, resources, and trades, as well as experienced players who want to explore a position. Hexari uses probability calculations and simplified models to make those decisions easier to inspect. Its recommendations are aids to judgment, not predictions of a game's outcome.

The combined application is available at [hexari.hirusha.space](https://hexari.hirusha.space/). The repository also supports running Forge as a separate application.

## Features

### Board analyzer

Build a 19-tile board, set terrain, number tokens, and ports, and inspect production across its 54 intersections. The analyzer displays a pip heat map and ranked positions, supports three strategy modes, compares up to three corners, and filters positions using the settlement distance rule. Boards can be shared through a URL hash. A bounded auto-balance search evaluates candidate boards using a simulated four-player opening draft.

### Strategy workspace

- **Session tracker:** Record rolls, players' starting positions, buildings, trades, and steals. Compare observed and expected roll distributions and estimate hands from recorded events.
- **Trade calculator:** Enter a hand, placements, and a build goal to compare an offer using resource availability and applicable bank or port rates.
- **AI coach:** Submit a structured game state and a strategic question. Advice is streamed from a server-side model provider. Recent Hexari coaching responses are stored locally per board.
- **Statistics:** Explore board production, opening opportunities, a simulated strategy race, and common mistakes with hypothetical board examples.

### Forge

Forge is a streamlined two-player game playable against a bot, locally in hot-seat mode, or through an invite-based online session when the multiplayer service is configured. Players start with predetermined settlements, collect resources from dice rolls, and build towards five victory points. The variant has a two-minute turn timer, a seven-card hand cap, no robber, and no initial placement phase. Roads, settlements, cities, farms, markets, bank exchanges, and one-card player trades are supported. A successful build ends the turn.

Local games can be saved and resumed in the browser. Forge also provides an in-game coach, an activity log, and optional sound. The online service is a separate, in-memory WebSocket process; see [Online multiplayer](#online-multiplayer).

## Technology

| Area            | Technology                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| Application     | React 18, TypeScript, Vite                                                 |
| Board rendering | PixiJS 8 with SVG interaction layers and fallbacks                         |
| Coaching        | Vercel Node.js function, Gemini API, optional Groq API, server-sent events |
| Multiplayer     | Node.js, WebSockets (`ws`)                                                 |
| Verification    | Vitest, ESLint, Prettier, GitHub Actions                                   |
| Persistence     | Browser local storage; in-memory rooms for online Forge                    |

## Architecture

```text
Browser
  React screens (Hexari / Forge)
    |-- Shared board geometry, resources and rendering
    |-- Hexari analysis, tracker and trade engines
    |-- Forge game engine and bot
    |-- POST /api/coach ------> Node function ------> Gemini / Groq
    `-- WebSocket /forge -----> Multiplayer service (online Forge)
```

The Hexari analyzer and workspace share a board configuration. Forge uses game-specific board data and a TypeScript engine for state transitions and rules. The React interface invokes the engines and renders their results. The coach endpoint validates a structured state, sends it to a configured provider, and streams the response to the browser. Provider keys remain on the server.

For online Forge, the WebSocket service owns the session state, applies player commands, and sends each player a view with the opponent's hand hidden. Rooms exist only in the running process; they are not stored in a database.

```text
api/coach.ts              Coach HTTP function
apps/forge/               Standalone Forge entry point
server/multiplayer.mjs    Online Forge WebSocket service
src/forge/                Forge UI, engine, bot and online session logic
src/hexari/               Analyzer, workspace and strategy engines
src/server/               Coach streaming and local development middleware
src/shared/               Board geometry, rendering, resources and shared UI
tests/                    Engine, component and integration tests
```

## Getting started

### Prerequisites

- Node.js 22.12 or later in the Node 22 release line, and npm. The CI workflow uses Node.js 22; the multiplayer script uses Node's TypeScript type stripping.
- A modern browser.
- A Gemini or Groq API key only if you want to use AI coaching. The other features can run without a key.

### Install and run

```sh
git clone https://github.com/hellohirusha/hexari.git
cd hexari
npm ci
npm run dev
```

Open the URL printed by Vite. The combined application provides:

| Route    | Page               |
| -------- | ------------------ |
| `/`      | Board analyzer     |
| `/tools` | Strategy workspace |
| `/forge` | Forge              |

To run the standalone Forge application, use `npm run dev:forge` and open its printed URL. Forge is served at `/` in this configuration.

### Configure AI coaching

Copy `.env.example` to `.env.local` in the repository root, then add at least one provider key:

```dotenv
GEMINI_API_KEY=your_gemini_key
# Optional model override:
# GEMINI_MODEL=your_gemini_model

# Optional, or use Groq as the sole provider:
GROQ_API_KEY=your_groq_key
# GROQ_MODEL=your_groq_model
```

Both development servers load this file and serve `/api/coach` through local middleware. Restart the server after changing environment variables. `.env.local` is ignored by Git; do not put provider keys in client code or variables prefixed with `VITE_`.

Gemini is used when its key is present. If Gemini returns a rate limit or server error and a Groq key is configured, the endpoint tries Groq. With only a Groq key, it uses Groq directly. The defaults in the code are `gemini-3.8-flash` and `llama-3.3-70b-versatile`; model access and availability depend on the provider and account, so set an override if needed. Keys configured in Vercel are not automatically available to a local development server.

### Online multiplayer

Start the application and the multiplayer service in separate terminals:

```sh
npm run dev
npm run multiplayer
```

Open Forge, select **Online 1 vs. 1**, create a game, and share its invite link with the second player. On `localhost` and `127.0.0.1`, the client defaults to `ws://localhost:8787/forge`. The service exposes `GET /health` and listens on port `8787` unless `PORT` is set.

Localhost invites work for two browser windows on the same computer. For different devices, both players need an application URL and WebSocket service address reachable from their devices; configure the remote service as described below.

For a different browser origin or a remote service, configure:

| Variable                | Used by             | Purpose                                 |
| ----------------------- | ------------------- | --------------------------------------- |
| `VITE_FORGE_SERVER_URL` | Vite client         | Full WebSocket URL, including `/forge`  |
| `PORT`                  | Multiplayer process | Listening port                          |
| `FORGE_ALLOWED_ORIGINS` | Multiplayer process | Comma-separated allowed browser origins |

The default allowed origins are `http://localhost:5173` and `http://127.0.0.1:5173`. Add the actual application origin if Vite chooses another port or the client is hosted elsewhere. Use a secure `wss://` endpoint for an HTTPS-hosted client. Configure the service separately from the static application and Vercel coach function.

Rooms are held in memory, expire after two hours, and close when either player disconnects. Server restarts discard active sessions. The online implementation should be tested in its target deployment and across two devices before relying on it.

## Commands

| Command                    | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | Run the combined app and local coach endpoint            |
| `npm run dev:forge`        | Run standalone Forge and the local coach endpoint        |
| `npm run multiplayer`      | Start the online Forge WebSocket service                 |
| `npm run test:multiplayer` | Run the two-client WebSocket integration test            |
| `npm test`                 | Run the Vitest suite                                     |
| `npm run lint`             | Run ESLint and TypeScript checks                         |
| `npm run format`           | Check formatting with Prettier                           |
| `npm run build`            | Type-check and build the combined app into `dist/`       |
| `npm run build:forge`      | Type-check and build standalone Forge into `dist-forge/` |
| `npm run preview:forge`    | Preview the standalone static build                      |

`preview:forge` serves static files only; it does not provide the coach endpoint. The GitHub Actions workflow runs lint, formatting, tests, and both builds on pushes and pull requests.

## Deployment

The combined Vercel configuration builds the Vite app and rewrites `/tools` and `/forge` to its entry point. `api/coach.ts` is the server-side coach function. Configure provider keys as server environment variables for the relevant Vercel environment and create a new deployment after changing them.

For a separate Forge deployment, use the repository root as the project root, `npm run build:forge` as the build command, and `dist-forge` as the output directory. The repository-root `api/coach.ts` must be available to the deployment for coaching. This standalone deployment configuration has not been verified here.

Before exposing the coach publicly, configure and test endpoint rate limiting and provider usage or spending controls. The function validates its input and limits output, but does not provide a global spending cap. The WebSocket multiplayer service requires its own suitable host, origin configuration, and operational controls.

## Data and model limitations

Board configurations, local games, settings, tracker data, and Hexari coaching history are stored in browser local storage. They are specific to the browser and origin and can be lost when browser data is cleared. Online rooms are transient. Coaching sends the submitted game state to the configured model provider; Forge includes the current player's hand and visible board information.

Placement scores, trade evaluations, balance results, and player-hand estimates are heuristics. The tracker relies on entered events and assumptions, including uniformly random unknown steals; it cannot infer unrecorded actions. Dice rolls are independent, so a number that has appeared less often is not more likely on the next roll.

The statistics race simulates fixed strategies under simplified rules and does not represent observed player win rates. The board balancer's simulated draft does not guarantee fairness. Forge differs from a full Catan ruleset, and game duration and balance require human playtesting.

## License and credits

The project is licensed under the [MIT License](LICENSE). Audio attribution is listed in [audio credits](src/forge/assets/audio/CREDITS.md).
