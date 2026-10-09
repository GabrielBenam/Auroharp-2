# Autoarpa Android (v0.2)

Pantalla Tocar nativa (audio C++ con Oboe, multitáctil por roles) más el laboratorio completo dentro de un WebView.

Arriba de la sección de cuerdas hay dos botones: **Menú** (Buscador, Optimizador, Editor, Ajustes y Ayuda) y **Tabla de acordes** (la tabla de cobertura con su porcentaje; al tocar un acorde salen sus formas, cada una con **Ver animación**). La barra superior de la pantalla controla el ejemplo: Play/Pausa, velocidad, Reiniciar y Cerrar.

Archivos: `app/src/main/cpp` (audio y puente JNI), `app/src/main/java/lab/autoarpa` (Kotlin), `app/src/main/assets/web` (copia del laboratorio web), `app/src/main/assets/layouts.json` (layouts de respaldo), `tests/synth_test.cpp` (prueba del audio), `.github/workflows/android.yml`.

`tools/sync_web.js` y `tools/export_layout.js` regeneran las copias desde la carpeta `autoharp-lab`; no hacen falta para compilar.
