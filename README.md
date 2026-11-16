# Gomoku

A browser Gomoku game: 15×15 board, five or more in a row wins. Play against the computer or with two players on one device.

- **Difficulty** — Easy, Medium, or Hard (Hard looks several moves ahead).
- **Score** — win/loss/draw tally, saved in the browser along with your settings.
- **Clock** — optional per-player countdown; running out of time loses.
- **Review** — move list with coordinates, optional move numbers on stones, and step back/forward through the game.

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Test

```bash
node test.js
```

## Files

- `gomoku.js` — rules and computer opponent (no DOM)
- `app.js` — canvas rendering and input
- `style.css`, `index.html` — page
