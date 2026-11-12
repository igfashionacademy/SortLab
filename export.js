// Frame-exact MP4 export. Every frame and every sound gets an exact timestamp,
// so picture and sound always line up. Uses the browser's built-in encoders
// (WebCodecs) and a small MP4 writer.
(function (SL) {
  'use strict';

  const VIDEO_CODECS = ['avc1.64002A', 'avc1.640028', 'avc1.4D402A', 'avc1.4D4028', 'avc1.42E02A', 'avc1.42E028'];

  async function pickVideoConfig(width, height, fps) {
    if (!window.VideoEncoder) return null;
    for (const codec of VIDEO_CODECS) {
      const cfg = { codec, width, height, framerate: fps, bitrate: 12000000, avc: { format: 'avc' }, latencyMode: 'quality' };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return r.config || cfg;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // AAC first (works everywhere), Opus as a backup
  async function pickAudioConfig(sampleRate) {
    if (!window.AudioEncoder) return null;
    for (const codec of ['mp4a.40.2', 'opus']) {
      if (codec === 'opus' && sampleRate !== 48000) continue;
      const cfg = { codec, sampleRate, numberOfChannels: 1, bitrate: codec === 'opus' ? 160000 : 192000 };
      try {
        const r = await AudioEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // Can this browser export frame-exact? (needsAudio: whether sound is on)
  SL.canExactExport = async function (width, height, fps, needsAudio, sampleRate) {
    const v = await pickVideoConfig(width, height, fps);
    if (!v) return false;
    if (!needsAudio) return true;
    return !!(await pickAudioConfig(sampleRate || 48000));
  };

  /**
   * opts: { canvas, fps, total (seconds), drawFrame(T), audioBuffer, volume, onProgress(frac), isCancelled() }
   * returns a Blob (video/mp4), or null if cancelled
   */
  SL.exportMP4 = async function (opts) {
    const { canvas, fps, total, drawFrame, audioBuffer, onProgress, isCancelled } = opts;
    const width = canvas.width, height = canvas.height;
    const vcfg = await pickVideoConfig(width, height, fps);
    if (!vcfg) throw new Error('no video encoder');

    const vSamples = [];
    let avcC = null, encError = null;
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description && !avcC) {
          avcC = new Uint8Array(meta.decoderConfig.description.buffer || meta.decoderConfig.description).slice();
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        vSamples.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
      },
      error: (e) => { encError = e; }
    });
    venc.configure(vcfg);

    const frames = Math.max(1, Math.ceil(total * fps));
    const frameUs = 1e6 / fps;
    for (let k = 0; k < frames; k++) {
      if (isCancelled && isCancelled()) { try { venc.close(); } catch (e) { /* ignore */ } return null; }
      if (encError) throw encError;
      drawFrame(Math.min(total - 0.0001, k / fps));
      const vf = new VideoFrame(canvas, { timestamp: Math.round(k * frameUs), duration: Math.round(frameUs) });
      venc.encode(vf, { keyFrame: k % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 1));
      if (k % 10 === 0) {
        if (onProgress) onProgress((k / frames) * 0.95);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await venc.flush();
    venc.close();
    if (encError) throw encError;

    // ---- audio ----
    let aSamples = [], asc = null, aRate = 0, aCodec = null;
    if (audioBuffer) {
      aRate = audioBuffer.sampleRate;
      const acfg = await pickAudioConfig(aRate);
      if (acfg) {
        aCodec = acfg.codec;
        const aenc = new AudioEncoder({
          output: (chunk, meta) => {
            if (meta && meta.decoderConfig && meta.decoderConfig.description && !asc) {
              asc = new Uint8Array(meta.decoderConfig.description.buffer || meta.decoderConfig.description).slice();
            }
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            aSamples.push({ data, ts: chunk.timestamp, dur: chunk.duration });
          },
          error: (e) => { encError = e; }
        });
        aenc.configure(acfg);
        const src = audioBuffer.getChannelData(0);
        const len = Math.min(src.length, Math.ceil((frames / fps) * aRate));
        const vol = opts.volume == null ? 1 : opts.volume;
        const BLOCK = 4096;
        for (let i = 0; i < len; i += BLOCK) {
          const n = Math.min(BLOCK, len - i);
          const d = new Float32Array(n);
          for (let j = 0; j < n; j++) d[j] = src[i + j] * vol;
          const ad = new AudioData({ format: 'f32-planar', sampleRate: aRate, numberOfFrames: n, numberOfChannels: 1, timestamp: Math.round((i / aRate) * 1e6), data: d });
          aenc.encode(ad);
          ad.close();
        }
        await aenc.flush();
        aenc.close();
        if (encError) throw encError;
        if (!asc && aCodec === 'mp4a.40.2') asc = makeASC(aRate, 1);
      }
    }
    if (onProgress) onProgress(1);

    return new Blob([muxMP4({ width, height, fps, vSamples, avcC, aSamples, asc, aRate, aCodec })], { type: 'video/mp4' });
  };

  // AudioSpecificConfig for AAC-LC when the encoder doesn't give one
  function makeASC(rate, ch) {
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    const fi = Math.max(0, rates.indexOf(rate));
    return new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)]);
  }

  // ---------- tiny MP4 writer ----------

  function u8(...a) { return new Uint8Array(a); }
  function u16(v) { return u8((v >> 8) & 255, v & 255); }
  function u32(v) { return u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  function str(s) { return new Uint8Array([...s].map((c) => c.charCodeAt(0))); }
  function zeros(n) { return new Uint8Array(n); }
  function cat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function box(type, ...parts) {
    const body = cat(parts);
    return cat([u32(body.length + 8), str(type), body]);
  }
  function full(type, version, flags, ...parts) {
    return box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
  }
  const MATRIX = cat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  function sttsFrom(durs) {
    const runs = [];
    for (const d of durs) {
      if (runs.length && runs[runs.length - 1][1] === d) runs[runs.length - 1][0]++;
      else runs.push([1, d]);
    }
    return full('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => cat([u32(c), u32(d)])));
  }

  function trak(t, offsets) {
    const isV = t.kind === 'video';
    const sizes = t.samples.map((s) => s.data.length);
    const stsd = isV
      ? full('stsd', 0, 0, u32(1), box('avc1',
          zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(t.width), u16(t.height),
          u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff),
          box('avcC', t.avcC)))
      : t.codec === 'opus'
        ? full('stsd', 0, 0, u32(1), box('Opus',
            zeros(6), u16(1), zeros(8), u16(1), u16(16), u16(0), u16(0), u32(t.rate * 65536),
            box('dOps', u8(0, 1), u16(312), u32(48000), u16(0), u8(0))))
        : full('stsd', 0, 0, u32(1), box('mp4a',
            zeros(6), u16(1), zeros(8), u16(1), u16(16), u16(0), u16(0), u32(t.rate * 65536),
            esds(t.asc)));
    const stblParts = [
      stsd,
      sttsFrom(t.durs),
      full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(u32)),
      full('stco', 0, 0, u32(offsets.length), ...offsets.map(u32))
    ];
    if (isV) {
      const keys = [];
      t.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
      stblParts.splice(2, 0, full('stss', 0, 0, u32(keys.length), ...keys.map(u32)));
    }
    const mediaDur = t.durs.reduce((a, b) => a + b, 0);
    const movieDur = Math.round((mediaDur / t.timescale) * 1000);
    return box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(movieDur), zeros(8), u16(0), u16(0),
        u16(isV ? 0 : 0x0100), u16(0), MATRIX, u32(isV ? t.width * 65536 : 0), u32(isV ? t.height * 65536 : 0)),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(mediaDur), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), zeros(12), str(isV ? 'VideoHandler' : 'SoundHandler'), u8(0)),
        box('minf',
          isV ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, zeros(4)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl', ...stblParts))));
  }

  function esds(asc) {
    const dsi = cat([u8(0x05, asc.length), asc]);
    const dcd = cat([u8(0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0), u32(192000), u32(192000), dsi]);
    const sl = u8(0x06, 1, 2);
    const es = cat([u8(0x03, 3 + dcd.length + sl.length), u16(1), u8(0), dcd, sl]);
    return full('esds', 0, 0, es);
  }

  function muxMP4({ width, height, fps, vSamples, avcC, aSamples, asc, aRate, aCodec }) {
    vSamples.sort((a, b) => a.ts - b.ts);
    const VTS = 6000;
    const vDelta = Math.round(VTS / fps);
    const tracks = [{ kind: 'video', id: 1, width, height, avcC, timescale: VTS, samples: vSamples, durs: vSamples.map(() => vDelta) }];
    if (aSamples.length && (asc || aCodec === 'opus')) {
      aSamples.sort((a, b) => a.ts - b.ts);
      const opus = aCodec === 'opus';
      const durs = aSamples.map((x) => (opus ? Math.max(1, Math.round(((x.dur || 20000) * aRate) / 1e6)) : 1024));
      tracks.push({ kind: 'audio', id: 2, codec: opus ? 'opus' : 'aac', rate: aRate, asc, timescale: aRate, samples: aSamples, durs });
    }

    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'), str('Opus'));
    const movieDur = Math.round((vSamples.length / fps) * 1000);

    const build = (offsetsList) => box('moov',
      full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1)),
      ...tracks.map((t, i) => trak(t, offsetsList[i])));

    // first pass to learn the moov size, then real offsets
    const dummy = tracks.map((t) => t.samples.map(() => 0));
    const moovSize = build(dummy).length;
    let pos = ftyp.length + moovSize + 8;
    const offsets = tracks.map((t) => t.samples.map((s) => { const o = pos; pos += s.data.length; return o; }));
    const moov = build(offsets);
    const mdatBody = cat(tracks.flatMap((t) => t.samples.map((s) => s.data)));
    return cat([ftyp, moov, u32(mdatBody.length + 8), str('mdat'), mdatBody]);
  }
})(window.SL);
