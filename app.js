// Main visualizer page
(function (SL) {
  'use strict';

  const s = SL.loadSettings();
  const audio = SL.audio;
  audio.configure(s);

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const btnPlay = $('btnPlay');
  const speedIn = $('speed');
  const sizeIn = $('size');
  const algoSel = $('algoSelect');

  let photo = null;
  let look = null;
  let W = 0, H = 0, dpr = 1;
  const player = new SL.Player();
  let seed = SL.randomSeed();
  let initial = null, result = null;
  let phase = 'ready', running = false, stepPos = 0, sweepT = 0, time = 0, last = performance.now();

  const save = () => SL.saveSettings(s);
  const rebuildLook = () => { look = SL.buildLook(s, photo); };

  function compute() {
    result = SL.runSort(s.algo, initial, seed);
    if (result.error) SL.toast(result.error, 4500);
    resetRun();
  }

  function newArray() {
    seed = SL.randomSeed();
    initial = SL.makeArray(s.n, s.order, seed);
    compute();
  }

  function resetRun() {
    player.load(initial, result);
    phase = 'ready';
    stepPos = 0;
    sweepT = 0;
    setRunning(false);
  }

  function setRunning(v) {
    running = v;
    btnPlay.innerHTML = v ? SL.ICONS.pause : SL.ICONS.play;
    btnPlay.title = v ? 'Pause (Space)' : 'Play (Space)';
  }

  function startSweep() {
    if (result.gaveUp) {
      phase = 'done';
      setRunning(false);
      SL.toast('Bogo gave up after ' + SL.fmtInt(result.count) + ' steps. Try 6 items or fewer.', 4000);
      return;
    }
    phase = 'sweep';
    sweepT = 0;
  }

  function togglePlay() {
    unlockAudio();
    if (phase === 'done') resetRun();
    if (phase === 'ready') phase = 'sorting';
    setRunning(!running);
  }

  function stepOnce() {
    unlockAudio();
    if (phase === 'done') resetRun();
    setRunning(false);
    if (phase === 'ready') phase = 'sorting';
    if (phase !== 'sorting') return;
    stepPos = Math.floor(stepPos) + 1;
    if (player.stepTo(stepPos)) audio.play(player.noteValue());
    if (player.done) { startSweep(); if (phase === 'sweep') setRunning(true); }
  }

  function update(dt) {
    if (!running) return;
    if (phase === 'sorting') {
      stepPos += dt * s.speed;
      if (player.stepTo(Math.floor(stepPos))) audio.play(player.noteValue());
      if (player.done) startSweep();
    } else if (phase === 'sweep') {
      sweepT += dt;
      const f = sweepT / SL.SWEEP_SEC;
      if (f >= 1) {
        player.setSweep(-1);
        phase = 'done';
        setRunning(false);
      } else if (player.setSweep(f)) {
        audio.play(f);
      }
    }
  }

  function drawLabels(c) {
    const a = SL.algoById(s.algo);
    const u = dpr;
    c.textBaseline = 'top';
    c.fillStyle = '#ffffff';
    c.font = '700 ' + 18 * u + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    c.fillText(a.name, 18 * u, 16 * u);
    const nameW = c.measureText(a.name).width;
    c.fillStyle = '#8a94a8';
    c.font = '500 ' + 13 * u + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    c.fillText(a.cx, 18 * u + nameW + 10 * u, 21 * u);
    const a1 = 'Comparisons ' + SL.fmtInt(player.cmps) + '   Writes ' + SL.fmtInt(player.writes);
    const a2 = 'Step ' + SL.fmtInt(player.pos) + ' / ' + SL.fmtInt(player.total) + '   ~' + SL.fmtDur(player.total / s.speed);
    if (narrow()) {
      c.fillText(a1, 18 * u, 44 * u);
      c.fillText(a2, 18 * u, 62 * u);
    } else {
      c.fillText(a1 + '   ' + a2, 18 * u, 44 * u);
    }
  }

  const narrow = () => W / dpr < 640;

  function draw() {
    const top = s.labels ? (narrow() ? 88 : 70) * dpr : 12 * dpr;
    const rect = { x: 12 * dpr, y: top, w: W - 24 * dpr, h: H - top - 12 * dpr };
    SL.renderFrame(ctx, W, H, look, (l) => SL.drawViz(l, rect, player.view(), look, time), s.labels ? drawLabels : null);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- sound hint ----------
  const hint = $('soundHint');
  function unlockAudio() {
    audio.unlock();
    hint.classList.add('hidden');
  }
  hint.addEventListener('click', () => { unlockAudio(); s.sound = true; audio.configure(s); panel.sync(); save(); });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  // ---------- dock ----------
  algoSel.innerHTML = SL.algoOptionsHTML(s.algo);
  algoSel.addEventListener('change', () => { s.algo = algoSel.value; save(); compute(); });

  const chips = SL.buildModeChips($('modeChips'), s, () => { rebuildLook(); save(); });

  function syncDock() {
    speedIn.value = SL.sliderFromSpeed(s.speed);
    $('speedVal').textContent = SL.fmtSpeed(s.speed);
    sizeIn.value = SL.sliderFromN(s.n);
    $('sizeVal').textContent = s.n;
    algoSel.value = s.algo;
    chips.sync();
  }

  speedIn.addEventListener('input', () => { s.speed = SL.speedFromSlider(+speedIn.value); syncDock(); panel.sync(); save(); });
  sizeIn.addEventListener('input', () => { $('sizeVal').textContent = SL.nFromSlider(+sizeIn.value); });
  sizeIn.addEventListener('change', () => { s.n = SL.nFromSlider(+sizeIn.value); save(); panel.sync(); newArray(); });

  btnPlay.addEventListener('click', togglePlay);
  $('btnStep').addEventListener('click', stepOnce);
  $('btnReset').addEventListener('click', resetRun);
  $('btnNew').addEventListener('click', newArray);
  $('btnNew').innerHTML = SL.ICONS.shuffle;
  $('btnStep').innerHTML = SL.ICONS.step;
  $('btnReset').innerHTML = SL.ICONS.reset;

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || document.querySelector('.modal.open')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') stepOnce();
    else if (e.key === 'r' || e.key === 'R') resetRun();
    else if (e.key === 'n' || e.key === 'N') newArray();
  });

  // ---------- customize drawer ----------
  const drawerEl = $('drawer');
  const panel = SL.buildPanel(drawerEl, s, (key, value) => {
    if (key === 'photo') photo = value;
    if (['n', 'order', 'newArray'].includes(key)) newArray();
    if (['sound', 'wave', 'volume', 'pitchLow', 'pitchHigh'].includes(key)) audio.configure(s);
    rebuildLook();
    syncDock();
    save();
  }, () => photo);
  $('openCustomize').addEventListener('click', () => panel.open());

  // ---------- video maker ----------
  SL.initVideo(s, () => photo);
  $('openVideo').addEventListener('click', () => { setRunning(false); SL.openVideo(); });

  // ---------- start ----------
  window.addEventListener('resize', resize);
  resize();
  rebuildLook();
  syncDock();
  newArray();
  SL.loadPhoto().then((img) => { photo = img; rebuildLook(); panel.sync(); });
  requestAnimationFrame(loop);
  if (location.hash === '#video') {
    history.replaceState(null, '', location.pathname + location.search);
    SL.openVideo();
  }
})(window.SL);
