package ch.kerim.fokus

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// Einstellungen und Zwischenspeicher der App (SharedPreferences).
class Speicher(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("fokus", Context.MODE_PRIVATE)

    var adresse: String
        get() = p.getString("adresse", "https://homelabkerim.taila4b96b.ts.net:8443")!!
        set(v) = p.edit().putString("adresse", v.trim().trimEnd('/')).apply()
    var token: String?
        get() = p.getString("token", null)
        set(v) = p.edit().putString("token", v).apply()
    var geraetName: String
        get() = p.getString("name", "Pixel")!!
        set(v) = p.edit().putString("name", v).apply()
    var letzterStatus: String
        get() = p.getString("status", "noch nichts gesendet")!!
        set(v) = p.edit().putString("status", v).apply()
    var letzteSperren: String
        get() = p.getString("sperren", "[]")!!
        set(v) = p.edit().putString("sperren", v).apply()
    var bereichRegeln: String
        get() = p.getString("regeln", "{}")!!
        set(v) = p.edit().putString("regeln", v).apply()
    var puffer: String
        get() = p.getString("puffer", "{}")!!
        set(v) = p.edit().putString("puffer", v).apply()

    val gekoppelt: Boolean get() = !token.isNullOrEmpty()

    fun entkoppeln() {
        p.edit().remove("token").remove("sperren").remove("regeln").remove("puffer").apply()
    }

    fun sperren(): JSONArray = try { JSONArray(letzteSperren) } catch (e: Exception) { JSONArray() }
    fun regeln(): JSONObject = try { JSONObject(bereichRegeln) } catch (e: Exception) { JSONObject() }
}
