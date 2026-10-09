# Autoarpa Lab — Lógica central (versión 0.1, revisada)

## 1. Revisión de la propuesta inicial: inconsistencias encontradas y corrección

**1.1 La "unión en dos fases" no es física (inconsistencia principal).** La propuesta inicial decía que rasguear la mitad grave con la barra A y la mitad aguda con la barra B producía la unión de ambos acordes (Am → C = Am7). Es falso en una autoarpa real: al presionar B, su fieltro cae sobre todas las cuerdas que B no deja libres, incluidas las que todavía vibran por el rasgueo con A. Con Am → C, las cuerdas de La se apagan y el resultado es simplemente Do mayor. Corrección: el estado del instrumento se modela en el tiempo con tres reglas: (a) presionar barras define la máscara efectiva como intersección (AND); (b) presionar una barra apaga al instante lo que vibra bajo su fieltro; (c) soltar las barras no apaga nada. De ahí sale que la única forma física de *agregar* notas es el **pinch**: rasguear con barras, soltarlas y pulsar 1 o 2 cuerdas sueltas. El acorde resultante es arpegiado, las cuerdas pulsadas pesan la mitad en la métrica y su puntaje se limita a 97 % (nunca "Exacto").

**1.2 La afinación no es cromática en el bajo.** La propuesta decía "cromática F2–C6". Las hojas de fieltrado del proyecto muestran la afinación real: F2 G2 C3 D3 E3 · F3 F#3 G3 A3 A#3 B3 · C4…B4 · C5…B5 · C6. Faltan F#2, G#2, A2, A#2, B2, C#3, D#3 y G#3. Consecuencia práctica: la barra de Do de fábrica deja sonar G2 como cuerda más grave, así que el rasgueo completo es Do/Sol (segunda inversión).

**1.3 El bonus de bajo hacía que barras correctas no dieran 100 %.** Con la regla original, la barra C puntuaba 96 % por la inversión del punto 1.2. Corrección: mismas clases de altura que el acorde = 100 % (Exacto); la inversión se informa aparte y solo afecta el orden de los resultados (costo 0.03).

**1.4 El orden lexicográfico (primero parecido, luego tocabilidad) era incorrecto.** Un 91 % con tres botones y pinch quedaba por encima de un 90 % con una barra. Corrección: orden por *rango* = parecido − costo de ejecución (botón extra 0.035, zona 0.02, pinch 0.04 por cuerda, alcance de mano 0.02 por posición extra, pocas cuerdas hasta 0.12, inversión 0.03). La interfaz muestra la dificultad para que el orden sea comprensible.

**1.5 Fieltrado por nombre vs. fieltrado real (corregido con datos).** La propuesta generaba una barra abriendo toda cuerda cuya nota pertenece al acorde. Al comparar contra los 20 fieltros reales de las hojas del proyecto, 8 difieren: el fieltrador cierra a propósito notas del acorde en el bajo para que el rasgueo no arranque en una mala inversión (C cierra G2, Dm cierra F2, D7 cierra C3, B7 cierra A3, etc.). Se dedujo una regla que reproduce 19 de 20: (1) si la fundamental está en las 5 cuerdas más graves, se cierra todo lo que está por debajo de ella; (2) toda séptima por debajo de la primera fundamental se cierra. La única excepción documentada es A7 de P. D. Race, que deja abierta G3 justo debajo de A3. La barra sigue siendo una máscara por cuerda; si hay fieltro documentado se usa (punto verde en la interfaz) y si no, se genera con esta regla.

