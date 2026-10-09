/* Teoría musical: notas, clases de altura y diccionario de acordes con funciones armónicas. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Nombre preferido por fundamental (convención autoarpa: Bb, Eb, Ab; F#, C#, G#)
  const PREF = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  const PC_OF = {};
  SHARP.forEach((n, i) => { PC_OF[n] = i; });
  FLAT.forEach((n, i) => { PC_OF[n] = i; });
  Object.assign(PC_OF, { 'E#': 5, 'B#': 0, 'Fb': 4, 'Cb': 11 });

  /* Peso de cada función armónica para la métrica funcional.
     r=fundamental, 3=tercera, 5=quinta, 7=séptima, x=extensión/color, s=suspensión (reemplaza la tercera) */
  const ROLE_W = { r: 1.0, '3': 1.0, s: 1.0, '5': 0.4, '7': 0.8, x: 0.6 };

  /* Tipos de acorde: sufijo -> lista de [intervalo, función] */
  const TYPES = [
    { id: 'maj', suf: '', name: 'Mayor', iv: [[0, 'r'], [4, '3'], [7, '5']] },
    { id: 'min', suf: 'm', name: 'Menor', iv: [[0, 'r'], [3, '3'], [7, '5']] },
    { id: '7', suf: '7', name: 'Séptima dominante', iv: [[0, 'r'], [4, '3'], [7, '5'], [10, '7']] },
    { id: 'm7', suf: 'm7', name: 'Menor séptima', iv: [[0, 'r'], [3, '3'], [7, '5'], [10, '7']] },
    { id: 'maj7', suf: 'maj7', name: 'Mayor séptima', iv: [[0, 'r'], [4, '3'], [7, '5'], [11, '7']] },
    { id: '6', suf: '6', name: 'Sexta', iv: [[0, 'r'], [4, '3'], [7, '5'], [9, 'x']] },
    { id: 'm6', suf: 'm6', name: 'Menor sexta', iv: [[0, 'r'], [3, '3'], [7, '5'], [9, 'x']] },
    { id: 'sus2', suf: 'sus2', name: 'Suspendido 2', iv: [[0, 'r'], [2, 's'], [7, '5']] },
    { id: 'sus4', suf: 'sus4', name: 'Suspendido 4', iv: [[0, 'r'], [5, 's'], [7, '5']] },
    { id: '7sus4', suf: '7sus4', name: 'Séptima sus4', iv: [[0, 'r'], [5, 's'], [7, '5'], [10, '7']] },
    { id: 'add9', suf: 'add9', name: 'Add9', iv: [[0, 'r'], [4, '3'], [7, '5'], [2, 'x']] },
    { id: '9', suf: '9', name: 'Novena', iv: [[0, 'r'], [4, '3'], [7, '5'], [10, '7'], [2, 'x']] },
    { id: 'dim', suf: 'dim', name: 'Disminuido (tríada)', iv: [[0, 'r'], [3, '3'], [6, '5']] },
    { id: 'dim7', suf: 'dim7', name: 'Disminuido séptima', iv: [[0, 'r'], [3, '3'], [6, '5'], [9, '7']] },
    { id: 'm7b5', suf: 'm7b5', name: 'Semidisminuido', iv: [[0, 'r'], [3, '3'], [6, '5'], [10, '7']] },
    { id: 'aug', suf: 'aug', name: 'Aumentado', iv: [[0, 'r'], [4, '3'], [8, '5']] }
  ];
  const TYPE_BY_SUF = {};
  TYPES.forEach(t => { TYPE_BY_SUF[t.suf] = t; });
  Object.assign(TYPE_BY_SUF, { M: TYPE_BY_SUF[''], min: TYPE_BY_SUF.m, '-': TYPE_BY_SUF.m, 'M7': TYPE_BY_SUF.maj7, 'ma7': TYPE_BY_SUF.maj7, '°': TYPE_BY_SUF.dim, 'o': TYPE_BY_SUF.dim, '°7': TYPE_BY_SUF.dim7, 'o7': TYPE_BY_SUF.dim7, 'ø': TYPE_BY_SUF.m7b5, '+': TYPE_BY_SUF.aug, 'sus': TYPE_BY_SUF.sus4 });

  function pcName(pc) { return PREF[((pc % 12) + 12) % 12]; }
  function midiName(m) { return pcName(m) + (Math.floor(m / 12) - 1); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /** Construye un acorde objetivo: {root, type, name, tones:[{pc, role, w}], pcs:Set} */
  function makeChord(root, typeId) {
    const t = TYPES.find(x => x.id === typeId);
    if (!t) throw new Error('Tipo desconocido: ' + typeId);
    const tones = t.iv.map(([iv, role]) => ({ pc: (root + iv) % 12, role, w: ROLE_W[role] }));
    return { root, type: t.id, name: pcName(root) + t.suf, typeName: t.name, tones, pcs: new Set(tones.map(x => x.pc)) };
  }

  /** "F#m7", "Bb", "Edim7", "C/E" (la barra indica bajo deseado) */
  function parseChord(str) {
    if (!str) return null;
    const s = String(str).trim().replace('♭', 'b').replace('♯', '#');
    const m = s.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/);
    if (!m) return null;
    const rootName = m[1].toUpperCase() + m[2];
    const root = PC_OF[rootName];
    const t = TYPE_BY_SUF[m[3]];
    if (root === undefined || !t) return null;
    const ch = makeChord(root, t.id);
    if (m[4]) {
      const b = PC_OF[m[4][0].toUpperCase() + m[4].slice(1)];
      if (b !== undefined) { ch.bass = b; ch.name += '/' + pcName(b); }
    }
    return ch;
  }

  function allChords(typeIds) {
    const out = [];
    const ids = typeIds || TYPES.map(t => t.id);
    for (const id of ids) for (let r = 0; r < 12; r++) out.push(makeChord(r, id));
    return out;
  }

  AH.theory = { SHARP, FLAT, PREF, PC_OF, TYPES, ROLE_W, pcName, midiName, midiToFreq, makeChord, parseChord, allChords };
})(typeof globalThis !== 'undefined' ? globalThis : window);
