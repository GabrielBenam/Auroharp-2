/* Pruebas del motor (node tests/engine.test.js). Sin dependencias. */
'use strict';
const path = require('path');
['theory', 'felts', 'instrument', 'engine', 'optimizer', 'arranger', 'player'].forEach(f => require(path.join(__dirname, '..', 'src', f + '.js')));
const { theory: T, instrument: I, engine: E, optimizer: O } = globalThis.AH;
let fails = 0, n = 0;
function ok(cond, msg) { n++; if (!cond) { fails++; console.error('FALLA:', msg); } else console.log('ok -', msg); }

const L = I.buildLayout(I.LAYOUT_DEFS[0]);
ok(L.tuning.length === 36, 'afinación de 36 cuerdas');
ok(L.tuning[0].name === 'F2' && L.tuning[35].name === 'C6', 'rango F2–C6');
ok(L.tuning.every((s, i) => i === 0 || s.midi > L.tuning[i - 1].midi), 'afinación ascendente');
ok(L.rows.flat().length === 21, 'OS21 tiene 21 barras');

const bar = l => L.rows.flat().find(b => b.label === l);
const strings = m => { const o = []; m.forEach((v, i) => { if (v) o.push(i); }); return o; };
const pcsOf = s => Array.from(new Set(s.map(i => L.tuning[i].pc))).sort((a, b) => a - b);

// Intersección: C ∩ Am = {C, E}
const inter = pcsOf(strings(E.andMasks([bar('C'), bar('Am')], 36)));
ok(JSON.stringify(inter) === JSON.stringify([0, 4]), 'C ∩ Am deja C y E');

// Cada barra generada identifica su propio acorde al 100 %
for (const b of L.rows.flat()) {
  const id = E.identify(strings(b.mask), L.tuning, 1)[0];
  ok(id.chord.name === T.parseChord(b.label).name && id.sc.S === 1, `barra ${b.label} se identifica como ${b.label} 100%`);
}

// Fieltros reales (Race 15): todos dan su acorde exacto
const R = I.buildLayout(I.LAYOUT_DEFS.find(d => d.id === 'race15'));
for (const b of R.rows.flat()) {
  const s = strings(b.mask);
  const sc = E.score(E.features(s, R.tuning), T.parseChord(b.label));
  ok(sc.exact, `fieltro real ${b.label} contiene exactamente sus notas`);
}

// La regla de bajo reproduce al menos 19 de 20 fieltros reales
let same = 0; const keys = Object.keys(AH.FELTS);
keys.forEach(k => { const g = I.barFromChord(k.split(':')[1], L.tuning); if (strings(g.mask).map(i => i + 1).join() === AH.FELTS[k].join()) same++; });
ok(same >= 19, `regla de bajo reproduce ${same}/${keys.length} fieltros reales`);

// Búsqueda
const cache = E.buildCache(L);
const best = (c, o) => E.search(T.parseChord(c), cache, Object.assign({ top: 1 }, o))[0];
ok(best('G').sc.S === 1 && best('G').bars.length === 1, 'G existente: 1 barra, 100%');
ok(best('F#m').bars.map(b => b.label).sort().join('+') === 'B7+D', 'F#m sin pinch: B7 ∩ D (F#, A)');
ok(best('Am7', { pinches: true }).pinches.length >= 1, 'Am7 con pinch agrega una cuerda');
ok(best('Am7', { pinches: true }).sc.S < 1, 'pinch nunca puntúa 100% (arpegiado)');
ok(!best('C#', {}) || best('C#').sc.S < 0.7, 'C# no alcanzable en OS21 sin re-fieltrar');

// Puntaje: notas ajenas bajan, faltantes bajan
const f = s => E.features(s, L.tuning);
const cMaj = T.parseChord('C');
const sC = strings(bar('C').mask), sC7 = strings(bar('C7').mask);
ok(E.score(f(sC7), cMaj).S < 1 && E.score(f(sC7), cMaj).S > 0.7, 'C7 como sustituto de C: entre 70 y 100');
ok(E.score(f(sC), T.parseChord('Cm')).S < E.score(f(sC), cMaj).S, 'C se parece más a C que a Cm');

// Parser
['F#m7', 'Bbmaj7', 'Ebdim7', 'G/B', 'Dm7b5', 'Caug', 'Asus4'].forEach(x => ok(!!T.parseChord(x), 'parsea ' + x));
ok(T.parseChord('H') === null, 'rechaza acorde inválido');

// Serialización ida y vuelta
const L2 = I.deserializeLayout(JSON.parse(JSON.stringify(I.serializeLayout(L))));
ok(L2.rows.flat().every((b, i) => b.mask.join() === L.rows.flat()[i].mask.join()), 'serializar/deserializar conserva fieltros');

