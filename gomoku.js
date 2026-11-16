// Gomoku game rules and computer opponent. No DOM access, so it also loads in Node for tests.
(function (root) {
  'use strict';

  const SIZE = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const other = (p) => (p === BLACK ? WHITE : BLACK);
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  class Game {
    constructor() {
      this.reset();
    }

    reset() {
      this.board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY));
      this.history = [];
      this.turn = BLACK;
      this.winner = EMPTY;
      this.winLine = null;
      this.draw = false;
    }

    get over() {
      return this.winner !== EMPTY || this.draw;
    }

    get lastMove() {
      return this.history[this.history.length - 1] || null;
    }

    play(r, c) {
      if (this.over || !inside(r, c) || this.board[r][c] !== EMPTY) return false;
      const player = this.turn;
      this.board[r][c] = player;
      this.history.push({ r, c, player });
      const line = findWinLine(this.board, r, c);
      if (line) {
        this.winner = player;
        this.winLine = line;
      } else if (this.history.length === SIZE * SIZE) {
        this.draw = true;
      }
      this.turn = other(player);
      return true;
    }

    undo() {
      const move = this.history.pop();
      if (!move) return false;
      this.board[move.r][move.c] = EMPTY;
      this.turn = move.player;
      this.winner = EMPTY;
      this.winLine = null;
      this.draw = false;
      return true;
    }
  }

  // Returns the run of five or more stones through (r, c), or null.
  function findWinLine(board, r, c) {
    const p = board[r][c];
    if (p === EMPTY) return null;
    for (const [dr, dc] of DIRS) {
      const line = [{ r, c }];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (inside(rr, cc) && board[rr][cc] === p) {
          if (s === 1) line.push({ r: rr, c: cc });
          else line.unshift({ r: rr, c: cc });
          rr += dr * s;
          cc += dc * s;
        }
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  // Value of the line formed in one direction if `p` played at (r, c).
  function lineScore(board, r, c, p, dr, dc) {
    let count = 1, openEnds = 0;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (inside(rr, cc) && board[rr][cc] === p) {
        count++;
        rr += dr * s;
        cc += dc * s;
      }
      if (inside(rr, cc) && board[rr][cc] === EMPTY) openEnds++;
    }
    if (count >= 5) return 1e7;
    if (openEnds === 0) return 0;
    if (count === 4) return openEnds === 2 ? 1e5 : 1e4;
    if (count === 3) return openEnds === 2 ? 5e3 : 400;
    if (count === 2) return openEnds === 2 ? 200 : 20;
    return openEnds;
  }

  function cellScore(board, r, c, p) {
    let total = 0;
    for (const [dr, dc] of DIRS) total += lineScore(board, r, c, p, dr, dc);
    return total;
  }

  function hasNeighbour(board, r, c) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if ((dr || dc) && inside(r + dr, c + dc) && board[r + dr][c + dc] !== EMPTY) return true;
      }
    }
    return false;
  }

  // Picks a move for `player`: weighs what each empty cell would build for
  // itself against what it would deny the opponent.
  function bestMove(board, player) {
    const mid = (SIZE - 1) / 2;
    const opp = other(player);
    let best = [], bestScore = -1, anyStone = false;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) {
          anyStone = true;
          continue;
        }
        if (!hasNeighbour(board, r, c)) continue;
        const score =
          cellScore(board, r, c, player) * 1.2 +
          cellScore(board, r, c, opp) -
          (Math.abs(r - mid) + Math.abs(c - mid)) * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = [{ r, c }];
        } else if (score === bestScore) {
          best.push({ r, c });
        }
      }
    }

    if (!anyStone) return { r: mid, c: mid };
    if (!best.length) return null;
    return best[Math.floor(Math.random() * best.length)];
  }

  const api = { SIZE, EMPTY, BLACK, WHITE, Game, findWinLine, bestMove, other };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gomoku = api;
})(typeof window !== 'undefined' ? window : globalThis);
