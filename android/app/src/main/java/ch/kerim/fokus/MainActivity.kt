package ch.kerim.fokus

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

// Einfache Oberfläche: koppeln, Status, Bedienungshilfe einschalten.
class MainActivity : Activity() {
    private lateinit var s: Speicher
    private lateinit var wurzel: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private val netz = Executors.newSingleThreadExecutor()
    private val auffrischen = object : Runnable {
        override fun run() { zeichnen(); handler.postDelayed(this, 3000) }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        s = Speicher(this)
        val scroll = ScrollView(this)
        wurzel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(40), dp(20), dp(24)) }
        scroll.addView(wurzel)
        setContentView(scroll)
    }

    override fun onResume() { super.onResume(); handler.post(auffrischen) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(auffrischen) }

    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()

    private fun text(t: String, groesse: Float = 15f, fett: Boolean = false, farbe: Int = Color.parseColor("#151a26")) = TextView(this).apply {
        this.text = t; textSize = groesse; setTextColor(farbe)
        if (fett) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, dp(6), 0, dp(6))
    }

    private fun knopf(t: String, f: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; setOnClickListener { f() }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
    }

    private fun feld(hinweis: String, wert: String, zahl: Boolean = false) = EditText(this).apply {
        hint = hinweis; setText(wert); setSingleLine(true)
        inputType = if (zahl) InputType.TYPE_CLASS_NUMBER else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
    }

    private fun dienstAn(): Boolean {
        val an = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val name = ComponentName(this, FokusService::class.java).flattenToString()
        return an.split(':').any { it.equals(name, true) }
    }

    private var letzteAnsicht = ""

    private fun zeichnen() {
        val ansicht = "${s.gekoppelt}|${dienstAn()}|${s.letzterStatus}"
        if (ansicht == letzteAnsicht) return
        // Während der Eingabe nicht neu zeichnen
        if (!s.gekoppelt && letzteAnsicht.startsWith("false|") && wurzel.childCount > 0) { letzteAnsicht = ansicht; return }
        letzteAnsicht = ansicht
        wurzel.removeAllViews()
        wurzel.addView(text("Fokus", 28f, true))
        if (!s.gekoppelt) {
            wurzel.addView(text("Verbinde dieses Handy mit deiner Zentrale. Den Code bekommst du in der Zentrale unter Fokus → Gerät koppeln. Tailscale muss an sein."))
            val adresse = feld("Adresse der Zentrale", s.adresse)
            val code = feld("6-stelliger Code", "", true)
            val name = feld("Name dieses Geräts", if (s.geraetName == "Pixel") Build.MODEL else s.geraetName)
            val meldung = text("", 14f, farbe = Color.parseColor("#b42318"))
            wurzel.addView(adresse); wurzel.addView(code); wurzel.addView(name)
            wurzel.addView(knopf("Koppeln") {
                val a = adresse.text.toString().trim().trimEnd('/')
                val c = code.text.toString().replace(" ", "")
                val n = name.text.toString().trim().ifEmpty { "Handy" }
                meldung.text = "Verbinde …"
                netz.execute {
                    try {
                        val token = Api.koppeln(a, c, n)
                        s.adresse = a; s.geraetName = n; s.token = token; s.letzterStatus = "gekoppelt"
                        handler.post { letzteAnsicht = ""; zeichnen() }
                    } catch (e: Exception) {
                        handler.post { meldung.text = e.message ?: "Fehler" }
                    }
                }
            })
            wurzel.addView(meldung)
        } else {
            wurzel.addView(text("Gekoppelt als «${s.geraetName}»", 17f, true))
            wurzel.addView(text(s.adresse, 13f, farbe = Color.GRAY))
            val an = dienstAn()
            wurzel.addView(text(if (an) "Bedienungshilfe: an ✓" else "Bedienungshilfe: AUS – ohne sie wird nichts gemessen", 16f, true,
                if (an) Color.parseColor("#15803d") else Color.parseColor("#b42318")))
            if (!an) {
                wurzel.addView(text("Einstellungen → Bedienungshilfen → Installierte Apps → «Fokus (Zentrale)» → einschalten. Falls die Option ausgegraut ist: Einstellungen → Apps → Fokus → ⋮ (oben rechts) → «Eingeschränkte Einstellungen zulassen»."))
                wurzel.addView(knopf("Bedienungshilfen öffnen") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
                wurzel.addView(knopf("App-Info öffnen") {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(android.net.Uri.parse("package:$packageName")))
                })
            }
            wurzel.addView(text("Status: ${s.letzterStatus}", 14f))
            wurzel.addView(text("Sperren: ${s.sperren().length()} aktiv", 14f))
            wurzel.addView(knopf("Inspektor starten (30 Sek)") {
                val dienst = FokusService.instanz
                if (dienst == null) s.letzterStatus = "Bedienungshilfe ist aus"
                else { dienst.inspektorStarten(30); s.letzterStatus = "Inspektor läuft: jetzt die App öffnen" }
            })
            wurzel.addView(knopf("Entkoppeln") { s.entkoppeln(); letzteAnsicht = ""; zeichnen() })
        }
    }
}
