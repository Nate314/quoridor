# TypeScript Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every code file in the Quoridor repo to TypeScript with no behavior change, type-checked under `strict`.

**Architecture:** Shared shapes live in `shared/types.ts` and wire-message types in `shared/messages.ts`. Node 22.18+ runs the server's `.ts` files directly by stripping types; Vite compiles the browser's `.tsx`. Two TypeScript configs check browser and server code against their own globals, `tsc -b` runs both, and data arriving over the WebSocket is typed `unknown` and narrowed by the existing runtime checks.

**Tech Stack:** TypeScript 5.8+, React 19, Vite 6, Express 5, `ws` 8, Node 22.22.3 (built-in type stripping, `node:test`), ESLint 9 with `typescript-eslint`.

**Spec:** `docs/superpowers/specs/2026-10-02-typescript-conversion-design.md`

## Global Constraints

- No behavior change. No refactor beyond what typing requires. If the compiler exposes a real bug, stop and report it instead of fixing it.
- No `any` (explicit or via `@ts-ignore`). A type assertion (`as` or `!`) only where the compiler cannot follow the logic, with a one-line comment saying why.
- Erasable syntax only: no `enum`, no `namespace`, no constructor parameter properties. Type-only imports use `import type` or inline `type` (required by `verbatimModuleSyntax`).
- Relative imports of shared code and server code include the `.ts` extension. Imports between files inside `src/` stay extensionless as they are today, except `main.tsx` importing `./App.tsx`.
- New packages are dev dependencies only: `typescript` (^5.8), `@types/node` (^22), `@types/express`, `@types/ws`, `typescript-eslint`. Nothing else.
- Rename files with `git mv` so history follows them.
- Work on branch `four-players-undo-vote`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No em-dashes in any prose, comments, or commit messages.
- At the end of every task: `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass with no warnings.

## Review Focus

1. A type-only import written without `type` makes Node crash at runtime ("does not provide an export named"). Expected: impossible, because `verbatimModuleSyntax` makes `tsc` reject it. Pinned in Task 1 Step 9 and Task 2 Step 6, which run the real code under Node (tests and server smoke) after `typecheck`.
2. Malformed wire data (a string, an array, `null`, wrong field types) must still be rejected exactly as before now that it is typed `unknown`. Pinned by the existing "rejects malformed and illegal moves" test, the new "rejects moves that are not objects" test (Task 1), and the smoke script's garbage messages (Task 2).
3. Browser code must not pick up Node globals and server code must not pick up DOM globals. Pinned by the two configs (`types: []` and no DOM lib respectively), checked by `npm run typecheck` in every task.
4. Undo restore when the current player has left, and the lone-survivor paths, gain small null guards for typing. Expected: identical results. Pinned by the existing games tests ("an undo returning the turn to a departed player skips them", "a player leaving during a vote no longer counts").
5. The real app must look and play the same. Pinned in Task 3 Step 9 (Chrome: 3 players, undo approve and decline, a leaver skipped, both themes, two window sizes).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `tsconfig.json` | Create | Solution file referencing the two configs (editors and `tsc -b`) |
| `tsconfig.app.json` | Create | Browser code: `src/`, `shared/` minus tests; DOM globals only |
| `tsconfig.node.json` | Create | Node code: `server/`, `shared/` with tests, `vite.config.ts`; Node globals only |
| `.nvmrc` | Create | `22`, for `nvm use` |
| `package.json` | Modify | Dev dependencies, scripts, `engines` |
| `eslint.config.js` | Modify | `typescript-eslint` for `.ts`/`.tsx` |
| `vite.config.js` to `.ts` | Rename | Unchanged content |
| `shared/types.ts` | Create | All shared data shapes |
| `shared/messages.js` to `.ts` | Rename + type | Message type names, message unions, `asRecord` for untrusted data |
| `shared/rules.js` to `.ts` | Rename + type | Rules |
| `shared/rules.test.js` to `.ts` | Rename + type | Rules tests |
| `server/games.js` to `.ts` | Rename + type | Game manager |
| `server/games.test.js` to `.ts` | Rename + type | Game manager tests |
| `server/server.js` to `.ts` | Rename + type | Express and WebSocket routing |
| `src/main.jsx`, `App.jsx` to `.tsx` | Rename + type | Entry and shell |
| `src/components/*.jsx` to `.tsx` | Rename + type | Game, UndoVote, ThemeToggle |
| `src/services/gameService.js` to `.ts` | Rename + type | Browser WebSocket client |
| `index.html` | Modify | Loads `/src/main.tsx` |
| `README.md`, `docs/architecture.md` | Modify | Node requirement, scripts, file names |

---

### Task 1: Tooling and shared code

**Files:**
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.nvmrc`, `shared/types.ts`
- Modify: `package.json`, `eslint.config.js`
- Rename + rewrite: `shared/messages.js` to `shared/messages.ts`, `shared/rules.js` to `shared/rules.ts`, `shared/rules.test.js` to `shared/rules.test.ts`
- Rename: `vite.config.js` to `vite.config.ts`
- Modify import paths only: `server/games.js`, `server/server.js`, `src/components/Game.jsx`, `src/services/gameService.js`

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks import these exact names):
  - `shared/types.ts`: `Seat`, `Position`, `Orientation`, `Wall`, `PlacedWall`, `Move`, `LastMove`, `UndoVote`, `GameState`, `PublicGameState`, `BoardState`, `WallInput`, `Result<T>`
  - `shared/messages.ts`: `MESSAGE_TYPES`, `ClientMessage`, `ServerMessage`, `asRecord(value: unknown): Record<string, unknown> | null`
  - `shared/rules.ts`: same exports as today, now typed: `BOARD_SIZE`, `MAX_PLAYERS`, `SEATS`, `wallsPerPlayer`, `isAtGoal`, `isBlockedByWall`, `getValidMoves(state: BoardState, seat)`, `hasPathToGoal`, `isValidWallPlacement(state: BoardState, wall: WallInput): wall is Wall`, `createGameState`, `nextActivePlayer`, `addPlayer(state, name): { state: GameState; seat: Seat } | { error: string }`, `removePlayer`, `applyMove(state, seat, move: unknown): Result<GameState>`
  - npm scripts `typecheck`, `build`, `lint`, `test`

- [ ] **Step 1: Install the dev dependencies**

Run: `npm install -D typescript@^5.8 @types/node@^22 @types/express @types/ws typescript-eslint`
Expected: `package.json` `devDependencies` gains exactly these five; `dependencies` unchanged.

- [ ] **Step 2: Add the TypeScript configs and `.nvmrc`**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Create `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": [],
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": ["src", "shared"],
  "exclude": ["shared/**/*.test.ts"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": ["server", "shared", "vite.config.ts"]
}
```

`"types": []` in the app config stops `@types/node` globals leaking into browser code; React types still resolve through imports. The node config has no DOM lib, so server code cannot use browser globals.

Create `.nvmrc` containing one line: `22`

- [ ] **Step 3: Update `package.json`**

Set the scripts to:

```json
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -b",
    "build": "npm run typecheck && vite build",
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview",
    "start": "npm run build && node server/server.js",
    "test": "node --test"
  },
