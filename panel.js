// Customize drawer (Look / Data / Sound), shared by every page
(function (SL) {
  'use strict';

  SL.buildPanel = function (el, s, onChange, getPhoto) {
    el.innerHTML = `
      <div class="drawer-head">
        <div class="tabs">
          <button class="tab active" data-tab="look">Look</button>
          <button class="tab" data-tab="data">Data</button>
          <button class="tab" data-tab="sound">Sound</button>
        </div>
        <button class="btn icon ghost" data-close aria-label="Close">${SL.ICONS.close}</button>
      </div>
      <div class="drawer-body">
        <div class="pane active" data-pane="look">
          <h4>Colours</h4>
          <div class="swatches" data-k="palettes"></div>
          <div class="custom-row">
            <input type="color" data-c="0" aria-label="Custom colour 1">
            <input type="color" data-c="1" aria-label="Custom colour 2">
            <input type="color" data-c="2" aria-label="Custom colour 3">
            <span class="hint">Make your own</span>
          </div>
          <h4>Background</h4>
          <div class="bgs" data-k="bgs"></div>
          <div class="row">
            <label class="btn small">Add a photo<input type="file" accept="image/*" data-k="photo" hidden></label>
            <button class="btn small ghost" data-k="photoRemove">Remove photo</button>
          </div>
          <p class="hint">Photos stay on your device. They're used for the background and for Tiles.</p>
          <label class="range-row"><span>Glow <b data-v="glow"></b></span><input type="range" min="0" max="200" data-k="glow"></label>
          ${SL.glowSupported ? '' : '<p class="hint">Glow is not supported in this browser.</p>'}
          <label class="range-row"><span>Size <b data-v="size"></b></span><input type="range" min="40" max="140" data-k="size"></label>
          <label class="switch"><input type="checkbox" data-k="spin"><i></i><span>Spin</span></label>
          <label class="switch"><input type="checkbox" data-k="labels"><i></i><span>Labels</span></label>
          <label class="switch"><input type="checkbox" data-k="tilePhoto"><i></i><span>Use my photo in Tiles</span></label>
          <button class="btn block" data-k="share">Copy share link</button>
        </div>
        <div class="pane" data-pane="data">
          <label class="range-row"><span>Items <b data-v="n"></b></span><input type="range" min="0" max="100" step="0.1" data-k="n"></label>
          <label class="field"><span>Starting order</span><select class="select" data-k="order">
            ${SL.ORDERS.map((o) => '<option value="' + o.id + '">' + o.name + '</option>').join('')}
          </select></label>
          <label class="range-row"><span>Speed <b data-v="speed"></b></span><input type="range" min="0" max="1000" data-k="speed"></label>
          <button class="btn block" data-k="newArray">New array</button>
          <p class="hint">Slow sorts like Bubble, Cycle or Stooge need a lot of steps on big arrays. Bogo gives up after a while unless the array is tiny.</p>
        </div>
        <div class="pane" data-pane="sound">
          <label class="switch"><input type="checkbox" data-k="sound"><i></i><span>Sound on</span></label>
          <label class="field"><span>Tone</span><select class="select" data-k="wave">
            <option value="sine">Soft (sine)</option>
            <option value="triangle">Classic (triangle)</option>
            <option value="square">Retro (square)</option>
            <option value="sawtooth">Buzzy (saw)</option>
          </select></label>
          <label class="range-row"><span>Volume <b data-v="volume"></b></span><input type="range" min="0" max="100" data-k="volume"></label>
          <label class="range-row"><span>Lowest pitch <b data-v="pitchLow"></b></span><input type="range" min="60" max="800" data-k="pitchLow"></label>
          <label class="range-row"><span>Highest pitch <b data-v="pitchHigh"></b></span><input type="range" min="400" max="3000" data-k="pitchHigh"></label>
          <button class="btn block" data-k="testSound">Test sound</button>
        </div>
      </div>`;

    const q = (sel) => el.querySelector(sel);
    const k = (name) => q('[data-k="' + name + '"]');

    // Tabs
    el.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
      el.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
    }));
    q('[data-close]').addEventListener('click', () => el.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.classList.remove('open'); });

    // Palettes
    const pal = k('palettes');
    pal.innerHTML = SL.PALETTES.map((p) =>
      '<button class="swatch" data-p="' + p.id + '" title="' + p.name + '"><i></i><span>' + p.name + '</span></button>'
    ).join('');
    pal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      s.palette = b.dataset.p;
      onChange('palette');
      sync();
    });
    el.querySelectorAll('[data-c]').forEach((inp) => inp.addEventListener('input', () => {
      s.custom[+inp.dataset.c] = inp.value;
      s.palette = 'custom';
      onChange('palette');
      sync();
    }));

    // Backgrounds
    const bgs = k('bgs');
    bgs.innerHTML = SL.BACKGROUNDS.map((b) =>
      '<button class="bg-opt" data-b="' + b.id + '" title="' + b.name + '"><i' + (b.css ? ' style="background:' + b.css + '"' : '') + '></i><span>' + b.name + '</span></button>'
    ).join('');
    bgs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]');
      if (!b) return;
      if (b.dataset.b === 'photo' && !getPhoto()) { k('photo').click(); return; }
      s.bg = b.dataset.b;
      onChange('bg');
      sync();
    });

    k('photo').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const img = await SL.savePhotoFile(f);
        s.bg = 'photo';
        onChange('photo', img);
        sync();
      } catch (err) {
        SL.toast("Couldn't open that image.");
      }
      e.target.value = '';
    });
    k('photoRemove').addEventListener('click', () => {
      SL.removePhoto();
      if (s.bg === 'photo') s.bg = 'midnight';
      onChange('photo', null);
      sync();
    });

    // Plain inputs
    const bindRange = (name, toVal, fire) => {
      const inp = k(name);
      inp.addEventListener('input', () => {
        s[name] = toVal ? toVal(+inp.value) : +inp.value;
        labels();
        if (fire !== 'change') onChange(name);
      });
      if (fire === 'change') inp.addEventListener('change', () => onChange(name));
    };
    bindRange('glow');
    bindRange('size');
    bindRange('volume');
    bindRange('pitchLow');
    bindRange('pitchHigh');
    bindRange('speed', SL.speedFromSlider);
    bindRange('n', SL.nFromSlider, 'change');

    ['spin', 'labels', 'tilePhoto', 'sound'].forEach((name) => {
      k(name).addEventListener('change', () => { s[name] = k(name).checked; onChange(name); });
    });
    ['order', 'wave'].forEach((name) => {
      k(name).addEventListener('change', () => { s[name] = k(name).value; onChange(name); });
    });

    k('newArray').addEventListener('click', () => onChange('newArray'));
    k('testSound').addEventListener('click', () => {
      SL.audio.unlock();
      let i = 0;
      const t = setInterval(() => { SL.audio.play(i / 12, true); if (++i > 12) clearInterval(t); }, 45);
    });
    k('share').addEventListener('click', async () => {
      const link = SL.shareLink(s);
      try {
        await navigator.clipboard.writeText(link);
        SL.toast('Share link copied.');
      } catch (e) {
        prompt('Copy this link:', link);
      }
    });

    function labels() {
      const v = (name, text) => { const b = q('[data-v="' + name + '"]'); if (b) b.textContent = text; };
      v('glow', s.glow + '%');
      v('size', s.size + '%');
      v('n', s.n);
      v('speed', SL.fmtSpeed(s.speed));
      v('volume', s.volume + '%');
      v('pitchLow', s.pitchLow + ' Hz');
      v('pitchHigh', s.pitchHigh + ' Hz');
    }

    function sync() {
      pal.querySelectorAll('[data-p]').forEach((b) => {
        b.classList.toggle('active', b.dataset.p === s.palette);
        b.querySelector('i').style.background = SL.paletteCSS(b.dataset.p, s.custom);
      });
      el.querySelectorAll('[data-c]').forEach((inp) => { inp.value = s.custom[+inp.dataset.c]; });
      bgs.querySelectorAll('[data-b]').forEach((b) => {
        b.classList.toggle('active', b.dataset.b === s.bg);
        if (b.dataset.b === 'photo') {
          const p = getPhoto();
          b.querySelector('i').style.background = p ? 'center/cover url(' + p.src + ')' : 'repeating-linear-gradient(45deg,#1b2232 0 6px,#121826 6px 12px)';
        }
      });
      k('glow').value = s.glow;
      k('size').value = s.size;
      k('spin').checked = s.spin;
      k('labels').checked = s.labels;
      k('tilePhoto').checked = s.tilePhoto;
      k('n').value = SL.sliderFromN(s.n);
      k('order').value = s.order;
      k('speed').value = SL.sliderFromSpeed(s.speed);
      k('sound').checked = s.sound;
      k('wave').value = s.wave;
      k('volume').value = s.volume;
      k('pitchLow').value = s.pitchLow;
      k('pitchHigh').value = s.pitchHigh;
      labels();
    }

    sync();
    return { sync, open: () => el.classList.add('open'), close: () => el.classList.remove('open') };
  };

  // Mode chips used in the bottom dock
  SL.buildModeChips = function (el, s, onPick) {
    el.innerHTML = SL.MODES.map((m) => '<button class="chip" data-m="' + m.id + '">' + m.name + '</button>').join('');
    const sync = () => el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('active', b.dataset.m === s.mode));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      s.mode = b.dataset.m;
      sync();
      onPick();
    });
    sync();
    return { sync };
  };
})(window.SL);
