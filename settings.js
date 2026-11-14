// Settings: saved on this device, and shareable through a link
(function (SL) {
  'use strict';

  const KEY = 'sortlab.settings';
  const PHOTO_KEY = 'sortlab.photo';

  SL.DEFAULTS = {
    algo: 'quick',
    mode: 'bars',
    palette: 'rainbow',
    custom: ['#00e5ff', '#3b82f6', '#ff3cac'],
    bg: 'midnight',
    glow: 100,
    size: 100,
    spin: false,
    labels: true,
    tilePhoto: true,
    n: 120,
    order: 'random',
    speed: 250,
    sound: true,
    wave: 'triangle',
    volume: 40,
    pitchLow: 160,
    pitchHigh: 1400
  };

  // Settings can come from a share link, so treat them as untrusted: known keys only, values within the UI's ranges.
  function clean(raw) {
    const d = SL.DEFAULTS, s = {};
    Object.keys(d).forEach((k) => { s[k] = Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : d[k]; });
    if (!SL.ALGOS.some((a) => a.id === s.algo)) s.algo = d.algo;
    if (!SL.MODES.some((m) => m.id === s.mode)) s.mode = d.mode;
    if (!SL.PALETTES.some((p) => p.id === s.palette)) s.palette = d.palette;
    if (!SL.BACKGROUNDS.some((b) => b.id === s.bg)) s.bg = d.bg;
    if (!SL.ORDERS.some((o) => o.id === s.order)) s.order = d.order;
    if (!Array.isArray(s.custom) || s.custom.length !== 3 || !s.custom.every((c) => /^#[0-9a-f]{6}$/i.test(c))) s.custom = d.custom.slice();
    if (!['sine', 'triangle', 'square', 'sawtooth'].includes(s.wave)) s.wave = d.wave;
    ['spin', 'labels', 'tilePhoto', 'sound'].forEach((k) => { s[k] = !!s[k]; });
    s.n = SL.clamp(Math.round(+s.n || d.n), 4, 2000);
    s.speed = SL.clamp(Math.round(+s.speed || d.speed), 1, 100000);
    const R = { glow: [0, 200], size: [40, 140], volume: [0, 100], pitchLow: [60, 800], pitchHigh: [400, 3000] };
    Object.keys(R).forEach((k) => { s[k] = isFinite(+s[k]) ? SL.clamp(+s[k], R[k][0], R[k][1]) : d[k]; });
    return s;
  }

  SL.loadSettings = function () {
    const s = Object.assign({}, SL.DEFAULTS);
    try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
    const m = location.hash.match(/s=([^&]+)/);
    if (m) {
      try { Object.assign(s, JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch (e) { /* ignore */ }
      history.replaceState(null, '', location.pathname + location.search);
    }
    return clean(s);
  };

  SL.saveSettings = function (s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  };

  SL.shareLink = function (s) {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(s))));
    return location.origin + location.pathname + '#s=' + b;
  };

  SL.photoKey = '';

  SL.loadPhoto = function () {
    return new Promise((res) => {
      let d = null;
      try { d = localStorage.getItem(PHOTO_KEY); } catch (e) { /* ignore */ }
      if (!d) return res(null);
      const img = new Image();
      img.onload = () => { SL.photoKey = 'p' + d.length; res(img); };
      img.onerror = () => res(null);
      img.src = d;
    });
  };

  // Shrinks the photo and keeps it only in this browser
  SL.savePhotoFile = function (file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const M = 1440;
        const sc = Math.min(1, M / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const d = c.toDataURL('image/jpeg', 0.86);
        try { localStorage.setItem(PHOTO_KEY, d); } catch (e) { /* too big to keep, use for this visit only */ }
        const out = new Image();
        out.onload = () => { SL.photoKey = 'p' + Date.now(); res(out); };
        out.src = d;
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  };

  SL.removePhoto = function () {
    try { localStorage.removeItem(PHOTO_KEY); } catch (e) { /* ignore */ }
    SL.photoKey = '';
  };

  SL.buildLook = function (s, photo) {
    return {
      mode: s.mode,
      lut: SL.makeLUT(s.palette, s.custom),
      glow: s.glow,
      size: s.size,
      spin: s.spin,
      labels: s.labels,
      bg: s.bg,
      photo: photo || null,
      photoKey: SL.photoKey,
      tilePhoto: s.tilePhoto
    };
  };
})(window.SL);
