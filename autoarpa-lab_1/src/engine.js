/* Motor de acordes: conjuntos sonoros, métrica de parecido, búsqueda, identificación y cobertura.
   Modelo físico (ver docs/LOGICA.md):
   - Barras presionadas => máscara efectiva = AND de máscaras (intersección).
   - Presionar una barra apaga al instante las cuerdas que ya vibraban y que esa barra cubre con fieltro.
   - Soltar las barras no apaga nada: lo que vibra sigue sonando.
   Por eso la única forma física de AGREGAR notas a un acorde es: rasguear con barras, soltar y
   pulsar cuerdas sueltas ("pinch"). Cambiar de barra a media ejecución NO produce la unión. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};
  const T = AH.theory;

  const CFG = {
    wFunctional: 0.65, wChroma: 0.35,
    foreignHarsh: 0.30, foreignSoft: 0.18,
    bassInversion: 0.06, bassForeign: 0.15,
    costButton: 0.035, costPinch: 0.04, costRange: 0.02, costThin: 0.12, costReach: 0.02,
    minStrings: 3, maxButtons: 3, maxPinches: 2, pinchWeight: 0.5, pinchCap: 0.97, costInversion: 0.03,
    harmonics: [[0, 1], [7, 0.3], [4, 0.15]]
  };

  /* Zonas de rasgueo (índices 0-based, inclusivos) sobre 36 cuerdas; se escalan si hay otra cantidad. */
  const WINDOWS = [
    { id: 'full', name: 'Completo', a: 0, b: 1 },
    { id: 'nobass', name: 'Sin bajos', a: 5 / 36, b: 1 },
    { id: 'lowmid', name: 'Graves-medios', a: 0, b: 23 / 36 },
    { id: 'mid', name: 'Medios', a: 7 / 36, b: 29 / 36 },
    { id: 'high', name: 'Agudos', a: 15 / 36, b: 1 }
  ];
  function windowRange(w, n) { return [Math.round(w.a * n), Math.round(w.b * n) - 1]; }

  /* ---------- Rasgos de un conjunto sonoro ---------- */
  /* pinched: conjunto de cuerdas pulsadas aparte (pesan menos: suenan solas y después del rasgueo) */
  function features(strings, tuning, pinched) {
    const chroma = new Float64Array(12);
    const vec = new Float64Array(12);
    let bass = -1, bassMidi = 1e9;
    for (const i of strings) {
      const s = tuning[i];
      const wt = pinched && pinched.has(i) ? CFG.pinchWeight : 1;
      chroma[s.pc] += wt;
      for (const [iv, w] of CFG.harmonics) vec[(s.pc + iv) % 12] += w * wt;
      if (s.midi < bassMidi) { bassMidi = s.midi; bass = s.pc; }
    }
    let pcsMask = 0, total = 0, norm = 0;
    for (let p = 0; p < 12; p++) { if (chroma[p] > 0) pcsMask |= (1 << p); total += chroma[p]; norm += vec[p] * vec[p]; }
    return { chroma, vec, vnorm: Math.sqrt(norm), bass, n: strings.length, total, pcsMask, pinched: !!(pinched && pinched.size) };
  }

  /* Plantilla espectral del acorde (cacheada) */
  const _tpl = new Map();
  function template(chord) {
    const key = chord.name;
    if (_tpl.has(key)) return _tpl.get(key);
    const vec = new Float64Array(12);
    let mask = 0;
    for (const t of chord.tones) {
      const base = t.role === 'r' ? 1.5 : 1;
      mask |= (1 << t.pc);
      for (const [iv, w] of CFG.harmonics) vec[(t.pc + iv) % 12] += base * w;
    }
    let n = 0; for (let p = 0; p < 12; p++) n += vec[p] * vec[p];
    const out = { vec, norm: Math.sqrt(n), mask };
    _tpl.set(key, out);
    return out;
  }

  /** Puntaje de parecido 0..1 entre un conjunto sonoro y un acorde objetivo. */
  function score(f, chord) {
    if (!f || f.n === 0) return { S: 0, F: 0, C: 0, exact: false, missing: chord.tones.map(t => t.pc), foreign: [] };
    const tpl = template(chord);
    let cov = 0, wsum = 0; const missing = [];
    // Una nota aportada solo por una cuerda pulsada aparte cuenta a medias (pinchWeight).
    for (const t of chord.tones) { wsum += t.w; if (f.chroma[t.pc] > 0) cov += t.w * Math.min(1, f.chroma[t.pc]); else missing.push(t.pc); }
    cov /= wsum;
    let pen = 0; const foreign = [];
    for (let p = 0; p < 12; p++) {
      if (f.chroma[p] === 0 || (tpl.mask >> p) & 1) continue;
      foreign.push(p);
      const harsh = ((tpl.mask >> ((p + 1) % 12)) & 1) || ((tpl.mask >> ((p + 11) % 12)) & 1);
      const share = f.chroma[p] / f.total;
      pen += (harsh ? CFG.foreignHarsh : CFG.foreignSoft) * (0.5 + 0.5 * Math.min(1, share * 4));
    }
    const wantBass = chord.bass !== undefined ? chord.bass : chord.root;
    let bassAdj = 0;
    if (f.bass !== wantBass) bassAdj = ((tpl.mask >> f.bass) & 1) ? -CFG.bassInversion : -CFG.bassForeign;
    const F = Math.max(0, Math.min(1, cov - pen + bassAdj));
    let dot = 0; for (let p = 0; p < 12; p++) dot += f.vec[p] * tpl.vec[p];
    const C = f.vnorm > 0 ? dot / (f.vnorm * tpl.norm) : 0;
    const exact = f.pcsMask === tpl.mask;
    let S = CFG.wFunctional * F + CFG.wChroma * C;
    // Mismas notas = mismo acorde (la inversión se informa aparte y solo afecta el orden).
    if (exact && !f.pinched) S = 1;
    if (f.pinched) S = Math.min(S, CFG.pinchCap); // con pinch el acorde es arpegiado, nunca idéntico
    return { S, F, C, exact: exact && !f.pinched, missing, foreign, bassAdj, inverted: f.bass !== wantBass };
  }

  function classify(S) {
    if (S >= 0.999) return { id: 'exacto', name: 'Exacto' };
    if (S >= 0.85) return { id: 'funcional', name: 'Funcional' };
    if (S >= 0.70) return { id: 'sustituto', name: 'Sustituto' };
    return { id: 'color', name: 'Color' };
  }

  /* ---------- Combinaciones de barras ---------- */
  function barPositions(layout) {
    const pos = new Map();
    layout.rows.forEach((r, ri) => r.forEach((b, ci) => pos.set(b.id, { r: ri, c: ci })));
    return pos;
  }

  function andMasks(bars, n) {
    const m = new Uint8Array(n).fill(1);
    for (const b of bars) for (let i = 0; i < n; i++) m[i] &= b.mask[i];
    return m;
  }

  /** Cuerdas que suenan con una receta {bars:[barras], range:[a,b], pinches:[idx]} */
  function realize(recipe, n) {
    const m = andMasks(recipe.bars, n);
    const [a, b] = recipe.range || [0, n - 1];
    const out = [];
    for (let i = a; i <= b; i++) if (m[i]) out.push(i);
    for (const p of (recipe.pinches || [])) if (out.indexOf(p) < 0) out.push(p);
    return out.sort((x, y) => x - y);
  }

  function combos(bars, k) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length) out.push(acc.slice());
      if (acc.length === k) return;
      for (let i = start; i < bars.length; i++) { acc.push(bars[i]); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
  }

  /** Precalcula todos los conjuntos sonoros de un layout (se reutiliza para cualquier acorde). */
  function buildCache(layout, opts) {
    opts = opts || {};
    const maxB = opts.maxButtons || CFG.maxButtons;
    const windows = opts.windows || WINDOWS;
    const n = layout.tuning.length;
    const bars = layout.rows.flat();
    const pos = barPositions(layout);
    const seen = new Map();
    const sets = [];
    for (const combo of combos(bars, maxB)) {
      const m = andMasks(combo, n);
      let reach = 0;
      if (combo.length > 1) {
        const ps = combo.map(b => pos.get(b.id));
        const cs = ps.map(p => p.c), rs = ps.map(p => p.r);
        const span = Math.max(...cs) - Math.min(...cs) + Math.max(...rs) - Math.min(...rs);
        reach = Math.max(0, span - 2);
      }
      for (const w of windows) {
        const [a, b] = windowRange(w, n);
        const strings = [];
        for (let i = a; i <= b; i++) if (m[i]) strings.push(i);
        if (strings.length < CFG.minStrings) continue;
        const key = strings.join(',');
        const cost = CFG.costButton * (combo.length - 1) + (w.id === 'full' ? 0 : CFG.costRange) + CFG.costReach * reach;
        const prev = seen.get(key);
        if (prev !== undefined && sets[prev].cost <= cost) continue;
        const f = features(strings, layout.tuning);
        if ((f.pcsMask & (f.pcsMask - 1)) === 0) continue; // una sola nota: no es acorde
        const entry = { bars: combo, window: w, range: [a, b], strings, f, cost };
        if (prev !== undefined) sets[prev] = entry;
        else { seen.set(key, sets.length); sets.push(entry); }
      }
    }
    return { layout, sets, n };
  }

  function thinCost(nStrings) { return CFG.costThin * Math.max(0, (8 - nStrings) / 8); }

  /* Elige la cuerda (con barras sueltas) que aporta la clase de altura pc, en el registro medio. */
  function pinchString(tuning, pc) {
    let best = -1, d = 1e9;
    tuning.forEach((s, i) => { if (s.pc === pc) { const dd = Math.abs(s.midi - 64); if (dd < d) { d = dd; best = i; } } });
    return best;
  }

  /**
   * Busca cómo obtener `chord` con el layout. Devuelve opciones ordenadas por rango (parecido menos costo de ejecución).
   * opts: {top, pinches:boolean, maxButtons}
   */
  function search(chord, cache, opts) {
    opts = opts || {};
    const top = opts.top || 12;
    const allowPinch = !!opts.pinches;
    const tuning = cache.layout.tuning;
    const res = [];
    for (const s of cache.sets) {
      if (opts.maxButtons && s.bars.length > opts.maxButtons) continue;
      const sc = score(s.f, chord);
      if (sc.S < 0.35) continue;
      res.push({ bars: s.bars, window: s.window, range: s.range, pinches: [], strings: s.strings, sc, rank: sc.S - s.cost - thinCost(s.f.n) - (sc.inverted ? CFG.costInversion : 0), baseCost: s.cost });
    }
    res.sort((a, b) => b.rank - a.rank);
    if (allowPinch) {
      const extra = [];
      for (const r of res.slice(0, 60)) {
        if (r.sc.exact || !r.sc.missing.length) continue;
        const miss = r.sc.missing.slice().sort((a, b) => weightOf(chord, b) - weightOf(chord, a)).slice(0, CFG.maxPinches);
        const pins = miss.map(pc => pinchString(tuning, pc)).filter(i => i >= 0);
        if (!pins.length) continue;
        const strings = Array.from(new Set(r.strings.concat(pins))).sort((a, b) => a - b);
        const f = features(strings, tuning, new Set(pins));
        const sc = score(f, chord);
        if (sc.S <= r.sc.S + 0.02) continue;
        const cost = r.baseCost + CFG.costPinch * pins.length;
        extra.push({ bars: r.bars, window: r.window, range: r.range, pinches: pins, strings, sc, rank: sc.S - cost - thinCost(r.strings.length) - (sc.inverted ? CFG.costInversion : 0), baseCost: cost });
      }
      res.push(...extra);
      res.sort((a, b) => b.rank - a.rank);
    }
    // quitar duplicados por conjunto de cuerdas
    const out = [], keys = new Set();
    for (const r of res) {
      const k = r.strings.join(',');
      if (keys.has(k)) continue;
      keys.add(k); out.push(r);
      if (out.length >= top) break;
    }
    return out;
  }

  function weightOf(chord, pc) { const t = chord.tones.find(x => x.pc === pc); return t ? t.w : 0; }

  const _dict = { list: null };
  function dictionary() { return _dict.list || (_dict.list = T.allChords()); }

  /** Identifica el acorde más parecido a un conjunto de cuerdas. */
  function identify(strings, tuning, k) {
    if (!strings.length) return [];
    const f = features(strings, tuning);
    const out = dictionary().map((ch, i) => ({ chord: ch, sc: score(f, ch), order: i }));
    out.sort((a, b) => (b.sc.S - a.sc.S) || (a.order - b.order));
    return out.slice(0, k || 3);
  }

  /** Mapa de cobertura: mejor puntaje por (tipo, fundamental). */
  function coverage(cache, typeIds, opts) {
    const types = typeIds || T.TYPES.map(t => t.id);
    const grid = [];
    for (const id of types) {
      const row = [];
      for (let r = 0; r < 12; r++) {
        const ch = T.makeChord(r, id);
        const best = search(ch, cache, Object.assign({ top: 1 }, opts))[0];
        row.push({ chord: ch, best: best || null, S: best ? best.sc.S : 0 });
      }
      grid.push({ type: id, cells: row });
    }
    return grid;
  }

  /** Texto de ejecución de una receta. */
  function describe(r, tuning) {
    const parts = [];
    parts.push('Presiona ' + r.bars.map(b => b.label).join(' + '));
    parts.push(r.window.id === 'full' ? 'rasguea todo' : 'rasguea zona ' + r.window.name.toLowerCase() + ' (cuerdas ' + (r.range[0] + 1) + '–' + (r.range[1] + 1) + ')');
    if (r.pinches && r.pinches.length) parts.push('suelta las barras y pulsa ' + r.pinches.map(i => tuning[i].name + ' (cuerda ' + (i + 1) + ')').join(' y '));
    return parts.join(', ');
  }

  function mechanism(r) {
    const m = [];
    if (r.bars.length > 1) m.push('Intersección');
    if (r.window.id !== 'full') m.push('Zona');
    if (r.pinches && r.pinches.length) m.push('Pinch');
    return m.length ? m.join(' + ') : 'Barra';
  }

  AH.engine = { CFG, WINDOWS, windowRange, features, score, classify, andMasks, realize, buildCache, search, identify, coverage, describe, mechanism, dictionary };
})(typeof globalThis !== 'undefined' ? globalThis : window);
