// Battle page: two sorts race on the same array at the same speed
(function (SL) {
  'use strict';

  const BKEY = 'sortlab.battle';
  const s = SL.loadSettings();
  const audio = SL.audio;
  audio.configure(s);

  const $ = (id) => document.getElementById(id);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(BKEY) || '{}'); } catch (e) { /* ignore */ }
  const known = (id, def) => (SL.ALGOS.some((a) => a.id === id) ? id : def);
  const picks = [known(saved.a, 'quick'), known(saved.b, 'bubble')];

  let photo = null, look = null, dpr = 1, time = 0, last = performance.now();
  let seed = SL.randomSeed(), initial = null;
  let running = false, started = false, stepPos = 0;

  const sides = [0, 1].map((i) => {
    const canvas = $(i ? 'stageB' : 'stageA');
    return {
      i, canvas, ctx: canvas.getContext('2d'), W: 1, H: 1,
      chipsEl: $(i ? 'algoB' : 'algoA'),
      stat: $(i ? 'statB' : 'statA'),
      player: new SL.Player(), result: null, sweepT: 0, phase: 'ready'
    };
  });

  const save = () => {
    SL.saveSettings(s);
    try { localStorage.setItem(BKEY, JSON.stringify({ a: picks[0], b: picks[1] })); } catch (e) { /* ignore */ }
  };
  const rebuildLook = () => { look = SL.buildLook(s, photo); };

  function compute(side) {
    side.result = SL.runSort(picks[side.i], initial, seed);
    if (side.result.error) SL.toast(side.result.error, 4500);
  }

  function resetRun() {
    sides.forEach((sd) => { sd.player.load(initial, sd.result); sd.phase = 'ready'; sd.sweepT = 0; });
    stepPos = 0;
    started = false;
    setRunning(false);
    $('winner').textContent = '';
    $('winner').classList.remove('show');
  }

  function newArray() {
    seed = SL.randomSeed();
    initial = SL.makeArray(s.n, s.order, seed);
    sides.forEach(compute);
    resetRun();
  }

  function setRunning(v) {
    running = v;
    $('btnPlay').innerHTML = v ? SL.ICONS.stop : SL.ICONS.play;
    $('btnPlay').classList.toggle('playing', v);
  }

  function togglePlay() {
    audio.unlock();
    $('soundHint').classList.add('hidden');
    if (sides.every((sd) => sd.phase === 'done')) resetRun();
    if (!started) { started = true; sides.forEach((sd) => { sd.phase = 'sorting'; }); }
    setRunning(!running);
  }

  function announce() {
    const [a, b] = sides;
    const na = SL.algoById(picks[0]).name, nb = SL.algoById(picks[1]).name;
    const w = $('winner');
    if (a.result.count === b.result.count) w.textContent = "It's a tie: both took " + SL.fmtInt(a.result.count) + ' steps.';
    else {
      const win = a.result.count < b.result.count ? a : b;
      const lose = win === a ? b : a;
      w.textContent = (win === a ? na : nb) + ' wins with ' + SL.fmtInt(win.result.count) + ' steps (' +
        (lose === a ? na : nb) + ' needed ' + SL.fmtInt(lose.result.count) + ').';
    }
    w.classList.add('show');
  }

  function update(dt) {
    if (!running) return;
    stepPos += dt * s.speed;
    sides.forEach((sd) => {
      const p = sd.player;
      if (sd.phase === 'sorting') {
        if (p.stepTo(Math.floor(stepPos))) audio.play(p.noteValue());
        if (p.done) { sd.phase = sd.result.gaveUp ? 'done' : 'sweep'; sd.sweepT = 0; }
      } else if (sd.phase === 'sweep') {
        sd.sweepT += dt;
        const f = sd.sweepT / SL.SWEEP_SEC;
        if (f >= 1) { p.setSweep(-1); sd.phase = 'done'; }
        else if (p.setSweep(f)) audio.play(f);
      }
    });
    if (sides.every((sd) => sd.phase === 'done')) { setRunning(false); announce(); }
  }

  function draw() {
    sides.forEach((sd) => {
      const p = sd.player;
      const rect = { x: 8 * dpr, y: 8 * dpr, w: sd.W - 16 * dpr, h: sd.H - 16 * dpr };
      SL.renderFrame(sd.ctx, sd.W, sd.H, look, (l) => SL.drawViz(l, rect, p.view(), look, time), null);
      sd.stat.textContent = s.labels
        ? SL.fmtInt(p.pos) + ' / ' + SL.fmtInt(p.total) + ' steps · ' + SL.fmtInt(p.cmps) + ' comparisons'
        : '';
    });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    sides.forEach((sd) => {
      sd.W = Math.max(1, Math.round(sd.canvas.clientWidth * dpr));
      sd.H = Math.max(1, Math.round(sd.canvas.clientHeight * dpr));
      sd.canvas.width = sd.W;
      sd.canvas.height = sd.H;
    });
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- controls ----------
  sides.forEach((sd) => {
    sd.chips = SL.buildChips(sd.chipsEl, SL.ALGOS, () => picks[sd.i], (id) => {
      picks[sd.i] = id;
      save();
      compute(sd);
      resetRun();
    });
  });

  const chips = SL.buildModeChips($('modeChips'), s, () => { rebuildLook(); save(); });

  function syncDock() {
    chips.sync();
    sides.forEach((sd) => sd.chips.sync());
  }

  $('btnPlay').addEventListener('click', togglePlay);
  $('soundHint').addEventListener('click', () => { audio.unlock(); $('soundHint').classList.add('hidden'); });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || document.querySelector('.modal.open')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'r' || e.key === 'R') resetRun();
    else if (e.key === 'n' || e.key === 'N') newArray();
  });

  const panel = SL.buildPanel($('drawer'), s, (key, value) => {
    if (key === 'photo') photo = value;
    if (['n', 'order', 'newArray'].includes(key)) newArray();
    if (key === 'reset') resetRun();
    if (['sound', 'wave', 'volume', 'pitchLow', 'pitchHigh'].includes(key)) audio.configure(s);
    rebuildLook();
    syncDock();
    save();
  }, () => photo, { step: false });
  $('openCustomize').addEventListener('click', () => panel.open());

  // ---------- video maker (opens in Battle mode with these two sorts) ----------
  SL.initVideo(s, () => photo);
  $('openVideo').addEventListener('click', () => {
    setRunning(false);
    SL.openVideo({ layout: 'battle', algos: [picks[0], picks[1]], mode: s.mode, n: s.n, order: s.order, speed: s.speed });
  });

  window.addEventListener('resize', resize);
  resize();
  rebuildLook();
  syncDock();
  newArray();
  SL.loadPhoto().then((img) => { photo = img; rebuildLook(); panel.sync(); });
  requestAnimationFrame(loop);
})(window.SL);
