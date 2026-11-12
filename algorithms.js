// Sorting algorithms. Each one runs on a Tracker that records every step,
// so the full step count is known before anything is drawn.
(function (SL) {
  'use strict';

  const OP = { CMP: 0, SWAP: 1, SET: 2, READ: 3 };
  SL.OP = OP;

  const STEP_LIMIT = 3000000;
  const BOGO_LIMIT = 120000;

  class LimitError extends Error {}

  class Tracker {
    constructor(arr, limit, seed) {
      this.a = arr.slice();
      this.n = arr.length;
      this.buf = new Int32Array(3 * 8192);
      this.len = 0;
      this.limit = limit;
      this.cmps = 0;
      this.writes = 0;
      this.gaveUp = false;
      this.rnd = SL.mulberry32((seed ^ 0x9e3779b9) >>> 0);
    }
    push(t, x, y) {
      if (this.len >= this.limit) throw new LimitError('limit');
      const k = this.len * 3;
      if (k + 3 > this.buf.length) {
        const nb = new Int32Array(this.buf.length * 2);
        nb.set(this.buf);
        this.buf = nb;
      }
      this.buf[k] = t;
      this.buf[k + 1] = x;
      this.buf[k + 2] = y;
      this.len++;
    }
    cmp(i, j) { this.push(OP.CMP, i, j); this.cmps++; return this.a[i] - this.a[j]; }
    cmpv(x, y, i, j) { this.push(OP.CMP, i, j); this.cmps++; return x - y; }
    swap(i, j) {
      if (i === j) return;
      this.push(OP.SWAP, i, j);
      this.writes += 2;
      const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t;
    }
    set(i, v) { this.push(OP.SET, i, v); this.writes++; this.a[i] = v; }
    read(i) { this.push(OP.READ, i, 0); return this.a[i]; }
    get(i) { return this.a[i]; }
  }

  // ---------- shared pieces ----------

  function insertionRange(t, lo, hi) {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i;
      while (j > lo && t.cmp(j - 1, j) > 0) { t.swap(j - 1, j); j--; }
    }
  }

  function mergeRange(t, aux, lo, m, hi) {
    for (let k = lo; k <= hi; k++) aux[k] = t.get(k);
    let i = lo, j = m + 1;
    for (let k = lo; k <= hi; k++) {
      if (i > m) t.set(k, aux[j++]);
      else if (j > hi) t.set(k, aux[i++]);
      else if (t.cmpv(aux[j], aux[i], j, i) < 0) t.set(k, aux[j++]);
      else t.set(k, aux[i++]);
    }
  }

  // ---------- fast ----------

  function quick(t) {
    const st = [0, t.n - 1];
    while (st.length) {
      const hi = st.pop(), lo = st.pop();
      if (lo >= hi) continue;
      t.swap((lo + hi) >> 1, hi);
      let p = lo;
      for (let i = lo; i < hi; i++) {
        if (t.cmp(i, hi) < 0) { t.swap(i, p); p++; }
      }
      t.swap(p, hi);
      st.push(lo, p - 1, p + 1, hi);
    }
  }

  function merge(t) {
    const aux = new Array(t.n);
    (function ms(lo, hi) {
      if (hi <= lo) return;
      const m = (lo + hi) >> 1;
      ms(lo, m);
      ms(m + 1, hi);
      mergeRange(t, aux, lo, m, hi);
    })(0, t.n - 1);
  }

  function heap(t) {
    const n = t.n;
    function sift(i, size) {
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < size && t.cmp(l, m) > 0) m = l;
        if (r < size && t.cmp(r, m) > 0) m = r;
        if (m === i) return;
        t.swap(i, m);
        i = m;
      }
    }
    for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
    for (let e = n - 1; e > 0; e--) { t.swap(0, e); sift(0, e); }
  }

  function tim(t) {
    const n = t.n, RUN = 32;
    for (let lo = 0; lo < n; lo += RUN) insertionRange(t, lo, Math.min(lo + RUN - 1, n - 1));
    const aux = new Array(n);
    for (let size = RUN; size < n; size *= 2) {
      for (let lo = 0; lo < n - size; lo += 2 * size) {
        const m = lo + size - 1;
        const hi = Math.min(lo + 2 * size - 1, n - 1);
        if (t.cmp(m, m + 1) > 0) mergeRange(t, aux, lo, m, hi);
      }
    }
  }

  function shell(t) {
    const n = t.n;
    const gaps = [1, 4, 10, 23, 57, 132, 301, 701];
    while (gaps[gaps.length - 1] * 2.25 < n) gaps.push(Math.floor(gaps[gaps.length - 1] * 2.25));
    for (let g = gaps.length - 1; g >= 0; g--) {
      const gap = gaps[g];
      if (gap >= n) continue;
      for (let i = gap; i < n; i++) {
        let j = i;
        while (j >= gap && t.cmp(j - gap, j) > 0) { t.swap(j - gap, j); j -= gap; }
      }
    }
  }

  function comb(t) {
    const n = t.n;
    let gap = n, sorted = false;
    while (!sorted) {
      gap = Math.floor(gap / 1.3);
      if (gap <= 1) { gap = 1; sorted = true; }
      for (let i = 0; i + gap < n; i++) {
        if (t.cmp(i, i + gap) > 0) { t.swap(i, i + gap); sorted = false; }
      }
    }
  }

  function bitonic(t) {
    const pow2Below = (n) => { let k = 1; while (k < n) k <<= 1; return k >> 1; };
    function cs(i, j, up) {
      const c = t.cmp(i, j);
      if (up ? c > 0 : c < 0) t.swap(i, j);
    }
    function bmerge(lo, n, up) {
      if (n <= 1) return;
      const m = pow2Below(n);
      for (let i = lo; i < lo + n - m; i++) cs(i, i + m, up);
      bmerge(lo, m, up);
      bmerge(lo + m, n - m, up);
    }
    function bsort(lo, n, up) {
      if (n <= 1) return;
      const m = n >> 1;
      bsort(lo, m, !up);
      bsort(lo + m, n - m, up);
      bmerge(lo, n, up);
    }
    bsort(0, t.n, true);
  }

  // ---------- slow and simple ----------

  function insertion(t) { insertionRange(t, 0, t.n - 1); }

  function selection(t) {
    const n = t.n;
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) if (t.cmp(j, m) < 0) m = j;
      t.swap(i, m);
    }
  }

  function bubble(t) {
    for (let end = t.n - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) {
        if (t.cmp(i, i + 1) > 0) { t.swap(i, i + 1); swapped = true; }
      }
      if (!swapped) break;
    }
  }

  function cocktail(t) {
    let lo = 0, hi = t.n - 1;
    while (lo < hi) {
      let swapped = false;
      for (let i = lo; i < hi; i++) if (t.cmp(i, i + 1) > 0) { t.swap(i, i + 1); swapped = true; }
      hi--;
      for (let i = hi; i > lo; i--) if (t.cmp(i - 1, i) > 0) { t.swap(i - 1, i); swapped = true; }
      lo++;
      if (!swapped) break;
    }
  }

  function gnome(t) {
    let i = 0;
    while (i < t.n) {
      if (i === 0 || t.cmp(i - 1, i) <= 0) i++;
      else { t.swap(i - 1, i); i--; }
    }
  }

  function oddeven(t) {
    const n = t.n;
    let sorted = false;
    while (!sorted) {
      sorted = true;
      for (let i = 1; i < n - 1; i += 2) if (t.cmp(i, i + 1) > 0) { t.swap(i, i + 1); sorted = false; }
      for (let i = 0; i < n - 1; i += 2) if (t.cmp(i, i + 1) > 0) { t.swap(i, i + 1); sorted = false; }
    }
  }

  function cycle(t) {
    const n = t.n;
    for (let cs = 0; cs < n - 1; cs++) {
      let item = t.read(cs);
      let pos = cs;
      for (let i = cs + 1; i < n; i++) if (t.cmpv(t.get(i), item, i, cs) < 0) pos++;
      if (pos === cs) continue;
      while (item === t.get(pos)) pos++;
      let tmp = t.get(pos); t.set(pos, item); item = tmp;
      while (pos !== cs) {
        pos = cs;
        for (let i = cs + 1; i < n; i++) if (t.cmpv(t.get(i), item, i, cs) < 0) pos++;
        while (item === t.get(pos)) pos++;
        tmp = t.get(pos); t.set(pos, item); item = tmp;
      }
    }
  }

  function pancake(t) {
    function flip(k) { let i = 0; while (i < k) { t.swap(i, k); i++; k--; } }
    for (let size = t.n; size > 1; size--) {
      let mi = 0;
      for (let i = 1; i < size; i++) if (t.cmp(i, mi) > 0) mi = i;
      if (mi !== size - 1) {
        if (mi > 0) flip(mi);
        flip(size - 1);
      }
    }
  }

  // ---------- no comparing ----------

  function radix(t) {
    const n = t.n;
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, t.read(i));
    for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
      const vals = new Array(n), out = new Array(n), cnt = new Array(10).fill(0);
      for (let i = 0; i < n; i++) { vals[i] = t.read(i); cnt[Math.floor(vals[i] / exp) % 10]++; }
      for (let d = 1; d < 10; d++) cnt[d] += cnt[d - 1];
      for (let i = n - 1; i >= 0; i--) out[--cnt[Math.floor(vals[i] / exp) % 10]] = vals[i];
      for (let i = 0; i < n; i++) t.set(i, out[i]);
    }
  }

  function counting(t) {
    const n = t.n;
    let max = 0;
    const vals = new Array(n);
    for (let i = 0; i < n; i++) { vals[i] = t.read(i); if (vals[i] > max) max = vals[i]; }
    const cnt = new Array(max + 1).fill(0);
    for (const v of vals) cnt[v]++;
    let k = 0;
    for (let v = 0; v <= max; v++) while (cnt[v]-- > 0) t.set(k++, v);
  }

  function bucket(t) {
    const n = t.n;
    const vals = new Array(n);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) { vals[i] = t.read(i); min = Math.min(min, vals[i]); max = Math.max(max, vals[i]); }
    const B = Math.max(1, Math.round(Math.sqrt(n)));
    const buckets = Array.from({ length: B }, () => []);
    for (const v of vals) buckets[Math.min(B - 1, Math.floor(((v - min) / (max - min + 1)) * B))].push(v);
    let k = 0;
    const ranges = [];
    for (const b of buckets) {
      const start = k;
      for (const v of b) t.set(k++, v);
      if (k - start > 1) ranges.push([start, k - 1]);
    }
    for (const [lo, hi] of ranges) insertionRange(t, lo, hi);
  }

  function gravity(t) {
    const n = t.n;
    const a0 = new Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) { a0[i] = t.read(i); if (a0[i] > max) max = a0[i]; }
    const ge = new Array(max + 2).fill(0);
    for (const v of a0) ge[v]++;
    for (let l = max - 1; l >= 0; l--) ge[l] += ge[l + 1];
    const dropped = new Array(n).fill(0);
    const cur = a0.slice();
    const stride = Math.max(1, Math.ceil(max / 48));
    let L = 0;
    while (L < max) {
      const next = Math.min(max, L + stride);
      for (let l = L + 1; l <= next; l++) {
        const from = n - ge[l];
        for (let i = from; i < n; i++) dropped[i]++;
      }
      L = next;
      for (let i = 0; i < n; i++) {
        const v = dropped[i] + Math.max(0, a0[i] - L);
        if (v !== cur[i]) { cur[i] = v; t.set(i, v); }
      }
    }
  }

  // ---------- just for fun ----------

  function bogo(t) {
    const n = t.n;
    const isSorted = () => { for (let i = 0; i < n - 1; i++) if (t.cmp(i, i + 1) > 0) return false; return true; };
    while (!isSorted()) {
      if (t.len > BOGO_LIMIT) { t.gaveUp = true; return; }
      for (let i = n - 1; i > 0; i--) t.swap(i, Math.floor(t.rnd() * (i + 1)));
    }
  }

  function stooge(t) {
    (function s(i, j) {
      if (t.cmp(i, j) > 0) t.swap(i, j);
      if (j - i + 1 > 2) {
        const k = Math.floor((j - i + 1) / 3);
        s(i, j - k);
        s(i + k, j);
        s(i, j - k);
      }
    })(0, t.n - 1);
  }

  // Shuffles only the items that are still in the wrong spot, and keeps the rest
  function keepbogo(t) {
    const n = t.n;
    const target = t.a.slice().sort((x, y) => x - y);
    let free = [];
    for (let i = 0; i < n; i++) if (t.cmpv(t.get(i), target[i], i, i) !== 0) free.push(i);
    while (free.length) {
      for (let k = free.length - 1; k > 0; k--) t.swap(free[k], free[Math.floor(t.rnd() * (k + 1))]);
      free = free.filter((i) => t.cmpv(t.get(i), target[i], i, i) !== 0);
    }
  }

  SL.ALGO_GROUPS = ['Fast', 'Slow and simple', 'No comparing', 'Just for fun'];

  SL.ALGOS = [
    { id: 'quick', name: 'Quick Sort', group: 'Fast', cx: 'O(n log n)', fn: quick },
    { id: 'merge', name: 'Merge Sort', group: 'Fast', cx: 'O(n log n)', fn: merge },
    { id: 'heap', name: 'Heap Sort', group: 'Fast', cx: 'O(n log n)', fn: heap },
    { id: 'tim', name: 'Tim Sort', group: 'Fast', cx: 'O(n log n)', fn: tim },
    { id: 'shell', name: 'Shell Sort', group: 'Fast', cx: 'O(n^1.3)', fn: shell },
    { id: 'comb', name: 'Comb Sort', group: 'Fast', cx: 'O(n log n)', fn: comb },
    { id: 'bitonic', name: 'Bitonic Sort', group: 'Fast', cx: 'O(n log² n)', fn: bitonic },
    { id: 'insertion', name: 'Insertion Sort', group: 'Slow and simple', cx: 'O(n²)', fn: insertion },
    { id: 'selection', name: 'Selection Sort', group: 'Slow and simple', cx: 'O(n²)', fn: selection },
    { id: 'bubble', name: 'Bubble Sort', group: 'Slow and simple', cx: 'O(n²)', fn: bubble },
    { id: 'cocktail', name: 'Cocktail Shaker Sort', group: 'Slow and simple', cx: 'O(n²)', fn: cocktail },
    { id: 'gnome', name: 'Gnome Sort', group: 'Slow and simple', cx: 'O(n²)', fn: gnome },
    { id: 'oddeven', name: 'Odd-Even Sort', group: 'Slow and simple', cx: 'O(n²)', fn: oddeven },
    { id: 'cycle', name: 'Cycle Sort', group: 'Slow and simple', cx: 'O(n²)', fn: cycle },
    { id: 'pancake', name: 'Pancake Sort', group: 'Slow and simple', cx: 'O(n²)', fn: pancake },
    { id: 'radix', name: 'Radix Sort', group: 'No comparing', cx: 'O(n·k)', fn: radix },
    { id: 'counting', name: 'Counting Sort', group: 'No comparing', cx: 'O(n + k)', fn: counting },
    { id: 'bucket', name: 'Bucket Sort', group: 'No comparing', cx: 'O(n + k)', fn: bucket },
    { id: 'gravity', name: 'Gravity Sort', group: 'No comparing', cx: 'O(S)', fn: gravity },
    { id: 'bogo', name: 'Bogo Sort', group: 'Just for fun', cx: 'O(n·n!)', fn: bogo },
    { id: 'stooge', name: 'Stooge Sort', group: 'Just for fun', cx: 'O(n^2.71)', fn: stooge },
    { id: 'keepbogo', name: 'Keep Bogo Sort', group: 'Just for fun', cx: 'O(n²)', fn: keepbogo }
  ];

  SL.algoById = (id) => SL.ALGOS.find((a) => a.id === id) || SL.ALGOS[0];

  SL.algoOptionsHTML = function (selected) {
    return SL.ALGO_GROUPS.map((g) =>
      '<optgroup label="' + g + '">' +
      SL.ALGOS.filter((a) => a.group === g)
        .map((a) => '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + a.name + '</option>')
        .join('') +
      '</optgroup>'
    ).join('');
  };

  // Runs a sort on a copy of arr and returns every recorded step
  SL.runSort = function (id, arr, seed) {
    const algo = SL.algoById(id);
    const t = new Tracker(arr, STEP_LIMIT, seed || 1);
    let error = null;
    try {
      if (arr.length > 1) algo.fn(t);
    } catch (e) {
      if (e instanceof LimitError) {
        error = algo.name + ' needs more than ' + SL.fmtInt(STEP_LIMIT) + ' steps for ' + arr.length + ' items. Try fewer items.';
      } else {
        throw e;
      }
    }
    return { id: algo.id, ops: t.buf, count: t.len, cmps: t.cmps, writes: t.writes, gaveUp: t.gaveUp, error, final: t.a };
  };
})(window.SL);
