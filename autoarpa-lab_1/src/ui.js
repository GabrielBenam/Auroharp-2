/* Interfaz de usuario. */
(function (g) {
  'use strict';
  const AH = g.AH;
  const T = AH.theory, I = AH.instrument, E = AH.engine, O = AH.optimizer;
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; };
  const pct = x => Math.round(x * 100) + '%';
  const KEYROWS = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm,.-'];
  const LS_KEY = 'autoarpa.layouts.v1';
  const LS_LAST = 'autoarpa.lastLayout';
  const EMBED = /[?&]embed=/.test(g.location.search);       // dentro de la app Android (WebView)
  const bridge = () => g.AndroidBridge || null;

  const st = {
    layout: null, cache: null, pressed: new Set(), keyBars: new Map(), zone: 'full',
    audio: null, editSel: null, proposal: null, highlight: null, customDefs: [], anim: null, animHands: new Set(), mode: 'menu', layoutKey: 'def:os21'
  };

  /* ---------- Persistencia (opcional, nunca bloqueante) ---------- */
  function loadCustom() { try { const s = localStorage.getItem(LS_KEY); st.customDefs = s ? JSON.parse(s) : []; } catch (e) { st.customDefs = []; } }
  function saveCustom() { try { localStorage.setItem(LS_KEY, JSON.stringify(st.customDefs)); } catch (e) { toast('No se pudo guardar en este navegador; usa "Guardar" para exportar.'); } }

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

  /* ---------- Layouts ---------- */
  function fillLayoutSelect(selId) {
    const s = $('#layoutSel'); s.innerHTML = '';
    const og1 = el('optgroup', { label: 'Referencia' });
    I.LAYOUT_DEFS.forEach(d => og1.appendChild(el('option', { value: 'def:' + d.id }, d.name)));
    s.appendChild(og1);
    if (st.customDefs.length) {
      const og2 = el('optgroup', { label: 'Mis layouts' });
      st.customDefs.forEach((d, i) => og2.appendChild(el('option', { value: 'cus:' + i }, d.name)));
      s.appendChild(og2);
    }
    if (selId) s.value = selId;
  }
  function setLayout(layout) {
    st.layout = layout; st.pressed.clear(); st.editSel = null; st.highlight = null;
    st.cache = E.buildCache(layout);
    if (!st.audio) st.audio = new AH.Audio(layout.tuning); else st.audio.setTuning(layout.tuning);
    st.keyBars.clear();
    rebindKeys();
    $('#eName').value = layout.name;
    renderBars(); renderEditor(); updateReadout(); drawBed();
    $('#cTable').innerHTML = ''; $('#cSummary').innerHTML = '';
    animClose(true); notifyLayout();
    if (EMBED) setTimeout(() => { if (!$('#cTable').innerHTML) runCoverage(); }, 400); // la tabla queda lista antes de abrirla
  }
  /** Envía a la app Android el layout activo (máscaras por cuerda) para que el instrumento nativo lo use. */
  function notifyLayout() {
    const b = bridge(); if (!b || !st.layout) return;
    const L = st.layout;
    try {
      b.layoutChanged(JSON.stringify({ id: L.id, name: L.name, midi: L.tuning.map(x => x.midi), names: L.tuning.map(x => x.name),
        rows: L.rows.map(r => r.map(x => ({ label: x.label, mask: Array.from(x.mask).join('') }))) }));
    } catch (e) { /* sin puente */ }
  }
  function selectLayout(v) {
    st.layoutKey = v; try { localStorage.setItem(LS_LAST, v); } catch (e) { /* */ }
    if (v.startsWith('def:')) setLayout(I.buildLayout(I.LAYOUT_DEFS.find(d => d.id === v.slice(4))));
    else setLayout(I.deserializeLayout(st.customDefs[+v.slice(4)]));
  }

  /* ---------- Botonera ---------- */
  function keyOf(bar) { for (const [k, b] of st.keyBars) if (b === bar && k !== ';') return k; return ''; }
  function renderBars() {
    const box = $('#bars'); box.innerHTML = '';
    st.layout.rows.forEach(row => {
      const r = el('div', { class: 'bar-row' });
      row.forEach(b => {
        const btn = el('button', { class: 'bar-btn' + (st.pressed.has(b.id) ? ' on' : '') + (st.highlight && st.highlight.has(b.id) ? ' hl' : '') + (st.animHands.has(b.id) ? ' hand' : ''), title: (b.source === 'real' ? 'Fieltrado real documentado' : b.source === 'generado' ? 'Fieltrado generado por notas del acorde' : 'Barra personalizada') + (b.note ? ' · ' + b.note : '') },
          `<span class="src ${b.source}"></span>${b.label}<span class="k">${keyOf(b).toUpperCase()}</span>`);
        btn.addEventListener('pointerdown', e => { e.preventDefault(); if ($('#latch').checked || e.shiftKey || e.ctrlKey) toggleBar(b); else pressBar(b, true); });
        btn.addEventListener('pointerup', () => { if (!$('#latch').checked) pressBar(b, false); });
        btn.addEventListener('pointerleave', e => { if (!$('#latch').checked && e.buttons) pressBar(b, false); });
        r.appendChild(btn);
      });
      box.appendChild(r);
    });
  }
  function pressBar(b, on) {
    if (on) { if (st.pressed.has(b.id)) return; st.pressed.add(b.id); if (st.audio && st.audio.ctx) st.audio.applyMask(b.mask); }
    else { if (!st.pressed.has(b.id)) return; st.pressed.delete(b.id); }
    st.highlight = null; renderBars(); updateReadout(); drawBed();
  }
  function toggleBar(b) { pressBar(b, !st.pressed.has(b.id)); }
  function pressedBars() { return st.layout.rows.flat().filter(b => st.pressed.has(b.id)); }
  function currentMask() { return E.andMasks(pressedBars(), st.layout.tuning.length); }
  function currentZone() { return E.WINDOWS.find(w => w.id === st.zone) || E.WINDOWS[0]; }
  function currentStrings() {
    const m = currentMask(); const [a, b] = E.windowRange(currentZone(), m.length);
    const out = []; for (let i = a; i <= b; i++) if (m[i]) out.push(i); return out;
  }

  function updateReadout() {
    const bars = pressedBars();
    const name = $('#chordName'), info = $('#chordInfo'), alt = $('#chordAlt'), notes = $('#chordNotes'), meter = $('#chordMeter');
    alt.innerHTML = ''; notes.textContent = '';
    if (!bars.length) { name.textContent = '—'; info.textContent = 'Sin barras: suenan las 36 cuerdas'; meter.style.width = '0'; return; }
    const strings = currentStrings();
    const pcs = Array.from(new Set(strings.map(i => st.layout.tuning[i].pc)));
    if (pcs.length < 2) { name.textContent = '∅'; info.textContent = bars.map(b => b.label).join(' + ') + ': ' + (pcs.length ? 'una sola nota (' + T.pcName(pcs[0]) + ')' : 'ninguna cuerda suena'); meter.style.width = '0'; return; }
    const id = E.identify(strings, st.layout.tuning, 4);
    const top = id[0]; const cls = E.classify(top.sc.S);
    name.textContent = top.chord.name;
    info.textContent = bars.map(b => b.label).join(' + ') + ' · ' + pct(top.sc.S) + ' · ' + cls.name + (top.sc.inverted ? ' · bajo en ' + T.pcName(E.features(strings, st.layout.tuning).bass) : '');
    meter.style.width = pct(top.sc.S); meter.style.background = `var(--${cls.id})`;
    id.slice(1).forEach(x => alt.appendChild(el('span', { class: 'chip' }, x.chord.name + ' ' + pct(x.sc.S))));
    notes.textContent = 'Notas: ' + pcs.sort((a, b) => a - b).map(T.pcName).join(' · ') + ' · ' + strings.length + ' cuerdas';
  }

  /* ---------- Encordado (canvas) ---------- */
  const bed = { x: [], hover: -1, lastX: null, dragging: false };
  function drawBed() {
    const c = $('#bed'); if (!c || !st.layout) return;
    const dpr = g.devicePixelRatio || 1; const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const grd = x.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, css.getPropertyValue('--wood1')); grd.addColorStop(1, css.getPropertyValue('--wood2'));
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    const n = st.layout.tuning.length; const pad = 18; const step = (W - 2 * pad) / (n - 1);
    const mask = pressedBars().length ? currentMask() : null;
    const [za, zb] = E.windowRange(currentZone(), n);
    // zona
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(pad + za * step - step / 2, 0, (zb - za + 1) * step, H);
    const hl = st.highlightStrings;
    bed.x = [];
    for (let i = 0; i < n; i++) {
      const sx = pad + i * step; bed.x.push(sx);
      const on = !mask || mask[i];
      const thick = 2.6 - 1.8 * (i / (n - 1));
      x.strokeStyle = hl ? (hl.has(i) ? css.getPropertyValue('--accent') : css.getPropertyValue('--string-off')) : on ? css.getPropertyValue('--string') : css.getPropertyValue('--string-off');
      x.lineWidth = thick + (i === bed.hover ? 1 : 0);
      x.beginPath(); x.moveTo(sx, 26); x.lineTo(sx, H - 26); x.stroke();
      const vib = st.vib && st.vib[i] && (performance.now() - st.vib[i] < 900);
      if (vib) { x.strokeStyle = css.getPropertyValue('--accent'); x.globalAlpha = 0.5; x.lineWidth = thick + 3; x.beginPath(); x.moveTo(sx, 26); x.lineTo(sx, H - 26); x.stroke(); x.globalAlpha = 1; }
      const s = st.layout.tuning[i];
      x.fillStyle = on ? css.getPropertyValue('--text') : css.getPropertyValue('--string-off');
      x.font = '10px system-ui'; x.textAlign = 'center';
      if (step >= 16 || i % 2 === 0) { x.fillText(T.pcName(s.pc), sx, 16); x.fillText(String(i + 1), sx, H - 10); }
    }
    drawAnimOverlay(x, W, H, pad, step, css);
    if (st.vib && st.vib.some(t => t && performance.now() - t < 900)) requestAnimationFrame(drawBed);
  }
  /* Guía visual de la animación: zona de rasgueo, mano que barre las cuerdas y anillo del pinch. */
  function drawAnimOverlay(x, W, H, pad, step, css) {
    const an = st.anim; if (!an) return;
    const acc = css.getPropertyValue('--accent2');
    if (an.sweep) {
      const sw = an.sweep, c = AH.player.sweepAt(sw, an.t);
      x.fillStyle = acc; x.globalAlpha = 0.16; x.fillRect(pad + sw.a * step - step / 2, 0, (sw.b - sw.a + 1) * step, H); x.globalAlpha = 1;
      const cx = pad + c * step;
      x.strokeStyle = acc; x.lineWidth = 2; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(cx, 22); x.lineTo(cx, H - 22); x.stroke(); x.setLineDash([]);
      x.fillStyle = acc; x.beginPath(); x.arc(cx, H / 2, 11, 0, 6.2832); x.fill();
      x.fillStyle = '#10201b'; x.font = 'bold 13px system-ui'; x.textAlign = 'center'; x.fillText('→', cx, H / 2 + 4);
    }
    an.focus.forEach(f => {
      if (an.t < f.t || an.t > f.t + f.dur) return;
      const sx = pad + f.s * step, k = ((an.t - f.t) / 300) % 1;
      x.strokeStyle = acc; x.lineWidth = 3; x.beginPath(); x.arc(sx, H / 2, 10 + 10 * k, 0, 6.2832); x.stroke();
      x.fillStyle = acc; x.beginPath(); x.arc(sx, H / 2, 6, 0, 6.2832); x.fill();
      x.fillStyle = css.getPropertyValue('--text'); x.font = 'bold 12px system-ui'; x.textAlign = 'center'; x.fillText('pulsa', sx, H / 2 - 24);
    });
  }
  function stringAt(px) { let best = -1, d = 1e9; bed.x.forEach((sx, i) => { const dd = Math.abs(sx - px); if (dd < d) { d = dd; best = i; } }); return d < 14 ? best : -1; }
  function playString(i) {
    if (i < 0) return;
    const mask = pressedBars().length ? currentMask() : null;
    if (mask && !mask[i]) return;
    st.audio.pluck(i); markVib([i]);
  }
  function markVib(list) { st.vib = st.vib || []; const t = performance.now(); list.forEach(i => { st.vib[i] = t; }); drawBed(); }
  function strumNow() {
    const strings = pressedBars().length ? currentStrings() : (() => { const [a, b] = E.windowRange(currentZone(), st.layout.tuning.length); const o = []; for (let i = a; i <= b; i++) o.push(i); return o; })();
    st.audio.strum(strings, +$('#strumMs').value); markVib(strings);
  }
  function bindBed() {
    const c = $('#bed');
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); bed.dragging = true; const r = c.getBoundingClientRect(); bed.lastX = e.clientX - r.left; const i = stringAt(bed.lastX); playString(i); });
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(); const px = e.clientX - r.left;
      const h = stringAt(px); if (h !== bed.hover) { bed.hover = h; drawBed(); }
      if (!bed.dragging || bed.lastX === null) return;
      const lo = Math.min(bed.lastX, px), hi = Math.max(bed.lastX, px);
      const crossed = []; bed.x.forEach((sx, i) => { if (sx > lo && sx <= hi) crossed.push(i); });
      if (px < bed.lastX) crossed.reverse();
      crossed.forEach(playString); bed.lastX = px;
    });
    const end = () => { bed.dragging = false; bed.lastX = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { bed.hover = -1; drawBed(); });
    g.addEventListener('resize', drawBed);
  }

  /* ---------- Teclado ---------- */
  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (!$('#tab-play').classList.contains('active')) return;
      if (e.code === 'Space') { e.preventDefault(); strumNow(); return; }
      if (e.key === 'Escape') { st.audio.dampAll(); return; }
      const b = st.keyBars.get(e.key.toLowerCase());
      if (b && !e.repeat) { e.preventDefault(); if ($('#latch').checked) toggleBar(b); else pressBar(b, true); }
    });
    document.addEventListener('keyup', e => {
      if ($('#latch').checked) return;
      const b = st.keyBars.get(e.key.toLowerCase()); if (b) pressBar(b, false);
    });
  }

  /* ---------- Buscador ---------- */
  function miniBed(r) {
    const n = st.layout.tuning.length; const set = new Set(r.strings); const pins = new Set(r.pinches || []);
    let h = '<div class="minibed" title="Cuerdas que suenan (verde = pulsada aparte)">';
    for (let i = 0; i < n; i++) h += `<i class="${pins.has(i) ? 'pin' : set.has(i) ? 'on' : ''}"></i>`;
    return h + '</div>';
  }
  /* El orden de resultados = parecido − costo de ejecución; se muestra para que el orden sea comprensible. */
  function difficulty(r) { const c = r.sc.S - r.rank; return c < 0.03 ? 'fácil' : c < 0.09 ? 'media' : 'difícil'; }
  function resultCard(r, chord) {
    const cls = E.classify(r.sc.S);
    const tun = st.layout.tuning;
    const pcs = Array.from(new Set(r.strings.map(i => tun[i].pc))).sort((a, b) => a - b).map(T.pcName).join(' ');
    const det = [];
    if (r.sc.missing.length) det.push('faltan: ' + r.sc.missing.map(T.pcName).join(', '));
    if (r.sc.foreign.length) det.push('ajenas: ' + r.sc.foreign.map(T.pcName).join(', '));
    if (r.sc.inverted) det.push('inversión');
    if (r.pinches && r.pinches.length) det.push('arpegiado (pinch)');
    const card = el('div', { class: 'card' },
      `<div class="top-line"><span class="pct">${pct(r.sc.S)}</span><span class="badge ${cls.id}">${cls.name}</span></div>
       <div class="mech">${E.mechanism(r)} · ejecución ${difficulty(r)}</div>
       <div class="desc">${E.describe(r, tun)}</div>${miniBed(r)}
       <div class="det">Suenan: ${pcs} · ${r.strings.length} cuerdas${det.length ? ' · ' + det.join(' · ') : ''}</div>`);
    const acts = el('div', { class: 'acts' });
    acts.appendChild(el('button', { class: 'primary', onclick: () => startAnim(r, chord, cls) }, 'Ver animación'));
    acts.appendChild(el('button', { class: 'ghost web-only', onclick: () => playRecipe(r) }, 'Escuchar'));
    acts.appendChild(el('button', { class: 'ghost web-only', onclick: () => showOnBoard(r) }, 'Ver en botonera'));
    card.appendChild(acts);
    return card;
  }
  function playRecipe(r) {
    const a = st.audio; a.ensure(); a.dampAll();
    const base = r.strings.filter(i => !(r.pinches || []).includes(i));
    a.strum(base, +$('#strumMs').value);
    markVib(base);
    if (r.pinches && r.pinches.length) setTimeout(() => { r.pinches.forEach((p, k) => setTimeout(() => { a.pluck(p); markVib([p]); }, k * 160)); }, 260);
  }
  function showOnBoard(r) {
    st.pressed.clear(); r.bars.forEach(b => st.pressed.add(b.id)); st.zone = r.window.id; $('#zoneSel').value = st.zone;
    switchTab('play'); $('#latch').checked = true; renderBars(); updateReadout(); drawBed();
    toast('Barras presionadas (modo mantener). ' + (r.pinches.length ? 'Recuerda el pinch: ' + r.pinches.map(i => st.layout.tuning[i].name).join(', ') : ''));
  }
  function runSearch(chord) {
    if (!chord) { $('#qTarget').textContent = 'No reconozco ese acorde. Ejemplos: C, F#m, Bb7, Ebmaj7, Gsus4, Bdim, Adim7, Dm7b5, Caug, G/B'; $('#qResults').innerHTML = ''; return; }
    $('#qChord').value = chord.name;
    const res = E.search(chord, st.cache, { top: 12, pinches: $('#qPinch').checked, maxButtons: +$('#qMaxB').value });
    $('#qTarget').innerHTML = `<b>${chord.name}</b> (${chord.typeName}) · notas ${chord.tones.map(t => T.pcName(t.pc)).join(' · ')} · layout: ${st.layout.name}`;
    const box = $('#qResults'); box.innerHTML = '';
    if (!res.length) { box.innerHTML = '<p class="hint">Ninguna combinación se parece lo suficiente (&lt;35%). Prueba el Optimizador para re-fieltrar una barra.</p>'; return; }
    res.forEach(r => box.appendChild(resultCard(r, chord)));
  }

  /* ---------- Animación de ejemplo (escritorio, web y app Android) ---------- */
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
  function startAnim(r, chord, cls) {
    const plan = AH.player.build(st.layout, r, { label: chord && chord.name, pct: r.sc.S, className: cls && cls.name });
    const b = bridge();
    if (b && b.playExample) { b.playExample(JSON.stringify({ events: plan.events, duration: plan.duration, label: chord && chord.name })); return; }
    animClose(true);
    switchTab('play');
    st.audio.ensure(); st.audio.dampAll(); st.pressed.clear();
    st.anim = { ev: plan.events, dur: plan.duration, t: 0, i: 0, playing: true, speed: 1, last: performance.now(), sweep: null, focus: [], text: '' };
    $('#animBar').hidden = false; animLabels(); requestAnimationFrame(animTick);
  }
  function animLabels() {
    const an = st.anim; if (!an) return;
    $('#anPlay').textContent = an.playing ? 'Pausa' : (an.t >= an.dur ? 'Repetir' : 'Play');
    $('#anSpeed').textContent = an.speed + '×'; $('#anText').textContent = an.text;
  }
  function animApplyPress(idx) {
    const flat = st.layout.rows.flat();
    const ids = new Set(idx.map(k => flat[k] && flat[k].id).filter(Boolean));
    ids.forEach(id => { if (!st.pressed.has(id)) { const bar = flat.find(b => b.id === id); if (bar) st.audio.applyMask(bar.mask); } });
    st.pressed = new Set(ids); st.animHands = new Set(ids); st.highlight = null;
    renderBars(); updateReadout();
  }
  function animFire(e) {
    const an = st.anim;
    if (e.type === 'caption') { an.text = e.text; $('#anText').textContent = e.text; }
    else if (e.type === 'press') animApplyPress(e.bars);
    else if (e.type === 'sweep') an.sweep = e;
    else if (e.type === 'focus') an.focus.push(e);
    else if (e.type === 'pluck') { const m = pressedBars().length ? currentMask() : null; if (!m || m[e.s]) { st.audio.pluck(e.s, undefined, e.vel); markVib([e.s]); } }
    else if (e.type === 'end') { an.playing = false; animLabels(); }
  }
  function animTick(now) {
    const an = st.anim; if (!an) return;
    const dt = now - an.last; an.last = now;
    if (an.playing) {
      an.t += dt * an.speed;
      while (an.i < an.ev.length && an.ev[an.i].t <= an.t) animFire(an.ev[an.i++]);
      if (an.sweep && an.t > an.sweep.t + an.sweep.dur + 500) an.sweep = null;
    }
    drawBed();
    requestAnimationFrame(animTick);
  }
  function animToggle() {
    const an = st.anim; if (!an) return;
    if (!an.playing && an.t >= an.dur) { animRestart(); return; }
    an.playing = !an.playing; an.last = performance.now(); animLabels();
  }
  function animSpeed(dir) {
    const an = st.anim; if (!an) return;
    const k = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(an.speed) + dir)); an.speed = SPEEDS[k]; animLabels();
  }
  function animRestart() {
    const an = st.anim; if (!an) return;
    st.audio.dampAll(); st.pressed.clear(); st.animHands.clear(); renderBars(); updateReadout();
    an.t = 0; an.i = 0; an.sweep = null; an.focus = []; an.playing = true; an.last = performance.now(); animLabels();
  }
  function animClose(silent) {
    if (!st.anim) return;
    st.anim = null; st.animHands.clear(); $('#animBar').hidden = true;
    if (!silent) { st.audio.dampAll(); st.pressed.clear(); renderBars(); updateReadout(); drawBed(); }
  }

  /* ---------- Cobertura ---------- */
  function runCoverage() {
    const grid = E.coverage(st.cache, null, { pinches: $('#cPinch').checked });
    const t = $('#cTable'); t.innerHTML = '';
    const head = el('tr'); head.appendChild(el('th', null, ''));
    for (let r = 0; r < 12; r++) head.appendChild(el('th', null, T.pcName(r)));
    t.appendChild(head);
    let n = 0, ex = 0, fu = 0, sum = 0;
    grid.forEach(row => {
      const tr = el('tr'); const ty = T.TYPES.find(x => x.id === row.type);
      tr.appendChild(el('th', { title: ty.name }, ty.suf || 'mayor'));
      row.cells.forEach(cell => {
        const cls = cell.best ? E.classify(cell.S).id : 'none';
        n++; sum += cell.S; if (cls === 'exacto') ex++; if (cls === 'exacto' || cls === 'funcional') fu++;
        const td = el('td', { class: cls, title: cell.chord.name + (cell.best ? ' · ' + E.describe(cell.best, st.layout.tuning) : ' · sin opción') }, cell.best ? Math.round(cell.S * 100) : '–');
        td.addEventListener('click', () => { switchTab('search'); runSearch(cell.chord); });
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    $('#cSummary').innerHTML = `<div class="kpi"><b>${ex}</b><span>exactos de ${n}</span></div><div class="kpi"><b>${fu}</b><span>exactos + funcionales</span></div><div class="kpi"><b>${pct(sum / n)}</b><span>parecido medio</span></div><div class="kpi"><b>${st.layout.rows.flat().length}</b><span>barras</span></div>`;
  }

  /* ---------- Optimizador ---------- */
  function runOptimize() {
    const rep = O.parseRepertoire($('#oRep').value);
    const out = $('#oOut'); out.innerHTML = '';
    if (rep.bad.length) toast('Ignorados: ' + rep.bad.join(', '));
    if (!rep.items.length) { out.innerHTML = '<p class="hint">Escribe al menos un acorde.</p>'; return; }
    out.innerHTML = '<p class="hint">Calculando…</p>';
    setTimeout(() => {
      const locked = new Set($('#oLocked').value.split(/[\s,]+/).filter(Boolean));
      const r = O.optimize(st.layout, rep.items, { steps: +$('#oSteps').value, locked });
      st.proposal = r.layout; $('#oApply').disabled = !r.changes.length;
      out.innerHTML = '';
      const sum = el('div', { class: 'card' }, `<div class="top-line"><span class="pct">${pct(r.before.value)} → ${pct(r.after.value)}</span><span class="badge ${E.classify(r.after.value).id}">cobertura del repertorio</span></div>
        <div class="desc">${r.changes.length ? r.changes.map(c => `Re-fieltrar <b>${c.from}</b> (fila ${c.row + 1}, pos. ${c.col + 1}) como <b>${c.to}</b> · +${pct(c.gain)}`).join('<br>') : 'Ningún cambio mejora la cobertura: el layout ya cubre bien este repertorio o las barras útiles están bloqueadas.'}</div>`);
      out.appendChild(sum);
      const tb = el('table', { class: 'simple' }, '<tr><th>Acorde</th><th>Peso</th><th>Antes</th><th>Después</th><th>Cómo (después)</th></tr>');
      r.after.per.forEach((p, i) => { const b = r.before.per[i]; tb.appendChild(el('tr', null, `<td>${p.chord.name}</td><td>${p.w}</td><td>${pct(b.S)}</td><td>${pct(p.S)}</td><td>${p.best ? E.describe(p.best, st.layout.tuning) : '—'}</td>`)); });
      const wrap = el('div', { class: 'card', style: 'grid-column:1/-1' }); wrap.appendChild(tb); out.appendChild(wrap);
    }, 20);
  }

  /* ---------- Reacomodo ---------- */
  function gridHtml(layout, movedLabels) {
    let h = '<div class="bars small">';
    layout.rows.forEach(r => { h += '<div class="bar-row">' + r.map(b => `<span class="bar-btn mini${movedLabels.has(b.label) ? ' moved' : ''}">${b.label}</span>`).join('') + '</div>'; });
    return h + '</div>';
  }
  function runArrange() {
    const out = $('#aOut'); out.innerHTML = '<p class="hint">Calculando…</p>';
    setTimeout(() => {
      const locked = new Set($('#aLocked').value.split(/[\s,]+/).filter(Boolean));
      const r = AH.arranger.arrange(st.layout, { progressions: $('#aProg').value, locked, withinRows: $('#aRows').checked });
      st.arranged = r.layout; $('#aApply').disabled = !r.moves.length;
      if (r.bad.length) toast('Ignorados: ' + r.bad.join(', '));
      const moved = new Set(r.moves.map(m => m.label));
      const f = (x, d) => x.toFixed(d === undefined ? 2 : d);
      const b = r.before, a = r.after;
      out.innerHTML = '';
      out.appendChild(el('div', { class: 'card' }, `<div class="top-line"><b>Antes</b></div>${gridHtml(st.layout, new Set())}`));
      out.appendChild(el('div', { class: 'card' }, `<div class="top-line"><b>Después</b><span class="badge funcional">${r.moves.length} barras movidas</span></div>${gridHtml(r.layout, moved)}`));
      const tb = el('table', { class: 'simple' }, `<tr><th>Indicador</th><th>Antes</th><th>Después</th></tr>
        <tr><td>Recorrido medio de la mano por cambio (botones)</td><td>${r.transitions ? f(b.travelAvg) : '—'}</td><td>${r.transitions ? f(a.travelAvg) : '—'}</td></tr>
        <tr><td>Cambios a un botón vecino</td><td>${r.transitions ? pct(b.nearPct) : '—'}</td><td>${r.transitions ? pct(a.nearPct) : '—'}</td></tr>
        <tr><td>Patrón armónico de Smith cumplido</td><td>${f(b.harmony, 1)} / ${b.harmonyMax}</td><td>${f(a.harmony, 1)} / ${a.harmonyMax}</td></tr>
        <tr><td>Tonalidades con IV-I-V contiguos</td><td>${b.keysIVV.join(' ') || '—'}</td><td>${a.keysIVV.join(' ') || '—'}</td></tr>`);
      const wrap = el('div', { class: 'card', style: 'grid-column:1/-1' }); wrap.appendChild(tb);
      if (r.missing.length) wrap.appendChild(el('p', { class: 'hint' }, 'Sin forma de tocar (≥70%) con este layout, no cuentan en el recorrido: ' + r.missing.join(', ') + '. Usa el optimizador de re-fieltrado primero.'));
      if (r.moves.length) wrap.appendChild(el('p', { class: 'desc' }, 'Movimientos: ' + r.moves.map(m => `${m.label} (fila ${m.from.r + 1}, pos. ${m.from.c + 1} → fila ${m.to.r + 1}, pos. ${m.to.c + 1})`).join(' · ')));
      out.appendChild(wrap);
    }, 20);
  }

  /* ---------- Editor ---------- */
  function renderEditor() {
    const box = $('#eBars'); box.innerHTML = '';
    st.layout.rows.forEach((row, ri) => {
      const r = el('div', { class: 'bar-row' });
      row.forEach((b, ci) => {
        const btn = el('button', { class: 'bar-btn' + (st.editSel && st.editSel.b === b ? ' sel' : '') }, `<span class="src ${b.source}"></span>${b.label}`);
        btn.addEventListener('click', () => { st.editSel = { b, ri, ci }; renderEditor(); });
        r.appendChild(btn);
      });
      box.appendChild(r);
    });
    const grid = $('#eStrings'); grid.innerHTML = '';
    const sel = st.editSel && st.editSel.b;
    $('#eLabel').value = sel ? sel.label : '';
    st.layout.tuning.forEach((s, i) => {
      const on = sel ? !!sel.mask[i] : false;
      const btn = el('button', { class: on ? 'on' : '', title: 'Cuerda ' + (i + 1) + ' · ' + s.name }, (i + 1) + ' ' + s.name);
      btn.disabled = !sel;
      btn.addEventListener('click', () => { sel.mask[i] = sel.mask[i] ? 0 : 1; sel.source = 'custom'; afterEdit(); });
      grid.appendChild(btn);
    });
    if (sel) {
      const strings = []; sel.mask.forEach((v, i) => { if (v) strings.push(i); });
      const id = strings.length ? E.identify(strings, st.layout.tuning, 3) : [];
      $('#eInfo').textContent = strings.length ? `Suena como: ${id.map(x => x.chord.name + ' ' + pct(x.sc.S)).join(' · ')} · ${strings.length} cuerdas · origen: ${sel.source}${sel.note ? ' · ' + sel.note : ''}` : 'Barra sin cuerdas libres.';
    } else $('#eInfo').textContent = 'Selecciona una barra.';
  }
  function afterEdit() { st.cache = E.buildCache(st.layout); renderEditor(); renderBars(); updateReadout(); drawBed(); notifyLayout(); }
  function bindEditor() {
    $('#eLabel').addEventListener('change', () => { if (st.editSel) { st.editSel.b.label = $('#eLabel').value.trim() || '?'; afterEdit(); } });
    $('#eFromChord').addEventListener('click', () => {
      if (!st.editSel) return toast('Selecciona una barra');
      try { const nb = I.barFromChord($('#eLabel').value.trim(), st.layout.tuning); st.editSel.b.mask = nb.mask; st.editSel.b.label = nb.label; st.editSel.b.source = 'custom'; afterEdit(); }
      catch (e) { toast('Etiqueta no reconocida como acorde'); }
    });
    $('#eAdd').addEventListener('click', () => {
      const ri = st.editSel ? st.editSel.ri : st.layout.rows.length - 1;
      const nb = I.barFromChord('C', st.layout.tuning); nb.source = 'custom';
      st.layout.rows[ri].push(nb); st.editSel = { b: nb, ri, ci: st.layout.rows[ri].length - 1 }; rebindKeys(); afterEdit();
    });
    $('#eDel').addEventListener('click', () => {
      if (!st.editSel) return; const { ri, ci } = st.editSel; st.layout.rows[ri].splice(ci, 1);
      st.layout.rows = st.layout.rows.filter(r => r.length); st.editSel = null; st.pressed.clear(); rebindKeys(); afterEdit();
    });
    const move = (dr, dc) => {
      if (!st.editSel) return; let { b, ri, ci } = st.editSel; const rows = st.layout.rows;
      rows[ri].splice(ci, 1);
      let nr = ri + dr; if (nr < 0) { rows.unshift([]); nr = 0; ri++; } if (nr >= rows.length) rows.push([]);
      let nc = dr ? Math.min(ci, rows[nr].length) : Math.max(0, Math.min(rows[nr].length, ci + dc));
      rows[nr].splice(nc, 0, b);
      st.layout.rows = rows.filter(r => r.length);
      const fr = st.layout.rows.findIndex(r => r.includes(b));
      st.editSel = { b, ri: fr, ci: st.layout.rows[fr].indexOf(b) }; rebindKeys(); afterEdit();
    };
    $('#eLeft').addEventListener('click', () => move(0, -1)); $('#eRight').addEventListener('click', () => move(0, 1));
    $('#eUp').addEventListener('click', () => move(-1, 0)); $('#eDown').addEventListener('click', () => move(1, 0));
    $('#eHear').addEventListener('click', () => { if (!st.editSel) return; const s = []; st.editSel.b.mask.forEach((v, i) => { if (v) s.push(i); }); st.audio.dampAll(); st.audio.strum(s); });
    $('#eSave').addEventListener('click', () => {
      const name = $('#eName').value.trim() || 'Mi layout';
      const ser = I.serializeLayout(st.layout); ser.name = name; ser.id = 'cus' + Date.now();
      const idx = st.customDefs.findIndex(d => d.name === name);
      if (idx >= 0) st.customDefs[idx] = ser; else st.customDefs.push(ser);
      saveCustom(); st.layout.name = name;
      fillLayoutSelect('cus:' + (idx >= 0 ? idx : st.customDefs.length - 1)); toast('Layout guardado: ' + name);
    });
    $('#eDelLayout').addEventListener('click', () => {
      const v = $('#layoutSel').value; if (!v.startsWith('cus:')) return toast('Solo se pueden borrar layouts propios');
      st.customDefs.splice(+v.slice(4), 1); saveCustom(); fillLayoutSelect('def:os21'); selectLayout('def:os21'); toast('Layout borrado');
    });
  }
  function rebindKeys() {
    st.keyBars.clear();
    st.layout.rows.forEach((r, ri) => r.forEach((b, ci) => { const k = (KEYROWS[ri] || '')[ci]; if (k) st.keyBars.set(k, b); }));
    if (st.keyBars.has('ñ')) st.keyBars.set(';', st.keyBars.get('ñ')); // teclado US
  }

  /* ---------- General ---------- */
  function switchTab(id) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + id));
    if (id === 'play') setTimeout(drawBed, 0);
    if (id === 'coverage' && !$('#cTable').innerHTML) runCoverage();
  }
  /* ---------- Modo embebido: menú y tabla de acordes dentro de la app Android ---------- */
  function openMode(mode) {
    st.mode = mode; document.body.dataset.mode = mode;
    if (mode === 'table') { switchTab('coverage'); if (!$('#cTable').innerHTML) runCoverage(); }
    else switchTab(st.menuTab && st.menuTab !== 'play' && st.menuTab !== 'coverage' ? st.menuTab : 'search');
  }
  function buildSettings() {
    const b = bridge(), box = $('#setBox'); if (!b || !b.getSettings) return;
    let cur = {}; try { cur = JSON.parse(b.getSettings()); } catch (e) { /* */ }
    const items = [['latch', 'Fijar botones (tocar para dejar presionada, otro toque la suelta)'], ['mirror', 'Zurdo: botonera a la derecha (las cuerdas no cambian de sentido)'],
      ['studio', 'Franja Estudio: ver qué cuerdas suenan'], ['force', 'Volumen según la fuerza del toque (si la pantalla lo permite)'], ['latency', 'Mostrar panel de latencia']];
    box.innerHTML = '';
    items.forEach(([k, label]) => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = !!cur[k];
      cb.addEventListener('change', () => b.setSetting(k, cb.checked));
      const l = el('label'); l.appendChild(cb); l.appendChild(document.createTextNode(label)); box.appendChild(l);
    });
    box.appendChild(el('button', { class: 'ghost', onclick: () => b.resetStats() }, 'Reiniciar medición de latencia'));
  }

  function exportLayout() {
    const data = JSON.stringify(I.serializeLayout(st.layout), null, 1);
    const a = el('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: (st.layout.name || 'layout').replace(/[^\w\-]+/g, '_') + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function importLayout(file) {
    const r = new FileReader();
    r.onload = () => {
      try { const obj = JSON.parse(r.result); const L = I.deserializeLayout(obj); st.customDefs.push(I.serializeLayout(L)); saveCustom(); fillLayoutSelect('cus:' + (st.customDefs.length - 1)); setLayout(L); toast('Layout importado'); }
      catch (e) { toast('Archivo no válido: ' + e.message); }
    };
    r.readAsText(file);
  }
  function help() {
    $('#helpBox').innerHTML = `
<h3>Qué hace este programa</h3>
<p>Simula una autoarpa de 36 cuerdas y, además de tocar los acordes de cada barra, busca acordes que el layout no trae de fábrica combinando tres mecanismos físicamente reales: <b>intersección</b> (presionar 2 o 3 barras a la vez: solo suenan las cuerdas libres en todas), <b>zona de rasgueo</b> (rasguear solo una parte del encordado) y <b>pinch</b> (rasguear con barras, soltarlas y pulsar 1 o 2 cuerdas sueltas; el acorde resultante es arpegiado y por eso nunca puntúa 100%).</p>
<h3>Qué NO hace (a propósito)</h3>
<p>No propone "cambiar de barra a mitad del rasgueo" para sumar notas: al presionar una barra nueva su fieltro apaga las cuerdas que ya vibraban, así que la unión de dos acordes no es físicamente posible por esa vía.</p>
<h3>Porcentaje de parecido</h3>
<p>Combina 65% de cobertura funcional (fundamental y tercera pesan 1.0, séptima 0.8, extensiones 0.6, quinta 0.4; penaliza notas ajenas, más si chocan a un semitono, y el bajo ajeno) y 35% de similitud espectral (coseno entre vectores de croma con armónicos 3.º y 5.º). Mismas notas que el acorde = 100% (Exacto). ≥85% Funcional, ≥70% Sustituto, menor Color.</p>
<h3>Teclado</h3>
<p>Fila 1 de botones: <code>1…0</code> · Fila 2: <code>Q…P</code> · Fila 3: <code>A…Ñ</code> · Espacio: rasguear · Esc: apagar todo. Mantén varias teclas para intersecar barras. Shift/Ctrl+clic o "Mantener presionadas" para dejar barras fijas.</p>
<h3>Fieltrado</h3>
<p>Punto verde = fieltrado real documentado (hojas de Harpers Guild / P. D. Race). Sin punto = generado a partir de las notas del acorde, cerrando en el bajo las inversiones malas con la regla deducida de los fieltros reales. Naranja = personalizado o propuesto. Edita cualquier barra cuerda por cuerda en "Editor de barras".</p>
<h3>Afinación</h3>
<p>Cromática estándar de 36 cuerdas: F2 G2 C3 D3 E3 · F3 F#3 G3 A3 A#3 B3 · C4…B4 · C5…B5 · C6. El bajo no es cromático, por eso algunos acordes tienen bajo invertido.</p>`;
  }

  function init() {
    if (EMBED) document.body.classList.add('embed');
    loadCustom(); fillLayoutSelect('def:os21');
    E.WINDOWS.forEach(w => $('#zoneSel').appendChild(el('option', { value: w.id }, w.name)));
    T.PREF.forEach((n, i) => $('#qRoot').appendChild(el('option', { value: i }, n)));
    T.TYPES.forEach(t => $('#qType').appendChild(el('option', { value: t.id }, (t.suf || 'mayor') + ' · ' + t.name)));
    $('#layoutSel').addEventListener('change', e => selectLayout(e.target.value));
    $('#zoneSel').addEventListener('change', e => { st.zone = e.target.value; updateReadout(); drawBed(); });
    $('#btnStrum').addEventListener('click', strumNow);
    $('#btnDamp').addEventListener('click', () => st.audio.dampAll());
    $('#btnRelease').addEventListener('click', () => { st.pressed.clear(); renderBars(); updateReadout(); drawBed(); });
    $('#vol').addEventListener('input', e => st.audio.setVolume(+e.target.value));
    $('#btnTheme').addEventListener('click', () => { const r = document.documentElement; const nt = r.dataset.theme === 'light' ? 'dark' : 'light'; r.dataset.theme = nt; try { localStorage.setItem('autoarpa.theme', nt); } catch (e) { /* */ } drawBed(); });
    try { const th = localStorage.getItem('autoarpa.theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* */ }
    $('#btnExport').addEventListener('click', exportLayout);
    $('#btnImport').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', e => { if (e.target.files[0]) importLayout(e.target.files[0]); e.target.value = ''; });
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { if (EMBED) st.menuTab = b.dataset.tab; switchTab(b.dataset.tab); }));
    $('#anPlay').addEventListener('click', animToggle); $('#anSlow').addEventListener('click', () => animSpeed(-1)); $('#anFast').addEventListener('click', () => animSpeed(1));
    $('#anRestart').addEventListener('click', animRestart); $('#anClose').addEventListener('click', () => animClose());
    $('#btnEmbedClose').addEventListener('click', () => { const b = bridge(); if (b) b.close(); });
    $('#qBack').addEventListener('click', () => switchTab('coverage'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') return; if (e.code === 'Space' && st.anim && !/input|textarea|select|button/i.test(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); animToggle(); } }, true);
    $('#qGo').addEventListener('click', () => runSearch(T.parseChord($('#qChord').value)));
    $('#qChord').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(T.parseChord($('#qChord').value)); });
    $('#qType').addEventListener('change', () => runSearch(T.makeChord(+$('#qRoot').value, $('#qType').value)));
    $('#qRoot').addEventListener('change', () => runSearch(T.makeChord(+$('#qRoot').value, $('#qType').value)));
    $('#qPinch').addEventListener('change', () => runSearch(T.parseChord($('#qChord').value)));
    $('#qMaxB').addEventListener('change', () => runSearch(T.parseChord($('#qChord').value)));
    $('#cGo').addEventListener('click', runCoverage);
    $('#cPinch').addEventListener('change', runCoverage);
    $('#oGo').addEventListener('click', runOptimize);
    $('#aGo').addEventListener('click', runArrange);
    $('#aApply').addEventListener('click', () => { if (!st.arranged) return; const ser = I.serializeLayout(st.arranged); st.customDefs.push(ser); saveCustom(); fillLayoutSelect('cus:' + (st.customDefs.length - 1)); setLayout(I.deserializeLayout(ser)); toast('Layout reacomodado cargado y guardado en "Mis layouts"'); });
    $('#oApply').addEventListener('click', () => { if (!st.proposal) return; const ser = I.serializeLayout(st.proposal); st.customDefs.push(ser); saveCustom(); fillLayoutSelect('cus:' + (st.customDefs.length - 1)); setLayout(I.deserializeLayout(ser)); toast('Layout propuesto cargado y guardado en "Mis layouts"'); });
    bindBed(); bindKeys(); bindEditor(); help();
    let first = 'def:os21';
    try { const last = localStorage.getItem(LS_LAST); if (last && (last.startsWith('def:') ? I.LAYOUT_DEFS.some(d => 'def:' + d.id === last) : st.customDefs[+last.slice(4)])) first = last; } catch (e) { /* */ }
    fillLayoutSelect(first); selectLayout(first);
    AH.ui = { openMode, state: st, startAnim, notifyLayout };
    if (EMBED) { buildSettings(); openMode('menu'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