// Optimizador: repertorio en La mejora
const rep = O.parseRepertoire('A:4 E:3 F#m:2 Bm:1 C#m:1').items;
const r = O.optimize(L, rep, { steps: 2 });
ok(r.after.value > r.before.value, `optimizador mejora cobertura ${r.before.value.toFixed(2)} → ${r.after.value.toFixed(2)}`);
ok(r.changes.every(c => c.from !== 'B7'), 'optimizador respeta barra bloqueada B7');

// Cobertura completa
const grid = E.coverage(cache);
ok(grid.length === T.TYPES.length && grid[0].cells.length === 12, 'mapa de cobertura 16×12');

// Reacomodo de botones
const A = globalThis.AH.arranger;
const prog = 'G C D Em G C D G\nC Am F G C Am F G\nG Em C D7 G';
const ar = A.arrange(L, { progressions: prog, withinRows: true, locked: new Set(['B7']) });
ok(ar.after.travelAvg <= ar.before.travelAvg + 1e-9, `reacomodo no empeora el recorrido ${ar.before.travelAvg.toFixed(2)} → ${ar.after.travelAvg.toFixed(2)}`);
ok(ar.layout.rows.every((r, i) => r.length === L.rows[i].length), 'reacomodo conserva la forma de la botonera');
ok(ar.layout.rows.flat().map(b => b.label).sort().join() === L.rows.flat().map(b => b.label).sort().join(), 'reacomodo no pierde ni duplica barras');
ok(ar.layout.rows.every((r, i) => r.every(b => L.rows[i].some(x => x.label === b.label))), 'modo "dentro de filas" no cambia barras de fila');
ok(ar.moves.every(m => m.label !== 'B7'), 'reacomodo respeta barra fija B7');
const shuffled = I.buildLayout({ id: 'x', name: 'x', rows: [['G', 'Eb', 'A', 'C', 'Bb', 'D', 'F']] });
const ar2 = A.arrange(shuffled, {});
ok(ar2.layout.rows[0].map(b => b.label).join(' ') === 'Eb Bb F C G D A', 'sin repertorio ordena por quintas: ' + ar2.layout.rows[0].map(b => b.label).join(' '));

// ---- Animación de ejemplo (player) ----
{
  const cache = E.buildCache(L);
  const res = E.search(T.parseChord('Am7'), cache, { top: 12, pinches: true, maxButtons: 3 });
  const withPin = res.find(r => r.pinches.length), noPin = res.find(r => !r.pinches.length);
  [withPin, noPin].filter(Boolean).forEach((r, k) => {
    const plan = AH.player.build(L, r, { label: 'Am7', pct: r.sc.S, className: 'x' });
    const ev = plan.events, tag = k ? 'sin pinch' : 'con pinch';
    ok(ev.every((e, i) => i === 0 || e.t >= ev[i - 1].t), 'guion ordenado en el tiempo (' + tag + ')');
    ok(ev[0].type === 'caption' || ev[0].type === 'press', 'el guion empieza presionando (' + tag + ')');
    const flat = L.rows.flat(), press = ev.find(e => e.type === 'press');
    ok(press.bars.length === r.bars.length && press.bars.every(i => r.bars.includes(flat[i])), 'índices de barras correctos (' + tag + ')');
    const strum = ev.filter(e => e.type === 'pluck' && e.kind === 'strum').map(e => e.s);
    const m = E.andMasks(r.bars, 36);
    ok(strum.length > 0 && strum.every(s => m[s] && s >= r.range[0] && s <= r.range[1]), 'rasgueo solo en cuerdas libres de la zona (' + tag + ')');
    ok(strum.every((s, i) => i === 0 || s > strum[i - 1]), 'rasgueo de grave a agudo (' + tag + ')');
    const pins = ev.filter(e => e.type === 'pluck' && e.kind === 'pinch').map(e => e.s);
    ok(JSON.stringify(pins) === JSON.stringify(r.pinches), 'pinch pulsa las cuerdas de la receta (' + tag + ')');
    if (pins.length) {
      const rel = ev.find(e => e.type === 'press' && e.bars.length === 0), firstPin = ev.find(e => e.kind === 'pinch');
      const lastStrum = ev.filter(e => e.kind === 'strum').pop();
      ok(rel && rel.t > lastStrum.t && firstPin.t > rel.t, 'el pinch ocurre después de soltar las barras');
    }
    ok(plan.duration > ev[ev.length - 1].t - 1 && ev[ev.length - 1].type === 'end', 'duración consistente (' + tag + ')');
    ok(ev.filter(e => e.type === 'caption').every(e => e.text.length > 10), 'todos los pasos tienen explicación en texto (' + tag + ')');
  });
}



console.log(`\n${n - fails}/${n} pruebas correctas`);
process.exit(fails ? 1 : 0);
