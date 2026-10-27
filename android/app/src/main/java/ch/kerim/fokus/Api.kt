package ch.kerim.fokus

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Aufrufe an die Zentrale. Immer auf einem Hintergrund-Thread aufrufen.
object Api {
    class Antwort(val status: Int, val json: JSONObject?)

    private fun post(url: String, token: String?, body: JSONObject): Antwort {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 8000
            c.readTimeout = 10000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = try { JSONObject(text) } catch (e: Exception) { null }
            return Antwort(c.responseCode, json)
        } finally {
            c.disconnect()
        }
    }

    /** Gibt das Token zurück oder wirft eine Exception mit verständlicher Meldung. */
    fun koppeln(adresse: String, code: String, name: String): String {
        val a = post("$adresse/api/fokus/agent/koppeln", null, JSONObject().put("code", code).put("name", name).put("art", "android"))
        val token = a.json?.optString("token")
        if (a.status == 200 && !token.isNullOrEmpty()) return token
        throw Exception(a.json?.optString("fehler")?.takeIf { it.isNotEmpty() } ?: "Fehler ${a.status}")
    }

    fun diagnose(s: Speicher, text: String): Antwort =
        post("${s.adresse}/api/fokus/agent/diagnose", s.token, JSONObject().put("text", text))

    // Schlüssel «web:domain» oder «app:Name» (alte Einträge ohne Vorsatz sind Apps).
    private fun teilen(key: String): Pair<String, String> = when {
        key.startsWith("web:") -> "web" to key.substring(4)
        key.startsWith("app:") -> "app" to key.substring(4)
        else -> "app" to key
    }

    /** Sendet die gesammelte Zeit und liefert die aktuellen Sperren zurück. */
    fun bericht(s: Speicher, zeiten: Map<String, Int>, jetzt: String?): Antwort {
        val eintraege = JSONArray()
        for ((key, sek) in zeiten) {
            val (art, name) = teilen(key)
            eintraege.put(JSONObject().put("art", art).put("name", name).put("sek", sek))
        }
        val body = JSONObject().put("version", "android-1.2").put("eintraege", eintraege)
        if (jetzt != null) {
            val (art, name) = teilen(jetzt)
            body.put("jetzt", JSONObject().put("art", art).put("name", name))
        }
        return post("${s.adresse}/api/fokus/agent/bericht", s.token, body)
    }
}
