(() => {
  const SHAPES = ['●', '■', '▲', '◆', '★'];
  const COLORS = ['#E8604C', '#3F9163', '#3B82C4', '#B8860B', '#8B5FBF'];
  const COUNTS = [1, 2, 3];
  const HINT_ORDER = ['color', 'shape', 'count'];

  const TIERS = [
    { maxSolved: 3, changing: ['color'], label: 'Tier 1', choices: 3 },
    { maxSolved: 6, changing: ['color', 'shape'], label: 'Tier 2', choices: 4 },
    { maxSolved: 10, changing: ['color', 'shape', 'count'], label: 'Tier 3', choices: 5 },
    { maxSolved: Infinity, changing: ['color', 'shape', 'count'], label: 'Tier 4', choices: 6 }
  ];

  const DAILY_TIERS = [0, 1, 2, 2, 3];
  const DAY_ZERO = new Date(2024, 0, 1);

  const ui = {
    endlessTab: document.getElementById('tab-endless'),
    dailyTab: document.getElementById('tab-daily'),
    pills: document.getElementById('pills'),
    tier: document.getElementById('tier-tag'),
    progressWrap: document.getElementById('progress-wrap'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    gameArea: document.getElementById('game-area')
  };

  const sfx = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      }
    },
    play(type) {
      try {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'click') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
        } else if (type === 'correct') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.setValueAtTime(659.25, now + 0.08);
          osc.frequency.setValueAtTime(783.99, now + 0.16);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
        } else if (type === 'wrong') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.linearRampToValueAtTime(80, now + 0.15);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
        }
      } catch (e) {}
    }
  };

  const state = {
    mode: 'endless',
    round: null,
    endless: { roundNumber: 1, streak: 0, lives: 3, solved: 0, gameOver: false },
    daily: { roundIndex: 0, lives: 3, results: [], finished: false, day: getTodayKey() },
    records: { streak: readNum('glyph_best'), fastest: readNum('glyph_best_time') || null }
  };

  loadDaily();
  bindUI();
  switchMode('endless');

  function readNum(k) {
    const v = parseInt(localStorage.getItem(k) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }

  function loadDaily() {
    try {
      const s = JSON.parse(localStorage.getItem('glyph_daily_' + state.daily.day));
      if (!s) return;
      state.daily.finished = true;
      state.daily.results = Array.isArray(s.results) ? s.results : [];
      state.daily.lives = Number.isFinite(s.lives) ? s.lives : 3;
    } catch {
      state.daily.finished = false;
      state.daily.results = [];
      state.daily.lives = 3;
    }
  }

  function saveDaily() {
    try {
      localStorage.setItem('glyph_daily_' + state.daily.day, JSON.stringify({
        results: state.daily.results,
        lives: state.daily.lives
      }));
    } catch {}
  }

  function getTodayKey() {
    const now = new Date();
    return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - DAY_ZERO) / 86400000) + 1;
  }

  function seededRandom(seed) {
    let v = seed | 0;
    return () => {
      v = (v + 0x6D2B79F5) | 0;
      let t = Math.imul(v ^ (v >>> 15), 1 | v);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let res = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      res = Math.imul(res ^ str.charCodeAt(i), 3432918353);
      res = (res << 13) | (res >>> 19);
    }
    return res >>> 0;
  }

  function randomize(rand, list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function choose(rand, list) {
    return list[Math.floor(rand() * list.length)];
  }

  function getTier(solved) {
    return TIERS.findIndex(t => solved < t.maxSolved);
  }

  function fmtTime(ms) {
    return (ms / 1000).toFixed(1) + 's';
  }

  function renderHearts(lives) {
    let res = '';
    for (let i = 0; i < 3; i++) {
      res += i < lives ? '♥' : '<span class="empty">♥</span>';
    }
    return res;
  }

  function makeAttr(rand, values, changing) {
    if (!changing) return { changing: false, value: choose(rand, values) };
    const opts = randomize(rand, values).slice(0, 3);
    const rev = rand() < 0.5;
    return {
      changing: true,
      values: opts,
      getValue(r, c) {
        return opts[rev ? (r - c + 3) % 3 : (r + c) % 3];
      }
    };
  }

  function readAttr(attr, r, c) {
    return attr.changing ? attr.getValue(r, c) : attr.value;
  }

  function makeCell(attrs, r, c) {
    return {
      shape: readAttr(attrs.shape, r, c),
      color: readAttr(attrs.color, r, c),
      count: readAttr(attrs.count, r, c)
    };
  }

  function matchCells(a, b) {
    return a.shape === b.shape && a.color === b.color && a.count === b.count;
  }

  function buildRound(rand, tier) {
    const attributes = {
      shape: makeAttr(rand, SHAPES, tier.changing.includes('shape')),
      color: makeAttr(rand, COLORS, tier.changing.includes('color')),
      count: makeAttr(rand, COUNTS, tier.changing.includes('count'))
    };

    const answer = makeCell(attributes, 2, 2);
    const keyFn = cell => tier.changing.map(a => cell[a]).join('|');
    const used = new Set([keyFn(answer)]);
    const decoys = [];
    let attempts = 300;

    while (decoys.length < tier.choices - 1 && attempts > 0) {
      attempts--;
      const cand = { ...answer };
      tier.changing.forEach(a => cand[a] = choose(rand, attributes[a].values));
      const k = keyFn(cand);
      if (!used.has(k)) {
        used.add(k);
        decoys.push(cand);
      }
    }

    return {
      random: rand,
      attributes,
      answer,
      changing: tier.changing,
      decoys,
      revealed: {},
      firstAttempt: true,
      hintUsed: false,
      locked: false,
      startedAt: performance.now(),
      timerId: null
    };
  }

  function renderCell(el, cell, className = 'cell') {
    el.className = `${className} c${cell.count}`;
    el.replaceChildren();
    for (let i = 0; i < cell.count; i++) {
      const g = document.createElement('span');
      g.className = 'g';
      g.textContent = cell.shape;
      g.style.color = cell.color;
      el.appendChild(g);
    }
  }

  function renderMarkup() {
    ui.gameArea.innerHTML = `
      <div class="card">
        <div class="card-top">
          <p class="prompt">Every row and column follows the same hidden rule. What belongs where the <b>?</b> is?</p>
          <div class="timer" id="timer">0.0s</div>
        </div>
        <div class="grid" id="grid"></div>
        <div class="hint-row">
          <button class="hint-btn" id="hint-btn" type="button">💡 Hint</button>
          <span class="hint-note" id="hint-note"></span>
        </div>
        <div class="revealed" id="revealed"></div>
      </div>
      <div class="choices-label">pick one</div>
      <div class="choices" id="choices"></div>
      <div class="feedback" id="feedback"></div>
      <button class="next-btn" id="next-btn" type="button"></button>
    `;

    const grid = document.getElementById('grid');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = document.createElement('div');
        if (r === 2 && c === 2) {
          cell.className = 'cell missing';
          cell.textContent = '?';
        } else {
          renderCell(cell, makeCell(state.round.attributes, r, c));
        }
        grid.appendChild(cell);
      }
    }

    const choicesEl = document.getElementById('choices');
    randomize(state.round.random, [state.round.answer, ...state.round.decoys]).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      renderCell(btn, opt, 'choice');
      btn.addEventListener('click', () => {
        sfx.play('click');
        handleAnswer(btn, opt);
      });
      choicesEl.appendChild(btn);
    });

    state.round.timerId = setInterval(() => {
      document.getElementById('timer').textContent = fmtTime(performance.now() - state.round.startedAt);
    }, 100);

    setupHint();
  }

  function setupHint() {
    const btn = document.getElementById('hint-btn');
    const note = document.getElementById('hint-note');
    const maxHints = Math.max(0, state.round.changing.length - 1);

    updateHintUI();

    btn.addEventListener('click', () => {
      sfx.play('click');
      if (Object.keys(state.round.revealed).length >= maxHints) return;
      const nextAttr = HINT_ORDER.find(a => state.round.changing.includes(a) && !state.round.revealed[a]);
      if (!nextAttr) return;

      state.round.revealed[nextAttr] = state.round.answer[nextAttr];
      state.round.hintUsed = true;

      const wrap = document.getElementById('revealed');
      const chip = document.createElement('div');
      chip.className = 'chip';
      if (nextAttr === 'color') {
        chip.innerHTML = `color <span style="width:10px;height:10px;border-radius:50%;background:${state.round.answer.color};display:inline-block"></span>`;
      } else if (nextAttr === 'shape') {
        chip.innerHTML = `shape <span style="color:${state.round.answer.color}">${state.round.answer.shape}</span>`;
      } else {
        chip.textContent = `count ${state.round.answer.count}`;
      }
      wrap.appendChild(chip);
      updateHintUI();

      if (state.mode === 'endless') {
        state.endless.streak = 0;
        renderStats();
      }
    });

    function updateHintUI() {
      const used = Object.keys(state.round.revealed).length;
      const rem = maxHints - used;
      btn.disabled = rem <= 0;
      note.textContent = maxHints === 0 ? 'no hints at this tier' : `${rem} left`;
    }
  }

  function handleAnswer(btn, choice) {
    if (state.round.locked) return;
    if (matchCells(choice, state.round.answer)) {
      sfx.play('correct');
      state.round.locked = true;
      clearInterval(state.round.timerId);
      document.querySelectorAll('#choices .choice').forEach(b => b.disabled = true);
      const hintBtn = document.getElementById('hint-btn');
      if (hintBtn) hintBtn.disabled = true;

      btn.classList.add('correct');
      const elapsed = performance.now() - state.round.startedAt;
      const clean = state.round.firstAttempt && !state.round.hintUsed;

      if (state.mode === 'endless') {
        const prevTier = getTier(state.endless.solved);
        state.endless.solved++;
        state.endless.roundNumber++;
        state.endless.streak = clean ? state.endless.streak + 1 : 0;

        if (state.endless.streak > state.records.streak) {
          state.records.streak = state.endless.streak;
          localStorage.setItem('glyph_best', String(state.records.streak));
        }
        if (clean && (!state.records.fastest || elapsed < state.records.fastest)) {
          state.records.fastest = elapsed;
          localStorage.setItem('glyph_best_time', String(Math.round(elapsed)));
        }

        showFeedback(clean ? `✓ Solved in ${fmtTime(elapsed)}` : '✓ Solved.', 'solved');
        showNext('Next round →');
        renderStats();
        if (getTier(state.endless.solved) > prevTier || (state.endless.streak >= 2 && state.records.streak === state.endless.streak)) confetti();
      } else {
        state.daily.results.push(clean ? '🟩' : '🟨');
        showFeedback(clean ? '✓ Solved clean.' : '✓ Solved.', 'solved');
        showNext(state.daily.roundIndex === DAILY_TIERS.length - 1 ? 'See results' : 'Next round →');
        renderStats();
      }
    } else {
      sfx.play('wrong');
      btn.classList.add('wrong');
      btn.disabled = true;
      state.round.firstAttempt = false;

      if (state.mode === 'endless') {
        state.endless.lives--;
        renderStats();
        if (state.endless.lives <= 0) {
          state.round.locked = true;
          clearInterval(state.round.timerId);
          document.querySelectorAll('#choices .choice').forEach(b => b.disabled = true);
          state.endless.gameOver = true;
          showFeedback(`Game over. Solved ${state.endless.solved}.`, 'over');
          showNext('Play again');
        } else {
          showFeedback('Check attributes against row and column.', 'hint');
        }
      } else {
        state.daily.lives--;
        renderStats();
        if (state.daily.lives <= 0) {
          state.round.locked = true;
          clearInterval(state.round.timerId);
          document.querySelectorAll('#choices .choice').forEach(b => b.disabled = true);
          while (state.daily.results.length < DAILY_TIERS.length) state.daily.results.push('🟥');
          showFeedback('Out of lives for today.', 'over');
          showNext('See results');
        } else {
          showFeedback('Check attributes against row and column.', 'hint');
        }
      }
    }
  }

  function showFeedback(msg, type) {
    const f = document.getElementById('feedback');
    f.textContent = msg;
    f.className = `feedback ${type} show`;
  }

  function showNext(text) {
    const btn = document.getElementById('next-btn');
    btn.textContent = text;
    btn.classList.add('show');
  }

  function renderStats() {
    if (state.mode === 'endless') {
      const solved = state.endless.solved;
      const tIdx = getTier(solved);
      const tier = TIERS[tIdx];
      const fastest = state.records.fastest ? `<div class="pill">fastest <b>${fmtTime(state.records.fastest)}</b></div>` : '';

      ui.pills.innerHTML = `
        <div class="pill">round <b>${state.endless.roundNumber}</b></div>
        <div class="pill">streak <b>${state.endless.streak}</b></div>
        <div class="pill">best <b>${state.records.streak}</b></div>
        ${fastest}
        <div class="pill hearts">${renderHearts(state.endless.lives)}</div>
      `;
      ui.tier.textContent = tier.label;
      ui.tier.style.display = '';
      ui.progressWrap.style.display = '';

      if (tIdx < TIERS.length - 1) {
        const start = tIdx === 0 ? 0 : TIERS[tIdx - 1].maxSolved;
        ui.progressLabel.textContent = `${tier.maxSolved - solved} to next tier`;
        ui.progressFill.style.width = `${Math.max(0, Math.min(100, Math.round(((solved - start) / (tier.maxSolved - start)) * 100)))}%`;
      } else {
        ui.progressLabel.textContent = 'max tier reached';
        ui.progressFill.style.width = '100%';
      }
    } else {
      const rNum = Math.min(state.daily.roundIndex + 1, DAILY_TIERS.length);
      ui.pills.innerHTML = `
        <div class="pill">day <b>${state.daily.day}</b></div>
        <div class="pill">round <b>${rNum}/5</b></div>
        <div class="pill hearts">${renderHearts(state.daily.lives)}</div>
      `;
      ui.tier.style.display = 'none';
      ui.progressWrap.style.display = 'none';
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    const endless = mode === 'endless';
    ui.endlessTab.classList.toggle('active', endless);
    ui.dailyTab.classList.toggle('active', !endless);
    ui.endlessTab.setAttribute('aria-selected', String(endless));
    ui.dailyTab.setAttribute('aria-selected', String(!endless));

    if (state.round && state.round.timerId) clearInterval(state.round.timerId);

    if (endless) {
      state.round = buildRound(Math.random, TIERS[getTier(state.endless.solved)]);
      renderMarkup();
      showNext('Next round →');
      renderStats();
    } else {
      if (state.daily.finished) {
        renderDailySummary();
      } else if (state.daily.lives <= 0 || state.daily.roundIndex >= DAILY_TIERS.length) {
        state.daily.finished = true;
        saveDaily();
        renderDailySummary();
      } else {
        state.round = buildRound(seededRandom(hash(`${state.daily.day}:${state.daily.roundIndex}`)), TIERS[DAILY_TIERS[state.daily.roundIndex]]);
        renderMarkup();
        if (state.daily.roundIndex === DAILY_TIERS.length - 1) showNext('See results');
        renderStats();
      }
    }
  }

  function renderDailySummary() {
    ui.gameArea.innerHTML = `
      <div class="card daily-summary">
        <div class="sub">Day ${state.daily.day} complete</div>
        <div class="emoji-row">${state.daily.results.join('')}</div>
        <div class="prompt">${state.daily.lives} / 3 lives left. Come back tomorrow.</div>
        <button class="copy-btn" id="copy-btn" type="button">Copy result</button>
      </div>
    `;
    document.getElementById('copy-btn').addEventListener('click', async () => {
      sfx.play('click');
      const btn = document.getElementById('copy-btn');
      try {
        await navigator.clipboard.writeText(`Glyph — Day ${state.daily.day}\n${state.daily.results.join('')}\n${state.daily.lives}/3 lives`);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy result', 1800);
      } catch {
        btn.textContent = 'Could not copy';
        setTimeout(() => btn.textContent = 'Copy result', 1800);
      }
    });
    renderStats();
  }

  function bindUI() {
    ui.endlessTab.addEventListener('click', () => {
      sfx.play('click');
      switchMode('endless');
    });
    ui.dailyTab.addEventListener('click', () => {
      sfx.play('click');
      switchMode('daily');
    });

    document.addEventListener('click', e => {
      if (e.target.id !== 'next-btn') return;
      sfx.play('click');
      if (state.mode === 'endless') {
        if (state.endless.gameOver) {
          state.endless = { roundNumber: 1, streak: 0, lives: 3, solved: 0, gameOver: false };
        }
        state.round = buildRound(Math.random, TIERS[getTier(state.endless.solved)]);
        renderMarkup();
        showNext('Next round →');
        renderStats();
      } else {
        state.daily.roundIndex++;
        if (state.daily.roundIndex >= DAILY_TIERS.length || state.daily.lives <= 0) {
          state.daily.finished = true;
          saveDaily();
          renderDailySummary();
        } else {
          switchMode('daily');
        }
      }
    });
  }

  function confetti() {
    const colors = ['#E8604C', '#3F9163', '#C99A2E', '#3B82C4'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.left = `${Math.random() * 100}vw`;
      p.style.background = choose(Math.random, colors);
      p.style.setProperty('--dx', `${Math.random() * 140 - 70}px`);
      p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3000);
    }
  }
})();
