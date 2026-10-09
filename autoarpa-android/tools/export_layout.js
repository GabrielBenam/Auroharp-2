// Genera app/src/main/assets/layouts.json desde el motor web (../autoharp-lab/src).
const path = require('path'), fs = require('fs');
const src = path.join(__dirname, '..', '..', 'autoharp-lab', 'src');
['theory', 'felts', 'instrument'].forEach(f => require(path.join(src, f + '.js')));
const I = globalThis.AH.instrument;
const out = I.LAYOUT_DEFS.map(d => {
  const L = I.buildLayout(d);
  return { id: L.id, name: L.name,
    midi: L.tuning.map(s => s.midi), names: L.tuning.map(s => s.name),
    rows: L.rows.map(r => r.map(b => ({ label: b.label, mask: Array.from(b.mask).join('') }))) };
});
fs.writeFileSync(path.join(__dirname, '..', 'app/src/main/assets/layouts.json'), JSON.stringify(out));
console.log('layouts:', out.map(o => o.id + '(' + o.rows.flat().length + ')').join(' '));