```

(`start` switches to `server/server.ts` in Task 2.) Add after `"type": "module",`:

```json
  "engines": {
    "node": ">=22.18"
  },
```

- [ ] **Step 4: Update the ESLint config**

Replace the whole of `eslint.config.js` with:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const reactRules = {
  ...reactHooks.configs.recommended.rules,
  'react-refresh/only-export-components': [
    'warn',
    { allowConstantExport: true },
  ],
}

const plugins = {
  'react-hooks': reactHooks,
  'react-refresh': reactRefresh,
}

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      sourceType: 'module',
    },
    plugins,
    rules: {
      ...reactRules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    plugins,
    rules: {
      ...reactRules,
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
)
```

The `js,jsx` block keeps the not-yet-converted files linted exactly as before; Task 3 narrows it once only `eslint.config.js` is left.

- [ ] **Step 5: Rename the files**

```bash
git mv vite.config.js vite.config.ts
git mv shared/messages.js shared/messages.ts
git mv shared/rules.js shared/rules.ts
git mv shared/rules.test.js shared/rules.test.ts
```

`vite.config.ts` content stays as it is.

- [ ] **Step 6: Create `shared/types.ts`**

```ts
// Data shapes shared by the browser and the server

export type Seat = number; // A player number, 1 to 4

export type Position = { row: number; col: number };

export type Orientation = 'horizontal' | 'vertical';

export type Wall = Position & { orientation: Orientation };

export type PlacedWall = Wall & { playerNumber: Seat };

// A wall as it arrives over the network, before validation
export type WallInput = { row: unknown; col: unknown; orientation: unknown };

export type Move =
  | { type: 'move'; row: number; col: number }
  | { type: 'wall'; row: number; col: number; orientation: Orientation };

export type LastMove =
  | { type: 'move'; playerNumber: Seat; from: Position; to: Position }
  | { type: 'wall'; playerNumber: Seat; row: number; col: number; orientation: Orientation };

export type UndoVote = { requestedBy: Seat; votes: Record<Seat, boolean> };

export type GameState = {
  gameId: string;
  started: boolean;
  currentPlayer: Seat | null;
  activePlayers: Seat[];
  playerNames: Record<Seat, string>;
  pawns: Record<Seat, Position>;
  wallCounts: Record<Seat, number>;
  walls: PlacedWall[];
  lastMove: LastMove | null;
  gameStatus: string;
  isGameOver: boolean;
  winner: Seat | null;
  undoVote: UndoVote | null;
};

// The game state as the server sends it to browsers
export type PublicGameState = GameState & { undoAvailable: boolean };

// The parts of the state that board geometry reads
export type BoardState = { pawns: Record<Seat, Position>; walls: Wall[]; activePlayers: Seat[] };

export type Result<T> = { state: T } | { error: string };
```

- [ ] **Step 7: Rewrite `shared/messages.ts`**

```ts
import type { Move, PublicGameState, Seat } from './types.ts';

// WebSocket message types shared by the browser and the server
export const MESSAGE_TYPES = {
  JOIN_GAME: 'JOIN_GAME',
  GAME_JOINED: 'GAME_JOINED',
  MAKE_MOVE: 'MAKE_MOVE',
  REQUEST_UNDO: 'REQUEST_UNDO',
  VOTE_UNDO: 'VOTE_UNDO',
  GAME_STATE: 'GAME_STATE',
  GAME_ERROR: 'GAME_ERROR'
} as const;

export type ClientMessage =
  | { type: typeof MESSAGE_TYPES.JOIN_GAME; gameId: string; playerName: string }
  | { type: typeof MESSAGE_TYPES.MAKE_MOVE; payload: { move: Move } }
  | { type: typeof MESSAGE_TYPES.REQUEST_UNDO }
  | { type: typeof MESSAGE_TYPES.VOTE_UNDO; payload: { approve: boolean } };

export type ServerMessage =
  | { type: typeof MESSAGE_TYPES.GAME_JOINED; payload: { playerNumber: Seat; gameState: PublicGameState } }
  | { type: typeof MESSAGE_TYPES.GAME_STATE; payload: PublicGameState }
  | { type: typeof MESSAGE_TYPES.GAME_ERROR; payload: { message: string } };

// Reads untrusted data as an object whose fields are all still unchecked, or null if it is not an object
export function asRecord(value: unknown): Record<string, unknown> | null {
  // Any non-null object can be read field by field; each field stays `unknown`
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
```

- [ ] **Step 8: Rewrite `shared/rules.ts`**

Replace the whole file with the following. The logic is today's, with these typing-only changes: `isWallInBounds` checks `typeof ... === 'number'` before `Number.isInteger` (same result), `isValidWallPlacement` is a type guard, `applyMove` reads the untrusted move through `asRecord` and finds the destination among the generated moves (same comparisons as before), and `addPlayer` has an unreachable guard for a missing free seat.

```ts
// Quoridor rules shared by the browser (move hints, wall previews) and the server (validation).
import { asRecord } from './messages.ts';
import type { BoardState, GameState, Position, Result, Seat, Wall, WallInput } from './types.ts';

export const BOARD_SIZE = 9;
export const MAX_PLAYERS = 4;

type SeatInfo = { start: Position; goal: { row: number } | { col: number }; goalLabel: string };

export const SEATS: Record<Seat, SeatInfo> = {
  1: { start: { row: 8, col: 4 }, goal: { row: 0 }, goalLabel: 'top row' },
  2: { start: { row: 0, col: 4 }, goal: { row: 8 }, goalLabel: 'bottom row' },
  3: { start: { row: 4, col: 0 }, goal: { col: 8 }, goalLabel: 'right column' },
  4: { start: { row: 4, col: 8 }, goal: { col: 0 }, goalLabel: 'left column' }
};

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 }, // up
  { row: 1, col: 0 },  // down
  { row: 0, col: -1 }, // left
  { row: 0, col: 1 }   // right
];

export function wallsPerPlayer(playerCount: number): number {
  return playerCount <= 2 ? 10 : 5;
}

export function isAtGoal(seat: Seat, position: Position): boolean {
  const { goal } = SEATS[seat];
  return 'row' in goal ? position.row === goal.row : position.col === goal.col;
}

function isOnBoard({ row, col }: Position): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isOccupied(pawns: Record<Seat, Position>, position: Position): boolean {
  return Object.values(pawns).some(pawn => isSamePosition(pawn, position));
}

// `from` and `to` must be orthogonally adjacent squares
export function isBlockedByWall(from: Position, to: Position, walls: Wall[]): boolean {
  if (from.col === to.col) {
    const row = Math.min(from.row, to.row);
    return walls.some(wall =>
      wall.orientation === 'horizontal' &&
      wall.row === row &&
      (wall.col === from.col - 1 || wall.col === from.col)  // Check both squares covered by wall
    );
  }
  const col = Math.min(from.col, to.col);
  return walls.some(wall =>
    wall.orientation === 'vertical' &&
    wall.col === col &&
    (wall.row === from.row - 1 || wall.row === from.row)  // Check both squares covered by wall
  );
}

export function getValidMoves(state: BoardState, seat: Seat): Position[] {
  const pawn = state.pawns[seat];
  const moves: Position[] = [];

  for (const dir of DIRECTIONS) {
    const step = { row: pawn.row + dir.row, col: pawn.col + dir.col };
    if (!isOnBoard(step) || isBlockedByWall(pawn, step, state.walls)) continue;

    if (!isOccupied(state.pawns, step)) {
      moves.push(step);
      continue;
    }

    // Jump straight over the adjacent pawn if the square beyond is free and reachable
    const jump = { row: step.row + dir.row, col: step.col + dir.col };
    if (isOnBoard(jump) && !isBlockedByWall(step, jump, state.walls) && !isOccupied(state.pawns, jump)) {
      moves.push(jump);
    }
  }

  return moves;
}

function isWallInBounds(wall: WallInput): wall is Wall {
  const { row, col, orientation } = wall;
  return (orientation === 'horizontal' || orientation === 'vertical') &&
    typeof row === 'number' && typeof col === 'number' &&
    Number.isInteger(row) && Number.isInteger(col) &&
    row >= 0 && row < BOARD_SIZE - 1 &&
    col >= 0 && col < BOARD_SIZE - 1;
}

function wallsConflict(a: Wall, b: Wall): boolean {
  if (a.orientation !== b.orientation) {
    return a.row === b.row && a.col === b.col; // Crossing at the same midpoint
  }
  if (a.orientation === 'horizontal') {
    return a.row === b.row && Math.abs(a.col - b.col) <= 1;
  }
  return a.col === b.col && Math.abs(a.row - b.row) <= 1;
}

export function hasPathToGoal(seat: Seat, start: Position, walls: Wall[]): boolean {
  const visited = new Set<string>();
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const square = queue.shift() as Position; // The loop condition guarantees an element
    const key = `${square.row},${square.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (isAtGoal(seat, square)) return true;

    for (const dir of DIRECTIONS) {
      const next = { row: square.row + dir.row, col: square.col + dir.col };
      if (isOnBoard(next) && !isBlockedByWall(square, next, walls)) {
        queue.push(next);
      }
    }
  }

  return false;
}

