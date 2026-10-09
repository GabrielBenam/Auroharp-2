package lab.autoarpa

import org.json.JSONObject

/** Evento del guion de animacion (generado por src/player.js del laboratorio web). */
class Ev(val t: Double, val type: String, val text: String, val bars: IntArray, val s: Int, val vel: Float, val a: Int, val b: Int, val dur: Double)

interface ExampleHost {
    fun onPress(bars: Set<Int>)
    fun onPluck(s: Int, vel: Float, offsetUs: Int)
    fun onCaption(text: String)
    fun onStopSound()
    fun onState()
}

/**
 * Reproductor del ejemplo de acorde. El tiempo del guion avanza a `speed` veces el tiempo real; pausar congela el reloj.
 * Los sonidos se programan 40 ms por adelantado con desfase en microsegundos para que el rasgueo conserve su separacion
 * exacta aunque los cuadros de pantalla lleguen cada 16 ms.
 */
class ExamplePlayer(private val host: ExampleHost) {
    companion object { val SPEEDS = doubleArrayOf(0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0); const val LOOKAHEAD_MS = 40.0 }

    var active = false; private set
    var playing = false; private set
    var speed = 1.0; private set
    var t = 0.0; private set
    var duration = 0.0; private set
    var sweep: Ev? = null; private set
    val focus = ArrayList<Ev>()
    var label = ""; private set
    private var events: List<Ev> = emptyList()
    private var next = 0
    private var lastMs = 0L

    fun load(json: String, nowMs: Long): Boolean {
        return try {
            val o = JSONObject(json)
            val arr = o.getJSONArray("events")
            val list = ArrayList<Ev>(arr.length())
            for (i in 0 until arr.length()) {
                val e = arr.getJSONObject(i)
                val bj = e.optJSONArray("bars")
                val bars = if (bj == null) IntArray(0) else IntArray(bj.length()) { bj.getInt(it) }
                list.add(Ev(e.getDouble("t"), e.getString("type"), e.optString("text", ""), bars, e.optInt("s", -1),
                    e.optDouble("vel", 0.75).toFloat(), e.optInt("a", 0), e.optInt("b", 0), e.optDouble("dur", 0.0)))
            }
            events = list.sortedBy { it.t }
            duration = o.optDouble("duration", events.lastOrNull()?.t ?: 0.0)
            label = o.optString("label", "")
            host.onStopSound(); host.onPress(emptySet())
            active = true; speed = 1.0; restartInternal(nowMs)
            true
        } catch (e: Exception) { false }
    }

    private fun restartInternal(nowMs: Long) {
        t = 0.0; next = 0; sweep = null; focus.clear(); playing = true; lastMs = nowMs
        host.onStopSound(); host.onPress(emptySet()); host.onState()
    }

    fun restart(nowMs: Long) { if (active) restartInternal(nowMs) }

    fun toggle(nowMs: Long) {
        if (!active) return
        if (!playing && t >= duration) { restartInternal(nowMs); return }
        playing = !playing; lastMs = nowMs; host.onState()
    }

    fun changeSpeed(dir: Int) {
        if (!active) return
        var k = SPEEDS.indexOfFirst { it == speed }; if (k < 0) k = 3
        speed = SPEEDS[(k + dir).coerceIn(0, SPEEDS.size - 1)]; host.onState()
    }

    fun close() {
        if (!active) return
        active = false; playing = false; sweep = null; focus.clear()
        host.onStopSound(); host.onPress(emptySet()); host.onCaption(""); host.onState()
    }

    fun speedLabel(): String = (if (speed == speed.toInt().toDouble()) speed.toInt().toString() else speed.toString()) + "×"

    fun tick(nowMs: Long) {
        val dt = (nowMs - lastMs).coerceIn(0L, 100L); lastMs = nowMs
        if (!active || !playing) return
        t += dt * speed
        val look = LOOKAHEAD_MS * speed
        while (next < events.size && events[next].t <= t + look) fire(events[next++])
        sweep?.let { if (t > it.t + it.dur + 500) sweep = null }
        focus.removeAll { t > it.t + it.dur }
        if (t >= duration) { playing = false; host.onState() }
    }

    private fun fire(e: Ev) {
        when (e.type) {
            "caption" -> host.onCaption(e.text)
            "press" -> host.onPress(e.bars.toSet())
            "sweep" -> sweep = e
            "focus" -> focus.add(e)
            "pluck" -> host.onPluck(e.s, e.vel, (((e.t - t) / speed) * 1000.0).coerceIn(0.0, 400000.0).toInt())
        }
    }
}
