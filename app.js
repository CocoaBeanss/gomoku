(function () {
  'use strict';

  const { SIZE, BLACK, WHITE, Game, bestMove } = window.Gomoku;
  const STAR_POINTS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
  const COLUMNS = 'ABCDEFGHIJKLMNO';
  const AI_DELAY_MS = 350;
  const STORAGE_KEY = 'gomoku.v1';

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const modeEl = $('mode');
  const levelEl = $('level');
  const sideEl = $('side');
  const clockEl = $('clock');
  const numbersEl = $('numbers');
  const undoBtn = $('undo');
  const movesEl = $('moves');
  const playerEls = { [BLACK]: $('player-1'), [WHITE]: $('player-2') };

  const game = new Game();
  let view = 0;              // number of moves shown; less than history.length while reviewing
  let hover = null;          // cell under the pointer
  let cursor = null;         // keyboard cursor, shown only while navigating by keys
  let aiTimer = null;
  let cssSize = 0;

  let clocks = { [BLACK]: 0, [WHITE]: 0 };   // ms remaining
  let clockSnaps = [];                       // clocks as they stood after each move count
  let lastTick = performance.now();

  let tally = { ai: { you: 0, computer: 0, draw: 0 }, human: { black: 0, white: 0, draw: 0 } };
  let scored = null;         // tally entry counted for the current game, e.g. ['ai', 'you']

  const vsAI = () => modeEl.value === 'ai';
  const humanSide = () => Number(sideEl.value);
  const aiTurn = () => vsAI() && !game.over && game.turn !== humanSide();
  const reviewing = () => view < game.history.length;
  const clockLimit = () => Number(clockEl.value) * 60000;
  const colour = (p) => (p === BLACK ? 'Black' : 'White');
  const coord = (m) => COLUMNS[m.c] + (SIZE - m.r);

  // ---------- saved settings and score ----------

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      for (const group of Object.keys(tally)) {
        for (const key of Object.keys(tally[group])) {
          const v = saved.tally && saved.tally[group] && saved.tally[group][key];
          if (Number.isInteger(v) && v >= 0) tally[group][key] = v;
        }
      }
      const s = saved.settings || {};
      for (const [el, v] of [[modeEl, s.mode], [levelEl, s.level], [sideEl, s.side], [clockEl, s.clock]]) {
        if ([...el.options].some((o) => o.value === v)) el.value = v;
      }
      numbersEl.checked = s.numbers === true;
    } catch (e) {
      // Storage unavailable or corrupt: start with defaults.
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tally,
        settings: {
          mode: modeEl.value, level: levelEl.value, side: sideEl.value,
          clock: clockEl.value, numbers: numbersEl.checked,
        },
      }));
    } catch (e) {
      // Nothing to do: the game works without persistence.
    }
  }

  // Keeps the tally in step with the game: counts a result once when the game
  // ends and takes it back if that ending is undone.
  function settleScore() {
    if (game.over && !scored) {
      const group = vsAI() ? 'ai' : 'human';
      let key = 'draw';
      if (game.winner) {
        if (vsAI()) key = game.winner === humanSide() ? 'you' : 'computer';
        else key = game.winner === BLACK ? 'black' : 'white';
      }
      tally[group][key]++;
      scored = [group, key];
      save();
    } else if (!game.over && scored) {
      tally[scored[0]][scored[1]] = Math.max(0, tally[scored[0]][scored[1]] - 1);
      scored = null;
      save();
    }
  }

  // ---------- clocks ----------

  function clockRunning() {
    return clockLimit() > 0 && !game.over && game.history.length > 0;
  }

  // Charges the time since the last call to the player on move.
  function advanceClock() {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    if (!clockRunning()) return;
    clocks[game.turn] -= dt;
    if (clocks[game.turn] <= 0) {
      clocks[game.turn] = 0;
      clearTimeout(aiTimer);
      game.timeout(game.turn);
      view = game.history.length;
      refresh();
    }
  }

  function formatClock(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderPlayers() {
    for (const p of [BLACK, WHITE]) {
      const el = playerEls[p];
      let label = colour(p);
      if (vsAI()) label = p === humanSide() ? 'You' : 'Computer';
      el.querySelector('.pname').textContent = label;
      el.classList.toggle('active', !game.over && game.turn === p);
      const clock = el.querySelector('.clock');
      clock.hidden = clockLimit() === 0;
      clock.textContent = formatClock(clocks[p]);
      clock.classList.toggle('low', clocks[p] <= 15000);
    }
  }

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

  // One unit of margin on every side leaves room for coordinate labels.
  const unit = () => cssSize / (SIZE + 1);
  const pos = (i) => unit() * (i + 1);

  function drawStone(r, c, player, alpha) {
    const x = pos(c), y = pos(r), rad = unit() * 0.44;
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
    const u = unit();
    const shown = game.history.slice(0, view);
    const live = !reviewing();

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
      ctx.arc(Math.round(pos(c)) + 0.5, Math.round(pos(r)) + 0.5, Math.max(2.5, u * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = `${Math.max(9, u * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < SIZE; i++) {
      ctx.fillText(COLUMNS[i], pos(i), cssSize - u * 0.28);
      ctx.fillText(String(SIZE - i), u * 0.3, pos(i));
    }

    shown.forEach((m) => drawStone(m.r, m.c, m.player, 1));

    const last = shown[shown.length - 1];
    const winLine = live ? game.winLine : null;

    if (numbersEl.checked) {
      ctx.font = `600 ${u * 0.36}px system-ui, sans-serif`;
      shown.forEach((m, i) => {
        if (m === last) ctx.fillStyle = m.player === BLACK ? '#ff9a85' : '#d0311a';
        else ctx.fillStyle = m.player === BLACK ? '#f2f2f2' : '#1a1a1a';
        ctx.fillText(String(i + 1), pos(m.c), pos(m.r) + u * 0.02);
      });
    } else if (last && !winLine) {
      ctx.fillStyle = '#e0452b';
      ctx.beginPath();
      ctx.arc(pos(last.c), pos(last.r), u * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    if (winLine) {
      const a = winLine[0], b = winLine[winLine.length - 1];
      ctx.save();
      ctx.strokeStyle = '#e0452b';
      ctx.globalAlpha = numbersEl.checked ? 0.55 : 1;
      ctx.lineWidth = Math.max(3, u * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos(a.c), pos(a.r));
      ctx.lineTo(pos(b.c), pos(b.r));
      ctx.stroke();
      ctx.restore();
    }

    const canPlace = live && !game.over && !aiTurn();
    const ghost = cursor || hover;
    if (canPlace && ghost && !game.board[ghost.r][ghost.c]) {
      drawStone(ghost.r, ghost.c, game.turn, 0.45);
    }
    if (cursor) {
      ctx.strokeStyle = '#2f6fdb';
      ctx.lineWidth = 2;
      ctx.strokeRect(pos(cursor.c) - u / 2 + 2, pos(cursor.r) - u / 2 + 2, u - 4, u - 4);
    }
  }

  // ---------- panels ----------

  function statusText() {
    if (game.winner) {
      const loser = game.winner === BLACK ? WHITE : BLACK;
      if (vsAI()) {
        const won = game.winner === humanSide();
        if (game.timedOut) return won ? 'Computer ran out of time — you win!' : 'Out of time — computer wins.';
        return won ? 'You win!' : 'Computer wins.';
      }
      if (game.timedOut) return `${colour(loser)} ran out of time — ${colour(game.winner)} wins!`;
      return `${colour(game.winner)} wins!`;
    }
    if (game.draw) return 'Draw — the board is full.';
    if (reviewing()) return 'Reviewing — press ⏭ to return to the game.';
    if (vsAI()) return aiTurn() ? 'Computer is thinking…' : `Your turn (${colour(game.turn).toLowerCase()})`;
    return `${colour(game.turn)} to move`;
  }

  function renderTally() {
    const rows = vsAI()
      ? [['You', tally.ai.you], ['Computer', tally.ai.computer], ['Draws', tally.ai.draw]]
      : [['Black', tally.human.black], ['White', tally.human.white], ['Draws', tally.human.draw]];
    const el = $('tally');
    el.textContent = '';
    for (const [label, value] of rows) {
      const cell = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      cell.append(dt, dd);
      el.appendChild(cell);
    }
  }

  function renderMoves() {
    movesEl.textContent = '';
    let current = null;
    game.history.forEach((m, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.index = i;
      btn.setAttribute('aria-label', `Move ${i + 1}, ${colour(m.player)} ${coord(m)}`);
      const dot = document.createElement('span');
      dot.className = `dot ${m.player === BLACK ? 'black' : 'white'}`;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = i + 1;
      btn.append(dot, n, coord(m));
      if (i === view - 1) {
        btn.setAttribute('aria-current', 'true');
        current = btn;
      }
      li.appendChild(btn);
      movesEl.appendChild(li);
    });
    $('moves-empty').hidden = game.history.length > 0;
    movesEl.hidden = game.history.length === 0;
    // Scroll only the list itself, never the page.
    if (current) movesEl.scrollTop = current.offsetTop - movesEl.offsetTop - movesEl.clientHeight / 2;
  }

  function renderReview() {
    const total = game.history.length;
    $('rev-first').disabled = $('rev-prev').disabled = view === 0;
    $('rev-next').disabled = $('rev-last').disabled = view === total;
    $('rev-pos').textContent = total ? `Move ${view} of ${total}` : '';
  }

  function refresh() {
    settleScore();
    statusEl.textContent = statusText();
    // Against the computer, undo needs one of the human's own moves to take back.
    const humanMoves = game.history.some((m) => m.player === humanSide());
    undoBtn.disabled = vsAI() ? !humanMoves : game.history.length === 0;
    $('side-label').hidden = $('level-label').hidden = !vsAI();
    renderPlayers();
    renderTally();
    renderMoves();
    renderReview();
    draw();
  }

  // ---------- game flow ----------

  function playMove(r, c) {
    advanceClock();
    if (!game.play(r, c)) return false;
    clockSnaps.push({ ...clocks });
    view = game.history.length;
    return true;
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (!aiTurn()) return;
    aiTimer = setTimeout(() => {
      if (!aiTurn()) return;
      const move = bestMove(game.board, game.turn, levelEl.value);
      if (move) playMove(move.r, move.c);
      refresh();
    }, AI_DELAY_MS);
  }

  function place(r, c) {
    if (game.over || aiTurn() || reviewing()) return;
    if (!playMove(r, c)) return;
    refresh();
    scheduleAI();
  }

  function newGame() {
    clearTimeout(aiTimer);
    scored = null;
    game.reset();
    view = 0;
    cursor = null;
    clocks = { [BLACK]: clockLimit(), [WHITE]: clockLimit() };
    clockSnaps = [{ ...clocks }];
    lastTick = performance.now();
    save();
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
    clockSnaps.length = game.history.length + 1;
    clocks = { ...clockSnaps[clockSnaps.length - 1] };
    lastTick = performance.now();
    view = game.history.length;
    refresh();
    scheduleAI();
  }

  function goTo(n) {
    view = Math.min(game.history.length, Math.max(0, n));
    cursor = null;
    refresh();
  }

  // ---------- input ----------

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const u = rect.width / (SIZE + 1);
    const c = Math.round((e.clientX - rect.left) / u) - 1;
    const r = Math.round((e.clientY - rect.top) / u) - 1;
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

  $('new').addEventListener('click', newGame);
  undoBtn.addEventListener('click', undo);
  modeEl.addEventListener('change', newGame);
  sideEl.addEventListener('change', newGame);
  clockEl.addEventListener('change', newGame);
  levelEl.addEventListener('change', save);
  numbersEl.addEventListener('change', () => {
    save();
    draw();
  });

  $('rev-first').addEventListener('click', () => goTo(0));
  $('rev-prev').addEventListener('click', () => goTo(view - 1));
  $('rev-next').addEventListener('click', () => goTo(view + 1));
  $('rev-last').addEventListener('click', () => goTo(game.history.length));
  movesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) goTo(Number(btn.dataset.index) + 1);
  });

  $('reset-score').addEventListener('click', () => {
    const group = tally[vsAI() ? 'ai' : 'human'];
    for (const key of Object.keys(group)) group[key] = 0;
    // The finished game on the board stays counted as zero rather than reappearing.
    save();
    renderTally();
  });

  setInterval(() => {
    advanceClock();
    if (clockLimit()) renderPlayers();
  }, 200);

  load();
  new ResizeObserver(resize).observe(canvas);
  resize();
  newGame();
})();
