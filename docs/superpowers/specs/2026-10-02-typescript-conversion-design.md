# TypeScript Conversion

**Date:** 2026-10-02
**Status:** Draft, awaiting review

## Goal

Convert the Quoridor codebase from JavaScript to TypeScript (`.ts` and `.tsx`) so the compiler catches mistakes such as a misspelled state field or a mismatched message shape between browser and server. Behavior does not change.

Success means: all 39 existing tests pass as `.test.ts` files, `npm run typecheck` passes under `strict`, `npm run lint` and `npm run build` pass with no warnings, and the game plays the same in Chrome.

The work lands on branch `four-players-undo-vote` as part of PR #2.

## Decisions

- **Scope:** every code file in `src/`, `server/` and `shared/` (tests included) becomes `.ts` or `.tsx`, and `vite.config.js` becomes `vite.config.ts`. `eslint.config.js` stays JavaScript, since a TypeScript ESLint config needs an extra package (`jiti`) for no practical gain.
- **Server runtime:** Node runs the `.ts` files directly using its built-in type stripping (`node server/server.ts`). Verified on this machine: Node 22.22.3 runs `.ts` files and `node --test` discovers `.test.ts` files with no flags and no warnings. This requires Node 22.18 or newer and limits the code to erasable syntax: no `enum`, no `namespace`, no constructor parameter properties, and relative imports must include the `.ts` extension.

## Design

### 1. Tooling and configuration

**New dev dependencies (none at runtime):** `typescript` (5.8 or newer, for `erasableSyntaxOnly`), `@types/node`, `@types/express`, `@types/ws`, `typescript-eslint`. `@types/react` and `@types/react-dom` are already present.

**TypeScript configs.** Two configs, because browser and server code see different globals:

| Config | Includes | Environment |
|---|---|---|
| `tsconfig.app.json` | `src/`, `shared/` excluding `*.test.ts` | DOM libs, no Node types, `jsx: react-jsx`, `moduleResolution: bundler` |
| `tsconfig.node.json` | `server/`, `shared/` including tests, `vite.config.ts` | Node types, no DOM libs, `module` and `moduleResolution: nodenext` |

`shared/` is checked under both, which proves it stays environment-neutral. Both configs set `strict`, `noEmit`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `skipLibCheck`, and target ES2022.

**Scripts (`package.json`):**

- `typecheck` (new): `tsc -p tsconfig.app.json && tsc -p tsconfig.node.json`
- `build`: `npm run typecheck && vite build`
- `start`: `npm run build && node server/server.ts`
- `test`: unchanged, `node --test` (discovers `*.test.ts`)
- `lint`: ESLint over `**/*.{ts,tsx}` with `typescript-eslint` recommended rules (not type-aware) plus the existing React hooks and React refresh rules. The recommended set includes `no-explicit-any`.

**Other files:**

- `index.html` loads `/src/main.tsx`.
- `package.json` gains `"engines": { "node": ">=22.18" }`.
- New `.nvmrc` containing `22`.
- Files are renamed with `git mv` so history follows them.

### 2. Types and code

**`shared/types.ts`** defines the data shapes once:

- `Seat` (a player number, 1 to 4), `Position`, `Orientation`, `Wall`
- `Move`: a discriminated union of a pawn move and a wall placement
- `LastMove`, `UndoVote`
- `GameState`: the state fields the rules produce today
- `PublicGameState`: `GameState` plus `undoAvailable`, as the server sends it
- `Result<T>`: `{ state: T } | { error: string }`, the shape every rules and manager operation already returns

**`shared/messages.ts`** keeps `MESSAGE_TYPES` as a constant object (`as const`, since `enum` is not erasable) and adds `ClientMessage` (join, move, request undo, vote) and `ServerMessage` (joined, state, error) unions.

**Wire data is typed as `unknown`.** Anything arriving over the WebSocket can be malformed, so the types do not claim otherwise:

- The server types parsed JSON as `unknown`.
- `applyMove` takes `move: unknown` and `voteUndo` takes `approve: unknown`. The existing runtime guards (unknown move types rejected, coordinates matched against generated moves, walls bounds-checked, anything other than `true` treated as a decline) narrow them.

This keeps the tested hostile-input behavior exactly as it is and keeps the types honest.

**Everything else is typed precisely:** rules functions, the game manager and its per-game record, `gameService` callbacks, React state (for example `useState<PublicGameState | null>`), and component props for `UndoVote` and `ThemeToggle`.

**Constraints:**

- No logic changes and no refactors beyond what typing requires. If the compiler exposes a real bug, stop and report it instead of fixing it silently.
- No `any`. A type assertion (`as`) is allowed only where the compiler cannot follow the logic, with a short comment explaining why.

### 3. Testing and verification

- `npm test`: all 39 tests pass as `.test.ts`.
- `npm run typecheck`, `npm run lint`, `npm run build`: pass with no errors or warnings.
- Server smoke test: run `node server/server.ts` and re-run the earlier WebSocket smoke script (joins, unjoined move, garbage messages, move, late join, undo, last player wins); output matches line for line.
- Chrome: a 3-tab game (join, goals, wall counts, a move, a wall), an undo vote approved and one declined, a tab closed mid-game and its turns skipped, both themes, and layout unchanged at two window sizes.

### 4. Docs and delivery

- `README.md`: requires Node 22.18 or newer (`nvm use` reads `.nvmrc`); mention `npm run typecheck`.
- `docs/architecture.md`: file names updated to `.ts` and `.tsx`.
- Commit on `four-players-undo-vote`, push to PR #2, and update the PR title and description to include the conversion.

## Out of scope

- A TypeScript ESLint config file.
- Type-aware lint rules (they need a full type-checking lint run and more configuration).
- Runtime schema validation libraries.
- Any behavior change or refactor not needed for typing.
