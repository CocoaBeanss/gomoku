(function () {
  'use strict';

  const { SIZE, BLACK, WHITE, Game, bestMove, other } = window.Gomoku;
  const STAR_POINTS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
  const AI_DELAY_MS = 350;

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const modeEl = document.getElementById('mode');
  const sideEl = document.getElementById('side');
  const sideLabel = document.getElementById('side-label');
  const undoBtn = document.getElementById('undo');
  const newBtn = document.getElementById('new');

  const game = new Game();
  let hover = null;          // cell under the pointer
  let cursor = null;         // keyboard cursor, shown only while navigating by keys
  let aiTimer = null;
  let cssSize = 0;

  const vsAI = () => modeEl.value === 'ai';
  const humanSide = () => Number(sideEl.value);
  const aiTurn = () => vsAI() && !game.over && game.turn !== humanSide();
  const name = (p) => (p === BLACK ? 'Black' : 'White');

  // ---------- drawing ----------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cssSize = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const cellSize = () => cssSize / SIZE;
  const pos = (i) => cellSize() * (i + 0.5);

  function drawStone(r, c, player, alpha) {
    const x = pos(c), y = pos(r), rad = cellSize() * 0.44;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (alpha === 1) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = rad * 0.3;
      ctx.shadowOffsetY = rad * 0.12;
    }
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
    if (player === BLACK) {
      g.addColorStop(0, '#6b6b6b');
      g.addColorStop(1, '#0d0d0d');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c9c9c9');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (!cssSize) return;
    const cell = cellSize();

    const wood = ctx.createLinearGradient(0, 0, cssSize, cssSize);
    wood.addColorStop(0, '#e6bd7c');
    wood.addColorStop(1, '#d3a260');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, cssSize, cssSize);

    ctx.strokeStyle = '#5b401f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < SIZE; i++) {
      const p = Math.round(pos(i)) + 0.5;
      ctx.moveTo(pos(0), p);
      ctx.lineTo(pos(SIZE - 1), p);
      ctx.moveTo(p, pos(0));
      ctx.lineTo(p, pos(SIZE - 1));
    }
    ctx.stroke();

    ctx.fillStyle = '#5b401f';
    for (const [r, c] of STAR_POINTS) {
      ctx.beginPath();
      ctx.arc(Math.round(pos(c)) + 0.5, Math.round(pos(r)) + 0.5, Math.max(2.5, cell * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (game.board[r][c]) drawStone(r, c, game.board[r][c], 1);
      }
    }

    const last = game.lastMove;
    if (last && !game.winLine) {
      ctx.fillStyle = '#e0452b';
      ctx.beginPath();
      ctx.arc(pos(last.c), pos(last.r), cell * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    if (game.winLine) {
      const a = game.winLine[0], b = game.winLine[game.winLine.length - 1];
      ctx.strokeStyle = '#e0452b';
      ctx.lineWidth = Math.max(3, cell * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos(a.c), pos(a.r));
      ctx.lineTo(pos(b.c), pos(b.r));
      ctx.stroke();
    }

    const canPlace = !game.over && !aiTurn();
    const ghost = cursor || hover;
    if (canPlace && ghost && !game.board[ghost.r][ghost.c]) {
      drawStone(ghost.r, ghost.c, game.turn, 0.45);
    }
    if (cursor) {
      ctx.strokeStyle = '#2f6fdb';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos(cursor.c) - cell / 2 + 2, pos(cursor.r) - cell / 2 + 2, cell - 4, cell - 4);
    }
  }

  function renderStatus() {
    let dot = game.turn, text;
    if (game.winner) {
      dot = game.winner;
      if (vsAI()) text = game.winner === humanSide() ? 'You win!' : 'Computer wins.';
      else text = `${name(game.winner)} wins!`;
    } else if (game.draw) {
      dot = null;
      text = 'Draw — the board is full.';
    } else if (vsAI()) {
      text = aiTurn() ? 'Computer is thinking…' : `Your turn (${name(game.turn).toLowerCase()})`;
    } else {
      text = `${name(game.turn)} to move`;
    }
    statusEl.innerHTML = '';
    if (dot) {
      const d = document.createElement('span');
      d.className = `dot ${dot === BLACK ? 'black' : 'white'}`;
      statusEl.appendChild(d);
    }
    statusEl.appendChild(document.createTextNode(text));

    // Against the computer, undo needs one of the human's own moves to take back.
    const humanMoves = game.history.some((m) => m.player === humanSide());
    undoBtn.disabled = vsAI() ? !humanMoves : game.history.length === 0;
    sideLabel.hidden = !vsAI();
  }

  function refresh() {
    renderStatus();
    draw();
  }

  // ---------- game flow ----------

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (!aiTurn()) return;
    aiTimer = setTimeout(() => {
      if (!aiTurn()) return;
      const move = bestMove(game.board, game.turn);
      if (move) game.play(move.r, move.c);
      refresh();
    }, AI_DELAY_MS);
  }

  function place(r, c) {
    if (game.over || aiTurn()) return;
    if (!game.play(r, c)) return;
    refresh();
    scheduleAI();
  }

  function newGame() {
    clearTimeout(aiTimer);
    game.reset();
    cursor = null;
    refresh();
    scheduleAI();
  }

  function undo() {
    clearTimeout(aiTimer);
    game.undo();
    if (vsAI()) {
      // Step back to the human's turn.
      while (game.history.length && game.turn !== humanSide()) game.undo();
    }
    refresh();
    scheduleAI();
  }

  // ---------- input ----------

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return { r, c };
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const cell = cellFromEvent(e);
    const changed = !cell !== !hover || (cell && (cell.r !== hover.r || cell.c !== hover.c));
    if (changed || cursor) {
      hover = cell;
      cursor = null;
      draw();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });

  canvas.addEventListener('click', (e) => {
    const cell = cellFromEvent(e);
    cursor = null;
    if (cell) place(cell.r, cell.c);
  });

  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (step) {
      e.preventDefault();
      const mid = (SIZE - 1) / 2;
      const from = cursor || game.lastMove || { r: mid, c: mid };
      cursor = cursor
        ? {
            r: Math.min(SIZE - 1, Math.max(0, from.r + step[0])),
            c: Math.min(SIZE - 1, Math.max(0, from.c + step[1])),
          }
        : { r: from.r, c: from.c };
      draw();
    } else if ((e.key === 'Enter' || e.key === ' ') && cursor) {
      e.preventDefault();
      place(cursor.r, cursor.c);
    }
  });

  canvas.addEventListener('blur', () => {
    cursor = null;
    draw();
  });

  newBtn.addEventListener('click', newGame);
  undoBtn.addEventListener('click', undo);
  modeEl.addEventListener('change', newGame);
  sideEl.addEventListener('change', newGame);

  new ResizeObserver(resize).observe(canvas);
  resize();
  newGame();
})();
