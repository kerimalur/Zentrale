package ch.kerim.zentrale.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject

/**
 * Vollbild-WebView für den TV-Tab der Zentrale. Gleichzeitig Startbildschirm (HOME) der Box.
 * Die Seite bekommt über «AndroidTV» die Möglichkeit, andere Apps (Jellyfin, Spotify, YouTube …) zu starten.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var zeigtFehlerseite = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        web.setBackgroundColor(0xFF0B0E14.toInt())
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true // nur für die lokale Fehlerseite aus assets/
            allowContentAccess = false
        }
        CookieManager.getInstance().setAcceptCookie(true)

        web.addJavascriptInterface(Bruecke(), "AndroidTV")
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) fehlerseite()
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame && errorResponse.statusCode >= 500) fehlerseite()
            }

            // Links bleiben in der App; fremde Adressen werden nicht geöffnet.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val ziel = request.url
                val start = Uri.parse(BuildConfig.START_URL)
                return !(ziel.host == start.host || ziel.scheme == "file")
            }

            override fun onPageFinished(view: WebView, url: String?) {
                CookieManager.getInstance().flush()
            }
        }

        web.loadUrl(BuildConfig.START_URL)
    }

    private fun fehlerseite() {
        if (zeigtFehlerseite) return
        zeigtFehlerseite = true
        web.loadUrl("file:///android_asset/offline.html")
    }

    private fun neuLaden() {
        zeigtFehlerseite = false
        web.loadUrl(BuildConfig.START_URL)
    }

    // Home-Taste, während die App schon läuft: zurück zur Startseite.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) neuLaden()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        // Nach einer anderen App (z. B. Jellyfin) frische Daten holen.
        if (zeigtFehlerseite) neuLaden() else web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        web.onPause()
        super.onPause()
    }

    // Zurück-Taste: die Seite entscheidet (eine Ebene hoch). Auf dem Start passiert nichts – wir sind der Startbildschirm.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (!zeigtFehlerseite) web.evaluateJavascript("(function(){return window.tvZurueck?window.tvZurueck():false})()", null)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Zurück wird in onKeyDown behandelt")
    override fun onBackPressed() {
        // absichtlich leer: die App ist der Startbildschirm und soll nicht beendet werden
    }

    /** Was die Seite aufrufen darf (window.AndroidTV). */
    inner class Bruecke {
        @JavascriptInterface
        fun startApp(pkg: String): Boolean {
            return try {
                val i = packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)
                if (i == null) {
                    false
                } else {
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(i)
                    true
                }
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun apps(): String {
            val arr = JSONArray()
            val gesehen = HashSet<String>()
            for (kategorie in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
                val abfrage = Intent(Intent.ACTION_MAIN).addCategory(kategorie)
                for (r in packageManager.queryIntentActivities(abfrage, 0)) {
                    val pkg = r.activityInfo.packageName
                    if (pkg == packageName || !gesehen.add(pkg)) continue
                    arr.put(JSONObject().put("name", r.loadLabel(packageManager).toString()).put("pkg", pkg))
                }
            }
            return arr.toString()
        }

        @JavascriptInterface
        fun home() {
            runOnUiThread { neuLaden() }
        }

        @JavascriptInterface
        fun retry() {
            runOnUiThread { neuLaden() }
        }
    }
}