export function isValidWallPlacement(state: BoardState, wall: WallInput): wall is Wall {
  if (!isWallInBounds(wall)) return false;
  const placed: Wall = wall;
  if (state.walls.some(existing => wallsConflict(existing, placed))) return false;

  // Every player still in the game must keep a path to their goal edge
  const walls = [...state.walls, placed];
  return state.activePlayers.every(seat => hasPathToGoal(seat, state.pawns[seat], walls));
}

export function createGameState(gameId: string): GameState {
  return {
    gameId,
    started: false,
    currentPlayer: null,
    activePlayers: [],
    playerNames: {},
    pawns: {},
    wallCounts: {},
    walls: [],
    lastMove: null,
    gameStatus: '',
    isGameOver: false,
    winner: null,
    undoVote: null
  };
}

function without<T>(record: Record<Seat, T>, key: Seat): Record<Seat, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

// Before the first move, wall counts track the player count and the lowest seat moves first
function withLobbyDefaults(state: GameState): GameState {
  const count = wallsPerPlayer(state.activePlayers.length);
  return {
    ...state,
    wallCounts: Object.fromEntries(state.activePlayers.map(seat => [seat, count])),
    currentPlayer: state.activePlayers[0] ?? null
  };
}

export function nextActivePlayer(state: Pick<GameState, 'activePlayers'>, fromSeat: Seat): Seat | null {
  for (let offset = 1; offset <= MAX_PLAYERS; offset++) {
    const seat = ((fromSeat - 1 + offset) % MAX_PLAYERS) + 1;
    if (state.activePlayers.includes(seat)) return seat;
  }
  return null;
}

export function addPlayer(state: GameState, name: string): { state: GameState; seat: Seat } | { error: string } {
  if (state.started) return { error: 'Game already in progress' };
  if (state.activePlayers.length >= MAX_PLAYERS) return { error: 'Game is full' };

  const seat = Object.keys(SEATS).map(Number).find(s => !state.activePlayers.includes(s));
  if (seat === undefined) return { error: 'Game is full' }; // Unreachable: fewer than MAX_PLAYERS seats are taken
  const activePlayers = [...state.activePlayers, seat].sort((a, b) => a - b);
  const next = withLobbyDefaults({
    ...state,
    activePlayers,
    playerNames: { ...state.playerNames, [seat]: name },
    pawns: { ...state.pawns, [seat]: SEATS[seat].start },
    gameStatus: `${name} joined (${activePlayers.length}/${MAX_PLAYERS} players)`
  });
  return { state: next, seat };
}

export function removePlayer(state: GameState, seat: Seat): GameState {
  const name = state.playerNames[seat];
  const activePlayers = state.activePlayers.filter(s => s !== seat);

  if (!state.started) {
    return withLobbyDefaults({
      ...state,
      activePlayers,
      playerNames: without(state.playerNames, seat),
      pawns: without(state.pawns, seat),
      gameStatus: `${name} left`
    });
  }

  // Mid-game: the pawn and walls stay, the seat is skipped from now on
  const next: GameState = { ...state, activePlayers, gameStatus: `${name} left the game` };
  if (state.isGameOver) return activePlayers.length < 2 ? { ...next, undoVote: null } : next;

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    return {
      ...next,
      isGameOver: true,
      winner,
      undoVote: null,
      gameStatus: `${state.playerNames[winner]} wins! Everyone else left.`
    };
  }

  if (state.currentPlayer === seat) {
    next.currentPlayer = nextActivePlayer(next, seat);
  }
  return next;
}

