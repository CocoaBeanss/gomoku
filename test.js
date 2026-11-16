// Run with: node test.js
const assert = require('assert');
const { SIZE, BLACK, WHITE, Game, bestMove } = require('./gomoku.js');

function playAll(game, moves) {
  for (const [r, c] of moves) assert.ok(game.play(r, c), `move ${r},${c} rejected`);
}

// Horizontal win for black.
{
  const g = new Game();
  playAll(g, [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7]]);
  assert.strictEqual(g.winner, BLACK);
  assert.strictEqual(g.winLine.length, 5);
  assert.strictEqual(g.play(0, 0), false, 'no moves after the game ends');
}

// Anti-diagonal win for white.
{
  const g = new Game();
  playAll(g, [[0, 0], [4, 10], [0, 1], [5, 9], [0, 2], [6, 8], [14, 14], [7, 7], [14, 13], [8, 6]]);
  assert.strictEqual(g.winner, WHITE);
}

// Occupied cells and out-of-range moves are rejected; undo restores state.
{
  const g = new Game();
  assert.ok(g.play(7, 7));
  assert.strictEqual(g.play(7, 7), false);
  assert.strictEqual(g.play(-1, 0), false);
  assert.strictEqual(g.play(0, SIZE), false);
  assert.ok(g.undo());
  assert.strictEqual(g.board[7][7], 0);
  assert.strictEqual(g.turn, BLACK);
  assert.strictEqual(g.undo(), false);
}

// Undoing a winning move reopens the game.
{
  const g = new Game();
  playAll(g, [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7]]);
  g.undo();
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.winLine, null);
  assert.strictEqual(g.turn, BLACK);
}

// Computer opens in the centre.
{
  const g = new Game();
  assert.deepStrictEqual(bestMove(g.board, BLACK), { r: 7, c: 7 });
}

// Computer takes a winning move over blocking.
{
  const g = new Game();
  playAll(g, [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6]]);
  const m = bestMove(g.board, BLACK);
  assert.strictEqual(m.r, 7);
  assert.ok(m.c === 2 || m.c === 7);
}

// Computer blocks an open-ended four.
{
  const g = new Game();
  playAll(g, [[7, 3], [0, 0], [7, 4], [0, 14], [7, 5], [14, 0], [7, 6]]);
  const m = bestMove(g.board, WHITE);
  assert.strictEqual(m.r, 7);
  assert.ok(m.c === 2 || m.c === 7);
}

// Computer vs computer always finishes with legal moves.
for (let i = 0; i < 20; i++) {
  const g = new Game();
  while (!g.over) {
    const m = bestMove(g.board, g.turn);
    assert.ok(m && g.play(m.r, m.c));
  }
}

// Running out of time hands the win to the other player; undo reopens the game.
{
  const g = new Game();
  playAll(g, [[7, 7], [7, 8]]);
  assert.ok(g.timeout(BLACK));
  assert.strictEqual(g.winner, WHITE);
  assert.strictEqual(g.play(0, 0), false);
  g.undo();
  assert.strictEqual(g.over, false);
  assert.strictEqual(g.timedOut, false);
}

// Every level takes a win, blocks a four, and finishes games with legal moves.
for (const level of ['easy', 'medium', 'hard']) {
  const win = new Game();
  playAll(win, [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6]]);
  let m = bestMove(win.board, BLACK, level);
  assert.ok(m.r === 7 && (m.c === 2 || m.c === 7), `${level} misses a win`);

  const block = new Game();
  playAll(block, [[7, 3], [0, 0], [7, 4], [0, 14], [7, 5], [14, 0], [7, 6]]);
  m = bestMove(block.board, WHITE, level);
  assert.ok(m.r === 7 && (m.c === 2 || m.c === 7), `${level} misses a block`);

  for (let i = 0; i < 3; i++) {
    const g = new Game();
    while (!g.over) {
      m = bestMove(g.board, g.turn, level);
      assert.ok(m && g.play(m.r, m.c));
    }
  }
}

// Hard sees a double threat coming: black has an open three and can make a
// second one, so white must not ignore it.
{
  const g = new Game();
  playAll(g, [[7, 7], [0, 0], [7, 8], [0, 14], [7, 9]]);
  const m = bestMove(g.board, WHITE, 'hard');
  assert.ok(m.r === 7 && (m.c === 6 || m.c === 10 || m.c === 5 || m.c === 11), 'hard ignores an open three');
}

console.log('All tests passed.');
