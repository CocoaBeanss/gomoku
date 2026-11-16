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
      this.timedOut = false;
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

    // Ends the game because `loser` ran out of time.
    timeout(loser) {
      if (this.over) return false;
      this.winner = other(loser);
      this.timedOut = true;
      return true;
    }

    undo() {
      const move = this.history.pop();
      if (!move) return false;
      this.timedOut = false;
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

  // Empty cells near existing stones, scored by what they build for `player`
  // (own) and what they deny the opponent (opp).
  function candidates(board, player) {
    const mid = (SIZE - 1) / 2;
    const opp = other(player);
    const list = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY || !hasNeighbour(board, r, c)) continue;
        const own = cellScore(board, r, c, player);
        const deny = cellScore(board, r, c, opp);
        const score = own * 1.2 + deny - (Math.abs(r - mid) + Math.abs(c - mid)) * 0.01;
        list.push({ r, c, own, deny, score });
      }
    }
    return list;
  }

  function pickTop(list) {
    let best = [], bestScore = -Infinity;
    for (const m of list) {
      if (m.score > bestScore) {
        bestScore = m.score;
        best = [m];
      } else if (m.score === bestScore) {
        best.push(m);
      }
    }
    return best.length ? best[Math.floor(Math.random() * best.length)] : null;
  }

  // ---------- look-ahead search (hard level) ----------

  const FIVE = 1e7;
  const WIN = 1e9;
  // Measured against the medium level, an odd depth plays best as black and an
  // even depth as white.
  const SEARCH_DEPTH = { [BLACK]: 5, [WHITE]: 4 };
  const SEARCH_WIDTH = 10;
  // Value of a five-cell window holding n stones of a single colour, for the
  // side about to move and for the side that just moved.
  const MOVER_WEIGHT = [0, 1, 12, 150, 50000, 1e6];
  const WAITER_WEIGHT = [0, 1, 10, 100, 2000, 1e6];

  const WINDOWS = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRS) {
        if (!inside(r + dr * 4, c + dc * 4)) continue;
        const w = [];
        for (let i = 0; i < 5; i++) w.push(r + dr * i, c + dc * i);
        WINDOWS.push(w);
      }
    }
  }

  // Static value of the position from the point of view of `mover`, who is to play.
  function evaluate(board, mover) {
    let score = 0;
    for (const w of WINDOWS) {
      let black = 0, white = 0;
      for (let i = 0; i < 10; i += 2) {
        const v = board[w[i]][w[i + 1]];
        if (v === BLACK) black++;
        else if (v === WHITE) white++;
      }
      if (black && white) continue;
      if (black) score += mover === BLACK ? MOVER_WEIGHT[black] : -WAITER_WEIGHT[black];
      else if (white) score += mover === WHITE ? MOVER_WEIGHT[white] : -WAITER_WEIGHT[white];
    }
    return score;
  }

  // Best few moves to search, with forced replies narrowed down.
  function searchMoves(board, player) {
    const list = candidates(board, player);
    const winning = list.find((m) => m.own >= FIVE);
    if (winning) return [winning];
    const blocks = list.filter((m) => m.deny >= FIVE);
    if (blocks.length) return blocks;
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, SEARCH_WIDTH);
  }

  function negamax(board, player, depth, alpha, beta) {
    const moves = searchMoves(board, player);
    if (!moves.length) return 0;
    const opp = other(player);
    let best = -Infinity;
    for (const m of moves) {
      let value;
      if (m.own >= FIVE) {
        value = WIN + depth; // sooner wins rank higher
      } else {
        board[m.r][m.c] = player;
        value = depth <= 1 ? -evaluate(board, opp) : -negamax(board, opp, depth - 1, -beta, -alpha);
        board[m.r][m.c] = EMPTY;
      }
      if (value > best) best = value;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function searchMove(board, player) {
    const moves = searchMoves(board, player);
    if (moves.length <= 1) return moves[0] || null;
    const opp = other(player);
    let best = null, bestValue = -Infinity;
    for (const m of moves) {
      board[m.r][m.c] = player;
      const value = -negamax(board, opp, SEARCH_DEPTH[player] - 1, -Infinity, -bestValue);
      board[m.r][m.c] = EMPTY;
      if (value > bestValue) {
        bestValue = value;
        best = m;
      }
    }
    return best;
  }

  // Picks a move for `player`.
  //   easy   – one-move heuristic with misjudged priorities
  //   medium – one-move heuristic
  //   hard   – looks several moves ahead
  function bestMove(board, player, level) {
    let stones = 0;
    for (const row of board) for (const v of row) if (v !== EMPTY) stones++;
    if (stones === 0) {
      const mid = (SIZE - 1) / 2;
      return { r: mid, c: mid };
    }

    let move;
    if (level === 'hard' && stones > 1) {
      move = searchMove(board, player);
    } else {
      const list = candidates(board, player);
      if (level === 'easy') for (const m of list) m.score *= 0.3 + Math.random() * 0.7;
      move = pickTop(list);
    }
    return move ? { r: move.r, c: move.c } : null;
  }

  const api = { SIZE, EMPTY, BLACK, WHITE, Game, findWinLine, bestMove, other };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gomoku = api;
})(typeof window !== 'undefined' ? window : globalThis);
