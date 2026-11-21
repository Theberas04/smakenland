package nl.werdens.smakenland;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * Enige scherm van de app: een WebView die het spel uit de bundel laadt.
 *
 * De pagina draait op https://appassets.androidplatform.net/assets/www/index.html,
 * zodat localStorage een echte origin heeft en het potje op het toestel bewaard
 * blijft. Er is geen internetverbinding nodig.
 */
public class MainActivity extends ComponentActivity {
  static final String TAG = "Smakenland";
  static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
  static final String EXTRA_SCHERM = "scherm";

  private WebView webView;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.enableEdgeToEdge(getWindow());

    webView = new WebView(this);
    webView.setBackgroundColor(Color.rgb(246, 241, 231));
    // De WebView tekent zijn inhoud niet binnen zijn eigen padding, dus de systeembalk
    // en de camerauitsparing horen op een houder eromheen. Zonder die houder schuift
    // de app-kop achter de klok van Android.
    FrameLayout houder = new FrameLayout(this);
    houder.setBackgroundColor(Color.rgb(246, 241, 231));
    houder.addView(webView, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    ViewCompat.setOnApplyWindowInsetsListener(houder, (view, windowInsets) -> {
      Insets bars = windowInsets.getInsets(
          WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
      view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
      return WindowInsetsCompat.CONSUMED;
    });
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
      }
    });
    setContentView(houder);
    ViewCompat.requestApplyInsets(houder);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);

    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

    webView.setWebViewClient(new WebViewClientCompat() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return loader.shouldInterceptRequest(request.getUrl());
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        Log.i(TAG, "SmakenlandPagina " + url);
      }
    });

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage message) {
        // De pagina meldt via console.info welk scherm er staat; dat is het bewijs
        // dat de bundel werkt en komt zo in logcat terecht.
        Log.i(TAG, message.message());
        return true;
      }
    });

    webView.loadUrl(startUrl(getIntent()));
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (webView == null) return;
    String scherm = schermUitExtra(intent);
    if (scherm != null) webView.loadUrl(START_URL + "#" + scherm);
  }

  /**
   * Een scherm uit een intent-extra komt alleen in een debuggable bouw door: een
   * release-app kan niet van buitenaf naar een scherm gestuurd worden.
   */
  static String schermUitExtra(Intent intent) {
    if (intent == null) return null;
    String scherm = intent.getStringExtra(EXTRA_SCHERM);
    if (scherm == null || scherm.isEmpty()) return null;
    if (!scherm.matches("levels|sudoku|vrij|level[0-9]{1,3}")) {
      Log.w(TAG, "onbekend scherm gevraagd: " + scherm);
      return null;
    }
    return scherm;
  }

  static boolean isDebuggable(ComponentActivity activity) {
    return (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }

  private String startUrl(Intent intent) {
    if (!isDebuggable(this)) return START_URL;
    String scherm = schermUitExtra(intent);
    return scherm == null ? START_URL : START_URL + "#" + scherm;
  }
}
