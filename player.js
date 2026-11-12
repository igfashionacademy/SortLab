// Plays back recorded steps onto a display array
(function (SL) {
  'use strict';

  SL.SWEEP_SEC = 1.2;

  class Player {
    constructor() {
      this.n = 0;
      this.arr = [];
      this.hl = new Uint8Array(0);
      this.hlList = [];
    }

    load(initial, result) {
      this.arr = initial.slice();
      this.n = initial.length;
      let m = 1;
      for (let i = 0; i < this.n; i++) if (this.arr[i] > m) m = this.arr[i];
      this.maxV = m;
      this.result = result;
      this.ops = result.ops;
      this.total = result.count;
      this.pos = 0;
      this.cmps = 0;
      this.writes = 0;
      this.hl = new Uint8Array(this.n);
      this.hlList = [];
      this.noteIdx = -1;
      this.sweepIdx = -1;
    }

    clearHL() {
      for (let k = 0; k < this.hlList.length; k++) this.hl[this.hlList[k]] = 0;
      this.hlList.length = 0;
    }

    mark(i, v) {
      if (i < 0 || i >= this.n) return;
      if (!this.hl[i]) this.hlList.push(i);
      this.hl[i] = v;
    }

    // Applies steps forward until target; returns how many were applied
    stepTo(target) {
      if (target > this.total) target = this.total;
      if (target <= this.pos) return 0;
      const ops = this.ops, a = this.arr;
      const applied = target - this.pos;
      const markFrom = Math.max(this.pos, target - 12);
      let note = -1;
      this.clearHL();
      for (let p = this.pos; p < target; p++) {
        const k = p * 3, t = ops[k], x = ops[k + 1], y = ops[k + 2];
        if (t === 0) {
          this.cmps++;
          if (p >= markFrom) { this.mark(x, 1); this.mark(y, 1); }
          note = x;
        } else if (t === 1) {
          const tmp = a[x]; a[x] = a[y]; a[y] = tmp;
          this.writes += 2;
          if (p >= markFrom) { this.mark(x, 2); this.mark(y, 2); }
          note = y;
        } else if (t === 2) {
          a[x] = y;
          this.writes++;
          if (p >= markFrom) this.mark(x, 2);
          note = x;
        } else {
          if (p >= markFrom) this.mark(x, 1);
          note = x;
        }
      }
      this.pos = target;
      this.noteIdx = note;
      return applied;
    }

    // Final "check" sweep across the sorted array; frac < 0 clears it
    setSweep(frac) {
      this.clearHL();
      if (frac < 0 || frac >= 1) { this.sweepIdx = -1; return false; }
      const idx = Math.min(this.n - 1, Math.floor(frac * this.n));
      const w = Math.max(1, Math.ceil(this.n / 40));
      for (let i = Math.max(0, idx - w); i <= idx; i++) this.mark(i, 3);
      const changed = idx !== this.sweepIdx;
      this.sweepIdx = idx;
      this.noteIdx = idx;
      return changed;
    }

    get done() { return this.pos >= this.total; }
    get progress() { return this.total ? this.pos / this.total : 1; }

    noteValue() {
      return this.noteIdx >= 0 ? this.arr[this.noteIdx] / this.maxV : -1;
    }

    view() {
      return { arr: this.arr, n: this.n, maxV: this.maxV, hl: this.hl };
    }
  }

  SL.Player = Player;
})(window.SL);