export function applyMove(state: GameState, seat: Seat, move: unknown): Result<GameState> {
  if (state.isGameOver) return { error: 'The game is over' };
  if (state.activePlayers.length < 2) return { error: 'Waiting for more players' };
  if (state.undoVote) return { error: 'An undo vote is in progress' };
  if (state.currentPlayer !== seat) return { error: 'Not your turn' };

  const input = asRecord(move);
  const name = state.playerNames[seat];
  let next: GameState;

  if (input?.type === 'move') {
    const to = getValidMoves(state, seat).find(valid => valid.row === input.row && valid.col === input.col);
    if (!to) return { error: 'Invalid move' };
    next = {
      ...state,
      pawns: { ...state.pawns, [seat]: to },
      lastMove: { type: 'move', playerNumber: seat, from: state.pawns[seat], to },
      gameStatus: `${name} moved`
    };
    if (isAtGoal(seat, to)) {
      next.isGameOver = true;
      next.winner = seat;
      next.gameStatus = `${name} wins!`;
    }
  } else if (input?.type === 'wall') {
    if (state.wallCounts[seat] <= 0) return { error: 'No walls left' };
    const wall = { row: input.row, col: input.col, orientation: input.orientation };
    if (!isValidWallPlacement(state, wall)) return { error: 'Invalid wall placement' };
    next = {
      ...state,
      walls: [...state.walls, { ...wall, playerNumber: seat }],
      wallCounts: { ...state.wallCounts, [seat]: state.wallCounts[seat] - 1 },
      lastMove: { type: 'wall', playerNumber: seat, ...wall },
      gameStatus: `${name} placed a wall`
    };
  } else {
    return { error: 'Unknown move type' };
  }

  next.started = true; // Locks joining and freezes wall counts
  if (!next.isGameOver) {
    next.currentPlayer = nextActivePlayer(next, seat);
  }
  return { state: next };
}
```

- [ ] **Step 9: Rewrite `shared/rules.test.ts`**

Replace the top of the file (imports through the `vWall` helper) with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEATS,
  wallsPerPlayer,
  isAtGoal,
  getValidMoves,
  hasPathToGoal,
  isValidWallPlacement,
  createGameState,
  addPlayer,
  removePlayer,
  applyMove
} from './rules.ts';
import type { BoardState, GameState, Move, Position, Seat, Wall } from './types.ts';

// Minimal state for geometry checks: only pawns, walls and activePlayers are read
function board({ pawns, walls = [], activePlayers = Object.keys(pawns).map(Number) }: {
  pawns: Record<Seat, Position>;
  walls?: Wall[];
  activePlayers?: Seat[];
}): BoardState {
  return { pawns, walls, activePlayers };
}

const at = (row: number, col: number): Position => ({ row, col });
const hWall = (row: number, col: number): Wall => ({ row, col, orientation: 'horizontal' });
const vWall = (row: number, col: number): Wall => ({ row, col, orientation: 'vertical' });
```

Replace the `lobby`, `play` and `step` helpers with:

```ts
function seated(result: ReturnType<typeof addPlayer>) {
  if ('error' in result) assert.fail(result.error);
  return result;
}

function lobby(...names: string[]): GameState {
  let state = createGameState('g1');
  for (const name of names) state = seated(addPlayer(state, name)).state;
  return state;
}

function play(state: GameState, seat: Seat, move: Move): GameState {
  const result = applyMove(state, seat, move);
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

const step = (row: number, col: number): Move => ({ type: 'move', row, col });
```

Make these three edits in the test bodies:
- In 'lobby wall counts follow the player count': `state = addPlayer(state, 'C').state;` becomes `state = seated(addPlayer(state, 'C')).state;`
- In 'a freed lobby seat is reused and the lowest seat moves first': `const result = addPlayer(state, 'D');` becomes `const result = seated(addPlayer(state, 'D'));`
- In 'reaching the goal edge wins, for every seat': replace the `cases` object and the `for` header with:

```ts
  const cases: [Seat, Position, Position][] = [
    [1, at(1, 2), at(0, 2)],
    [2, at(7, 2), at(8, 2)],
    [3, at(2, 7), at(2, 8)],
    [4, at(2, 1), at(2, 0)]
  ];
  for (const [seat, from, to] of cases) {
```

(the loop body stays the same).

Append one new test after 'rejects malformed and illegal moves':

```ts
test('rejects moves that are not objects', () => {
  const state = lobby('A', 'B');
  assert.deepEqual(applyMove(state, 1, 'move'), { error: 'Unknown move type' });
  assert.deepEqual(applyMove(state, 1, []), { error: 'Unknown move type' });
  assert.deepEqual(applyMove(state, 1, null), { error: 'Unknown move type' });
});
```

- [ ] **Step 10: Point the remaining JS files at the renamed shared files**

Change only the import specifiers:
- `server/games.js`: `'../shared/rules.js'` becomes `'../shared/rules.ts'`
- `server/server.js`: `'../shared/messages.js'` becomes `'../shared/messages.ts'`
- `src/components/Game.jsx`: `'../../shared/rules.js'` becomes `'../../shared/rules.ts'`
- `src/services/gameService.js`: `'../../shared/messages.js'` becomes `'../../shared/messages.ts'`

- [ ] **Step 11: Verify**

Run each and confirm:
- `npm run typecheck`: exit 0, no output.
- `npm test`: 40 tests pass (39 before plus the new one), no warnings.
- `npm run lint`: exit 0, no warnings.
- `npm run build`: ends with `built in`.
- Run `node server/server.js` in the background, then the smoke script from Task 2 Step 5 (it is identical); compare with the expected output there; stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json .nvmrc eslint.config.js vite.config.ts shared server/games.js server/server.js src/components/Game.jsx src/services/gameService.js
git commit -F - <<'EOF'
Add TypeScript tooling and convert the shared rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Server

**Files:**
- Rename + rewrite: `server/games.js` to `server/games.ts`, `server/games.test.js` to `server/games.test.ts`, `server/server.js` to `server/server.ts`
- Modify: `package.json` (`start` script)

**Interfaces:**
- Consumes: Task 1's `shared/types.ts`, `shared/messages.ts` (`MESSAGE_TYPES`, `ServerMessage`, `asRecord`), `shared/rules.ts`.
- Produces: `createGameManager()` with `join(gameId: unknown, playerName: unknown): JoinResult`, `leave(gameId: string, seat: Seat): { state: PublicGameState } | null`, `move(gameId: string, seat: Seat, move: unknown): Result<PublicGameState>`, `requestUndo(gameId: string, seat: Seat): Result<PublicGameState>`, `voteUndo(gameId: string, seat: Seat, approve: unknown): Result<PublicGameState>`, `getState(gameId: string): PublicGameState | undefined`. `JoinResult = { gameId: string; seat: Seat; state: PublicGameState } | { error: string }`. Wire format unchanged.

- [ ] **Step 1: Rename the files**

```bash
git mv server/games.js server/games.ts
git mv server/games.test.js server/games.test.ts
git mv server/server.js server/server.ts
```

- [ ] **Step 2: Rewrite `server/games.ts`**

Today's logic with types. Typing-only changes: `'error' in x` narrowing replaces `x.error` checks; `resolveUndoVote` guards an empty history and a null current player (both unreachable: a vote only opens with history, and every history entry was saved on a move, which needs a current player).

