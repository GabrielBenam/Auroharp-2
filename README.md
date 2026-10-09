# Autoarpa Lab

Autoarpa digital de 36 cuerdas con motor para obtener acordes que no existen en los layouts clásicos de 12, 15 y 21 barras. El motor combina intersección de barras, zona de rasgueo y pinch. Incluye buscador con porcentaje de parecido, mapa de cobertura, optimizador de re-fieltrado y editor de barras cuerda por cuerda.

- Lógica y correcciones: `docs/LOGICA.md`
- Fuentes: `docs/BIBLIOGRAFIA.md` y `docs/referencias/`
- Pruebas del motor: `node tests/engine.test.js`

## Animación de ejemplo

En el Buscador (y al hacer clic en una celda de Cobertura), cada forma de tocar un acorde trae el botón **Ver animación**. Una barra fija en la parte superior explica cada paso en texto, marca con "dedo" las barras que se presionan, dibuja la mano que rasguea de grave a agudo sobre la zona indicada y señala con un anillo la cuerda que se pulsa en el pinch. Un solo botón alterna **Play/Pausa**; **−** y **+** cambian la velocidad (0.25× a 3×); **Reiniciar** vuelve al inicio y **Cerrar** termina el ejemplo. La barra espaciadora también alterna play y pausa. El mismo guion lo usa la app Android.

## Estructura

```
index.html, styles.css      interfaz (funciona abriendo index.html con doble clic)
src/theory.js               notas y diccionario de 16 tipos de acorde con funciones armónicas
src/felts.js                fieltros reales documentados (hojas Harpers Guild / P. D. Race)
src/instrument.js           afinación, barras (máscaras por cuerda), regla de bajo, layouts
src/engine.js               métrica de parecido, búsqueda, identificación, cobertura
src/optimizer.js            optimizador de re-fieltrado por repertorio
src/arranger.js             reacomodo de botones (recorrido de mano + patrón armónico)
src/audio.js                síntesis Karplus-Strong y apagado por fieltro
src/player.js               guion de la animación de un ejemplo (presionar, rasguear, soltar, pinch)
src/ui.js                   interfaz
electron/main.js            envoltorio de escritorio para Windows
.github/workflows/build.yml compilación en GitHub Actions
```

## Compilar en GitHub (sin instalar nada en tu equipo)

Para subir el código:

1. En github.com, presiona **New** (repositorio nuevo), ponle de nombre `autoarpa-lab` y presiona **Create repository**.
2. En la página del repositorio, entra a **uploading an existing file**, arrastra **todo el contenido** de la carpeta descomprimida (no la carpeta misma) y presiona **Commit changes**.
3. Si la carpeta `.github` no se subió (Windows a veces la oculta), entra a **Add file → Create new file**, escribe como nombre `.github/workflows/build.yml`, pega el contenido del workflow y presiona **Commit changes**.

Para publicar la versión web:

4. Entra a **Settings → Pages**, y en **Source** elige **GitHub Actions**.

Para obtener el programa:

5. En la pestaña **Actions** verás la ejecución "Compilar Autoarpa Lab". Al terminar con la marca verde, entra a ella. En **Artifacts**, descarga **AutoarpaLab-Windows**: trae el instalador y la versión portable (.exe).
6. La versión web queda en `https://<tu-usuario>.github.io/autoarpa-lab/`.

Opcional, para crear una release con los .exe adjuntos: entra a **Releases → Draft a new release**, crea la etiqueta `v0.1.0` y publica.

Windows SmartScreen mostrará "Windows protegió su PC" porque el .exe no está firmado. Presiona **Más información → Ejecutar de todas formas**.
