// Draws the array in 12 styles (4 of them 3D), plus background and glow
(function (SL) {
  'use strict';

  const TAU = Math.PI * 2;

  SL.MODES = [
    { id: 'shape', name: 'Shape' },
    { id: 'wheel', name: 'Wheel' },
    { id: 'spiral', name: 'Spiral' },
    { id: 'bars', name: 'Bars' },
    { id: 'scatter', name: 'Scatter' },
    { id: 'ring', name: 'Ring' },
    { id: 'sunburst', name: 'Sunburst' },
    { id: 'tiles', name: 'Tiles' },
    { id: 'tower', name: 'Tower', group: '3D' },
    { id: 'blocks', name: 'Blocks', group: '3D' },
    { id: 'sphere', name: 'Sphere', group: '3D' },
    { id: 'helix', name: 'Helix', group: '3D' }
  ];

  // 3D styles: each item becomes a dot or a column in unit space, then gets tilted,
  // spun (if Spin is on), perspective-projected and painted far to near.
  function draw3d(ctx, mode, n, arr, maxV, col, cx, cy, R, look, time) {
    const yaw = 0.6 + (look.spin ? time * 0.5 : 0), cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cP = Math.cos(0.45), sP = Math.sin(0.45);
    const S = R * 0.72;
    const proj = (x, y, z) => {
      const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
      const y1 = y * cP + z1 * sP, z2 = z1 * cP - y * sP; // tilt so we look down from above
      const f = 3.2 / (3.2 + z2);
      return [cx + x1 * f * S, cy - y1 * f * S, z2, f];
    };
    const seg = mode === 'tower' || mode === 'blocks';
    const c = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / c);
    const A = new Array(n), B = seg ? new Array(n) : null;
    for (let k = 0; k < n; k++) {
      const v = arr[k] / maxV;
      const e = (arr[k] - (k + 1) * (maxV / n)) / maxV; // 0 when the item is in its sorted spot
      if (mode === 'tower') {
        const a = (k / n) * TAU;
        A[k] = proj(Math.cos(a) * 0.9, -0.7, Math.sin(a) * 0.9);
        B[k] = proj(Math.cos(a) * 0.9, -0.7 + 1.4 * v, Math.sin(a) * 0.9);
      } else if (mode === 'blocks') {
        const gx = (((k % c) + 0.5) / c * 2 - 1) * 0.9, gz = ((Math.floor(k / c) + 0.5) / rows * 2 - 1) * 0.9 * rows / c;
        A[k] = proj(gx, -0.6, gz);
        B[k] = proj(gx, -0.6 + 1.2 * v, gz);
      } else if (mode === 'sphere') {
        const yy = 1 - (2 * (k + 0.5)) / n, rr = Math.sqrt(1 - yy * yy), ph = k * 2.39996;
        const r = 0.85 + e * 0.6;
        A[k] = proj(Math.cos(ph) * rr * r, yy * r, Math.sin(ph) * rr * r);
      } else {
        const f = (k + 0.5) / n, a = f * 4 * TAU, r = 0.7 + e * 0.6;
        A[k] = proj(Math.cos(a) * r, -0.9 + 1.8 * f, Math.sin(a) * r);
      }
    }
    const order = Array.from({ length: n }, (_, k) => k);
    order.sort((i, j) => A[j][2] - A[i][2]);
    if (seg) {
      const w = mode === 'tower' ? (TAU * 0.9 * S) / n * 0.6 : ((1.8 * S) / c) * 0.6;
      ctx.lineCap = 'butt';
      for (const k of order) {
        ctx.strokeStyle = col(k);
        ctx.lineWidth = SL.clamp(w, 1, 14) * A[k][3];
        ctx.beginPath();
        ctx.moveTo(A[k][0], A[k][1]);
        ctx.lineTo(B[k][0], B[k][1] - 0.5);
        ctx.stroke();
      }
    } else {
      const d = mode === 'sphere' ? (S * 1.6) / Math.sqrt(n) : (4 * TAU * 0.7 * S) / n * 0.45;
      const dr = SL.clamp(d, 1.2, 8);
      for (const k of order) {
        ctx.fillStyle = col(k);
        ctx.beginPath();
        ctx.arc(A[k][0], A[k][1], dr * A[k][3], 0, TAU);
        ctx.fill();
      }
    }
  }

  SL.BACKGROUNDS = [
    { id: 'midnight', name: 'Midnight', css: 'radial-gradient(circle,#1a2a55,#04060c)' },
    { id: 'black', name: 'Black', css: '#000' },
    { id: 'ocean', name: 'Deep sea', css: 'linear-gradient(#03132b,#073a66)' },
    { id: 'dusk', name: 'Dusk', css: 'linear-gradient(135deg,#2a1150,#07040f)' },
    { id: 'ember', name: 'Ember', css: 'linear-gradient(135deg,#2a0d0d,#0a0505)' },
    { id: 'photo', name: 'My photo', css: null }
  ];

  // Highlight colours: 1 compare, 2 write, 3 final sweep
  const HL = [null, '#ffffff', '#ff4d6d', '#ffffff'];

  SL.glowSupported = (function () {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.filter = 'blur(2px)';
      return c.filter === 'blur(2px)';
    } catch (e) {
      return false;
    }
  })();

  const layers = new Map();
  function getLayer(w, h) {
    const k = w + 'x' + h;
    let L = layers.get(k);
    if (!L) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      L = { c, ctx: c.getContext('2d') };
      layers.set(k, L);
    }
    return L;
  }

  function drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height, r = w / h;
    let sw, sh, sx, sy;
    if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  SL.drawCover = drawCover;

  function drawBackground(ctx, W, H, look) {
    if (look.bg === 'photo' && look.photo) {
      drawCover(ctx, look.photo, 0, 0, W, H);
      ctx.fillStyle = 'rgba(4,6,12,0.55)';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    let g;
    switch (look.bg) {
      case 'black':
        g = '#000';
        break;
      case 'ocean':
        g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#03132b'); g.addColorStop(1, '#073a66');
        break;
      case 'dusk':
        g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#24104a'); g.addColorStop(1, '#07040f');
        break;
      case 'ember':
        g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#2a0d0d'); g.addColorStop(1, '#0a0505');
        break;
      default:
        g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, '#111c3a'); g.addColorStop(1, '#04060c');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Full frame: background, glow pass, sharp pass, then text overlay
  SL.renderFrame = function (ctx, W, H, look, drawLayer, overlay) {
    drawBackground(ctx, W, H, look);
    const L = getLayer(W, H);
    L.ctx.clearRect(0, 0, W, H);
    drawLayer(L.ctx);
    if (look.glow > 0 && SL.glowSupported) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, (look.glow / 100) * 0.7);
      ctx.filter = 'blur(' + Math.max(2, Math.round(Math.min(W, H) * 0.014 * (look.glow / 100))) + 'px)';
      ctx.drawImage(L.c, 0, 0);
      ctx.restore();
    }
    ctx.drawImage(L.c, 0, 0);
    if (overlay) overlay(ctx);
  };

  // Source picture for Tiles mode (your photo, or generated art)
  const tileCache = { key: null, c: null };
  function tileSource(look) {
    const usePhoto = look.tilePhoto && look.photo;
    const key = look.lut.key + '|' + (usePhoto ? look.photoKey : 'art');
    if (tileCache.key === key) return tileCache.c;
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    if (usePhoto) {
      drawCover(x, look.photo, 0, 0, S, S);
    } else {
      let g;
      if (x.createConicGradient) {
        g = x.createConicGradient(-Math.PI / 2, S / 2, S / 2);
        for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, look.lut.css[Math.round((i / 8) * 255)]);
      } else {
        g = x.createLinearGradient(0, 0, S, S);
        for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, look.lut.css[Math.round((i / 4) * 255)]);
      }
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
      const rg = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.72);
      rg.addColorStop(0, 'rgba(255,255,255,0.4)');
      rg.addColorStop(0.4, 'rgba(255,255,255,0)');
      rg.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = rg;
      x.fillRect(0, 0, S, S);
      x.strokeStyle = 'rgba(255,255,255,0.2)';
      x.lineWidth = 6;
      for (let r = 90; r < S * 0.75; r += 115) { x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.stroke(); }
    }
    tileCache.key = key;
    tileCache.c = c;
    return c;
  }

  // Draws one array inside rect
  SL.drawViz = function (ctx, rect, st, look, time) {
    const { x, y, w, h } = rect;
    const n = st.n, arr = st.arr, hl = st.hl, maxV = st.maxV;
    if (!n) return;
    const css = look.lut.css;
    const sz = look.size / 100;
    const cx = x + w / 2, cy = y + h / 2;
    const R = (Math.min(w, h) / 2) * 0.92 * sz;
    const rot = -Math.PI / 2 + (look.spin ? time * 0.25 : 0);
    const scale = maxV > 1 ? 255 / (maxV - 1) : 0;
    const col = (k) => (hl[k] ? HL[hl[k]] : css[Math.round((arr[k] - 1) * scale)]);

    switch (look.mode) {
      case 'bars': {
        const pad = w * 0.03;
        const bw = (w - 2 * pad) / n;
        const maxH = h * 0.92 * Math.min(1, sz);
        const base = y + h - (h - maxH) / 2;
        const gap = bw > 4 ? Math.max(1, bw * 0.18) : 0;
        const bx = x + pad + (w - 2 * pad) * (1 - Math.min(1, sz)) / 2;
        const bww = bw * Math.min(1, sz);
        for (let k = 0; k < n; k++) {
          const bh = (arr[k] / maxV) * maxH;
          ctx.fillStyle = col(k);
          ctx.fillRect(bx + k * bww, base - bh, bww - gap * Math.min(1, sz) + (gap ? 0 : 0.6), bh);
        }
        break;
      }
      case 'wheel': {
        const step = TAU / n;
        for (let k = 0; k < n; k++) {
          const a0 = rot + k * step;
          ctx.fillStyle = col(k);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, a0, a0 + step + 0.012);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'shape': {
        const step = TAU / n;
        for (let k = 0; k < n; k++) {
          const a0 = rot + k * step;
          const r = R * (0.12 + 0.88 * (arr[k] / maxV));
          ctx.fillStyle = col(k);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, a0, a0 + step + 0.012);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'sunburst': {
        const step = TAU / n;
        const r0 = R * 0.16;
        ctx.lineCap = 'round';
        ctx.lineWidth = SL.clamp(TAU * R * 0.55 / n * 0.6, 1, 7);
        const dot = ctx.lineWidth * 0.9 + 1;
        for (let k = 0; k < n; k++) {
          const a = rot + (k + 0.5) * step;
          const r = r0 + (R - r0) * (arr[k] / maxV);
          const c = col(k);
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.strokeStyle = c;
          ctx.beginPath();
          ctx.moveTo(cx + ca * r0, cy + sa * r0);
          ctx.lineTo(cx + ca * r, cy + sa * r);
          ctx.stroke();
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(cx + ca * r, cy + sa * r, dot, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'ring': {
        const step = TAU / n;
        const base = R * 0.72;
        const dr = SL.clamp((TAU * base) / n * 0.42, 1.3, 9);
        for (let k = 0; k < n; k++) {
          const a = rot + (k + 0.5) * step;
          const r = base + ((arr[k] - (k + 1) * (maxV / n)) / maxV) * R * 0.55;
          ctx.fillStyle = col(k);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dr, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'spiral': {
        const turns = 3.2;
        const len = turns * TAU * R * 0.56;
        const dr = SL.clamp((len / n) * 0.45, 1.2, 9);
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n;
          const a = rot + f * turns * TAU;
          const r = R * (0.1 + 0.86 * f) + ((arr[k] - (k + 1) * (maxV / n)) / maxV) * R * 0.35;
          ctx.fillStyle = col(k);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dr, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'scatter': {
        const side = Math.min(w, h) * 0.9 * sz;
        const ox = cx - side / 2, oy = cy + side / 2;
        const dr = SL.clamp((side / n) * 0.5, 1.3, 7);
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = col(k);
          ctx.beginPath();
          ctx.arc(ox + ((k + 0.5) / n) * side, oy - (arr[k] / maxV) * side, dr, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'tiles': {
        const src = tileSource(look);
        const side = Math.min(w, h) * 0.92 * sz;
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const tile = side / cols;
        const ox = cx - side / 2, oy = cy - (rows * tile) / 2;
        const sw = src.width / cols;
        const flat = n > 1 && maxV !== n;
        for (let k = 0; k < n; k++) {
          let s = Math.round(((arr[k] - 1) / Math.max(1, maxV - 1)) * (n - 1));
          if (!flat) s = arr[k] - 1;
          s = SL.clamp(s, 0, n - 1);
          const dx = ox + (k % cols) * tile, dy = oy + Math.floor(k / cols) * tile;
          ctx.drawImage(src, (s % cols) * sw, Math.floor(s / cols) * sw, sw, sw, dx, dy, tile + 0.6, tile + 0.6);
          if (hl[k]) {
            ctx.fillStyle = hl[k] === 2 ? 'rgba(255,77,109,0.55)' : 'rgba(255,255,255,0.55)';
            ctx.fillRect(dx, dy, tile, tile);
          }
        }
        break;
      }
      case 'tower':
      case 'blocks':
      case 'sphere':
      case 'helix':
        draw3d(ctx, look.mode, n, arr, maxV, col, cx, cy, R, look, time);
        break;
    }
  };
})(window.SL);