```ts
import { createGameState, addPlayer, removePlayer, applyMove, nextActivePlayer } from '../shared/rules.ts';
import type { GameState, PublicGameState, Result, Seat } from '../shared/types.ts';

const MAX_NAME_LENGTH = 20; // applies to player names and game IDs

type Game = { state: GameState; history: GameState[] };

export type JoinResult = { gameId: string; seat: Seat; state: PublicGameState } | { error: string };

// Holds every game in memory, plus each game's undo history, which is never sent to browsers
export function createGameManager() {
  const games = new Map<string, Game>();

  function view(game: Game): PublicGameState {
    return { ...game.state, undoAvailable: game.history.length > 0 };
  }

  function findPlayer(gameId: string, seat: Seat): { game: Game } | { error: string } {
    const game = games.get(gameId);
    if (!game) return { error: 'Game not found' };
    if (!game.state.activePlayers.includes(seat)) return { error: 'You are not in this game' };
    return { game };
  }

  // Applies the undo once every connected player has approved
  function resolveUndoVote(game: Game): void {
    const { state } = game;
    const vote = state.undoVote;
    if (!vote || !state.activePlayers.every(seat => vote.votes[seat])) return;

    const previous = game.history.pop();
    if (!previous) return; // Unreachable: a vote only opens when there is history

    const restored: GameState = {
      ...previous,
      started: true,
      activePlayers: state.activePlayers,
      playerNames: state.playerNames,
      undoVote: null,
      gameStatus: 'Last turn undone'
    };
    const current = restored.currentPlayer;
    if (current !== null && !restored.activePlayers.includes(current)) {
      restored.currentPlayer = nextActivePlayer(restored, current);
    }
    game.state = restored;
  }

  return {
    join(gameId: unknown, playerName: unknown): JoinResult {
      const id = String(gameId ?? '').trim().slice(0, MAX_NAME_LENGTH);
      const name = String(playerName ?? '').trim().slice(0, MAX_NAME_LENGTH);
      if (!id) return { error: 'Please enter a game ID' };
      if (!name) return { error: 'Please enter your name' };

      const game = games.get(id) ?? { state: createGameState(id), history: [] };
      const result = addPlayer(game.state, name);
      if ('error' in result) return result;

      game.state = result.state;
      games.set(id, game);
      return { gameId: id, seat: result.seat, state: view(game) };
    },

    leave(gameId: string, seat: Seat): { state: PublicGameState } | null {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return null;
      const { game } = found;

      game.state = removePlayer(game.state, seat);
      if (game.state.activePlayers.length === 0) {
        games.delete(gameId);
        return null;
      }
      resolveUndoVote(game);
      return { state: view(game) };
    },

    move(gameId: string, seat: Seat, move: unknown): Result<PublicGameState> {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return found;
      const { game } = found;

      const result = applyMove(game.state, seat, move);
      if ('error' in result) return result;

      game.history.push(game.state);
      game.state = result.state;
      return { state: view(game) };
    },

    requestUndo(gameId: string, seat: Seat): Result<PublicGameState> {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return found;
      const { game } = found;
      const { state } = game;

      if (game.history.length === 0) return { error: 'Nothing to undo' };
      if (state.undoVote) return { error: 'An undo vote is already in progress' };
      if (state.activePlayers.length < 2) return { error: 'Not enough players to vote' };

      game.state = {
        ...state,
        undoVote: { requestedBy: seat, votes: { [seat]: true } },
        gameStatus: `${state.playerNames[seat]} wants to undo the last turn`
      };
      return { state: view(game) };
    },

    voteUndo(gameId: string, seat: Seat, approve: unknown): Result<PublicGameState> {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return found;
      const { game } = found;
      const { state } = game;
      const vote = state.undoVote;

      if (!vote) return { error: 'No undo vote in progress' };
      if (vote.votes[seat]) return { error: 'You already voted' };

      if (approve !== true) {
        game.state = { ...state, undoVote: null, gameStatus: `${state.playerNames[seat]} declined the undo` };
        return { state: view(game) };
      }

      game.state = { ...state, undoVote: { ...vote, votes: { ...vote.votes, [seat]: true } } };
      resolveUndoVote(game);
      return { state: view(game) };
    },

    getState(gameId: string): PublicGameState | undefined {
      const game = games.get(gameId);
      return game && view(game);
    }
  };
}
```

- [ ] **Step 3: Rewrite `server/games.test.ts`**

Replace the top of the file (imports through the `ok` helper) with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameManager } from './games.ts';
import type { Move, PublicGameState, Result } from '../shared/types.ts';

type Manager = ReturnType<typeof createGameManager>;

const step = (row: number, col: number): Move => ({ type: 'move', row, col });

function gameWith(...names: string[]): Manager {
  const manager = createGameManager();
  for (const name of names) manager.join('g1', name);
  return manager;
}

