// Shared helpers used by every page
window.SL = window.SL || {};
(function (SL) {
  'use strict';

  // Small seeded random number generator so arrays can be rebuilt exactly
  SL.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  SL.randomSeed = () => (Math.random() * 2147483647) | 0;

  SL.ORDERS = [
    { id: 'random', name: 'Shuffled' },
    { id: 'reversed', name: 'Reversed' },
    { id: 'nearly', name: 'Nearly sorted' },
    { id: 'few', name: 'Few unique' },
    { id: 'sorted', name: 'Already sorted' }
  ];

  // Builds the starting array for a sort
  SL.makeArray = function (n, order, seed) {
    const rnd = SL.mulberry32(seed);
    const a = new Array(n);
    if (order === 'few') {
      const levels = Math.min(n, 8);
      for (let i = 0; i < n; i++) {
        a[i] = Math.max(1, Math.round(((Math.floor((i * levels) / n) + 1) / levels) * n));
      }
    } else {
      for (let i = 0; i < n; i++) a[i] = i + 1;
    }
    const swap = (i, j) => { const t = a[i]; a[i] = a[j]; a[j] = t; };
    if (order === 'random' || order === 'few') {
      for (let i = n - 1; i > 0; i--) swap(i, Math.floor(rnd() * (i + 1)));
    } else if (order === 'reversed') {
      a.reverse();
    } else if (order === 'nearly') {
      const swaps = Math.max(1, Math.round(n * 0.04));
      for (let k = 0; k < swaps; k++) {
        const i = Math.floor(rnd() * n);
        const j = Math.min(n - 1, i + 1 + Math.floor(rnd() * 6));
        swap(i, j);
      }
    }
    return a;
  };

  // Slider mappings (log scales feel better for speed and size)
  SL.speedFromSlider = (v) => Math.max(1, Math.round(Math.pow(10, (v / 1000) * 5)));
  SL.sliderFromSpeed = (sp) => Math.round((Math.log10(Math.max(1, sp)) / 5) * 1000);
  SL.nFromSlider = (v) => Math.round(8 * Math.pow(250, v / 100));
  SL.sliderFromN = (n) => (Math.log(Math.max(8, n) / 8) / Math.log(250)) * 100;

  SL.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  SL.fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  SL.fmtDur = (s) => {
    if (!isFinite(s)) return '--';
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  };
  SL.fmtSpeed = (sp) => SL.fmtInt(sp) + ' steps/s';

  SL.toast = function (msg, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(SL._toastTimer);
    SL._toastTimer = setTimeout(() => el.classList.remove('show'), ms || 3200);
  };

  SL.ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.5" height="14" rx="1.2"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.2"/></svg>',
    step: '<svg viewBox="0 0 24 24"><path d="M6 6.2v11.6a.9.9 0 0 0 1.4.75l8.6-5.8a.9.9 0 0 0 0-1.5L7.4 5.45A.9.9 0 0 0 6 6.2z"/><rect x="16.5" y="5" width="2.5" height="14" rx="1"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.4 4.95l1.85.77A6 6 0 1 0 12 6v3L7.5 5 12 1v3z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5l-1.8-1.8-4.1 4.1-1.4-1.4 4.1-4.1L16 3zM3 5.6 4.4 4.2 19.8 19.6 18.4 21 3 5.6zM14.7 16.1l1.4-1.4 3.1 3.1L21 16v5h-5l1.8-1.8-3.1-3.1zM3 17.6l5.3-5.3 1.4 1.4L4.4 19 3 17.6z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z"/></svg>'
  };
})(window.SL);
