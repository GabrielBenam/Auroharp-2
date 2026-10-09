/* Reacomodo de botones: permuta las barras entre las posiciones de la botonera.
   Minimiza  J = a·Recorrido + g·Bordes − b·Armonía  con recocido simulado (simulated annealing).
   - Recorrido: distancia que recorre la mano entre acordes consecutivos de tus progresiones; los acordes
     que se tocan con 2 barras (intersección) además deben quedar juntos (se presionan a la vez).
   - Armonía: principio de Jo Ann Smith: el patrón de dedos es igual en todas las tonalidades si
     (a) en una fila los acordes avanzan por quintas de izquierda a derecha,
     (b) el relativo menor queda justo debajo de su mayor,
     (c) el V7 queda justo arriba del I.
   - Bordes: las barras de los extremos apagan peor y generan armónicos (Smith); las más usadas se alejan de ahí.
   Reacomodar NO requiere re-fieltrar: es mover barras de ranura y re-etiquetar botones. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};
  const T = AH.theory, I = AH.instrument, E = AH.engine;

  const W = { travel: 1.0, harmony: 0.6, edge: 0.3, together: 2.0, rowScale: 0.8, iters: 40000, restarts: 4 };

  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /** Progresiones en orden. Cada línea es una canción (no hay transición entre líneas). "A:2" repite el acorde. */
  function parseProgressions(text) {
    const songs = [], bad = [];
    String(text || '').split(/\n+/).forEach(line => {
      const seq = [];
      line.split(/[\s,;|]+/).filter(Boolean).forEach(tok => {
        const [name, w] = tok.split(':');
        const ch = T.parseChord(name);
        if (!ch) { bad.push(name); return; }
        const reps = Math.max(1, Math.min(8, Math.round(parseFloat(w) || 1)));
        for (let k = 0; k < reps; k++) seq.push(ch);
      });
      if (seq.length) songs.push(seq);
    });
    return { songs, bad };
  }

  function slotsOf(layout) { const s = []; layout.rows.forEach((r, ri) => r.forEach((_, ci) => s.push({ r: ri, c: ci, last: r.length - 1 }))); return s; }

  function dist(p, q) { const dx = p.c - q.c, dy = (p.r - q.r) * W.rowScale; return Math.sqrt(dx * dx + dy * dy); }

  /** Cómo se toca cada acorde con barras (directo o intersección), sin pinch. */
  function chordButtons(chord, bars, cache) {
    const direct = bars.findIndex(b => { const p = T.parseChord(b.label); return p && p.name === chord.name; });
    if (direct >= 0) return [direct];
    const best = E.search(chord, cache, { top: 1, maxButtons: 2 })[0];
    if (!best || best.sc.S < 0.7) return null;
    return best.bars.map(b => bars.indexOf(b));
  }

  /** Matrices de peso entre barras: transiciones (Wt), presión simultánea (Wp), uso (U). */
  function buildWeights(layout, songs) {
    const bars = layout.rows.flat(); const n = bars.length;
    const Wt = Array.from({ length: n }, () => new Float64Array(n));
    const Wp = Array.from({ length: n }, () => new Float64Array(n));
    const U = new Float64Array(n);
    const missing = new Set();
    if (!songs.length) return { Wt, Wp, U, transitions: 0, missing };
    const cache = E.buildCache(layout, { maxButtons: 2, windows: [E.WINDOWS[0]] });
    const memo = new Map();
    const btn = ch => { if (!memo.has(ch.name)) memo.set(ch.name, chordButtons(ch, bars, cache)); return memo.get(ch.name); };
    let transitions = 0;
    songs.forEach(seq => {
      let prev = null;
      seq.forEach(ch => {
        const b = btn(ch);
        if (!b) { missing.add(ch.name); prev = null; return; }
        b.forEach(i => { U[i] += 1; });
        if (b.length > 1) for (let x = 0; x < b.length; x++) for (let y = x + 1; y < b.length; y++) { Wp[b[x]][b[y]] += 1; Wp[b[y]][b[x]] += 1; }
        if (prev && prev.join() !== b.join()) {
          const w = 1 / (prev.length * b.length);
          prev.forEach(i => b.forEach(j => { if (i !== j) { Wt[i][j] += w; Wt[j][i] += w; } }));
          transitions++;
        }
        prev = b;
      });
    });
    return { Wt, Wp, U, transitions, missing };
  }

  /* Relaciones armónicas entre barras */
  function family(ch) { return ch.type === 'min' || ch.type === 'm7' ? 'min' : (ch.type === '7' ? 'dom' : ch.type === 'maj' ? 'maj' : 'otro'); }
  function buildRelations(bars) {
    const chs = bars.map(b => T.parseChord(b.label));
    const H = [], V = [];
    for (let i = 0; i < bars.length; i++) for (let j = 0; j < bars.length; j++) {
      if (i === j || !chs[i] || !chs[j]) continue;
      const a = chs[i], b = chs[j], fa = family(a), fb = family(b);
      // (a) quintas ascendentes de izquierda a derecha, misma familia
      if (fa === fb && fa !== 'otro' && (b.root - a.root + 12) % 12 === 7) H.push([i, j, 1]);
      // (b) relativo menor debajo del mayor
      if (fa === 'maj' && fb === 'min' && (b.root - a.root + 12) % 12 === 9) V.push([i, j, 1]);
      // (c) V7 arriba del I  (j = I debajo de i = V7)
      if (fa === 'dom' && fb === 'maj' && (a.root - b.root + 12) % 12 === 7) V.push([i, j, 0.8]);
    }
    return { H, V, possible: H.length + V.length };
  }

  /** pos[i] = ranura de la barra i */
  function harmonyScore(pos, slots, rel) {
    let s = 0;
    for (const [i, j, w] of rel.H) { const p = slots[pos[i]], q = slots[pos[j]]; if (p.r === q.r && q.c === p.c + 1) s += w; else if (p.r === q.r && q.c === p.c - 1) s += 0.3 * w; }
    for (const [i, j, w] of rel.V) { const p = slots[pos[i]], q = slots[pos[j]]; if (q.c === p.c && q.r === p.r + 1) s += w; else if (Math.abs(q.c - p.c) <= 1 && q.r === p.r + 1) s += 0.4 * w; }
    return s;
  }

  function travel(pos, slots, M) {
    const n = pos.length; let t = 0, wsum = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const w = M.Wt[i][j]; if (w) { t += w * dist(slots[pos[i]], slots[pos[j]]); wsum += w; }
    }
    return { t, wsum };
  }
  function together(pos, slots, M) {
    const n = pos.length; let t = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const w = M.Wp[i][j]; if (w) { const d = dist(slots[pos[i]], slots[pos[j]]); t += w * (d + Math.max(0, d - 2) * 2); }
    }
    return t;
  }
  function edge(pos, slots, M) {
    let e = 0; for (let i = 0; i < pos.length; i++) { const s = slots[pos[i]]; if (s.c === 0 || s.c === s.last) e += M.U[i]; } return e;
  }

  function cost(pos, slots, M, rel, norm) {
    const tr = travel(pos, slots, M).t + W.together * together(pos, slots, M);
    return W.travel * tr / norm.travel + W.edge * edge(pos, slots, M) / norm.usage - W.harmony * harmonyScore(pos, slots, rel) / norm.harm;
  }

  function metrics(pos, slots, M, rel, bars) {
    const tr = travel(pos, slots, M);
    let near = 0, nw = 0;
    const n = pos.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const w = M.Wt[i][j]; if (w) { nw += w; if (dist(slots[pos[i]], slots[pos[j]]) <= 1.3) near += w; } }
    // tonalidades con I-IV-V contiguos (IV a la izquierda, V a la derecha, misma fila)
    const at = new Map(); bars.forEach((b, i) => at.set(slots[pos[i]].r + ',' + slots[pos[i]].c, i));
    const keys = [];
    bars.forEach((b, i) => {
      const ch = T.parseChord(b.label); if (!ch || ch.type !== 'maj') return;
      const s = slots[pos[i]];
      const L = at.get(s.r + ',' + (s.c - 1)), R = at.get(s.r + ',' + (s.c + 1));
      const cl = L !== undefined && T.parseChord(bars[L].label), cr = R !== undefined && T.parseChord(bars[R].label);
      if (cl && cr && cl.type === 'maj' && cr.type === 'maj' && cl.root === (ch.root + 5) % 12 && cr.root === (ch.root + 7) % 12) keys.push(ch.name);
    });
    return {
      travelAvg: tr.wsum ? tr.t / tr.wsum : 0,
      nearPct: nw ? near / nw : 0,
      harmony: rel.possible ? harmonyScore(pos, slots, rel) : 0,
      harmonyMax: rel.H.length + rel.V.length,
      keysIVV: keys,
      together: together(pos, slots, M)
    };
  }

  /**
   * opts: {progressions: texto, locked: Set de etiquetas, withinRows: boolean, seed}
   * Devuelve {layout, before, after, moves, missing, bad}
   */
  function arrange(layout, opts) {
    opts = opts || {};
    const bars = layout.rows.flat();
    const slots = slotsOf(layout);
    const n = bars.length;
    const { songs, bad } = parseProgressions(opts.progressions || '');
    const M = buildWeights(layout, songs);
    const rel = buildRelations(bars);
    const locked = opts.locked || new Set();
    const movable = []; for (let i = 0; i < n; i++) if (!locked.has(bars[i].label)) movable.push(i);
    const usage = M.U.reduce((a, b) => a + b, 0);
    const norm = { travel: Math.max(1, M.transitions), usage: Math.max(1, usage), harm: Math.max(1, rel.possible / 2) };
    if (!songs.length) { norm.travel = 1; }

    const pos0 = bars.map((_, i) => i);
    const before = metrics(pos0, slots, M, rel, bars);
    const c0 = cost(pos0, slots, M, rel, norm);
    let best = pos0.slice(), bestC = c0;
    const rand = rng(opts.seed || 12345);

    for (let rs = 0; rs < W.restarts && movable.length > 1; rs++) {
      let pos = rs === 0 ? pos0.slice() : best.slice();
      if (rs > 0) for (let k = 0; k < movable.length; k++) { // perturbación
        const a = movable[Math.floor(rand() * movable.length)], b = movable[Math.floor(rand() * movable.length)];
        if (a !== b && (!opts.withinRows || slots[pos[a]].r === slots[pos[b]].r)) { const t = pos[a]; pos[a] = pos[b]; pos[b] = t; }
      }
      let c = cost(pos, slots, M, rel, norm);
      let temp = 0.5;
      const cool = Math.pow(0.001 / temp, 1 / W.iters);
      for (let it = 0; it < W.iters; it++) {
        const a = movable[Math.floor(rand() * movable.length)], b = movable[Math.floor(rand() * movable.length)];
        if (a === b) continue;
        if (opts.withinRows && slots[pos[a]].r !== slots[pos[b]].r) continue;
        let t = pos[a]; pos[a] = pos[b]; pos[b] = t;
        const nc = cost(pos, slots, M, rel, norm);
        if (nc <= c || rand() < Math.exp((c - nc) / temp)) { c = nc; if (c < bestC - 1e-12) { bestC = c; best = pos.slice(); } }
        else { t = pos[a]; pos[a] = pos[b]; pos[b] = t; }
        temp *= cool;
      }
    }

    // construir layout nuevo
    const rows = layout.rows.map(r => new Array(r.length));
    bars.forEach((b, i) => { const s = slots[best[i]]; rows[s.r][s.c] = I.cloneBar(b); });
    const out = { id: layout.id + '-reac', name: layout.name + ' (reacomodado)', ref: layout.ref, tuning: layout.tuning, rows };
    const moves = [];
    bars.forEach((b, i) => { if (best[i] !== i) { const s0 = slots[i], s1 = slots[best[i]]; moves.push({ label: b.label, from: s0, to: s1 }); } });
    const after = metrics(best, slots, M, rel, bars);
    return { layout: out, before, after, moves, missing: Array.from(M.missing), bad, costBefore: c0, costAfter: bestC, transitions: M.transitions };
  }

  AH.arranger = { W, parseProgressions, arrange, buildRelations };
})(typeof globalThis !== 'undefined' ? globalThis : window);