function ok(result: Result<PublicGameState>): PublicGameState {
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

function joined(result: ReturnType<Manager['join']>) {
  if ('error' in result) assert.fail(result.error);
  return result;
}

function left(result: ReturnType<Manager['leave']>): PublicGameState {
  assert.ok(result, 'expected the game to still exist');
  return result.state;
}
```

Then make these edits in the test bodies (assertions otherwise unchanged):
- 'join trims the game ID and name and rejects blanks': `const first = manager.join('  g1 ', ' Alice ');` becomes `const first = joined(manager.join('  g1 ', ' Alice '));`, and `manager.join('g1', 'Bob').seat` becomes `joined(manager.join('g1', 'Bob')).seat`.
- 'leaving the lobby frees the seat...': `manager.leave('g1', 1).state.activePlayers` becomes `left(manager.leave('g1', 1)).activePlayers`, and `manager.join('g1', 'C').seat` becomes `joined(manager.join('g1', 'C')).seat`.
- 'moves are validated and recorded for undo': `manager.getState('g1').undoAvailable` becomes `manager.getState('g1')?.undoAvailable`.
- 'an undo approved by everyone restores the previous turn': replace `assert.deepEqual(restored.lastMove.to, { row: 7, col: 4 });` with `assert.deepEqual(restored.lastMove, { type: 'move', playerNumber: 1, from: { row: 8, col: 4 }, to: { row: 7, col: 4 } });`; and `manager.getState('g1').pawns[1]` becomes `manager.getState('g1')?.pawns[1]`, `manager.getState('g1').undoAvailable` becomes `manager.getState('g1')?.undoAvailable`.
- 'a player leaving during a vote no longer counts': `const after = manager.leave('g1', 3).state;` becomes `const after = left(manager.leave('g1', 3));`
- `function wonGame() {` becomes `function wonGame(): Manager {`
- Both 'an undo vote after a win is cancelled when ...' tests: `const state = manager.leave('g1', N).state;` becomes `const state = left(manager.leave('g1', N));` (N is 1 and 2 respectively).
- 'join caps the name and the game ID at 20 characters': `const joined = manager.join('g'.repeat(30), 'n'.repeat(30));` becomes `const result = joined(manager.join('g'.repeat(30), 'n'.repeat(30)));`, and the two assertions read `result.gameId` and `result.state.playerNames[1]`.

- [ ] **Step 4: Rewrite `server/server.ts`**

Same behavior. `WebSocket` is imported the way the `ws` docs show (default import) and used only as a type. Typing-only changes: parsed JSON is `unknown` and read through `asRecord` (a string `payload` reads as no move, as before); `send` takes a typed `ServerMessage` (same `{ type, payload }` JSON); `JSON.parse(String(message))` is what `JSON.parse(buffer)` already did implicitly.

```ts
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGameManager } from './games.ts';
import { MESSAGE_TYPES, asRecord, type ServerMessage } from '../shared/messages.ts';
import type { PublicGameState, Result, Seat } from '../shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

type Connection = { gameId: string; seat: Seat };

const manager = createGameManager();
const connections = new Map<WebSocket, Connection>(); // Filled once the socket has joined a game

// Configure Express routes
app.use(express.static(path.join(__dirname, '../dist')));

// Serve index.html for any routes that don't match static files
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data: unknown;
    try {
      data = JSON.parse(String(message));
    } catch (error) {
      console.error('Error parsing message:', error);
      return;
    }
    try {
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error handling message:', error);
      sendError(ws, 'Something went wrong');
    }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function handleMessage(ws: WebSocket, data: unknown): void {
  const message = asRecord(data);
  if (message?.type === MESSAGE_TYPES.JOIN_GAME) {
    handleJoinGame(ws, message);
    return;
  }

  const connection = connections.get(ws);
  if (!connection) {
    sendError(ws, 'Join a game first');
    return;
  }

  const { gameId, seat } = connection;
  const payload = asRecord(message?.payload);
  switch (message?.type) {
    case MESSAGE_TYPES.MAKE_MOVE:
      respond(ws, gameId, manager.move(gameId, seat, payload?.move));
      break;
    case MESSAGE_TYPES.REQUEST_UNDO:
      respond(ws, gameId, manager.requestUndo(gameId, seat));
      break;
    case MESSAGE_TYPES.VOTE_UNDO:
      respond(ws, gameId, manager.voteUndo(gameId, seat, payload?.approve));
      break;
  }
}

function handleJoinGame(ws: WebSocket, message: Record<string, unknown>): void {
  if (connections.has(ws)) {
    sendError(ws, 'Already in a game');
    return;
  }

  const result = manager.join(message.gameId, message.playerName);
  if ('error' in result) {
    sendError(ws, result.error);
    return;
  }

  connections.set(ws, { gameId: result.gameId, seat: result.seat });
  send(ws, { type: MESSAGE_TYPES.GAME_JOINED, payload: { playerNumber: result.seat, gameState: result.state } });
  broadcast(result.gameId, result.state);
}

function handleDisconnect(ws: WebSocket): void {
  const connection = connections.get(ws);
  if (!connection) return;

  connections.delete(ws);
  const result = manager.leave(connection.gameId, connection.seat);
  if (result) broadcast(connection.gameId, result.state);
}

function respond(ws: WebSocket, gameId: string, result: Result<PublicGameState>): void {
  if ('error' in result) {
    sendError(ws, result.error);
  } else {
    broadcast(gameId, result.state);
  }
}

function broadcast(gameId: string, state: PublicGameState): void {
  for (const [ws, connection] of connections) {
    if (connection.gameId === gameId) send(ws, { type: MESSAGE_TYPES.GAME_STATE, payload: state });
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: MESSAGE_TYPES.GAME_ERROR, payload: { message } });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
  console.log('Use Ctrl+C to stop the server');
});
```

- [ ] **Step 5: Point `start` at the TypeScript server**

In `package.json`, `"start": "npm run build && node server/server.js"` becomes `"start": "npm run build && node server/server.ts"`.

- [ ] **Step 6: Verify**

- `npm run typecheck`, `npm run lint`: exit 0, no warnings.
- `npm test`: 40 pass.
- `npm run build`, then run `node server/server.ts` in the background and run the WebSocket smoke script from `docs/superpowers/plans/2026-10-02-four-players-and-undo-vote.md` Task 4 Step 3 (a copy is kept outside the repo as `smoke.mjs` in the session scratchpad; do not add it to the repo). Expected output, line for line:

```
seats: 1 2
unjoined move: Join a game first
garbage from A: Unknown move type
after move: {"row":7,"col":4} A moved
late join: Game already in progress
after undo: {"row":8,"col":4} Last turn undone
after A leaves: B wins! Everyone else left. winner 2
```

The server log shows exactly one `Error parsing message` (for `not json`) and no TypeScript or experimental warnings. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A server package.json
git commit -F - <<'EOF'
Convert the server to TypeScript

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Browser client

**Files:**
- Rename + rewrite: `src/main.jsx` to `src/main.tsx`, `src/App.jsx` to `src/App.tsx`, `src/components/Game.jsx` to `Game.tsx`, `src/components/UndoVote.jsx` to `UndoVote.tsx`, `src/components/ThemeToggle.jsx` to `ThemeToggle.tsx`, `src/services/gameService.js` to `gameService.ts`
- Modify: `index.html`, `eslint.config.js`

**Interfaces:**
- Consumes: Task 1's types, `MESSAGE_TYPES`, `ClientMessage`, `ServerMessage`, and rules functions.
- Produces: no new interfaces; the app behaves as before.

- [ ] **Step 1: Rename the files**

```bash
git mv src/main.jsx src/main.tsx
git mv src/App.jsx src/App.tsx
git mv src/components/Game.jsx src/components/Game.tsx
git mv src/components/UndoVote.jsx src/components/UndoVote.tsx
git mv src/components/ThemeToggle.jsx src/components/ThemeToggle.tsx
git mv src/services/gameService.js src/services/gameService.ts
```

`App.tsx` and `ThemeToggle.tsx` need no content changes (their imports are extensionless and their types infer).

- [ ] **Step 2: Update `index.html` and `src/main.tsx`**

In `index.html`, `src="/src/main.jsx"` becomes `src="/src/main.tsx"`.

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// index.html always contains the #root element
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Rewrite `src/services/gameService.ts`**

```ts
import { MESSAGE_TYPES, type ClientMessage, type ServerMessage } from '../../shared/messages.ts';
import type { Move, PublicGameState, Seat } from '../../shared/types.ts';

type GameJoined = { playerNumber: Seat; gameState: PublicGameState };

class GameService {
  ws: WebSocket | null;
  onGameState: ((state: PublicGameState) => void) | null;
  onGameJoined: ((data: GameJoined) => void) | null;
  onError: ((message: string) => void) | null;
  onDisconnect: (() => void) | null;

  constructor() {
    this.ws = null;
    this.onGameState = null;
    this.onGameJoined = null;
    this.onError = null;
    this.onDisconnect = null;
  }

