package ch.kerim.fokus

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import org.json.JSONArray
import org.json.JSONObject

/**
 * Handy-Parkplatz: Wer kabellos lädt (Pixel Stand), gilt als «geparkt».
 * Beim Parken: Nicht stören an, Spiele und die in der Zentrale gewählten Apps sind gesperrt.
 * Die Parkzeiten (von/bis) werden gespeichert und mit dem nächsten Bericht an die Zentrale gemeldet.
 */
class Parken(
    private val ctx: Context,
    private val s: Speicher,
    private val handler: Handler,
    private val geaendert: () -> Unit,
) {
    private val startVerzoegerung = 10_000L   // Wackler beim Auflegen ignorieren
    private val endeVerzoegerung = 30_000L    // kurzes Anheben/Abbrechen des Ladens nicht als Ende werten

    private var kabellos = false
    private var startAufgabe: Runnable? = null
    private var endeAufgabe: Runnable? = null
    private var registriert = false
    private val spielCache = HashMap<String, Boolean>()

    private val empfaenger = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) { if (i != null) batterie(i) }
    }

    val geparkt: Boolean get() = s.parkSeit > 0L

    // ---------- Lebenszyklus ----------
    fun start() {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val sticky = if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(empfaenger, filter, Context.RECEIVER_NOT_EXPORTED) else ctx.registerReceiver(empfaenger, filter)
        registriert = true
        val nun = System.currentTimeMillis()
        kabellos = sticky?.let { istKabellos(it) } ?: false
        // Dienst neu gestartet (z. B. nach Neustart des Handys): offenen Zustand mit der Wirklichkeit abgleichen
        if (geparkt && !kabellos) beenden(maxOf(s.parkZuletzt, s.parkSeit))
        else if (!geparkt && kabellos) beginnen(nun)
        else if (geparkt) dndEin()
    }

    fun stop() {
        startAufgabe?.let { handler.removeCallbacks(it) }
        endeAufgabe?.let { handler.removeCallbacks(it) }
        if (registriert) {
            try { ctx.unregisterReceiver(empfaenger) } catch (_: Exception) {}
            registriert = false
        }
    }

    /** Alle 5 Sekunden vom Dienst aufgerufen: merkt sich, bis wann das Handy sicher geparkt war. */
    fun tick() {
        if (geparkt && kabellos) s.parkZuletzt = System.currentTimeMillis()
    }

    // ---------- Erkennung ----------
    private fun istKabellos(i: Intent): Boolean =
        (i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) and BatteryManager.BATTERY_PLUGGED_WIRELESS) != 0

    private fun batterie(i: Intent) {
        val jetztKabellos = istKabellos(i)
        if (jetztKabellos == kabellos) return
        kabellos = jetztKabellos
        val nun = System.currentTimeMillis()
        if (kabellos) {
            endeAufgabe?.let { handler.removeCallbacks(it) }
            if (!geparkt) {
                val von = nun
                val a = Runnable { if (kabellos && !geparkt) beginnen(von) }
                startAufgabe = a
                handler.postDelayed(a, startVerzoegerung)
            }
        } else {
            startAufgabe?.let { handler.removeCallbacks(it) }
            if (geparkt) {
                val bis = nun
                val a = Runnable { if (!kabellos && geparkt) beenden(bis) }
                endeAufgabe = a
                handler.postDelayed(a, endeVerzoegerung)
            }
        }
    }

    private fun beginnen(von: Long) {
        s.parkSeit = von
        s.parkZuletzt = System.currentTimeMillis()
        dndEin()
        geaendert()
    }

    private fun beenden(bis: Long) {
        val von = s.parkSeit
        if (von > 0L && bis > von) {
            val liste = fertigListe()
            liste.put(JSONObject().put("von", von).put("bis", bis))
            s.parkFertig = liste.toString()
        }
        s.parkSeit = 0L
        dndAus()
        geaendert()
    }

    // ---------- Nicht stören ----------
    private fun nm() = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun dndErlaubt(): Boolean = try { nm().isNotificationPolicyAccessGranted } catch (_: Exception) { false }

    /** Schaltet Nicht stören ein, aber nur, wenn es aus ist; ein strengerer Modus bleibt unangetastet. */
    private fun dndEin() {
        if (!konfig().optBoolean("dnd", true) || !dndErlaubt()) return
        try {
            val n = nm()
            val aktuell = n.currentInterruptionFilter
            if (aktuell == NotificationManager.INTERRUPTION_FILTER_ALL || aktuell == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
                n.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                s.dndGesetzt = true
            }
        } catch (_: Exception) {}
    }

    /** Schaltet Nicht stören nur aus, wenn es von hier kam und seither nicht von Hand geändert wurde. */
    private fun dndAus() {
        if (!s.dndGesetzt) return
        s.dndGesetzt = false
        if (!dndErlaubt()) return
        try {
            val n = nm()
            if (n.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_PRIORITY) n.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
        } catch (_: Exception) {}
    }

    // ---------- Sperren während des Parkens ----------
    fun konfig(): JSONObject = s.parkKonfigJson()

    @Suppress("DEPRECATION")
    private fun istSpiel(pkg: String): Boolean = spielCache.getOrPut(pkg) {
        try {
            val info = ctx.packageManager.getApplicationInfo(pkg, 0)
            info.category == ApplicationInfo.CATEGORY_GAME || (info.flags and ApplicationInfo.FLAG_IS_GAME) != 0
        } catch (_: Exception) { false }
    }

    /** Ist diese App gerade gesperrt, weil das Handy geparkt ist? */
    fun blockiert(pkg: String, name: String): Boolean {
        if (!geparkt) return false
        val k = konfig()
        val apps = k.optJSONArray("apps") ?: JSONArray()
        val n = name.lowercase()
        val p = pkg.lowercase()
        for (i in 0 until apps.length()) {
            val a = apps.optString(i).trim().lowercase()
            if (a.isNotEmpty() && (n.contains(a) || p.contains(a))) return true
        }
        return k.optBoolean("spiele", true) && istSpiel(pkg)
    }

    // ---------- Meldung an die Zentrale ----------
    fun fertigListe(): JSONArray = try { JSONArray(s.parkFertig) } catch (_: Exception) { JSONArray() }

    fun berichtJson(): JSONObject = JSONObject()
        .put("aktiv", geparkt)
        .put("seit", s.parkSeit)
        .put("fertig", fertigListe())

    /** Entfernt die Sitzungen, die die Zentrale bestätigt hat (nach erfolgreichem Bericht). */
    fun bestaetigt(gesendet: Set<Long>) {
        val rest = JSONArray()
        val alt = fertigListe()
        for (i in 0 until alt.length()) {
            val e = alt.getJSONObject(i)
            if (e.optLong("von") !in gesendet) rest.put(e)
        }
        s.parkFertig = rest.toString()
    }
}
