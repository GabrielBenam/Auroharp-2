/* Modelo físico: encordado de 36 cuerdas, barras como máscaras por cuerda, layouts. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};
  const T = AH.theory;

  /* Afinación cromática estándar de 36 cuerdas (tomada de las hojas de fieltrado del proyecto):
     F G C D E | F F# G A A# B | C … B (cromático) | C … B (cromático) | C
     Nota: el bajo NO es cromático (faltan F#2, G#2, A2, A#2, B2, C#3, D#3, G#3). */
  const STD36 = ['F2', 'G2', 'C3', 'D3', 'E3', 'F3', 'F#3', 'G3', 'A3', 'A#3', 'B3',
    'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
    'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5', 'C6'];

  function noteToMidi(n) {
    const m = n.match(/^([A-G][#b]?)(-?\d)$/);
    if (!m) throw new Error('Nota inválida ' + n);
    return T.PC_OF[m[1]] + 12 * (parseInt(m[2], 10) + 1);
  }

  function makeTuning(names) {
    return names.map((n, i) => { const midi = noteToMidi(n); return { idx: i, num: i + 1, midi, pc: midi % 12, name: T.midiName(midi) }; });
  }

  let _id = 0;
  /** Barra generada a partir de un acorde: deja sonar toda cuerda cuya clase de altura pertenece al acorde. */
  function barFromChord(label, tuning) {
    const ch = T.parseChord(label);
    if (!ch) throw new Error('Acorde no reconocido para barra: ' + label);
    const mask = new Uint8Array(tuning.length);
    tuning.forEach((s, i) => { mask[i] = ch.pcs.has(s.pc) ? 1 : 0; });
    applyBassRule(mask, ch, tuning);
    return { id: 'b' + (++_id), label, mask, source: 'generado' };
  }

  /** Barra con fieltrado explícito: lista de números de cuerda (1-based) que suenan. */
  function barFromStrings(label, nums, tuning, source) {
    const mask = new Uint8Array(tuning.length);
    nums.forEach(n => { if (n >= 1 && n <= tuning.length) mask[n - 1] = 1; });
    return { id: 'b' + (++_id), label, mask, source: source || 'real' };
  }

  /* Regla de voz en el bajo, deducida de los 20 fieltros reales documentados (las reproduce todas):
     1) si la fundamental aparece en las 5 cuerdas más graves, se cierran todas las cuerdas por debajo de ella;
     2) toda séptima por debajo de la primera fundamental se cierra (evita la séptima en el bajo). */
  const BASS_ROOT_ZONE = 5;
  function applyBassRule(mask, ch, tuning) {
    const first = tuning.findIndex((s, i) => mask[i] && s.pc === ch.root);
    if (first < 0) return mask;
    const sevenths = new Set(ch.tones.filter(t => t.role === '7').map(t => t.pc));
    for (let i = 0; i < first; i++) {
      if (first < BASS_ROOT_ZONE || sevenths.has(tuning[i].pc)) mask[i] = 0;
    }
    return mask;
  }

  function cloneBar(b) { return { id: 'b' + (++_id), label: b.label, mask: new Uint8Array(b.mask), source: b.source, locked: b.locked }; }

  /* Definición de layouts. Cada fila: lista de etiquetas. Prefijo de fieltrado real: "clave@etiqueta". */
  const LAYOUT_DEFS = [
    { id: 'os21', name: 'Oscar Schmidt 21 (fábrica)', ref: 'Smith, Unified Chord Bars; Lewis, Chord bar layouts',
      rows: [['Eb', 'Bb', 'F', 'C', 'G', 'D', 'A'], ['F7', 'C7', 'G7', 'D7', 'A7', 'E7', 'B7'], ['Ab', 'Bb7', 'Cm', 'Gm', 'Dm', 'Am', 'Em']] },
    { id: 'unified21', name: 'Unified (Jo Ann Smith)', ref: 'Smith, Unified Chord Bars',
      rows: [['Eb', 'Bb', 'F', 'C', 'G', 'D', 'A'], ['F7', 'C7', 'G7', 'D7', 'A7', 'E7', 'B7'], ['Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m']] },
    { id: 'folk21', name: 'Folk 21 (Harpers Guild + Smith custom)', ref: '21_chord_reconfig_chord_bars.xls; Smith (author-preferred)',
      rows: [['Bb', 'F', 'C', 'G', 'D', 'A', 'hg21:E@E'], ['C7', 'G7', 'D7', 'A7', 'E7', 'B7', 'hg21:F#7@F#7'], ['Gm', 'Dm', 'Am', 'Em', 'hg21:Bm@Bm', 'hg21:F#m@F#m', 'hg21:C#m@C#m']] },
    { id: 'race15', name: 'Folk 15 (P. D. Race)', ref: 'autoharp_pauls_15_chord_folk_chords.xls',
      rows: [['pr15:Dm@Dm', 'pr15:D7@D7', 'pr15:D@D', 'pr15:Am@Am', 'pr15:A7@A7', 'pr15:E7@E7', 'pr15:Bm@Bm'],
        ['pr15:Bb@Bb', 'pr15:F@F', 'pr15:C@C', 'pr15:G@G', 'pr15:A@A', 'pr15:Em@Em', 'pr15:B7@B7', 'pr15:F#m@F#m']] },
    { id: 'std15', name: 'Estándar 15 (Berkshire)', ref: 'Lewis, Chord bar layouts',
      rows: [['D', 'Gm', 'A7', 'Dm', 'E7', 'Am', 'D7'], ['Eb', 'F7', 'Bb', 'C7', 'F', 'G7', 'C', 'G']] },
    { id: 'app15', name: 'Appalachian 15', ref: 'Lewis, Chord bar layouts',
      rows: [['A', 'Gm', 'A7', 'Dm', 'E7', 'Am', 'D7'], ['E', 'D', 'Bb', 'C7', 'F', 'G7', 'C', 'G']] },
    { id: 'std12', name: 'Estándar 12 (1898–1983)', ref: 'Lewis, Chord bar layouts',
      rows: [['Gm', 'A7', 'Dm', 'E7', 'Am', 'D7'], ['Bb', 'C7', 'F', 'G7', 'C', 'G']] }
  ];

  function buildLayout(def, tuningNames) {
    const tuning = makeTuning(tuningNames || STD36);
    const rows = def.rows.map(r => r.map(item => {
      if (typeof item === 'object') { // barra serializada {label, strings, source}
        return barFromStrings(item.label, item.strings, tuning, item.source || 'custom');
      }
      const at = item.indexOf('@');
      if (at > 0) {
        const key = item.slice(0, at), label = item.slice(at + 1);
        const felt = AH.FELTS && AH.FELTS[key];
        if (felt) return barFromStrings(label, felt, tuning, 'real');
        return barFromChord(label, tuning);
      }
      return barFromChord(item, tuning);
    }));
    // Advertencia de Lewis: B7 es la única barra que usa las cuerdas D# en el 21 de fábrica.
    rows.forEach(r => r.forEach(b => { if (b.label === 'B7') b.note = 'Única barra que usa D# en layouts de fábrica: cambiarla tiene costo.'; }));
    return { id: def.id, name: def.name, ref: def.ref || '', tuning, rows };
  }

  function allBars(layout) { return layout.rows.flat(); }

  function serializeLayout(layout) {
    return {
      id: layout.id, name: layout.name, ref: layout.ref,
      tuning: layout.tuning.map(s => s.name),
      rows: layout.rows.map(r => r.map(b => ({ label: b.label, source: b.source, strings: Array.from(b.mask).map((v, i) => v ? i + 1 : 0).filter(Boolean) })))
    };
  }

  function deserializeLayout(obj) {
    const tuningNames = obj.tuning || STD36;
    return buildLayout({ id: obj.id || ('custom' + Date.now()), name: obj.name || 'Personalizado', ref: obj.ref, rows: obj.rows }, tuningNames);
  }

  AH.instrument = { applyBassRule, STD36, LAYOUT_DEFS, noteToMidi, makeTuning, barFromChord, barFromStrings, cloneBar, buildLayout, allBars, serializeLayout, deserializeLayout };
})(typeof globalThis !== 'undefined' ? globalThis : window);
