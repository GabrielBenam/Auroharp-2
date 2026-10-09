/* Optimizador inverso: dado un repertorio (acordes con frecuencia), propone qué barras re-fieltrar.
   Búsqueda voraz (greedy) por pasos: en cada paso prueba reemplazar cada barra no bloqueada por cada
   acorde candidato y se queda con el cambio que más sube la cobertura ponderada. Evaluación rápida:
   barras sueltas y pares, zonas "completo" y "sin bajos", sin pinch (solo sonido simultáneo). */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};
  const T = AH.theory, I = AH.instrument, E = AH.engine;

  /** Repertorio desde texto: "C G Am F G7 C" o "C:4, G:3, Am7:1" */
  function parseRepertoire(text) {
    const counts = new Map(), bad = [];
    String(text || '').split(/[\s,;|]+/).filter(Boolean).forEach(tok => {
      const [name, w] = tok.split(':');
      const ch = T.parseChord(name);
      if (!ch) { bad.push(name); return; }
      const k = ch.name;
      const prev = counts.get(k) || { chord: ch, w: 0 };
      prev.w += w ? (parseFloat(w) || 1) : 1;
      counts.set(k, prev);
    });
    return { items: Array.from(counts.values()), bad };
  }

  const FAST = { maxButtons: 2, windows: [E.WINDOWS[0], E.WINDOWS[1]] };

  function evaluate(layout, rep) {
    const cache = E.buildCache(layout, FAST);
    let tot = 0, wsum = 0; const per = [];
    for (const it of rep) {
      const best = E.search(it.chord, cache, { top: 1 })[0];
      const S = best ? best.sc.S : 0;
      per.push({ chord: it.chord, w: it.w, S, best });
      tot += S * it.w; wsum += it.w;
    }
    return { value: wsum ? tot / wsum : 0, per };
  }

  function candidates(rep, layout) {
    const names = new Set(layout.rows.flat().map(b => b.label));
    const out = new Map();
    const add = ch => { if (!names.has(ch.name) && !out.has(ch.name)) out.set(ch.name, ch); };
    rep.forEach(it => {
      add(it.chord);
      ['maj', 'min', '7'].forEach(t => add(T.makeChord(it.chord.root, t)));
    });
    return Array.from(out.values());
  }

  function cloneLayout(layout) {
    return { id: layout.id + '-opt', name: layout.name + ' (optimizado)', ref: layout.ref, tuning: layout.tuning, rows: layout.rows.map(r => r.map(b => I.cloneBar(b))) };
  }

  /**
   * opts: {steps (n.º de barras a re-fieltrar), locked: Set de etiquetas que no se tocan, onProgress}
   * Devuelve {before, after, changes:[{row,col,from,to,gain}], layout}
   */
  function optimize(layout, rep, opts) {
    opts = opts || {};
    const steps = opts.steps || 2;
    const locked = opts.locked || new Set(['B7']);
    let cur = cloneLayout(layout);
    const before = evaluate(layout, rep);
    let curVal = before.value;
    const changes = [];
    const used = new Set(rep.map(it => it.chord.name));
    for (let s = 0; s < steps; s++) {
      const cands = candidates(rep, cur);
      let best = null;
      cur.rows.forEach((row, ri) => row.forEach((bar, ci) => {
        if (locked.has(bar.label) || bar.pinned) return;
        // no sacrificar barras que el propio repertorio usa
        if (used.has((T.parseChord(bar.label) || {}).name)) return;
        for (const ch of cands) {
          const trial = { id: cur.id, name: cur.name, tuning: cur.tuning, rows: cur.rows.map(r => r.slice()) };
          const nb = I.barFromChord(ch.name, cur.tuning);
          nb.source = 'propuesta';
          trial.rows[ri][ci] = nb;
          const v = evaluate(trial, rep).value;
          if (!best || v > best.v + 1e-9) best = { v, ri, ci, from: bar.label, to: ch.name, bar: nb };
        }
      }));
      if (!best || best.v <= curVal + 0.002) break;
      cur.rows[best.ri][best.ci] = best.bar;
      best.bar.pinned = true;
      changes.push({ row: best.ri, col: best.ci, from: best.from, to: best.to, gain: best.v - curVal });
      curVal = best.v;
      if (opts.onProgress) opts.onProgress(s + 1, steps);
    }
    return { before, after: evaluate(cur, rep), changes, layout: cur };
  }

  AH.optimizer = { parseRepertoire, evaluate, optimize };
})(typeof globalThis !== 'undefined' ? globalThis : window);
