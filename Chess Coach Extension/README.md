# Venice Chess Coach

Rating-calibrated move arrow for chess.com and lichess. Runs entirely local.

## Install
1. Download the [installable extension ZIP](https://github.com/heyitsmecruelty-macos/Chess-Cheats/releases/latest/download/Venice-Chess-Coach.zip)
   and extract it.
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the extracted folder containing `manifest.json`.
4. Open a game on chess.com or lichess.
5. Set your rating on the panel and press **Start coaching**.

## Use
- Arrow appears automatically on your turn (bottom side).
- `Alt+A` forces a fresh analysis. `Alt+H` hides the panel.
- **Sacrifice flair** only favors a piece sacrifice when the engine still sees at
  least a 1.2-pawn advantage and the move is within 0.2 pawns of its top choice.
- **Auto arrow** off = manual mode only.
- **Strong** auto play starts with book moves and only plays clear tactics or advantages.
  **Whole game** plays every turn.

## Behaviour
- Plays roughly 120 Elo above your setting, from a shortlist around that strength.
- Blunder chance falls from ~30% at 800 to ~1% at 2400.
- Short opening book so first moves vary.

## Known limits
- Castling rights are inferred from piece placement; if a king wandered back to e1
  after losing rights, an O-O suggestion can be illegal. Re-check that move.
- En passant is not read from the DOM.
- Built for standard 8x8 boards. Chess960 is untested.