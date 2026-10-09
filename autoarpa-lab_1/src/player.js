/* Guion de animación de un ejemplo de acorde.
   Convierte una receta del buscador {bars, window, range, pinches, sc} en una lista de eventos con tiempo (ms a velocidad 1×)
   que reproducen la interfaz de escritorio y la app Android: presionar barras, rasguear de grave a agudo,
   soltar barras y pulsar cuerdas sueltas (pinch). Sin dependencias de DOM: se prueba en Node. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};
  const T = AH.theory, E = AH.engine;

  const TIMING = { hold: 1300, perString: 55, afterStrum: 1500, releasePause: 1300, pinchLead: 700, pinchGap: 1500, tail: 1800 };

  function noteName(tuning, i) { return tuning[i].name; }

  /**
   * layout: {rows, tuning}; r: receta; opts: {label: 'Am7', pct: 0.92, className: 'Funcional'}
   * Devuelve {events, duration, steps, barIdx, strum, pinches}.
   */
  function build(layout, r, opts) {
    opts = opts || {};
    const tun = layout.tuning, n = tun.length;
    const flat = layout.rows.flat();
    const barIdx = r.bars.map(b => { let k = flat.indexOf(b); if (k < 0) k = flat.findIndex(x => x.label === b.label); return k; }).filter(k => k >= 0);
    const mask = E.andMasks(r.bars, n);
    const a = r.range ? r.range[0] : 0, b = r.range ? r.range[1] : n - 1;
    const pins = (r.pinches || []).slice();
    const strum = [];
    for (let i = a; i <= b; i++) if (mask[i]) strum.push(i);
    const labels = r.bars.map(x => x.label);
    const steps = 2 + (pins.length ? 2 : 0);
    const ev = [];
    let t = 0, step = 1;
    const cap = (at, text) => ev.push({ t: at, type: 'caption', text });

    // 1) presionar
    cap(t, `Paso ${step}/${steps}: ` + (labels.length === 1
      ? `Mantén presionada la barra ${labels[0]}.`
      : `Mantén presionadas a la vez ${labels.join(' y ')}, cada una con un dedo distinto. Solo suenan las cuerdas libres en todas las barras (intersección).`));
    ev.push({ t, type: 'press', bars: barIdx });
    step++;

    // 2) rasguear
    t += TIMING.hold;
    const full = a === 0 && b === n - 1;
    const where = full ? 'todo el encordado' : `solo desde la cuerda ${a + 1} (${noteName(tun, a)}) hasta la ${b + 1} (${noteName(tun, b)})`;
    cap(t, `Paso ${step}/${steps}: Con la otra mano rasguea de grave a agudo ${where}. Las cuerdas en gris no suenan: las tapa el fieltro.`);
    const dur = Math.max(0, (strum.length - 1) * TIMING.perString);
    ev.push({ t, type: 'sweep', a, b, dur, s: -1 });
    strum.forEach((s, k) => ev.push({ t: t + k * TIMING.perString, type: 'pluck', s, vel: 0.75, kind: 'strum' }));
    let end = t + dur;
    step++;

    // 3) pinch
    if (pins.length) {
      end += TIMING.afterStrum;
      cap(end, `Paso ${step}/${steps}: Suelta todas las barras. Las cuerdas que ya vibran siguen sonando.`);
      ev.push({ t: end, type: 'press', bars: [] });
      step++;
      end += TIMING.releasePause;
      pins.forEach((p, k) => {
        const at = end + k * TIMING.pinchGap;
        if (k === 0) cap(at, `Paso ${step}/${steps}: Con un dedo pulsa la cuerda ${p + 1} (${noteName(tun, p)})` + (pins.length > 1 ? `; después la ${pins.filter((_, j) => j > 0).map(q => (q + 1) + ' (' + noteName(tun, q) + ')').join(' y la ')}.` : '.'));
        else cap(at, `Ahora pulsa la cuerda ${p + 1} (${noteName(tun, p)}).`);
        ev.push({ t: at, type: 'focus', s: p, dur: TIMING.pinchLead + 600 });
        ev.push({ t: at + TIMING.pinchLead, type: 'pluck', s: p, vel: 0.8, kind: 'pinch' });
      });
      end += (pins.length - 1) * TIMING.pinchGap + TIMING.pinchLead;
    }

    // cierre
    end += TIMING.afterStrum / 2;
    const res = opts.label ? `Resultado: ${opts.label}` + (opts.pct !== undefined ? ` al ${Math.round(opts.pct * 100)}%` : '') + (opts.className ? ` (${opts.className})` : '') + (pins.length ? ', arpegiado.' : '.') : 'Fin del ejemplo.';
    cap(end, res);
    ev.push({ t: end + TIMING.tail, type: 'end' });
    ev.sort((x, y) => x.t - y.t); // estable: conserva el orden relativo de eventos simultáneos
    return { events: ev, duration: end + TIMING.tail, steps, barIdx, strum, pinches: pins };
  }

  /** Cursor del rasgueo (índice de cuerda con decimales) en el instante t, o null si no hay rasgueo activo. */
  function sweepAt(sw, t) {
    if (!sw) return null;
    const k = sw.dur > 0 ? Math.min(1, Math.max(0, (t - sw.t) / sw.dur)) : 1;
    return sw.a + (sw.b - sw.a) * k;
  }

  AH.player = { TIMING, build, sweepAt };
})(typeof globalThis !== 'undefined' ? globalThis : window);
