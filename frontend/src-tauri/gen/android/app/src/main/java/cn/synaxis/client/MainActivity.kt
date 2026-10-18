package cn.synaxis.client

import android.os.Bundle
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.net.Uri
import androidx.core.view.WindowCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var clientWebView: WebView? = null
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    clientWebView = webView
    // A narrowly scoped appearance channel; no files, credentials or navigation.
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun setDark(dark: Boolean) {
        runOnUiThread {
          val uri = Uri.parse(webView.url ?: "")
          if (uri.host != "tauri.localhost" && uri.scheme != "tauri") return@runOnUiThread
          val controller = WindowCompat.getInsetsController(window, webView)
          controller.isAppearanceLightStatusBars = !dark
          controller.isAppearanceLightNavigationBars = !dark
        }
      }
    }, "SynaxisSystemUi")
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript(
          "!window.dispatchEvent(new CustomEvent('synaxis:native-back', {cancelable:true}))"
        ) { handled -> if (handled != "true") finish() }
      }
    })
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
  override fun onPause() {
    clientWebView?.evaluateJavascript("window.dispatchEvent(new Event('synaxis:native-pause'))", null)
    super.onPause()
  }
  override fun onResume() {
    super.onResume()
    clientWebView?.evaluateJavascript("window.dispatchEvent(new Event('synaxis:native-resume'))", null)
  }
}
