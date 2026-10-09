# Bibliografía y referencias — Autoarpa Lab

Cada referencia indica para qué se usó en el software.

## Fuentes del proyecto (archivos cargados)

1. Bob Lewis (2001). *Chord bar layouts* (chord_layouts.pdf). Layouts Std 12, Std 15 (Berkshire), Appalachian 15, Guitaro, 15A, GDAE, Chuck Daniels, Drew Smith, Factory/Lewis 21, y la advertencia de que B7 es la única barra que usa las cuerdas D#. Uso: presets `std12`, `std15`, `app15`; barra B7 bloqueada por defecto en el optimizador. https://harpersguild.com/autoharp_tweaking/folk_friendly/chord_layouts.pdf
2. Jo Ann Smith, Autoharpist LLC. *The Unified Chord Bar Arrangement* (Unified Chord Bars.pdf). Teoría I-IV-V, relativos menores y arreglo Unified con variante con barras personalizadas. Uso: presets `os21`, `unified21`, `folk21`. https://drive.google.com/file/d/1P4ga42ltcPnEZ_Tc0YbmxmngqIxiNzf6/view
3. Harpers Guild. *21_chord_reconfig_chord_bars.xls*. Fieltrado cuerda por cuerda de E, Bm, F#m, F#7 y C#m. Uso: fieltros reales del preset `folk21` y afinación de 36 cuerdas. Copia en `docs/referencias/`.
4. Paul D. Race (2017). *autoharp_pauls_15_chord_folk_chords.xls*. Fieltrado cuerda por cuerda de 15 barras folk (FCGDA). Uso: preset `race15`, afinación y deducción de la regla de bajo. Copia en `docs/referencias/`.

## Referencias web consultadas

5. Alan J. Gumm (12 abr 2026). *21-Chord Autoharp Chord Layout Options: A Do-It-Yourself Guide*. Compara los layouts Factory, Unified, Bowers/Americana, Fretted Instrument Keys, Folk Rock, Hailey Jazz Diminished, Lewis Advanced y Gumm Jazz Compromise. Documenta que Linda Louisell presiona F#m + B7 para obtener un F# ("passable in a jam, thin on its own"). Uso: validación práctica del mecanismo de intersección y de las equivalencias de disminuidos. https://alanjgumm.wordpress.com/2026/04/12/21-chord-autoharp-chord-layout-options-a-do-it-yourself-guide/
6. Harpers Guild. *Simplest 21-Chorder Reconfiguration*. Procedimiento de re-fieltrado: fieltro de 3/16" × 3/16" para 21 barras, tira continua con muescas en V, cortes angostos y prueba antes de reinstalar. Uso: textos del optimizador (re-fieltrar barra existente). https://harpersguild.com/autoharp_tweaking/simple_21/simplest_21-chorder_reconfig.htm
7. Harpers Guild. *Folk-Friendly Autoharp*. Layouts Bowers/Americana y Unified, diferencias de fieltro 15 vs. 21 barras y advertencias de desmontaje. https://harpersguild.com/autoharp_tweaking/folk_friendly/folk_autoharp.htm
8. Harpers Guild. *Autoharp Factory Chord Setups*. Historia de los sets de 5, 8, 12, 15 y 21 barras. https://harpersguild.com/history_of_autoharp/factory_setups/autoharp_factory_chords.htm
9. Videos citados por Gumm: cambio simple de Bb a Bm https://youtu.be/QOs_BMPWtvc · cómo re-fieltrar una autoarpa https://youtu.be/S2JzuImtnZs · opciones de Smith https://youtu.be/pFH_SjpxGf0
10. Plantillas para imprimir (no descargables desde este entorno; enlazar manualmente): OS21 replacement chord bars https://harpersguild.com/autoharp_tweaking/chromatic_21/0s21_replacement_chord_bars.pdf · hoja 15 barras v2 con E https://harpersguild.com/autoharp_tweaking/folk_friendly/autoharp_pauls_15_chord_folk_chords2.xls · hoja de fieltros de Wendy Grossman https://www.pelicancrossing.net/autoharp.xls

## Fundamentos técnicos del motor

11. Karplus, K. y Strong, A. (1983). Digital Synthesis of Plucked-String and Drum Timbres. *Computer Music Journal*, 7(2), 43–55. Uso: síntesis de cuerda pulsada. https://doi.org/10.2307/3680062
12. Fujishima, T. (1999). Realtime Chord Recognition of Musical Sound: a System Using Common Lisp Music. *Proc. ICMC 1999*. Uso: perfil de clases de altura (croma) e identificación de acordes por plantillas. https://quod.lib.umich.edu/i/icmc/bbp2372.1999.446
13. Harte, C., Sandler, M., Abdallah, S. y Gómez, E. (2005). Symbolic Representation of Musical Chords: A Proposed Syntax for Text Annotations. *Proc. ISMIR 2005*. Uso: notación de tipos de acorde. https://ismir2005.ismir.net/proceedings/1080.pdf
14. Open Music Theory, *Chord schemas* (I-IV-V-vi). https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/
15. W3C, *Web Audio API*. https://www.w3.org/TR/webaudio/ · Electron, documentación https://www.electronjs.org/docs · electron-builder https://www.electron.build/