**Sin cambios (verificado consistente):** la intersección de barras (confirmada en la práctica por Linda Louisell, que presiona F#m + B7 para obtener un F# "pasable", citado por Gumm), la métrica mixta funcional + espectral, el mapa de cobertura y el optimizador inverso.

## 2. Modelo físico

Encordado: lista de 36 cuerdas con altura MIDI. Barra: máscara de 36 posiciones (1 = muesca, suena; 0 = fieltro). Layout: filas de barras con su posición, que determina el alcance de la mano. Fuente de fieltrado: `real` (hojas Harpers Guild / P. D. Race), `generado` (por notas del acorde), `custom` o `propuesta`.

## 3. Mecanismos para obtener acordes

| Mecanismo | Operación | Agrega notas | Quita notas |
|---|---|---|---|
| Barra | máscara de una barra | no | sí |
| Intersección | AND de 2–3 barras | no | sí |
| Zona | rango contiguo de cuerdas (completo, sin bajos, graves-medios, medios, agudos) | no | sí, y cambia el bajo |
| Pinch | rasgueo con barras + 1–2 cuerdas pulsadas con barras sueltas | sí (arpegiado) | no |

## 4. Métrica de parecido

S = 0.65·F + 0.35·C, en el intervalo 0–1.

F (cobertura funcional): suma de pesos de las notas del acorde presentes (fundamental 1.0, tercera o suspensión 1.0, séptima 0.8, extensión 0.6, quinta 0.4), dividida entre la suma total. Una nota que solo aporta una cuerda pulsada cuenta 0.5. Se resta 0.18 por cada nota ajena (0.30 si está a un semitono de una nota del acorde), escalado por su proporción de cuerdas, y 0.15 si el bajo es una nota ajena (0.06 si es inversión).

C (similitud espectral): coseno entre vectores de croma de 12 clases. Cada cuerda aporta a su clase y, con menor peso, a sus armónicos 3.º (quinta, 0.3) y 5.º (tercera mayor, 0.15). La plantilla del acorde se construye igual, con la fundamental reforzada.

Reglas: mismas notas = 100 % (Exacto); con pinch, máximo 97 %. Clases: Exacto 100, Funcional ≥ 85, Sustituto ≥ 70, Color < 70.

## 5. Motores

Búsqueda directa: precalcula todos los conjuntos sonoros del layout (barras sueltas, pares y tríos × 5 zonas, sin duplicados; unos 200 conjuntos distintos en un 21 barras), evalúa cada uno contra el acorde y, si se permite, prueba el pinch de las notas faltantes sobre los 60 mejores. Identificación: lo que suena se compara contra 192 acordes (12 fundamentales × 16 tipos). Cobertura: matriz 16 × 12 con el mejor puntaje, sin pinch por defecto (sonido simultáneo). Optimizador: búsqueda voraz por pasos; en cada paso prueba re-fieltrar cada barra no bloqueada (B7 por defecto, por la advertencia de Lewis sobre las cuerdas D#) y no usada por el repertorio, con candidatos del repertorio y sus tríadas o séptimas; acepta el cambio que más sube la cobertura ponderada.

## 5b. Reacomodo de botones (v0.2)

Permuta las barras entre las ranuras de la botonera sin re-fieltrar. Minimiza J = 1.0·Recorrido + 0.3·Bordes − 0.6·Armonía con recocido simulado (40 000 intercambios × 4 reinicios, semilla fija para que el resultado sea reproducible). Recorrido: suma, sobre acordes consecutivos de las progresiones del usuario, de la distancia entre sus botones (filas a 0.8 de columna); si un acorde se toca por intersección, sus dos barras además deben quedar juntas (peso 2, con castigo extra si están a más de 2 botones). Bordes: uso de cada barra si queda en un extremo de fila (Smith: los extremos apagan peor y generan armónicos). Armonía: quintas ascendentes de izquierda a derecha en la misma familia, relativo menor justo debajo del mayor y V7 justo arriba del I; con eso el patrón de dedos es igual en todas las tonalidades. Opción por defecto: mover solo dentro de cada fila, que conserva filas de mayores, séptimas y menores. Las barras fijas no se mueven. Sin progresiones, solo actúa la armonía; con una fila desordenada recupera el orden Eb Bb F C G D A.

## 5c. Animación de ejemplo (v0.3)

Cada receta del buscador se convierte en un guion de eventos con tiempo (a velocidad 1×): presionar las barras (todas a la vez, un dedo por barra), esperar 1.3 s, rasguear de grave a agudo solo las cuerdas libres de la zona (55 ms entre cuerdas), y, si hay pinch, soltar las barras, esperar y pulsar cada cuerda indicada (1.5 s entre pulsaciones). Cada paso trae un texto explicativo y los eventos visuales (manos en las barras, zona y cursor del rasgueo, anillo del pinch). El guion se genera en `src/player.js` sin dependencias de interfaz, por lo que se prueba en Node y lo reutilizan escritorio, web y Android. La velocidad escala el reloj del guion, no el tono. En Android los sonidos se programan 40 ms por adelantado con desfase en microsegundos para conservar la separación entre cuerdas.

## 6. Audio

Karplus-Strong precalculado por cuerda. El rasgueo va de grave a agudo con un retardo de 4–40 ms entre cuerdas. Presionar una barra apaga en unos 12 ms las cuerdas bajo su fieltro.

## 7. Pendientes conocidos (siguientes versiones)

El re-fieltrado y el reacomodo se ejecutan por separado (primero re-fieltrar, aplicar, luego reacomodar); falta un modo combinado. Los pesos de la métrica son una primera calibración y deben ajustarse de oído. Las zonas son fijas, no arrastrables. Los layouts de Bowers, Lewis Standard, Bluegrass y Advanced no se incluyeron porque el texto del PDF disponible está truncado; se pueden capturar en el Editor.
