package lab.autoarpa

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Autoarpa tocable. Cada dedo toma un rol segun donde baja:
 *  - botonera: mantiene presionada una barra (varios dedos = varias barras, interseccion);
 *  - cuerdas: rasguea (cruzar una cuerda la pulsa), toca (bajar sobre una cuerda la pulsa) y, si se queda quieto
 *    mas de REST_MS, apaga la cuerda (como un dedo real sobre el encordado);
 *  - botones Menu / Tabla (arriba de la seccion de cuerdas).
 * Presionar una barra apaga al instante lo que vibra bajo su fieltro; soltarla no cambia nada.
 */
class HarpView(ctx: Context) : View(ctx) {
    companion object {
        const val REST_MS = 120L
        const val REST_SLOP_DP = 6f
        const val MIN_RETRIGGER_MS = 18L
        const val MAX_OFFSET_US = 60_000
        const val N = 36
    }

    private class Ptr(val id: Int) {
        var role = 0                  // 1 barra, 2 cuerdas, 3 boton de cabecera
        var bar = -1
        var lastX = 0f; var lastT = 0L
        var downX = 0f; var downT = 0L
        var restDone = false; var moved = false
        var header = 0                // 1 menu, 2 tabla
    }

    // ---- ajustes y retrollamadas ----
    var latch = false
    var mirror = false
    var studio = true
    var showLatency = false
    var useForce = true
    var onMenu: (() -> Unit)? = null
    var onTable: (() -> Unit)? = null
    var onCaption: ((String) -> Unit)? = null
    var onAnimState: (() -> Unit)? = null

    private val ptrs = HashMap<Int, Ptr>()
    private var layout: Layout? = null
    private var flatBars = ArrayList<Bar>()
    private val barRects = ArrayList<RectF>()
    private val latched = HashSet<Int>()
    private var animPressed: Set<Int> = emptySet()
    private val lastStringT = LongArray(N)
    private val levels = FloatArray(N)
    private val stats = DoubleArray(11)
    private var statsAt = 0L
    private var curMask = (1L shl N) - 1
    private var audioOn = false
    private var downHeader = 0

    // fuerza tactil: rango observado de presion para normalizar; solo se usa si el rango es util
    private var pMin = 1f; private var pMax = 0f; private var pCount = 0
    private fun forceOk() = useForce && pCount >= 25 && (pMax - pMin) > 0.12f
    private fun pNorm(p: Float) = ((p - pMin) / max(0.0001f, pMax - pMin)).coerceIn(0f, 1f)
    private fun seePressure(p: Float) { if (p > 0f) { pMin = min(pMin, p); pMax = max(pMax, p); pCount++ } }

    private val host = object : ExampleHost {
        override fun onPress(bars: Set<Int>) { animPressed = bars; applyMask() }
        override fun onPluck(s: Int, vel: Float, offsetUs: Int) { Native.pluck(s, vel, offsetUs, 0.0) }
        override fun onCaption(text: String) { this@HarpView.onCaption?.invoke(text) }
        override fun onStopSound() { for (i in 0 until N) Native.damp(i, 0) }
        override fun onState() { this@HarpView.onAnimState?.invoke() }
    }
    val player = ExamplePlayer(host)

    private val dp = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val txt = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val xs = FloatArray(N)
    private var barsPanel = RectF(); private var strPanel = RectF(); private var strip = RectF()
    private val menuRect = RectF(); private val tableRect = RectF()
    private var spacing = 10f

    private val cBg = Color.parseColor("#17130f"); private val cPanel = Color.parseColor("#261f18")
    private val cBtn = Color.parseColor("#30271f"); private val cOn = Color.parseColor("#e0a35a")
    private val cStr = Color.parseColor("#d9d2c5"); private val cOff = Color.parseColor("#4a4036")
    private val cAcc2 = Color.parseColor("#7cc4b0"); private val cText = Color.parseColor("#f1e8dc")
    private val cDark = Color.parseColor("#10201b")

    fun setLayout(l: Layout) {
        layout = l
        flatBars = ArrayList(l.rows.flatten())
        latched.clear(); ptrs.clear(); animPressed = emptySet()
        player.close()
        Native.setTuning(l.midi)
        relayout(); applyMask()
        invalidate()
    }
    fun currentMidi(): IntArray? = layout?.midi

