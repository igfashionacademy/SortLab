// Video maker: 1080x1920 vertical videos with sound.
// The length is worked out from the real number of steps each sort needs.
(function (SL) {
  'use strict';

  const VKEY = 'sortlab.video';
  const W = 1080, H = 1920;
  const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  let s, getPhoto, modal, canvas, ctx, vs, modeChips;
  let plan = null;
  let busy = null; // 'record' | 'preview' | null
  let cancelled = false;
  let lastUrl = null;
  const cache = new Map();
  const el = {};

  function saveVs() { try { localStorage.setItem(VKEY, JSON.stringify(vs)); } catch (e) { /* ignore */ } }

  SL.initVideo = function (settings, photoGetter) {
    s = settings;
    getPhoto = photoGetter;
    modal = document.getElementById('videoModal');
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(VKEY) || '{}'); } catch (e) { /* ignore */ }
    vs = Object.assign({
      layout: 'sequence',
      algos: ['quick', 'merge', 'heap'],
      n: 120,
      order: 'random',
      speed: 300,
      mode: s.mode,
      intro: 1,
      outro: 1,
      title: true,
      stats: true,
      sound: true,
      fps: 60,
      handle: '',
      seed: SL.randomSeed()
    }, saved);
    vs.algos = (vs.algos || []).filter((id) => SL.ALGOS.some((a) => a.id === id));
    if (!vs.algos.length) vs.algos = [s.algo];
    buildUI();
  };

  // preset: optional settings to start from (e.g. Battle page passes its two sorts)
  SL.openVideo = function (preset) {
    if (preset && !busy) {
      if (preset.layout === 'battle' && preset.algos) {
        // keep any extra sequence sorts after the two battle picks
        vs.algos = preset.algos.concat(vs.algos.slice(2));
      }
      ['layout', 'mode', 'n', 'order', 'speed'].forEach((k) => { if (preset[k] !== undefined) vs[k] = preset[k]; });
      saveVs();
    }
    modal.classList.add('open');
    syncUI();
    refresh();
  };

  function close() {
    if (busy) { cancelled = true; }
    modal.classList.remove('open');
  }

  // ---------- UI ----------

  function buildUI() {
    modal.innerHTML = `
      <div class="modal-card video-card">
        <div class="modal-head">
          <h3>Make video</h3>
          <button class="btn icon ghost" data-k="close" aria-label="Close">${SL.ICONS.close}</button>
        </div>
        <div class="video-grid">
          <div class="video-settings">
            <div class="seg" data-k="layout">
              <button data-val="sequence">One after another</button>
              <button data-val="battle">Battle (2 at once)</button>
            </div>
            <h4>Sorts</h4>
            <div class="sort-list" data-k="list"></div>
            <button class="btn small" data-k="add">+ Add a sort</button>
            <div class="field"><span>Style</span><div class="chips wrap" data-k="modeChips"></div></div>
            <div class="grid2">
              <label class="field"><span>Starting order</span><select class="select" data-k="order">
                ${SL.ORDERS.map((o) => '<option value="' + o.id + '">' + o.name + '</option>').join('')}
              </select></label>
            </div>
            <label class="range-row"><span>Items <b data-v="n"></b></span><input type="range" min="0" max="100" step="0.1" data-k="n"></label>
            <label class="range-row"><span>Speed <b data-v="speed"></b></span><input type="range" min="0" max="1000" data-k="speed"></label>
            <div class="grid2">
              <label class="field"><span>Pause before each sort (s)</span><input class="input" type="number" min="0" max="10" step="0.5" data-k="intro"></label>
              <label class="field"><span>Pause after each sort (s)</span><input class="input" type="number" min="0" max="10" step="0.5" data-k="outro"></label>
            </div>
            <div class="grid2">
              <label class="field"><span>Frame rate</span><select class="select" data-k="fps">
                <option value="30">30 fps</option><option value="60">60 fps</option>
              </select></label>
              <label class="field"><span>Your name (optional)</span><input class="input" data-k="handle" maxlength="40" placeholder="@yourname"></label>
            </div>
            <label class="switch"><input type="checkbox" data-k="title"><i></i><span>Show sort name</span></label>
            <label class="switch"><input type="checkbox" data-k="stats"><i></i><span>Show stats and progress bar</span></label>
            <label class="switch"><input type="checkbox" data-k="sound"><i></i><span>Sound</span></label>
            <button class="btn small ghost" data-k="reseed">${SL.ICONS.shuffle} Shuffle a new array</button>
            <p class="hint">Colours, background, glow and spin come from Customize.</p>
          </div>
          <div class="video-side">
            <div class="estimate" data-k="estimate"></div>
            <div class="preview-box">
              <canvas width="${W}" height="${H}" data-k="canvas"></canvas>
              <video data-k="video" controls playsinline hidden></video>
            </div>
            <div class="progress" data-k="progressWrap" hidden><div data-k="bar"></div></div>
            <div class="progress-text hint" data-k="progressText"></div>
            <div class="row">
              <button class="btn" data-k="preview">${SL.ICONS.play} Preview</button>
              <button class="btn primary grow" data-k="record">Make video</button>
            </div>
            <a class="btn block" data-k="download" hidden>Download video</a>
            <p class="hint">Output is 1080×1920 MP4, ready for TikTok, Reels and Shorts. Keep this tab open until it's done. In Chrome and Edge the video is built frame by frame, so sound and picture line up exactly.</p>
          </div>
        </div>
      </div>`;

    modal.querySelectorAll('[data-k]').forEach((n) => { el[n.dataset.k] = n; });
    canvas = el.canvas;
    ctx = canvas.getContext('2d');

    el.close.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

    el.layout.addEventListener('click', (e) => {
      const b = e.target.closest('[data-val]');
      if (!b || busy) return;
      vs.layout = b.dataset.val;
      if (vs.layout === 'battle') {
        while (vs.algos.length < 2) vs.algos.push(vs.algos[0] === 'bubble' ? 'quick' : 'bubble');
      }
      changed(true);
    });

    el.add.addEventListener('click', () => {
      if (busy || vs.algos.length >= 12) return;
      const used = new Set(vs.algos);
      const next = SL.ALGOS.find((a) => !used.has(a.id) && a.group !== 'Just for fun') || SL.ALGOS[0];
      vs.algos.push(next.id);
      changed(true);
    });

    el.list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b || busy) return;
      vs.algos.splice(+b.dataset.rm, 1);
      if (!vs.algos.length) vs.algos.push('quick');
      changed(true);
    });

    modeChips = SL.buildChips(el.modeChips, SL.MODES, () => vs.mode, (id) => { if (busy) return; vs.mode = id; changed(false); });
    el.order.addEventListener('change', () => { vs.order = el.order.value; changed(false); });
    el.fps.addEventListener('change', () => { vs.fps = +el.fps.value; changed(false); });
    el.handle.addEventListener('input', () => { vs.handle = el.handle.value; changed(false); });
    ['intro', 'outro'].forEach((k) => el[k].addEventListener('input', () => {
      vs[k] = SL.clamp(+el[k].value || 0, 0, 10);
      changed(false);
    }));
    ['title', 'stats', 'sound'].forEach((k) => el[k].addEventListener('change', () => { vs[k] = el[k].checked; changed(false); }));

    el.n.addEventListener('input', () => { vs.n = SL.nFromSlider(+el.n.value); labels(); });
    el.n.addEventListener('change', () => changed(false));
    el.speed.addEventListener('input', () => { vs.speed = SL.speedFromSlider(+el.speed.value); labels(); changed(false); });

    el.reseed.addEventListener('click', () => { if (busy) return; vs.seed = SL.randomSeed(); changed(false); });
    el.preview.addEventListener('click', () => { if (busy === 'preview') cancelled = true; else if (!busy) run(false); });
    el.record.addEventListener('click', () => { if (busy === 'record') cancelled = true; else if (!busy) run(true); });
  }

  function labels() {
    modal.querySelector('[data-v="n"]').textContent = vs.n;
    modal.querySelector('[data-v="speed"]').textContent = SL.fmtSpeed(vs.speed);
  }

  function syncUI() {
    el.layout.querySelectorAll('[data-val]').forEach((b) => b.classList.toggle('active', b.dataset.val === vs.layout));
    const battle = vs.layout === 'battle';
    const shown = battle ? vs.algos.slice(0, 2) : vs.algos;
    el.list.innerHTML = shown.map((id, i) => `
      <div class="sort-row">
        <span class="num">${battle ? (i ? 'B' : 'A') : i + 1}</span>
        <div class="chips" data-row="${i}"></div>
        <span class="dur" data-dur="${i}"></span>
        ${battle ? '' : '<button class="btn icon ghost small" data-rm="' + i + '" aria-label="Remove">' + SL.ICONS.trash + '</button>'}
      </div>`).join('');
    el.list.querySelectorAll('[data-row]').forEach((row) => {
      const i = +row.dataset.row;
      SL.buildChips(row, SL.ALGOS, () => vs.algos[i], (id) => { if (busy) return; vs.algos[i] = id; changed(false); });
    });
    el.add.hidden = battle || vs.algos.length >= 12;
    modeChips.sync();
    el.order.value = vs.order;
    el.n.value = SL.sliderFromN(vs.n);
    el.speed.value = SL.sliderFromSpeed(vs.speed);
    el.intro.value = vs.intro;
    el.outro.value = vs.outro;
    el.fps.value = String(vs.fps);
    el.handle.value = vs.handle;
    el.title.checked = vs.title;
    el.stats.checked = vs.stats;
    el.sound.checked = vs.sound;
    labels();
  }

  let refreshTimer = 0;
  function changed(rebuildList) {
    saveVs();
    if (rebuildList) syncUI();
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 120);
  }

  // ---------- plan + length estimate ----------

  function initialArr() { return SL.makeArray(vs.n, vs.order, vs.seed); }

  function getResult(id, init) {
    const key = id + '|' + vs.n + '|' + vs.order + '|' + vs.seed;
    let r = cache.get(key);
    if (!r) {
      r = SL.runSort(id, init, vs.seed);
      cache.set(key, r);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
    }
    return r;
  }

  function buildPlan() {
    const init = initialArr();
    const S = SL.SWEEP_SEC;
    const segs = [];
    const sortSec = (r) => r.count / vs.speed;
    const sweepSec = (r) => (r.gaveUp ? 0 : S);
    if (vs.layout === 'battle') {
      const algos = vs.algos.slice(0, 2);
      const rs = algos.map((id) => getResult(id, init));
      const sd = rs.map(sortSec);
      const end = Math.max(sd[0] + sweepSec(rs[0]), sd[1] + sweepSec(rs[1]));
      segs.push({ algos, results: rs, sortDurs: sd, dur: vs.intro + end + vs.outro });
    } else {
      vs.algos.forEach((id) => {
        const r = getResult(id, init);
        const sd = sortSec(r);
        segs.push({ algos: [id], results: [r], sortDurs: [sd], dur: vs.intro + sd + sweepSec(r) + vs.outro });
      });
    }
    let t = 0;
    segs.forEach((g) => { g.start = t; t += g.dur; });
    return { init, segs, total: t };
  }

  function refresh() {
    if (busy) return;
    plan = buildPlan();
    const battle = vs.layout === 'battle';
    const rows = [];
    plan.segs.forEach((g, si) => {
      g.results.forEach((r, j) => {
        const idx = battle ? j : si;
        const d = el.list.querySelector('[data-dur="' + idx + '"]');
        if (d) d.textContent = SL.fmtDur(g.sortDurs[j]);
        let note = '';
        if (r.error) note = '<em class="warn">Too many steps, stopped early</em>';
        else if (r.gaveUp) note = '<em class="warn">Gives up (array too big)</em>';
        rows.push('<li><span>' + SL.algoById(r.id).name + '</span><span>' + SL.fmtInt(r.count) + ' steps · ' + SL.fmtDur(g.sortDurs[j]) + '</span>' + note + '</li>');
      });
    });
    const long = plan.total > 180 ? '<p class="hint warn">That\'s a long one. Raise the speed or use fewer items to make it shorter.</p>' : '';
    el.estimate.innerHTML =
      '<div class="est-head"><span>Video length</span><strong>' + SL.fmtDur(plan.total) + '</strong></div>' +
      '<ul class="est-list">' + rows.join('') + '</ul>' +
      '<p class="hint">Worked out from the exact steps each sort takes at ' + SL.fmtSpeed(vs.speed) +
      ', plus pauses and a ' + SL.SWEEP_SEC + 's finish check.</p>' + long;
    showCanvas();
    frameAt(Math.min(plan.total, vs.intro * 0.5), { si: -1, players: [] });
  }

  function showCanvas() {
    el.video.hidden = true;
    el.video.pause();
    canvas.hidden = false;
  }

  // ---------- drawing ----------

  function vizRect(mode) {
    if (mode === 'bars' || mode === 'scatter') return { x: 50, y: 400, w: 980, h: 1080 };
    return { x: 40, y: 430, w: 1000, h: 1000 };
  }

  function text(c, str, x, y, size, weight, color, align) {
    c.font = weight + ' ' + size + 'px ' + FONT;
    c.fillStyle = color;
    c.textAlign = align || 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(str, x, y);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function bar(c, x, y, w, h, frac) {
    c.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(c, x, y, w, h, h / 2);
    c.fill();
    if (frac > 0) {
      c.fillStyle = '#ffffff';
      roundRect(c, x, y, Math.max(h, w * frac), h, h / 2);
      c.fill();
    }
  }

  function badge(c, str, x, y, color) {
    c.font = '800 34px ' + FONT;
    const w = c.measureText(str).width + 40;
    c.fillStyle = color;
    roundRect(c, x - w, y - 44, w, 56, 28);
    c.fill();
    text(c, str, x - w / 2, y - 4, 34, 800, '#ffffff', 'center');
  }

  function drawOverlay(c, g, players, si, rects) {
    const battle = players.length === 2;
    if (!battle) {
      const a = SL.algoById(g.algos[0]);
      const p = players[0];
      if (plan.segs.length > 1) text(c, (si + 1) + ' / ' + plan.segs.length, W / 2, 120, 36, 600, 'rgba(255,255,255,0.55)');
      if (vs.title) {
        text(c, a.name, W / 2, 230, 92, 800, '#ffffff');
        text(c, a.cx, W / 2, 300, 44, 500, 'rgba(255,255,255,0.6)');
      }
      if (vs.stats) {
        text(c, 'Comparisons', 300, 1580, 36, 500, 'rgba(255,255,255,0.6)');
        text(c, SL.fmtInt(p.cmps), 300, 1655, 68, 800, '#ffffff');
        text(c, 'Writes', 780, 1580, 36, 500, 'rgba(255,255,255,0.6)');
        text(c, SL.fmtInt(p.writes), 780, 1655, 68, 800, '#ffffff');
        bar(c, 140, 1720, 800, 16, p.progress);
      }
    } else {
      const tops = [rects[0].y - 40, rects[1].y - 40];
      const both = players[0].done && players[1].done;
      const c0 = g.results[0].count, c1 = g.results[1].count;
      players.forEach((p, j) => {
        const a = SL.algoById(g.algos[j]);
        text(c, a.name, 70, tops[j], 58, 800, '#ffffff', 'left');
        if (vs.stats) {
          text(c, SL.fmtInt(p.pos) + ' steps', 1010, tops[j], 40, 600, 'rgba(255,255,255,0.7)', 'right');
          bar(c, 70, rects[j].y + rects[j].h + 22, 940, 12, p.progress);
        }
        const mine = j === 0 ? c0 : c1, other = j === 0 ? c1 : c0;
        if (both) {
          if (mine < other) badge(c, 'WINNER', 1010, tops[j] - 70, '#3b82f6');
          else if (mine === other) badge(c, 'TIE', 1010, tops[j] - 70, '#475569');
        } else if (p.done) {
          badge(c, 'DONE', 1010, tops[j] - 70, '#3b82f6');
        }
      });
      text(c, 'VS', W / 2, (rects[0].y + rects[0].h + rects[1].y) / 2 + 10, 54, 900, 'rgba(255,255,255,0.85)');
    }
    if (vs.handle) text(c, vs.handle, W / 2, 1850, 40, 600, 'rgba(255,255,255,0.6)');
  }

  // Moves the sorts to time T (seconds). onNote(frac, playerIndex) is called for each sound.
  function advance(T, rt, onNote) {
    if (!plan || !plan.segs.length) return null;
    let si = plan.segs.findIndex((g) => T < g.start + g.dur);
    if (si < 0) si = plan.segs.length - 1;
    const g = plan.segs[si];
    if (rt.si !== si) {
      rt.si = si;
      rt.players = g.results.map((r) => { const p = new SL.Player(); p.load(plan.init, r); return p; });
    }
    const ts = T - g.start - vs.intro;
    rt.players.forEach((p, j) => {
      if (ts < 0) return;
      if (p.stepTo(Math.floor(ts * vs.speed)) && onNote) onNote(p.noteValue(), j);
      if (p.done && !g.results[j].gaveUp) {
        const f = (ts - g.sortDurs[j]) / SL.SWEEP_SEC;
        if (f >= 1) p.setSweep(-1);
        else if (f >= 0 && p.setSweep(f) && onNote) onNote(f, j);
      }
    });
    return { g, si };
  }

  // Draws the video at time T (seconds)
  function frameAt(T, rt) {
    const st = advance(T, rt, null);
    if (!st) return;
    const { g, si } = st;
    const look = SL.buildLook(Object.assign({}, s, { mode: vs.mode, labels: false }), getPhoto());
    const battle = rt.players.length === 2;
    const rects = battle
      ? [{ x: 70, y: 250, w: 940, h: 640 }, { x: 70, y: 1110, w: 940, h: 640 }]
      : [vizRect(vs.mode)];
    SL.renderFrame(ctx, W, H, look,
      (l) => rt.players.forEach((p, j) => SL.drawViz(l, rects[j], p.view(), look, T)),
      (c) => drawOverlay(c, g, rt.players, si, rects));
  }

  // ---------- soundtrack ----------

  // Replays the whole plan once and writes down exactly when every note happens
  function collectNotes() {
    const notes = [];
    const rt = { si: -1, players: [] };
    const last = [-1, -1];
    const dt = 1 / 240;
    const gain = plan.segs.some((g) => g.results.length === 2) ? 0.7 : 1;
    for (let i = 0, T = 0; T < plan.total; i++, T = i * dt) {
      advance(T, rt, (frac, j) => {
        if (frac < 0 || T - last[j] < 0.014) return;
        last[j] = T;
        notes.push([T, frac, gain]);
      });
    }
    return notes;
  }

  // Builds the soundtrack ahead of time so sound and picture can't drift apart
  async function buildSoundtrack() {
    if (!vs.sound || !SL.audio.ctx) return null;
    try {
      return await SL.audio.renderNotes(collectNotes(), plan.total);
    } catch (e) {
      return null;
    }
  }

  // ---------- preview / record ----------

  function pickMime() {
    const list = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  function setBusy(mode) {
    busy = mode;
    modal.classList.toggle('busy', !!mode);
    el.record.innerHTML = mode === 'record' ? 'Stop' : 'Make video';
    el.preview.innerHTML = mode === 'preview' ? SL.ICONS.pause + ' Stop' : SL.ICONS.play + ' Preview';
    el.record.disabled = mode === 'preview';
    el.preview.disabled = mode === 'record';
    el.progressWrap.hidden = !mode;
    if (!mode) el.progressText.textContent = '';
  }

  async function run(recordIt) {
    plan = buildPlan();
    if (!plan.total) return;
    if (recordIt && (!window.MediaRecorder || !canvas.captureStream)) {
      SL.toast("This browser can't record video. Try Chrome, Edge or Firefox on a computer.", 5000);
      return;
    }
    SL.audio.unlock();
    showCanvas();
    el.download.hidden = true;
    cancelled = false;
    setBusy(recordIt ? 'record' : 'preview');

    let rec = null, chunks = [], stopped = null, videoTracks = [];
    const rt = { si: -1, players: [] };
    frameAt(0, rt);

    el.progressText.textContent = 'Preparing sound...';
    await new Promise((r) => setTimeout(r, 30));
    const soundtrack = await buildSoundtrack();
    if (cancelled) { setBusy(null); refresh(); return; }
    // fresh state after building the soundtrack
    rt.si = -1;
    frameAt(0, rt);

    // Best path: build the file frame by frame with exact timestamps
    if (recordIt) {
      const withAudio = vs.sound && !!soundtrack;
      let exact = false;
      try { exact = await SL.canExactExport(W, H, vs.fps, withAudio, soundtrack ? soundtrack.sampleRate : 48000); } catch (e) { exact = false; }
      if (exact) {
        let blob = null;
        try {
          const rtx = { si: -1, players: [] };
          blob = await SL.exportMP4({
            canvas,
            fps: vs.fps,
            total: plan.total,
            drawFrame: (T) => frameAt(T, rtx),
            audioBuffer: withAudio ? soundtrack : null,
            volume: SL.audio.volume * 0.5,
            isCancelled: () => cancelled,
            onProgress: (f) => {
              el.bar.style.width = (f * 100).toFixed(1) + '%';
              el.progressText.textContent = 'Making video ' + Math.round(f * 100) + '%';
            }
          });
        } catch (e) {
          blob = null;
          if (!cancelled) SL.toast('Something went wrong while making the video. Trying the backup recorder.', 4000);
          exact = false;
        }
        if (exact || cancelled) {
          setBusy(null);
          if (!blob) { SL.toast('Stopped.'); refresh(); return; }
          showResult(blob, 'video/mp4');
          return;
        }
        rt.si = -1;
        frameAt(0, rt);
      }
    }

    if (recordIt) {
      const vstream = canvas.captureStream(vs.fps);
      videoTracks = vstream.getVideoTracks();
      const tracks = videoTracks.slice();
      if (vs.sound) {
        const as = SL.audio.stream();
        if (as) tracks.push(...as.getAudioTracks());
      }
      const mime = pickMime();
      const opts = { videoBitsPerSecond: 12000000, audioBitsPerSecond: 192000 };
      if (mime) opts.mimeType = mime;
      try { rec = new MediaRecorder(new MediaStream(tracks), opts); }
      catch (e) { rec = new MediaRecorder(new MediaStream(tracks)); }
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(500);
    }

    // The video follows the audio clock, so both stay locked together
    const actx = SL.audio.ctx;
    let source = null, clock;
    if (actx) {
      const startAt = actx.currentTime + 0.15;
      if (soundtrack) {
        source = actx.createBufferSource();
        source.buffer = soundtrack;
        source.connect(SL.audio.master);
        source.start(startAt);
      }
      clock = () => actx.currentTime - startAt;
    } else {
      const t0 = performance.now() + 150;
      clock = () => (performance.now() - t0) / 1000;
    }

    await new Promise((resolve) => {
      function tick() {
        if (cancelled) return resolve();
        const T = Math.max(0, clock());
        if (T >= plan.total) {
          frameAt(plan.total - 0.0001, rt);
          el.bar.style.width = '100%';
          return resolve();
        }
        frameAt(T, rt);
        el.bar.style.width = ((T / plan.total) * 100).toFixed(1) + '%';
        el.progressText.textContent = (recordIt ? 'Recording ' : 'Preview ') + SL.fmtDur(T) + ' / ' + SL.fmtDur(plan.total);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    if (source) { try { source.stop(); } catch (e) { /* already ended */ } source.disconnect(); }
    if (rec) {
      await new Promise((r) => setTimeout(r, 120));
      rec.stop();
      await stopped;
      videoTracks.forEach((t) => t.stop());
    }
    const wasCancelled = cancelled;
    setBusy(null);

    if (!rec || wasCancelled || !chunks.length) {
      if (rec && wasCancelled) SL.toast('Recording stopped.');
      refresh();
      return;
    }

    showResult(new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] }), (rec.mimeType || 'video/webm').split(';')[0]);
  }

  function showResult(blob, type) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    el.video.src = lastUrl;
    el.video.hidden = false;
    canvas.hidden = true;
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    el.download.href = lastUrl;
    el.download.download = 'sorting-video-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;
    el.download.textContent = 'Download video (' + ext.toUpperCase() + ', ' + (blob.size / 1048576).toFixed(1) + ' MB)';
    el.download.hidden = false;
    if (ext === 'webm') SL.toast('Saved as WebM. Most apps accept it; if one doesn\'t, convert it to MP4 with any free converter.', 6000);
  }
})(window.SL);
