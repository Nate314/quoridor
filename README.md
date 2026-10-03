# Quoridor Multiplayer Game

A web-based implementation of the Quoridor board game with multiplayer support.

## Setup and Running

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm run start
```

This will build the client and start the server. Access the game at `http://localhost:3000`.

## How to Play Multiplayer

1. Open the game in two to four browser windows
2. In each window, enter your name and the same game ID (any string) to join the same game
3. Players are seated in join order: Player 1 (blue) starts at the bottom, Player 2 (red) at the top, Player 3 (green) on the left, Player 4 (purple) on the right
4. The lowest-numbered player makes the first move once at least two players have joined. Nobody can join after the first move
5. Take turns moving your pawn or placing walls
6. Win by reaching the opposite edge of the board

## Game Rules

- Players take turns either moving their pawn or placing a wall
- Pawns can move one square orthogonally (up, down, left, right)
- Pawns can jump straight over an adjacent pawn if the square beyond is free and not walled off
- Walls block pawn movement but cannot completely block a player's path to their goal
- Each player has 10 walls in a two-player game, or 5 walls with three or four players
- First player to reach their opposite edge wins
- If a player leaves mid-game, their pawn and walls stay on the board and their turns are skipped
- Any player can ask to undo the last turn. It is undone only if every player still in the game approves

## Technical Details

- Built with React and Vite
- Uses WebSocket for real-time multiplayer communication
- Supports games on the same local network
- Game state is synchronized between players

## Controls

- Click "Move" and then click a valid square to move your pawn
- Click "Horizontal Wall" or "Vertical Wall" to place walls
- Valid moves and wall placements are highlighted
- The game board is dimmed when it's not your turn

## Network Setup

The game supports network play using WebSocket connections. To play:

1. Start the server:

```bash
npm run start
```

The server will run on port 3000 by default and serve both the game client and WebSocket connections.

2. To play on the same machine:

- Open `http://localhost:3000` in two to four browser windows
- Enter any game ID to create or join a game

3. To play across different computers on the same network:

- Find the IP address of the computer running the server (e.g., using `ipconfig` or `ifconfig`)
- On each player's computer:
  - Open the game in a browser using the server's IP (e.g., `http://192.168.1.100:3000`)
  - Enter any game ID to create or join a game
  - Players are seated in join order, up to four per game

Note: Make sure every player can reach the server computer over the network. The server handles both the game interface and WebSocket connections on the same port.
