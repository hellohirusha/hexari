# hexari

A strategy companion and a two-player speed-mode board game. This is a work in progress.

## Run locally

```sh
npm install
npm run dev
npm test
```

Open the local Vite URL. The board analyzer is at `/`, the strategy workspace is at `/tools`, and Forge is at `/forge`. `npm run build` builds this combined app into `dist/`.

## Run or deploy Forge separately

```sh
npm run dev:forge
npm run build:forge
npm run preview:forge
```

The standalone Forge app runs at `/` and builds to `dist-forge/`. It imports Forge and the shared code, not the Hexari screens. Its header identifies Forge rather than linking back to the standalone app itself. Both builds can coexist locally.

For a separate Vercel project, point the project root at this repository, set the build command to `npm run build:forge`, and set the output directory to `dist-forge`. Keep the repository-root `api/coach.ts` so Vercel can discover the coach function. The static build is intended to be served at a domain root, not a URL subdirectory. This configuration has not yet been deployed or verified on Vercel.

The coach endpoint is a Vercel function, so plain Vite and `preview:forge` do not serve it. Configure `GEMINI_API_KEY` and optionally `GEMINI_MODEL` on the server; `GROQ_API_KEY` and `GROQ_MODEL` enable the backup. Never put API keys in browser code. Game saves and theme settings are stored in the browser and are isolated by origin, so a separate Forge domain will not automatically share existing saves with Hexari.

Before exposing the coach publicly, configure a Vercel Firewall rate-limit rule for `POST /api/coach` keyed by IP, with a 429 response when exceeded. Start with a conservative limit such as 10 requests per minute per IP, then monitor and tune it for your users. Set provider-side spending and usage limits where available and monitor both providers: a per-IP rule cannot enforce a global spending cap or stop distributed abuse. The application validates request size and fields, limits generated output, and rejects cross-site browser requests, but these are not substitutes for deployed rate limiting. Configure and test the rule separately for each Vercel project. See [Vercel's rate-limiting guide](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Current features

- Board analyzer: 19 editable tiles, a terrain and number palette, 54 generated intersections, editable coastal ports, pip heat map, strategy-weighted rankings, inventory warnings, comparison, distance-rule filtering, URL sharing, and a four-seat draft balancing model. Changes persist in the browser.
- Strategy workspace: dice distribution, a locally saved probabilistic session log with rolls, known builds, player and bank trades, known and unknown steals, multi-resource trade comparisons, a structured coach form, board production statistics, and short mistake reminders.
- Board statistics include independent quadrant opening-production totals and a reproducible 96-game strategy race across 24 shuffles of the current board's terrain-number pairs. Four fixed strategies rotate seats; their dice outcomes and resulting wins are simulated. This simplified five-point race includes city upgrades, abstract settlement expansion and bank or port exchanges, but omits the robber, player trading, development cards, road connectivity and bank shortages. Its percentages are model outcomes, not real-game win rates, and are not validated against player data. The supplied ports stay fixed; incomplete or invalid boards do not run the race.
- Forge: local bot or hot-seat play with an illustrated board, contextual building, animated dice, optional recorded sound effects, an in-game AI coach, a local activity log, a two-minute turn timer, dice production, a seven-card cap, connected roads, settlement distance rules, cities, 4:1 bank trades, one-card player trades, voluntary discard, five-point victory, and local save/resume. A successful build ends the current turn. The coach sends the current player's hand and visible board state to the configured AI service. Chat is hidden during local play.

Forge's new starting corners have the same resource types and pip totals for each resource. A reproducible exploratory study (`npx vitest run tests/forge-study.test.ts --disableConsoleIntercept`) plays the same heuristic bot from both seats, swaps starting locations, and reports wins and turn counts across seeds 1-100. For the current policy and seeds, the old starts produced 80-20 wins (30-70 when swapped), while the new starts produced 38-62 (56-44 when swapped); the new starts averaged about 162 turns versus 207-208 for the old starts. This is evidence about one bot policy, not proof of balance or a real-player win rate. Turn counts do not measure the guide's 12-18 minute target, which still requires human playtesting. Progressed saves retain their original positions.

## Architecture

```text
src/hexari/        Board analyzer, strategy workspace, and analysis engines
src/forge/         Forge UI, game engine, bot, and game-specific features
src/shared/        Board geometry, resource types, renderer, theme, and styling
src/main.tsx       Combined application entry point
apps/forge/        Standalone Forge HTML and entry point
api/coach.ts       Shared server-side AI endpoint
```

Hexari and Forge depend on shared code rather than on each other. Lint rules protect these module boundaries. `npm run lint`, `npm test`, `npm run build`, and `npm run build:forge` run in CI.

## Limits and remaining work

This is not yet the complete guide. The analyzer and Forge draw terrain with PIXI and retain SVG interaction layers and fallbacks. The balancer simulates a greedy four-seat snake draft with distance rules and compares the highest and lowest composite opening scores. It samples a bounded number of shuffles and only applies a board if its score gap meets the target; a failed search leaves the board unchanged. This model is not a guarantee of fair real games, and has not been validated through player studies. Complete trade event history, board examples, and comprehensive end-to-end tests remain. Online multiplayer and accounts are not implemented. The Hexari coach stores the last few responses per board locally and sends up to three with subsequent requests; Groq is used on a Gemini rate limit when configured. Both coach screens stream advice; live providers and public endpoint safeguards are not verified. The Forge rules are a prototype and differ from a complete Catan ruleset; notably it omits development cards, longest-road awards and ports, and player trades are limited to one card each. The expected game length and board balance are hypotheses that need playtesting.

All recommendation scores are heuristics, not predicted win rates. The tracker assumes starting hands are exact and stolen cards are uniformly random. Logged settlements and city upgrades update future production. Mixed player trades and observed bank exchanges update tracked hands, but bank rates and stock are not validated by the event logger. An exact hand correction is available for missed actions, but the tracker cannot infer unrecorded actions on its own. A session uses the board captured when tracking began. Dice rolls are independent: an outcome does not become more likely because it has not appeared recently. Board-wide production is not the same as production accessible to a player.

No deployed URL, verified AI connection, custom domain, or user-playtesting results are claimed. The provider's model availability and quota must be checked at deployment time.
