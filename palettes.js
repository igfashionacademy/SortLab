// Colour palettes turned into 256-step lookup tables
(function (SL) {
  'use strict';

  SL.PALETTES = [
    { id: 'rainbow', name: 'Rainbow', stops: null },
    { id: 'sunset', name: 'Sunset', stops: ['#2b1055', '#d53369', '#ff8c42', '#ffd166'] },
    { id: 'ocean', name: 'Ocean', stops: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef'] },
    { id: 'neon', name: 'Neon', stops: ['#ff00e5', '#7a00ff', '#00e5ff', '#39ff14'] },
    { id: 'fire', name: 'Fire', stops: ['#4a0000', '#c1121f', '#ff7b00', '#ffe066'] },
    { id: 'aurora', name: 'Aurora', stops: ['#00ffa3', '#00c2ff', '#7b2ff7', '#f107a3'] },
    { id: 'candy', name: 'Candy', stops: ['#ff7ac6', '#ffc2e2', '#8fe3e0', '#b4f8c8'] },
    { id: 'forest', name: 'Forest', stops: ['#0b3d20', '#2d6a4f', '#74c69d', '#d8f3dc'] },
    { id: 'ice', name: 'Ice', stops: ['#1b2a6b', '#3d7bd9', '#9ad1f5', '#e0fbfc'] },
    { id: 'shark', name: 'Deep blue', stops: ['#0a1020', '#1e3a8a', '#3b82f6', '#bfdbfe'] },
    { id: 'mono', name: 'Mono', stops: ['#2e2e2e', '#ffffff'] },
    { id: 'custom', name: 'Custom', stops: null }
  ];

  function hexToRgb(h) {
    h = String(h || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const v = parseInt(h, 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function hslToRgb(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }

  const cache = new Map();

  SL.makeLUT = function (id, custom) {
    const key = id + (id === 'custom' ? ':' + (custom || []).join(',') : '');
    if (cache.has(key)) return cache.get(key);
    const css = new Array(256), rgb = new Array(256);
    if (id === 'rainbow' || !SL.PALETTES.some((p) => p.id === id)) {
      for (let i = 0; i < 256; i++) rgb[i] = hslToRgb((i / 255) * 0.83, 0.9, 0.58);
    } else {
      const stops = (id === 'custom' ? custom : SL.PALETTES.find((p) => p.id === id).stops).map(hexToRgb);
      for (let i = 0; i < 256; i++) {
        const f = (i / 255) * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(f));
        const t = f - k;
        const a = stops[k], b = stops[k + 1] || a;
        rgb[i] = [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t));
      }
    }
    for (let i = 0; i < 256; i++) css[i] = 'rgb(' + rgb[i].join(',') + ')';
    const lut = { css, rgb, key };
    cache.set(key, lut);
    return lut;
  };

  // CSS gradient for palette swatches in the UI
  SL.paletteCSS = function (id, custom) {
    const lut = SL.makeLUT(id, custom);
    const pts = [0, 51, 102, 153, 204, 255].map((i) => lut.css[i]);
    return 'linear-gradient(90deg,' + pts.join(',') + ')';
  };
})(window.SL);
