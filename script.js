(function () {
  var SHAPE_POOL = ['●', '■', '▲', '◆', '★'];
  var COLOR_POOL = ['#E8604C', '#3F9163', '#3B82C4', '#B8860B', '#8B5FBF'];
  var COUNT_POOL = [1, 2, 3];
  var HINT_ORDER = ['color', 'shape', 'count'];
  var TIERS = [
    { max: 3,  varying: ['color'], label: 'Tier 1', numChoices: 3 },
    { max: 6,  varying: ['color', 'shape'], label: 'Tier 2', numChoices: 4 },
    { max: 10, varying: ['color', 'shape', 'count'], label: 'Tier 3', numChoices: 5 },
    { max: Infinity, varying: ['color', 'shape', 'count'], label: 'Tier 4', numChoices: 6 }
  ];
  var DAILY_SEQUENCE = [0, 1, 2, 2, 3];

  function tierIndexFor(n) {
    for (var i = 0; i < TIERS.length; i++) if (n < TIERS[i].max) return i;
    return TIERS.length - 1;
  }
  function tierMinFor(i) { return i === 0 ? 0 : TIERS[i - 1].max; }

  function hashStr(s) {
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0);
  }
  function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function todayKey() {
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var start = Date.UTC(2024, 0, 1);
    return Math.round((today - start) / 86400000) + 1;
  }
  function dayNumber() { return todayKey(); }

  function shuffle(rand, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pickN(rand, pool, n) { return shuffle(rand, pool).slice(0, n); }

  function buildAttr(rand, pool, isVarying) {
    if (!isVarying) return { varying: false, value: pool[Math.floor(rand() * pool.length)] };
    var values = pickN(rand, pool, 3);
    var flip = rand() < 0.5;
    return { varying: true, values: values, fn: function (r, c) { var idx = flip ? (r - c + 3) % 3 : (r + c) % 3; return values[idx]; } };
  }
  function attrAt(attr, r, c) { return attr.varying ? attr.fn(r, c) : attr.value; }
  function cellData(attrs, r, c) {
    return { shape: attrAt(attrs.shape, r, c), color: attrAt(attrs.color, r, c), count: attrAt(attrs.count, r, c) };
  }
  function sameCell(a, b) { return a.shape === b.shape && a.color === b.color && a.count === b.count; }

  function renderCellInto(container, data, extraClass) {
    container.className = (extraClass || 'cell') + ' c' + data.count;
    container.innerHTML = '';
    for (var i = 0; i < data.count; i++) {
        var s = document.createElement('span');
        s.className = 'g'; s.textContent = data.shape; s.style.color = data.color;
        container.appendChild(s);
    }
  }

  function confettiBurst() {
    var colors = ['#E8604C', '#3F9163', '#C99A2E', '#3B82C4'];
    for (var i = 0; i < 26; i++) {
      var d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = (Math.random() * 100) + 'vw';
      d.style.background = colors[Math.floor(Math.random() * colors.length)];
      d.style.setProperty('--dx', (Math.random() * 140 - 70) + 'px');
      d.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      d.style.animationDuration = (1.4 + Math.random() * 1.2) + 's';
      document.body.appendChild(d);
      (function (el) { setTimeout(function () { el.remove(); }, 3000); })(d);
    }
  }

  var bestStreak = parseInt(localStorage.getItem('glyph_best') || '0', 10);
  var bestTimeMs = parseInt(localStorage.getItem('glyph_best_time') || '0', 10) || null;

  var ui = {
    tabEndless: document.getElementById('tab-endless'),
    tabDaily: document.getElementById('tab-daily'),
    pills: document.getElementById('pills'),
    tier: document.getElementById('tier-tag'),
    progressWrap: document.getElementById('progress-wrap'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    area: document.getElementById('game-area')
  };

  var mode = 'endless';
  var endless = { round: 1, streak: 0, lives: 3, solvedTotal: 0, over: false };
  var daily = { roundIdx: 0, lives: 3, results: [], done: false, todayKey: todayKey() };

  var savedDaily = null;
  try { savedDaily = JSON.parse(localStorage.getItem('glyph_daily_' + daily.todayKey) || 'null'); } catch (e) {}
  if (savedDaily) { daily.done = true; daily.results = savedDaily.results; daily.lives = savedDaily.lives; }

  var rc = null;

  function fmtTime(ms) { return (ms / 1000).toFixed(1) + 's'; }

  function heartsHTML(lives) {
    var h = '';
    for (var i = 0; i < 3; i++) h += i < lives ? '♥' : '<span class="empty">♥</span>';
    return h;
  }

  function renderStats() {
    if (mode === 'endless') {
      ui.pills.innerHTML =
        '<div class="pill">round <b>' + endless.round + '</b></div>' +
        '<div class="pill">streak <b>' + endless.streak + '</b></div>' +
        '<div class="pill">best <b>' + bestStreak + '</b></div>' +
        (bestTimeMs ? '<div class="pill">fastest <b>' + fmtTime(bestTimeMs) + '</b></div>' : '') +
        '<div class="pill hearts">' + heartsHTML(endless.lives) + '</div>';
      var ti = tierIndexFor(endless.solvedTotal);
      ui.tier.textContent = TIERS[ti].label;
      ui.tier.style.display = '';
      if (ti < TIERS.length - 1) {
        var min = tierMinFor(ti), max = TIERS[ti].max;
        ui.progressWrap.style.display = '';
        ui.progressLabel.textContent = (max - endless.solvedTotal) + ' to next tier';
        ui.progressFill.style.width = Math.round(((endless.solvedTotal - min) / (max - min)) * 100) + '%';
      } else {
        ui.progressWrap.style.display = '';
        ui.progressLabel.textContent = 'max tier reached';
        ui.progressFill.style.width = '100%';
      }
    } else {
      ui.pills.innerHTML =
        '<div class="pill">day <b>' + dayNumber() + '</b></div>' +
        '<div class="pill">round <b>' + Math.min(daily.roundIdx + 1, 5) + '/5</b></div>' +
        '<div class="pill hearts">' + heartsHTML(daily.lives) + '</div>';
      ui.tier.style.display = 'none';
      ui.progressWrap.style.display = 'none';
    }
  }

  function axisConflict(attrs, attrName, value) {
    var rowVals = [cellData(attrs, 2, 0)[attrName], cellData(attrs, 2, 1)[attrName]];
    var colVals = [cellData(attrs, 0, 2)[attrName], cellData(attrs, 1, 2)[attrName]];
    var inRow = rowVals.indexOf(value) !== -1, inCol = colVals.indexOf(value) !== -1;
    if (inRow && inCol) return 'row and column';
    if (inRow) return 'row';
    if (inCol) return 'column';
    return null;
  }

  function buildRoundContext(rand, tierCfg) {
    var attrs = {
      shape: buildAttr(rand, SHAPE_POOL, tierCfg.varying.indexOf('shape') !== -1),
      color: buildAttr(rand, COLOR_POOL, tierCfg.varying.indexOf('color') !== -1),
      count: buildAttr(rand, COUNT_POOL, tierCfg.varying.indexOf('count') !== -1)
    };
    var target = cellData(attrs, 2, 2);
    var varying = tierCfg.varying;
    var seen = {};
    var key = function (o) { return varying.map(function (a) { return o[a]; }).join('|'); };
    seen[key(target)] = true;

    var poolByAttr = {};
    varying.forEach(function(a) { poolByAttr[a] = attrs[a].values || [attrs[a].value]; });
    var allCombos = [];
    
    function generateCombos(index, current) {
      if (index === varying.length) {
        allCombos.push(current);
        return;
      }
      var attr = varying[index];
      poolByAttr[attr].forEach(function(val) {
        var next = Object.assign({}, current);
        next[attr] = val;
        generateCombos(index + 1, next);
      });
    }
    generateCombos(0, { shape: target.shape, color: target.color, count: target.count });

    var validDecoyPool = shuffle(rand, allCombos.filter(function(cand) { return !seen[key(cand)]; }));
    var decoys = validDecoyPool.slice(0, tierCfg.numChoices - 1);

    return { 
      rand: rand, attrs: attrs, target: target, varying: varying, decoys: decoys, 
      revealed: {}, firstTry: true, hintUsed: false, locked: false, 
      startTime: performance.now(), timerId: null 
    };
  }

  function stopTimer() { 
    if (rc && rc.timerId) { 
      clearInterval(rc.timerId); 
      rc.timerId = null; 
    } 
  }

  function renderRoundUI(onChoice) {
    stopTimer();

    var html =
      '<div class="card">' +
        '<div class="card-top"><p class="prompt">Every row and column follows the same hidden rule, per attribute. What belongs where the <b>?</b> is?</p>' +
        '<div class="timer" id="timer">0.0s</div></div>' +
        '<div class="grid" id="grid"></div>' +
        '<div class="hint-row"><button class="hint-btn" id="hint-btn">💡 Hint</button><span class="hint-note" id="hint-note"></span></div>' +
        '<div class="revealed" id="revealed"></div>' +
      '</div>' +
      '<div class="choices-label">pick one</div>' +
      '<div class="choices" id="choices"></div>' +
      '<div class="feedback" id="feedback"></div>' +
      '<button class="next-btn" id="next-btn"></button>';
    ui.area.innerHTML = html;

    var grid = document.getElementById('grid');
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var cellEl = document.createElement('div');
        if (r === 2 && c === 2) { cellEl.className = 'cell missing'; cellEl.textContent = '?'; }
        else { renderCellInto(cellEl, cellData(rc.attrs, r, c)); }
        grid.appendChild(cellEl);
      }
    }

    var choicesEl = document.getElementById('choices');
    var all = shuffle(rc.rand, [rc.target].concat(rc.decoys));
    all.forEach(function (opt) {
      var btn = document.createElement('button');
      renderCellInto(btn, opt, 'choice');
      btn.addEventListener('click', function () { onChoice(btn, opt); });
      choicesEl.appendChild(btn);
    });

    var timerEl = document.getElementById('timer');
    rc.timerId = setInterval(function () {
      timerEl.textContent = fmtTime(performance.now() - rc.startTime);
    }, 100);

    var hintBtn = document.getElementById('hint-btn');
    var revealableCount = rc.varying.filter(function (a) { return HINT_ORDER.indexOf(a) !== -1; }).length;
    var maxReveals = Math.max(0, revealableCount - 1);
    var hintNote = document.getElementById('hint-note');
    function refreshHintUI() {
      var revealedCount = Object.keys(rc.revealed).length;
      hintBtn.disabled = revealedCount >= maxReveals;
      hintNote.textContent = maxReveals === 0 ? 'no hints at this tier' : (maxReveals - revealedCount) + ' left';
    }
    refreshHintUI();
    hintBtn.addEventListener('click', function () {
      var revealedCount = Object.keys(rc.revealed).length;
      if (revealedCount >= maxReveals) return;
      var next = HINT_ORDER.filter(function (a) { return rc.varying.indexOf(a) !== -1 && !rc.revealed[a]; })[0];
      if (!next) return;
      rc.revealed[next] = rc.target[next];
      rc.hintUsed = true;
      var chipWrap = document.getElementById('revealed');
      var chip = document.createElement('div');
      chip.className = 'chip';
      if (next === 'color') chip.innerHTML = 'color <span style="width:10px;height:10px;border-radius:50%;background:' + rc.target.color + ';display:inline-block"></span>';
      else if (next === 'shape') chip.innerHTML = 'shape <span style="color:' + rc.target.color + '">' + rc.target.shape + '</span>';
      else chip.textContent = 'count ' + rc.target.count;
      chipWrap.appendChild(chip);
      onHintUsed();
      refreshHintUI();
    });
  }

  var onHintUsed = function () {};

  function startEndlessRound() {
    var ti = tierIndexFor(endless.solvedTotal);
    rc = buildRoundContext(Math.random, TIERS[ti]);
    onHintUsed = function () {
      if (endless.streak !== 0) { endless.streak = 0; renderStats(); }
    };
    renderRoundUI(handleEndlessChoice);
    document.getElementById('next-btn').textContent = 'Next round →';
    renderStats();
  }

  function handleEndlessChoice(btn, opt) {
    if (rc.locked) return;
    var correct = sameCell(opt, rc.target);
    var feedback = document.getElementById('feedback');
    var nextBtn = document.getElementById('next-btn');

    if (correct) {
      rc.locked = true; stopTimer();
      btn.classList.add('correct');
      Array.prototype.forEach.call(document.getElementById('choices').children, function (c) { c.disabled = true; });
      document.getElementById('hint-btn').disabled = true;

      var elapsed = performance.now() - rc.startTime;
      var cleanSolve = rc.firstTry && !rc.hintUsed;

      endless.solvedTotal++;
      var oldTierIdx = tierIndexFor(endless.solvedTotal - 1);
      var newTierIdx = tierIndexFor(endless.solvedTotal);

      if (cleanSolve) { endless.streak++; } else { endless.streak = 0; }
      var newBestStreak = false;
      if (endless.streak > bestStreak) { bestStreak = endless.streak; localStorage.setItem('glyph_best', String(bestStreak)); newBestStreak = true; }
      var newBestTime = false;
      if (cleanSolve && (!bestTimeMs || elapsed < bestTimeMs)) { bestTimeMs = elapsed; localStorage.setItem('glyph_best_time', String(Math.round(bestTimeMs))); newBestTime = true; }

      endless.round++;
      feedback.textContent = cleanSolve ? '✓ Solved in ' + fmtTime(elapsed) + (newBestTime ? ' — new best time!' : '') : '✓ Solved.';
      feedback.className = 'feedback solved show';
      nextBtn.textContent = 'Next round →';
      nextBtn.classList.add('show');
      renderStats();

      if (newTierIdx > oldTierIdx || (newBestStreak && endless.streak >= 2)) confettiBurst();
    } else {
      btn.classList.add('wrong'); btn.disabled = true;
      endless.streak = 0; 
      rc.firstTry = false;
      endless.lives--;
      renderStats();

      if (endless.lives <= 0) {
        rc.locked = true; stopTimer();
        Array.prototype.forEach.call(document.getElementById('choices').children, function (c) { c.disabled = true; });
        document.getElementById('hint-btn').disabled = true;
        feedback.textContent = 'Game over — out of lives. Solved ' + endless.solvedTotal + ' this run (best streak ' + bestStreak + ').';
        feedback.className = 'feedback over show';
        nextBtn.textContent = 'Play again';
        nextBtn.classList.add('show');
        endless.over = true;
      } else {
        var msgs = [];
        rc.varying.forEach(function (a) {
          if (opt[a] !== rc.target[a]) { var axis = axisConflict(rc.attrs, a, opt[a]); if (axis) msgs.push(a + ' repeats in that ' + axis + '.'); }
        });
        feedback.textContent = msgs.length ? msgs.join(' ') : 'close — recheck every attribute against both the row and the column.';
        feedback.className = 'feedback hint show';
      }
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'next-btn') {
      if (mode === 'endless') {
        if (endless.over) { endless.over = false; endless.round = 1; endless.streak = 0; endless.lives = 3; endless.solvedTotal = 0; }
        startEndlessRound();
      } else {
        advanceDaily();
      }
    }
  });

  function dailyRandFor(roundIdx) {
    var seed = hashStr(daily.todayKey + ':' + roundIdx);
    return mulberry32(seed);
  }

  function startDailyRound() {
    if (daily.done) { renderDailySummary(); return; }
    if (daily.lives <= 0 || daily.roundIdx >= 5) { finishDaily(); return; }
    var tierCfg = TIERS[DAILY_SEQUENCE[daily.roundIdx]];
    rc = buildRoundContext(dailyRandFor(daily.roundIdx), tierCfg);
    onHintUsed = function () {};
    renderRoundUI(handleDailyChoice);
    document.getElementById('next-btn').textContent = daily.roundIdx === 4 ? 'See results' : 'Next round →';
    renderStats();
  }

  function handleDailyChoice(btn, opt) {
    if (rc.locked) return;
    var correct = sameCell(opt, rc.target);
    var feedback = document.getElementById('feedback');
    var nextBtn = document.getElementById('next-btn');

    if (correct) {
      rc.locked = true; stopTimer();
      btn.classList.add('correct');
      Array.prototype.forEach.call(document.getElementById('choices').children, function (c) { c.disabled = true; });
      document.getElementById('hint-btn').disabled = true;
      var cleanSolve = rc.firstTry && !rc.hintUsed;
      daily.results.push(cleanSolve ? '🟩' : '🟨');
      feedback.textContent = cleanSolve ? '✓ Solved clean.' : '✓ Solved.';
      feedback.className = 'feedback solved show';
      nextBtn.classList.add('show');
      renderStats();
    } else {
      btn.classList.add('wrong'); btn.disabled = true;
      rc.firstTry = false;
      daily.lives--;
      renderStats();
      if (daily.lives <= 0) {
        rc.locked = true; stopTimer();
        Array.prototype.forEach.call(document.getElementById('choices').children, function (c) { c.disabled = true; });
        document.getElementById('hint-btn').disabled = true;
        
        daily.results.push('🟥');
        while (daily.results.length < 5) daily.results.push('🟥');
        
        feedback.textContent = 'Out of lives for today.';
        feedback.className = 'feedback over show';
        nextBtn.textContent = 'See results';
        nextBtn.classList.add('show');
      } else {
        var msgs = [];
        rc.varying.forEach(function (a) {
          if (opt[a] !== rc.target[a]) { var axis = axisConflict(rc.attrs, a, opt[a]); if (axis) msgs.push(a + ' repeats in that ' + axis + '.'); }
        });
        feedback.textContent = msgs.length ? msgs.join(' ') : 'close — recheck every attribute against both the row and the column.';
        feedback.className = 'feedback hint show';
      }
    }
  }

  function advanceDaily() {
    if (daily.lives <= 0) {
      finishDaily();
    } else {
      daily.roundIdx++;
      if (daily.roundIdx >= 5) finishDaily();
      else startDailyRound();
    }
  }

  function finishDaily() {
    daily.done = true;
    localStorage.setItem('glyph_daily_' + daily.todayKey, JSON.stringify({ results: daily.results, lives: daily.lives }));
    renderDailySummary();
    if (daily.lives > 0 && daily.results.indexOf('🟥') === -1) confettiBurst();
  }

  function renderDailySummary() {
    stopTimer();
    ui.area.innerHTML =
      '<div class="card daily-summary">' +
        '<div class="sub">Day ' + dayNumber() + ' complete</div>' +
        '<div class="emoji-row">' + daily.results.join('') + '</div>' +
        '<div class="prompt">' + daily.lives + ' / 3 lives left. Come back tomorrow for a new one.</div>' +
        '<button class="copy-btn" id="copy-btn">Copy result</button>' +
      '</div>';
    document.getElementById('copy-btn').addEventListener('click', function () {
      var text = 'Glyph — Day ' + dayNumber() + '\n' + daily.results.join('') + '\n' + daily.lives + '/3 lives';
      var btn = this;
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!'; btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copy result'; btn.classList.remove('copied'); }, 1800);
        }).catch(function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          btn.textContent = 'Copied!'; btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copy result'; btn.classList.remove('copied'); }, 1800);
        } catch (err) {}
        document.body.removeChild(ta);
      }
    });
    renderStats();
  }

  function switchMode(m) {
    stopTimer();
    mode = m;
    ui.tabEndless.classList.toggle('active', m === 'endless');
    ui.tabDaily.classList.toggle('active', m === 'daily');
    if (m === 'endless') startEndlessRound();
    else startDailyRound();
  }

  ui.tabEndless.addEventListener('click', function () { switchMode('endless'); });
  ui.tabDaily.addEventListener('click', function () { switchMode('daily'); });

  switchMode('endless');
})();
