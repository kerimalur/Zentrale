package ch.kerim.fokus

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Bedienungshilfe: misst die Zeit pro App, meldet sie an die Zentrale und setzt Sperren um.
 * Sperren (App/Bereich) kommen aus der Zentrale, die Erkennung der Bereiche (View-IDs) ebenfalls.
 */
class FokusService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private val netz = Executors.newSingleThreadExecutor()
    private lateinit var speicher: Speicher

    private val puffer = HashMap<String, Int>()
    private var jetzt: String? = null
    private var sekSeitSenden = 0
    private val tick = 5
    private val sendeAlle = 30

    private val labelCache = HashMap<String, String>()
    private var ignorierte: Set<String> = emptySet()
    private var letzteAktion = 0L
    private var letzterHinweis = 0L
    private var letzteAuswertung = 0L

    // ---------- Inspektor: zeichnet auf, welche Elemente (View-IDs) die fremde App zeigt ----------
    private var inspektorBis = 0L
    private var inspektorLetzte = 0L
    private var inspektorHash = 0
    private val inspektorLog = StringBuilder()
    private var inspektorStart = 0L

    fun inspektorStarten(sekunden: Int) {
        inspektorLog.setLength(0)
        inspektorStart = System.currentTimeMillis()
        inspektorBis = inspektorStart + sekunden * 1000L
        inspektorHash = 0
        handler.postDelayed({ inspektorFertig() }, sekunden * 1000L + 500)
    }

    private fun inspektorFertig() {
        if (inspektorBis == 0L) return
        inspektorBis = 0L
        val text = inspektorLog.toString().ifEmpty { "(nichts aufgezeichnet)" }
        netz.execute {
            try {
                val a = Api.diagnose(speicher, text)
                speicher.letzterStatus = if (a.status == 200) "Inspektor gesendet" else "Inspektor-Fehler ${a.status}"
            } catch (e: Exception) { speicher.letzterStatus = "Inspektor: Zentrale nicht erreichbar" }
        }
    }

    private fun inspektorSammeln(pkg: String) {
        val nun = System.currentTimeMillis()
        if (nun - inspektorLetzte < 1200) return
        inspektorLetzte = nun
        val root = rootInActiveWindow ?: return
        val ids = java.util.TreeSet<String>()
        var anzahl = 0
        fun gehen(n: AccessibilityNodeInfo?, tiefe: Int) {
            if (n == null || anzahl > 1500 || tiefe > 40) return
            anzahl++
            val id = n.viewIdResourceName?.substringAfter(":id/")
            val desc = n.contentDescription?.toString()?.take(24)
            if (id != null) {
                val teile = StringBuilder(id)
                if (n.isSelected) teile.append('*')
                if (!desc.isNullOrEmpty() && (n.isSelected || n.isClickable)) teile.append(" [").append(desc).append(']')
                ids.add(teile.toString())
            }
            for (i in 0 until n.childCount) gehen(n.getChild(i), tiefe + 1)
        }
        gehen(root, 0)
        val h = ids.hashCode()
        if (h == inspektorHash) return
        inspektorHash = h
        inspektorLog.append("--- +").append((nun - inspektorStart) / 1000).append("s ").append(pkg).append('\n')
        inspektorLog.append(ids.take(150).joinToString("\n")).append('\n')
    }

    private val ticker = object : Runnable {
        override fun run() {
            try { zaehlen() } catch (_: Exception) {}
            handler.postDelayed(this, tick * 1000L)
        }
    }

    companion object { @Volatile var instanz: FokusService? = null }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instanz = this
        speicher = Speicher(this)
        try {
            val alt = speicher.puffer
            val o = JSONObject(alt)
            o.keys().forEach { puffer[it] = o.getInt(it) }
        } catch (_: Exception) {}
        ignorierte = ignorierteSammeln()
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, tick * 1000L)
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instanz = null
        handler.removeCallbacks(ticker)
        speichern()
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {}

    // ---------- Zeit zählen ----------
    private fun ignorierteSammeln(): Set<String> {
        val r = HashSet<String>()
        r.add(packageName)
        r.add("com.android.systemui")
        r.add("android")
        try {
            val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            packageManager.queryIntentActivities(home, PackageManager.MATCH_ALL).forEach { r.add(it.activityInfo.packageName) }
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).enabledInputMethodList.forEach { r.add(it.packageName) }
        } catch (_: Exception) {}
        return r
    }

    private fun aktiv(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        return pm.isInteractive && !km.isKeyguardLocked
    }

    private fun label(pkg: String): String = labelCache.getOrPut(pkg) {
        try {
            val info = packageManager.getApplicationInfo(pkg, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (_: Exception) { pkg }
    }

    private fun vordergrundPaket(): String? = try { rootInActiveWindow?.packageName?.toString() } catch (_: Exception) { null }

    private fun zaehlen() {
        jetzt = null
        if (aktiv()) {
            val pkg = vordergrundPaket()
            if (pkg != null && pkg !in ignorierte) {
                val n = label(pkg)
                jetzt = n
                puffer[n] = (puffer[n] ?: 0) + tick
            }
        }
        sekSeitSenden += tick
        if (sekSeitSenden >= sendeAlle) {
            sekSeitSenden = 0
            senden()
        }
    }

    private fun speichern() {
        speicher.puffer = JSONObject(puffer as Map<*, *>).toString()
    }

    private fun senden() {
        if (!speicher.gekoppelt) return
        val kopie = HashMap(puffer)
        val j = jetzt
        speichern()
        netz.execute {
            try {
                val a = Api.bericht(speicher, kopie, j)
                if (a.status == 200 && a.json != null) {
                    handler.post {
                        for ((k, v) in kopie) {
                            val rest = (puffer[k] ?: 0) - v
                            if (rest > 0) puffer[k] = rest else puffer.remove(k)
                        }
                        speichern()
                    }
                    speicher.letzteSperren = (a.json.optJSONArray("sperren") ?: org.json.JSONArray()).toString()
                    speicher.bereichRegeln = (a.json.optJSONObject("bereichRegeln") ?: JSONObject()).toString()
                    speicher.letzterStatus = "gesendet " + java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.GERMAN).format(java.util.Date())
                } else if (a.status == 401) {
                    speicher.letzterStatus = "Token ungültig – bitte neu koppeln"
                } else {
                    speicher.letzterStatus = "Fehler ${a.status}"
                }
            } catch (e: Exception) {
                speicher.letzterStatus = "Zentrale nicht erreichbar (Tailscale an?)"
            }
        }
    }

    // ---------- Sperren ----------
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event != null && inspektorBis > System.currentTimeMillis()) {
            val ip = event.packageName?.toString()
            if (ip != null && ip != packageName) inspektorSammeln(ip)
            return
        }
        if (event == null || !::speicher.isInitialized || !speicher.gekoppelt) return
        val nun = System.currentTimeMillis()
        if (nun - letzteAuswertung < 350) return
        letzteAuswertung = nun
        val pkg = event.packageName?.toString() ?: return
        if (pkg in ignorierte) return
        val sperren = speicher.sperren()
        if (sperren.length() == 0) return
        val regeln = speicher.regeln()
        for (i in 0 until sperren.length()) {
            val s = sperren.getJSONObject(i)
            val typ = s.optString("typ")
            val wert = s.optString("wert")
            if (typ == "app" && appPasst(pkg, wert)) {
                sperrenAktion { performGlobalAction(GLOBAL_ACTION_HOME); hinweis("${label(pkg)} ist gesperrt") }
                return
            }
            if (typ == "bereich") {
                val r = regeln.optJSONObject(wert) ?: continue
                if (r.optString("paket") != pkg) continue
                if (bereichAktiv(pkg, r)) {
                    sperrenAktion { bereichAktion(pkg, r) }
                    return
                }
            }
        }
    }

    private fun appPasst(pkg: String, wert: String): Boolean {
        val w = wert.lowercase()
        return w.isNotEmpty() && (label(pkg).lowercase().contains(w) || pkg.lowercase().contains(w))
    }

    private fun sperrenAktion(f: () -> Unit) {
        val nun = System.currentTimeMillis()
        if (nun - letzteAktion < 1200) return
        letzteAktion = nun
        f()
    }

    private fun hinweis(text: String) {
        val nun = System.currentTimeMillis()
        if (nun - letzterHinweis < 5000) return
        letzterHinweis = nun
        handler.post { Toast.makeText(this, text, Toast.LENGTH_SHORT).show() }
    }

    private fun bereichAktiv(pkg: String, r: JSONObject): Boolean {
        val root = rootInActiveWindow ?: return false
        val ids = r.optJSONArray("ids") ?: return false
        val selected = r.optBoolean("selected", false)
        for (i in 0 until ids.length()) {
            val nodes = root.findAccessibilityNodeInfosByViewId("$pkg:id/${ids.getString(i)}")
            if (nodes.any { !selected || it.isSelected }) return true
        }
        return false
    }

    private fun bereichAktion(pkg: String, r: JSONObject) {
        val a = r.optJSONObject("aktion")
        if (a != null && a.optString("typ") == "klick") {
            val root = rootInActiveWindow
            val ziel = root?.findAccessibilityNodeInfosByViewId("$pkg:id/${a.optString("id")}")?.firstOrNull()
            if (ziel != null && klicken(ziel)) { hinweis("Bereich gesperrt"); return }
        }
        performGlobalAction(GLOBAL_ACTION_BACK)
        hinweis("Bereich gesperrt")
    }

    private fun klicken(n: AccessibilityNodeInfo): Boolean {
        var k: AccessibilityNodeInfo? = n
        var tiefe = 0
        while (k != null && tiefe < 6) {
            if (k.isClickable) return k.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            k = k.parent
            tiefe++
        }
        return false
    }
}
