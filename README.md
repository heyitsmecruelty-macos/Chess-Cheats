# Venice Chess Coach

A local Chrome extension that analyzes games on chess.com and lichess, suggests
moves, and explains positions using a locally bundled Stockfish 19 engine.

## Download and install

1. Download the [installable extension ZIP](https://github.com/heyitsmecruelty-macos/Chess-Cheats/releases/latest/download/Venice-Chess-Coach.zip)
   and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open a game on chess.com or lichess, set your rating, and start coaching.

**Auto play:** **Strong** plays opening-book moves and clear tactics; **Whole game**
plays every turn.

The extension runs locally and does not send game data to a server.

The extension's source is GPL-3.0-or-later. It includes Stockfish.js 19.0.1
under GPL-3.0, along with its source archive, NNUE network, and notices in
`Chess Coach Extension/vendor/stockfish-19/`.