    fun clearLatched() { latched.clear(); applyMask(); invalidate() }
    fun relayout() { onSizeChanged(width, height, width, height); invalidate() }
    fun startAudio() { audioOn = layout?.let { Native.setTuning(it.midi); Native.start() } ?: false; postInvalidateOnAnimation() }
    fun stopAudio() { Native.stop(); audioOn = false; ptrs.clear() }

    // ---- API del ejemplo animado ----
    fun startExample(json: String): Boolean {
        val ok = player.load(json, SystemClock.uptimeMillis()); invalidate(); return ok
    }
    fun togglePlay() = player.toggle(SystemClock.uptimeMillis())
    fun restartExample() = player.restart(SystemClock.uptimeMillis())
    fun closeExample() { player.close() }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        val l = layout ?: return
        if (w == 0 || h == 0) return
        val pad = 8 * dp
        val barsW = w * 0.40f - pad
        val strW = w * 0.60f - 2 * pad
        // zurdo: solo cambia de lado la botonera; las cuerdas conservan su sentido (grave a la izquierda)
        if (mirror) {
            strPanel = RectF(pad, pad, pad + strW, h - pad)
            barsPanel = RectF(w - pad - barsW, pad, w - pad, h - pad)
        } else {
            barsPanel = RectF(pad, pad, pad + barsW, h - pad)
            strPanel = RectF(w - pad - strW, pad, w - pad, h - pad)
        }
        // cabecera de la seccion de cuerdas: Menu y Tabla (nunca dentro de la botonera)
        val bt = strPanel.top + 4 * dp; val bb = bt + 34 * dp
        menuRect.set(strPanel.left, bt, strPanel.left + 92 * dp, bb)
        tableRect.set(menuRect.right + 8 * dp, bt, menuRect.right + 8 * dp + 168 * dp, bb)
        val stripTop = bb + 6 * dp
        strip = if (studio) RectF(strPanel.left, stripTop, strPanel.right, stripTop + 46 * dp) else RectF(strPanel.left, stripTop, strPanel.right, stripTop)
        val left = strPanel.left + 6 * dp; val right = strPanel.right - 6 * dp
        spacing = (right - left) / (N - 1)
        for (i in 0 until N) xs[i] = left + i * spacing
        // botonera escalonada
        barRects.clear()
        val rows = l.rows; val maxCols = rows.maxOf { it.size }
        val stagger = 0.5f
        val cw = barsPanel.width() / (maxCols + stagger * (rows.size - 1))
        val rh = barsPanel.height() / rows.size
        for (r in rows.indices) {
            val off = r * stagger * cw
            for (c in rows[r].indices) {
                val bx = barsPanel.left + off + c * cw
                barRects.add(RectF(bx + 2 * dp, barsPanel.top + r * rh + 3 * dp, bx + cw - 2 * dp, barsPanel.top + (r + 1) * rh - 3 * dp))
            }
        }
        if (Build.VERSION.SDK_INT >= 29) systemGestureExclusionRects = listOf(Rect(0, 0, w, h))
    }

    // ---------- barras ----------
    private fun pressedSet(): Set<Int> {
        val s = HashSet<Int>(latched); s.addAll(animPressed)
        if (!latch) for (q in ptrs.values) if (q.role == 1 && q.bar >= 0) s.add(q.bar)
        return s
    }
    private fun applyMask() {
        var m = (1L shl N) - 1
        for (i in pressedSet()) if (i < flatBars.size) m = m and flatBars[i].mask
        curMask = m
        Native.setMask(m)
    }
    private fun barAt(x: Float, y: Float): Int {
        for (i in barRects.indices) if (barRects[i].contains(x, y)) return i
        return -1
    }

    // ---------- cuerdas ----------
    private fun nearestString(x: Float): Int {
        var best = -1; var bd = Float.MAX_VALUE
        for (i in 0 until N) { val d = abs(xs[i] - x); if (d < bd) { bd = d; best = i } }
        return if (bd <= spacing * 0.75f) best else -1
    }
    private fun velFromSpeed(pxPerMs: Float): Float {
        val v = pxPerMs / dp
        return 0.25f + 0.75f * min(1f, max(0f, (v - 0.3f) / 3.5f))
    }
    /** Mezcla velocidad del dedo y fuerza (si la pantalla la entrega con variacion util). Sin costo de latencia. */
    private fun velocity(speedVel: Float, pressure: Float): Float {
        return if (forceOk()) (0.5f * speedVel + 0.5f * (0.25f + 0.75f * pNorm(pressure))).coerceIn(0.1f, 1f) else speedVel
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(true)
        var base = -1L
        fun off(t: Long): Int { if (base < 0) base = t; return min(MAX_OFFSET_US, ((t - base) * 1000L).toInt()) }

        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = e.actionIndex; val id = e.getPointerId(i)
                val q = Ptr(id); ptrs[id] = q
                val x = e.getX(i); val y = e.getY(i); val t = e.eventTime
                q.lastX = x; q.lastT = t; q.downX = x; q.downT = t
                val b = barAt(x, y)
                if (menuRect.contains(x, y)) { q.role = 3; q.header = 1; downHeader = 1 }
                else if (tableRect.contains(x, y)) { q.role = 3; q.header = 2; downHeader = 2 }
                else if (b >= 0 || barsPanel.contains(x, y)) {
                    q.role = 1
                    if (latch) { if (!latched.remove(b) && b >= 0) latched.add(b) } else q.bar = b
                    applyMask()
                } else if (x >= strPanel.left - spacing && x <= strPanel.right + spacing && y > tableRect.bottom) {
                    q.role = 2
                    val pr = e.getPressure(i); seePressure(pr)
                    val s = nearestString(x)
                    if (s >= 0) firePluck(s, if (forceOk()) 0.3f + 0.7f * pNorm(pr) else 0.6f, off(t), t)
                }
            }
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until e.pointerCount) {
                    val q = ptrs[e.getPointerId(i)] ?: continue
                    if (q.role == 1) {
                        if (!latch) { val b = barAt(e.getX(i), e.getY(i)); if (b != q.bar) { q.bar = b; applyMask() } }
                    } else if (q.role == 2) {
                        val hs = e.historySize
                        for (h in 0 until hs) { val hp = e.getHistoricalPressure(i, h); seePressure(hp); strumTo(q, e.getHistoricalX(i, h), e.getHistoricalEventTime(h), hp, ::off) }
                        val cp = e.getPressure(i); seePressure(cp)
                        strumTo(q, e.getX(i), e.eventTime, cp, ::off)
                        if (abs(e.getX(i) - q.downX) > REST_SLOP_DP * dp) q.moved = true
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                if (e.actionMasked == MotionEvent.ACTION_CANCEL) { ptrs.clear(); downHeader = 0; applyMask() }
                else {
                    val i = e.actionIndex
                    val q = ptrs.remove(e.getPointerId(i))
                    if (q != null && q.role == 1) applyMask()
                    if (q != null && q.role == 3) {
                        val inside = (if (q.header == 1) menuRect else tableRect).contains(e.getX(i), e.getY(i))
                        if (inside) { if (q.header == 1) onMenu?.invoke() else onTable?.invoke() }
                        downHeader = 0
                    }
                }
            }
        }
        postInvalidateOnAnimation()
        return true
    }

    private fun strumTo(q: Ptr, x1: Float, t1: Long, pressure: Float, off: (Long) -> Int) {
        val x0 = q.lastX; val t0 = q.lastT
        if (t1 <= t0 && x1 == x0) return
        val dt = max(1L, t1 - t0).toFloat()
        val vel = velocity(velFromSpeed(abs(x1 - x0) / dt), pressure)
        if (x1 != x0) {
            val order = (0 until N).filter { if (x1 > x0) xs[it] > x0 && xs[it] <= x1 else xs[it] >= x1 && xs[it] < x0 }
                .sortedBy { if (x1 > x0) xs[it] else -xs[it] }
            for (s in order) {
                val t = t0 + ((xs[s] - x0) / (x1 - x0) * dt).toLong()
                if (t - lastStringT[s] < MIN_RETRIGGER_MS) continue
                firePluck(s, vel, off(t), t)
            }
        }
        q.lastX = x1; q.lastT = t1
    }

    private fun firePluck(s: Int, vel: Float, offUs: Int, t: Long) {
        lastStringT[s] = t
        Native.pluck(s, vel, offUs, t.toDouble())
    }

    // ---------- dibujo ----------
    private fun button(c: Canvas, r: RectF, label: String, down: Boolean) {
        p.style = Paint.Style.FILL; p.color = if (down) cOn else Color.parseColor("#3a3026")
        c.drawRoundRect(r, 10 * dp, 10 * dp, p)
        txt.textSize = 14 * dp; txt.typeface = Typeface.DEFAULT_BOLD; txt.color = if (down) Color.parseColor("#1d150d") else cText
        c.drawText(label, r.centerX(), r.centerY() + 5 * dp, txt)
    }

    override fun onDraw(c: Canvas) {
        val l = layout ?: return
        val now = SystemClock.uptimeMillis()
        player.tick(now)
        // dedo quieto sobre cuerdas => apagar
        for (q in ptrs.values) if (q.role == 2 && !q.restDone && !q.moved && now - q.downT >= REST_MS) {
            q.restDone = true
            val s = nearestString(q.downX)
            if (s >= 0) for (d in -1..1) { val j = s + d; if (j in 0 until N && (d == 0 || abs(xs[j] - q.downX) < spacing * 1.1f)) Native.damp(j, 0) }
        }
        Native.getLevels(levels)
        c.drawColor(cBg)

        // botonera
        p.style = Paint.Style.FILL; p.color = cPanel
        c.drawRoundRect(barsPanel, 14 * dp, 14 * dp, p)
        val pressed = pressedSet()
        for (i in barRects.indices) {
            val r = barRects[i]; val on = i in pressed; val byAnim = i in animPressed
            p.color = if (byAnim) cAcc2 else if (on) cOn else cBtn
            c.drawRoundRect(r, 9 * dp, 9 * dp, p)
            txt.textSize = 15 * dp; txt.typeface = Typeface.DEFAULT_BOLD
            txt.color = if (on || byAnim) Color.parseColor("#1d150d") else cText
            c.drawText(flatBars[i].label, r.centerX(), r.centerY() + 5 * dp, txt)
            if (byAnim) { // dedo que presiona
                val pulse = 0.5f + 0.5f * sin(now / 140f)
                p.style = Paint.Style.STROKE; p.strokeWidth = 3 * dp; p.color = cDark
                c.drawCircle(r.centerX(), r.centerY(), 17 * dp + 2 * dp * pulse, p); p.style = Paint.Style.FILL
                txt.textSize = 9 * dp; txt.color = cDark; c.drawText("dedo", r.centerX(), r.top + 11 * dp, txt)
            }
        }

        // cabecera de cuerdas: Menu y Tabla
        button(c, menuRect, "Menú", downHeader == 1)
        button(c, tableRect, "Tabla de acordes", downHeader == 2)
        if (player.active) {
            txt.textSize = 12 * dp; txt.typeface = Typeface.DEFAULT; txt.color = cAcc2; txt.textAlign = Paint.Align.RIGHT
            c.drawText("Ejemplo" + (if (player.label.isNotEmpty()) ": " + player.label else ""), strPanel.right - 6 * dp, menuRect.centerY() + 4 * dp, txt)
            txt.textAlign = Paint.Align.CENTER
        }

        // franja Estudio
        if (studio) {
            val cw = strip.width() / N
            for (i in 0 until N) {
                val open = ((curMask shr i) and 1L) == 1L
                val lv = min(1f, sqrt(levels[i]) * 1.6f)
                val x = strip.left + i * cw
                p.style = Paint.Style.FILL
                p.color = if (open) Color.parseColor("#3a3026") else Color.parseColor("#1f1914")
                c.drawRect(x + 1, strip.top, x + cw - 1, strip.bottom, p)
                if (open) { p.color = cOn; c.drawRect(x + 1, strip.bottom - strip.height() * lv, x + cw - 1, strip.bottom, p) }
                else { p.color = Color.parseColor("#6b3b33"); c.drawRect(x + 1, strip.bottom - 4 * dp, x + cw - 1, strip.bottom, p) }
            }
            txt.textSize = 9 * dp; txt.typeface = Typeface.DEFAULT; txt.color = cText
            for (i in 0 until N) {
                val nm = l.names.getOrNull(i) ?: ""
                if (nm.startsWith("C") && !nm.startsWith("C#") || nm.startsWith("F2")) c.drawText(nm, strip.left + (i + 0.5f) * strip.width() / N, strip.top + 11 * dp, txt)
            }
        }

        // cuerdas
        val top = strip.bottom + 8 * dp; val bottom = strPanel.bottom - 6 * dp
        val tsec = now / 1000f
        player.sweep?.let { sw -> // zona de rasgueo de la animacion
            p.style = Paint.Style.FILL; p.color = Color.argb(40, 124, 196, 176)
            c.drawRect(xs[sw.a] - spacing / 2, top - 4 * dp, xs[sw.b] + spacing / 2, bottom + 4 * dp, p)
        }
        for (i in 0 until N) {
            val open = ((curMask shr i) and 1L) == 1L
            val lv = min(1f, sqrt(levels[i]) * 1.6f)
            val note = l.names.getOrNull(i) ?: ""
            val isC = note.startsWith("C") && !note.startsWith("C#")
            val isF = note.startsWith("F") && !note.startsWith("F#")
            p.style = Paint.Style.STROKE
            p.strokeWidth = (if (isC || isF) 2.4f else 1.6f) * dp + lv * 1.5f * dp
            p.color = if (!open) cOff else if (isC) Color.parseColor("#e06a5a") else if (isF) Color.parseColor("#5aa0e0") else cStr
            if (lv > 0.02f && open) {
                val amp = lv * 3.2f * dp; val k = 14
                val path = Path(); path.moveTo(xs[i], top)
                for (j in 1..k) path.lineTo(xs[i] + amp * sin(j * Math.PI / k).toFloat() * sin(tsec * 90f + i), top + (bottom - top) * j / k)
                c.drawPath(path, p)
            } else c.drawLine(xs[i], top, xs[i], bottom, p)
        }

        // guia de la animacion: mano que rasguea y anillo de pinch
        if (player.active) {
            player.sweep?.let { sw ->
                val k = if (sw.dur > 0) ((player.t - sw.t) / sw.dur).coerceIn(0.0, 1.0).toFloat() else 1f
                val cx = xs[sw.a] + (xs[sw.b] - xs[sw.a]) * k
                p.style = Paint.Style.STROKE; p.strokeWidth = 2 * dp; p.color = cAcc2
                c.drawLine(cx, top, cx, bottom, p)
                p.style = Paint.Style.FILL; c.drawCircle(cx, (top + bottom) / 2, 14 * dp, p)
                txt.textSize = 16 * dp; txt.typeface = Typeface.DEFAULT_BOLD; txt.color = cDark
                c.drawText("→", cx, (top + bottom) / 2 + 6 * dp, txt)
            }
            for (f in player.focus) if (player.t >= f.t) {
                val k = (((player.t - f.t) / 300.0) % 1.0).toFloat()
                p.style = Paint.Style.STROKE; p.strokeWidth = 3 * dp; p.color = cAcc2
                c.drawCircle(xs[f.s], (top + bottom) / 2, (10 + 12 * k) * dp, p)
                p.style = Paint.Style.FILL; c.drawCircle(xs[f.s], (top + bottom) / 2, 6 * dp, p)
                txt.textSize = 13 * dp; txt.typeface = Typeface.DEFAULT_BOLD; txt.color = cText
                c.drawText("pulsa", xs[f.s], (top + bottom) / 2 - 26 * dp, txt)
            }
        }

        // panel de latencia
        if (showLatency) {
            if (now - statsAt > 250) { Native.stats(stats); statsAt = now }
            val out = stats[3]
            val force = if (!useForce) "desactivada" else if (forceOk()) "detectada" else "sin datos utiles (se usa la velocidad del dedo)"
            val lines = listOf(
                "Audio: " + (if (audioOn) "activo" else "SIN AUDIO") + "  API " + (if (stats[10] == 1.0) "AAudio" else if (stats[10] == 2.0) "OpenSL" else "-") +
                    "  " + (if (stats[8] == 1.0) "baja latencia" else "modo normal") + "  " + (if (stats[9] == 1.0) "exclusivo" else "compartido"),
                "Frecuencia ${stats[4].toInt()} Hz  rafaga ${stats[5].toInt()}  buffer ${stats[6].toInt()}  xruns ${stats[7].toInt()}",
                "Toque a motor: ultima %.1f  media %.1f  max %.1f ms".format(stats[0], stats[1], stats[2]),
                "Salida (estimada): " + (if (out >= 0) "%.1f ms".format(out) else "sin dato") + "   Total: " + (if (out >= 0) "%.0f ms".format(stats[1] + out) else "sin dato"),
                "Fuerza tactil: $force"
            )
            p.style = Paint.Style.FILL; p.color = Color.argb(225, 10, 8, 6)
            val h = lines.size * 17 * dp + 16 * dp
            c.drawRoundRect(RectF(barsPanel.left, barsPanel.bottom - h, barsPanel.right, barsPanel.bottom), 12 * dp, 12 * dp, p)
            txt.textAlign = Paint.Align.LEFT; txt.textSize = 10.5f * dp; txt.color = cAcc2; txt.typeface = Typeface.MONOSPACE
            for ((k, s) in lines.withIndex()) c.drawText(s, barsPanel.left + 10 * dp, barsPanel.bottom - h + 22 * dp + k * 17 * dp, txt)
            txt.textAlign = Paint.Align.CENTER
        }
        postInvalidateOnAnimation()
    }
}
