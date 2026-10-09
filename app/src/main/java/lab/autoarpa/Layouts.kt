package lab.autoarpa

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class Bar(val label: String, val mask: Long)
class Layout(val id: String, val name: String, val midi: IntArray, val names: List<String>, val rows: List<List<Bar>>)

object Layouts {
    /** Lee assets/layouts.json (generado desde el motor web con tools/export_layout.js). */
    fun load(ctx: Context): List<Layout> {
        val txt = ctx.assets.open("layouts.json").bufferedReader().use { it.readText() }
        val arr = JSONArray(txt)
        val out = ArrayList<Layout>()
        for (i in 0 until arr.length()) out.add(parseOne(arr.getJSONObject(i)))
        return out
    }

    /** Un layout en el formato que comparten layouts.json y el puente con el laboratorio web. */
    fun parseOne(o: JSONObject): Layout {
        val m = o.getJSONArray("midi"); val midi = IntArray(m.length()) { m.getInt(it) }
        val n = o.getJSONArray("names"); val names = List(n.length()) { n.getString(it) }
        val rowsJ = o.getJSONArray("rows")
        val rows = List(rowsJ.length()) { r ->
            val rj = rowsJ.getJSONArray(r)
            List(rj.length()) { b ->
                val bo = rj.getJSONObject(b)
                var mask = 0L
                val s = bo.getString("mask")
                for (k in s.indices) if (s[k] == '1') mask = mask or (1L shl k)
                Bar(bo.getString("label"), mask)
            }
        }
        return Layout(o.optString("id", "x"), o.optString("name", "Layout"), midi, names, rows)
    }
}