  connect(gameId: string, playerName: string, serverUrl = window.location.host): void {
    // Drop any earlier socket, e.g. after a refused join, without reporting a disconnect
    this.disconnect();

    // Use wss:// for https, ws:// for http
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${serverUrl}`);
    this.ws = ws;

    ws.onopen = () => {
      this.send({ type: MESSAGE_TYPES.JOIN_GAME, gameId, playerName });
    };

    ws.onmessage = (event) => {
      // Our own server only sends ServerMessage shapes
      this.handleMessage(JSON.parse(event.data) as ServerMessage);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onDisconnect?.();
    };
  }

  handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case MESSAGE_TYPES.GAME_JOINED:
        this.onGameJoined?.(message.payload);
        break;
      case MESSAGE_TYPES.GAME_STATE:
        this.onGameState?.(message.payload);
        break;
      case MESSAGE_TYPES.GAME_ERROR:
        this.onError?.(message.payload.message);
        break;
    }
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  makeMove(move: Move): void {
    this.send({ type: MESSAGE_TYPES.MAKE_MOVE, payload: { move } });
  }

  requestUndo(): void {
    this.send({ type: MESSAGE_TYPES.REQUEST_UNDO });
  }

  voteUndo(approve: boolean): void {
    this.send({ type: MESSAGE_TYPES.VOTE_UNDO, payload: { approve } });
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

export default new GameService();
```

- [ ] **Step 4: Rewrite `src/components/UndoVote.tsx`**

```tsx
import type { Seat, UndoVote as UndoVoteState } from '../../shared/types.ts';

type UndoVoteProps = {
  vote: UndoVoteState;
  playerNumber: Seat;
  activePlayers: Seat[];
  playerNames: Record<Seat, string>;
  onVote: (approve: boolean) => void;
};

export default function UndoVote({ vote, playerNumber, activePlayers, playerNames, onVote }: UndoVoteProps) {
  const canVote = activePlayers.includes(playerNumber) && !vote.votes[playerNumber];

  return (
    <div className="undo-vote">
      <div className="undo-vote-panel">
        <div className="undo-vote-title">{playerNames[vote.requestedBy]} wants to undo the last turn</div>
        <ul className="undo-vote-list">
          {activePlayers.map(seat => (
            <li key={seat}>
              {playerNames[seat]}: {vote.votes[seat] ? 'approved' : 'waiting'}
            </li>
          ))}
        </ul>
        {canVote ? (
          <div className="undo-vote-actions">
            <button onClick={() => onVote(true)}>Approve</button>
            <button onClick={() => onVote(false)}>Decline</button>
          </div>
        ) : (
          <div>Waiting for the other players</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `src/components/Game.tsx`**

Typing-only changes from today's `Game.jsx`: typed state; the join screen also shows when `playerNumber` is null (it is always set together with `gameState`); `turnMessage` reads the current player's name through a null check; the last-move checks use `lastMove?.type` so the compiler can narrow; the empty board uses `Array<null>`.

```tsx
import { useState, useEffect, useCallback } from 'react';
import gameService from '../services/gameService';
import UndoVote from './UndoVote';
import { BOARD_SIZE, SEATS, getValidMoves, isValidWallPlacement } from '../../shared/rules.ts';
import type { PlacedWall, Position, PublicGameState, Seat, Wall } from '../../shared/types.ts';

type Action = 'move' | 'wall-h' | 'wall-v';

const SQUARE_SIZE = 52; // 50px square plus its 1px borders
const BOARD = Array.from({ length: BOARD_SIZE }, () => Array<null>(BOARD_SIZE).fill(null));

export default function Game() {
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerNumber, setPlayerNumber] = useState<Seat | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action>('move');
  const [wallPreview, setWallPreview] = useState<Wall | null>(null);
  const [lastMoveHovered, setLastMoveHovered] = useState(false);
  const [lastMovePinned, setLastMovePinned] = useState(false);
  const currentPlayer = gameState?.currentPlayer;

  useEffect(() => {
    gameService.onGameJoined = (data) => {
      setPlayerNumber(data.playerNumber);
      setGameState(data.gameState);
      setError(null);
    };

    gameService.onGameState = (newGameState) => {
      setGameState(newGameState);
      setError(null);
    };

    gameService.onError = setError;

    gameService.onDisconnect = () => {
      setPlayerNumber(null);
      setGameState(null);
      setError('Disconnected from server');
    };

    return () => {
      gameService.disconnect();
    };
  }, []);

  useEffect(() => {
    // Reset to move at the start of every turn
    setSelectedAction('move');
    setWallPreview(null);
  }, [currentPlayer]);

  const handleJoinGame = useCallback(() => {
    const trimmedGameId = gameId.trim();
    const trimmedName = playerName.trim();
    if (!trimmedGameId) {
      setError('Please enter a game ID');
      return;
    }
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    setError(null);
    gameService.connect(trimmedGameId, trimmedName);
  }, [gameId, playerName]);

  if (!gameState || playerNumber === null) {
    return (
      <div className="game">
        <div className="game-info">
          <h2>Join a Game</h2>
          {error && <div className="error">{error}</div>}
          <div className="join-form">
            <div className="input-group">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                placeholder="Enter your name"
              />
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                maxLength={20}
                placeholder="Enter Game ID to create or join a game"
              />
            </div>
            <button onClick={handleJoinGame}>Join Game</button>
          </div>
        </div>
      </div>
    );
  }

  const { pawns, walls, playerNames, wallCounts, activePlayers, lastMove, isGameOver } = gameState;
  const seats = Object.keys(playerNames).map(Number).sort((a, b) => a - b);
  const isMyTurn = currentPlayer === playerNumber && activePlayers.length >= 2 && !isGameOver && !gameState.undoVote;
  const validMoves = isMyTurn ? getValidMoves(gameState, playerNumber) : [];
  const showLastMove = Boolean(lastMove) && (lastMoveHovered || lastMovePinned);

  function turnMessage(): string {
    const currentName = currentPlayer == null ? '' : playerNames[currentPlayer];
    if (isGameOver) return 'Game Over';
    if (activePlayers.length < 2) return 'Waiting for at least one more player';
    if (!gameState?.started) return `${currentName} moves first. Joining closes after the first move.`;
    return `${currentName}'s turn`;
  }

  function wallAt(row: number, col: number): Wall {
    return { row, col, orientation: selectedAction === 'wall-h' ? 'horizontal' : 'vertical' };
  }

  function handleSquareClick(row: number, col: number) {
    if (!isMyTurn || !gameState || playerNumber === null) return;

    if (selectedAction === 'move') {
      if (validMoves.some(move => move.row === row && move.col === col)) {
        gameService.makeMove({ type: 'move', row, col });
      }
      return;
    }

    const wall = wallAt(row, col);
    if (wallCounts[playerNumber] > 0 && isValidWallPlacement(gameState, wall)) {
      gameService.makeMove({ type: 'wall', ...wall });
      setSelectedAction('move');
      setWallPreview(null);
    }
  }

  function handleSquareHover(row: number, col: number) {
    if (!isMyTurn || !gameState || selectedAction === 'move') return;
    const wall = wallAt(row, col);
    setWallPreview(isValidWallPlacement(gameState, wall) ? wall : null);
  }

  function isSamePosition(a: Position, b: Position): boolean {
    return a.row === b.row && a.col === b.col;
  }

  function pawnAt(row: number, col: number): Seat | undefined {
    return seats.find(seat => isSamePosition(pawns[seat], { row, col }));
  }

  function getSquareClassName(row: number, col: number): string {
    const classNames = ['square'];
    if (validMoves.some(move => move.row === row && move.col === col)) {
      classNames.push('valid-move');
    }
    if (showLastMove && lastMove?.type === 'move') {
      if (isSamePosition(lastMove.from, { row, col })) classNames.push('last-move-from');
      if (isSamePosition(lastMove.to, { row, col })) classNames.push('last-move-to');
    }
    return classNames.join(' ');
  }

  function isLastMoveWall(wall: PlacedWall): boolean {
    return showLastMove && lastMove?.type === 'wall' &&
      isSamePosition(lastMove, wall) && lastMove.orientation === wall.orientation;
  }

  return (
    <>
      <div className="game-id">Game ID: {gameState.gameId}</div>
      <div className="game">
        <div className="player-info">
          You are {playerNames[playerNumber]} (Player {playerNumber}). Your goal: reach the {SEATS[playerNumber].goalLabel}.
        </div>
        <div className="game-info">
          {(error || gameState.gameStatus) && (
            <div className={error ? 'game-status game-status-error' : 'game-status'}>
              {error || gameState.gameStatus}
            </div>
          )}
          <div>{turnMessage()}</div>
          <div>
            Walls left:{' '}
            {seats.map((seat, index) => (
              <span key={seat} className={activePlayers.includes(seat) ? '' : 'player-left'}>
                {index > 0 && ' · '}
                {playerNames[seat]} {wallCounts[seat]}
                {!activePlayers.includes(seat) && ' (left)'}
              </span>
            ))}
          </div>
          <div className="action-buttons">
            <button
              onClick={() => setSelectedAction('move')}
              className={selectedAction === 'move' ? 'active' : ''}
            >
              Move
            </button>
            <button
              onClick={() => gameService.requestUndo()}
              disabled={!gameState.undoAvailable || Boolean(gameState.undoVote) || !activePlayers.includes(playerNumber) || activePlayers.length < 2}
            >
              Undo
            </button>
            <button
              onClick={() => setLastMovePinned(prev => !prev)}
              onMouseEnter={() => setLastMoveHovered(true)}
              onMouseLeave={() => setLastMoveHovered(false)}
              className={lastMovePinned ? 'active' : ''}
              disabled={!lastMove}
            >
              Show Last Move
            </button>
          </div>
        </div>
        <div className="board-area">
          <div className={`board ${isMyTurn ? '' : 'not-your-turn'} ${isGameOver ? 'game-over' : ''}`}>
            {BOARD.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row">
                {row.map((_, colIndex) => {
                  const seat = pawnAt(rowIndex, colIndex);
                  return (
                    <div
                      key={colIndex}
                      className={getSquareClassName(rowIndex, colIndex)}
                      onClick={() => handleSquareClick(rowIndex, colIndex)}
                      onMouseEnter={() => handleSquareHover(rowIndex, colIndex)}
                      onMouseLeave={() => setWallPreview(null)}
                    >
                      {seat && (
                        <div className={`pawn player${seat}`} title={playerNames[seat]}>
                          {playerNames[seat]?.[0] || `P${seat}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Wall overlay */}
            <div className="wall-overlay">
              {walls.map((wall, index) => (
                <div
                  key={index}
                  className={`wall ${wall.orientation} ${isLastMoveWall(wall) ? 'last-move' : ''}`}
                  style={{
                    top: `${(wall.row * SQUARE_SIZE) + 2}px`,
                    left: `${(wall.col * SQUARE_SIZE) + 2}px`
                  }}
                />
              ))}
            </div>
            {/* Wall preview */}
            {wallPreview && (
              <div
                className={`wall-preview ${wallPreview.orientation}`}
                style={{
                  top: `${(wallPreview.row * SQUARE_SIZE) + 2}px`,
                  left: `${(wallPreview.col * SQUARE_SIZE) + 2}px`
                }}
              />
            )}
          </div>
          {gameState.undoVote && (
            <UndoVote
              vote={gameState.undoVote}
              playerNumber={playerNumber}
              activePlayers={activePlayers}
              playerNames={playerNames}
              onVote={(approve) => gameService.voteUndo(approve)}
            />
          )}
        </div>
        <div className="wall-actions">
          <button
            onClick={() => setSelectedAction('wall-h')}
            className={selectedAction === 'wall-h' ? 'active' : ''}
          >
            Horizontal Wall
          </button>
          <button
            onClick={() => setSelectedAction('wall-v')}
            className={selectedAction === 'wall-v' ? 'active' : ''}
          >
            Vertical Wall
          </button>
        </div>
      </div>
    </>
  );
}
```

The `!gameState || playerNumber === null` checks inside `handleSquareClick` and `handleSquareHover` restate what the early return already guaranteed, because TypeScript does not carry that narrowing into nested functions; they never trigger. Likewise `gameState?.started` in `turnMessage`.

- [ ] **Step 6: Narrow the JS lint block**

In `eslint.config.js`, the first lint block now only has `eslint.config.js` itself to lint. Replace that block (the one with `files: ['**/*.{js,jsx}']`) with:

```js
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
  },
```

- [ ] **Step 7: Confirm no JavaScript source is left**

Run: `git ls-files '*.js' '*.jsx'`
Expected: only `eslint.config.js`.

- [ ] **Step 8: Verify**

`npm run typecheck`, `npm run lint` (exit 0, no warnings), `npm test` (40 pass), `npm run build` (`built in`).

- [ ] **Step 9: Check the app in Chrome**

Run `node server/server.ts` in the background. In Chrome (localhost test values only):
- Three tabs join one Game ID as A, B, C. Banners show top row, bottom row, right column; walls read "A 5 · B 5 · C 5"; the Game ID badge shows.
- A moves a pawn, B places a wall; last-move highlight works on hover.
- C clicks Undo; A approves, B approves; the wall disappears and the status reads "Last turn undone". Another Undo request declined by one player keeps the move.
- Close C's tab mid-game: C is greyed out with "(left)" and C's turn is skipped.
- Toggle the theme both ways; colours change and nothing is unreadable.
- Measure `document.querySelector('.game').getBoundingClientRect().height` at two viewport sizes (use a same-origin 1000x700 iframe if the window cannot be resized); it is about 886px, as before the conversion.
Close the tabs and stop the server.

- [ ] **Step 10: Commit**

```bash
git add -A src index.html eslint.config.js
git commit -F - <<'EOF'
Convert the browser client to TypeScript

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: the converted file names and scripts.
- Produces: accurate docs.

- [ ] **Step 1: README**

In `README.md`, replace the "Setup and Running" section's first step with:

```markdown
1. Use Node.js 22.18 or newer (the server runs its TypeScript files directly). With nvm:

```bash
nvm use
```

2. Install dependencies:

```bash
npm install
```
```

renumber the following step to 3, and add this section before "## How to Play Multiplayer":

```markdown
## Development

- `npm test` runs the unit tests
- `npm run typecheck` checks the TypeScript types for the browser and server code
- `npm run lint` runs ESLint
- `npm run dev` starts the Vite dev server for the browser code
```

In "Technical Details", change "Built with React and Vite" to "Built with React, Vite and TypeScript".

- [ ] **Step 2: Architecture doc**

In `docs/architecture.md`, update every source file path to its new extension: `/src/components/Game.jsx` to `.tsx`, `/src/services/gameService.js` to `.ts`, `/shared/rules.js` to `.ts`, `/server/games.js` to `.ts`, `/server/server.js` to `.ts`, and any other `.js` or `.jsx` path under `src/`, `server/` or `shared/`. Under the Shared Rules component, add a bullet: "Data shapes shared by both sides live in `/shared/types.ts`; WebSocket message types live in `/shared/messages.ts`". Check with `grep -nE "\.(js|jsx)\b" docs/architecture.md` that no source path still ends in `.js` or `.jsx`.

- [ ] **Step 3: Verify and commit**

Confirm no em-dashes: `grep -c "—" README.md docs/architecture.md` prints 0 for both. Then:

```bash
git add README.md docs/architecture.md
git commit -F - <<'EOF'
Document the TypeScript setup and Node requirement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Pushing to PR #2 and updating its description happen after the final whole-branch review, not in this task.
