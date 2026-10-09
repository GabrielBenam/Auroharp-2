package lab.autoarpa

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var harp: HarpView
    private lateinit var web: WebView
    private lateinit var caption: TextView
    private lateinit var btnPlay: Button
    private lateinit var btnSlow: Button
    private lateinit var btnFast: Button
    private lateinit var btnRestart: Button
    private lateinit var btnClose: Button
    private lateinit var speedLabel: TextView
    private val prefs by lazy { getSharedPreferences("autoarpa", Context.MODE_PRIVATE) }
    private var overlayOpen = false
    private var idleText = "Sin ejemplo activo. Abre «Tabla de acordes», elige un acorde y presiona «Ver animación»."

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layouts = Layouts.load(this)

        harp = HarpView(this)
        harp.setLayout(layouts[0])                         // se reemplaza en cuanto el laboratorio envia el layout activo
        harp.mirror = prefs.getBoolean("mirror", false)
        harp.studio = prefs.getBoolean("studio", true)
        harp.latch = prefs.getBoolean("latch", false)
        harp.showLatency = prefs.getBoolean("latency", false)
        harp.useForce = prefs.getBoolean("force", true)
        harp.relayout()
        harp.onMenu = { openOverlay("menu") }
        harp.onTable = { openOverlay("table") }
        harp.onCaption = { t -> caption.text = if (t.isEmpty()) idleText else t }
        harp.onAnimState = { refreshAnimBar() }

        // ----- barra superior: controles del ejemplo (play/pausa con un solo boton, velocidad, reiniciar, cerrar) -----
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#201a14"))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(6, 2, 6, 2)
        }
        fun btn(text: String, onClick: () -> Unit): Button = Button(this).apply {
            this.text = text; isAllCaps = false; textSize = 12f; minHeight = 0; minimumHeight = 0; minWidth = 0; minimumWidth = 0
            setPadding(22, 6, 22, 6)
            setOnClickListener { onClick() }
            bar.addView(this, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(4, 3, 4, 3) })
        }
        btnPlay = btn("Play") { harp.togglePlay() }
        btnSlow = btn("−") { harp.player.changeSpeed(-1) }
        speedLabel = TextView(this).apply { setTextColor(Color.parseColor("#f1e8dc")); textSize = 13f; gravity = Gravity.CENTER; minWidth = 70 }
        bar.addView(speedLabel)
        btnFast = btn("+") { harp.player.changeSpeed(1) }
        btnRestart = btn("Reiniciar") { harp.restartExample() }
        caption = TextView(this).apply { setTextColor(Color.parseColor("#7cc4b0")); textSize = 12f; maxLines = 2; setPadding(12, 0, 12, 0) }
        bar.addView(caption, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        btnClose = btn("Cerrar ejemplo") { harp.closeExample() }
        refreshAnimBar()

        // ----- WebView con el laboratorio (Buscador, Optimizador, Editor, Ajustes, Ayuda y la Tabla) -----
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#17130f"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webViewClient = WebViewClient()
            addJavascriptInterface(Bridge(), "AndroidBridge")
            visibility = View.GONE
            loadUrl("file:///android_asset/web/index.html?embed=android")
        }

        val stack = FrameLayout(this)
        stack.addView(harp, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        stack.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
        root.addView(bar, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(stack, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    private fun refreshAnimBar() {
        val pl = harp.player
        val on = pl.active
        btnPlay.text = if (!on) "Play" else if (pl.playing) "Pausa" else if (pl.t >= pl.duration) "Repetir" else "Play"
        speedLabel.text = if (on) "Velocidad " + pl.speedLabel() else "Velocidad"
        for (b in listOf(btnPlay, btnSlow, btnFast, btnRestart, btnClose)) { b.isEnabled = on; b.alpha = if (on) 1f else 0.4f }
        if (!on) caption.text = idleText
    }

    private fun openOverlay(mode: String) {
        overlayOpen = true
        web.visibility = View.VISIBLE
        web.evaluateJavascript("if(window.AH&&AH.ui){AH.ui.openMode('$mode')}", null)
        web.requestFocus()
    }
    private fun closeOverlay() { overlayOpen = false; web.visibility = View.GONE }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (overlayOpen) closeOverlay() else super.onBackPressed() }

    private fun applyLayout(json: String) {
        try {
            val l = Layouts.parseOne(JSONObject(json))
            val oldMidi = harp.currentMidi()
            harp.setLayout(l)
            if (oldMidi != null && !oldMidi.contentEquals(l.midi)) { harp.stopAudio(); harp.startAudio() } // otra afinacion: reabrir audio
        } catch (e: Exception) { /* layout invalido: se conserva el anterior */ }
    }

    /** Puente con el laboratorio web. Los metodos llegan en un hilo del WebView: todo pasa al hilo de la interfaz. */
    inner class Bridge {
        @JavascriptInterface fun layoutChanged(json: String) { runOnUiThread { applyLayout(json) } }
        @JavascriptInterface fun playExample(json: String) { runOnUiThread { closeOverlay(); harp.startExample(json); refreshAnimBar() } }
        @JavascriptInterface fun close() { runOnUiThread { closeOverlay() } }
        @JavascriptInterface fun resetStats() { Native.resetStats() }
        @JavascriptInterface fun getSettings(): String = JSONObject().apply {
            put("latch", harp.latch); put("mirror", harp.mirror); put("studio", harp.studio); put("latency", harp.showLatency); put("force", harp.useForce)
        }.toString()
        @JavascriptInterface fun setSetting(key: String, v: Boolean) {
            runOnUiThread {
                when (key) {
                    "latch" -> { harp.latch = v; if (!v) harp.clearLatched() }
                    "mirror" -> { harp.mirror = v; harp.relayout() }
                    "studio" -> { harp.studio = v; harp.relayout() }
                    "latency" -> harp.showLatency = v
                    "force" -> harp.useForce = v
                }
                prefs.edit().putBoolean(key, v).apply()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        harp.startAudio()
        web.onResume()
    }

    override fun onPause() {
        harp.stopAudio()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
