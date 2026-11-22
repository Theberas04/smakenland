package nl.werdens.smakenland;

import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Enige scherm van de app: een WebView die het spel uit de bundel laadt.
 *
 * De pagina draait op https://appassets.androidplatform.net/assets/www/index.html,
 * zodat localStorage een echte origin heeft en het potje op het toestel bewaard
 * blijft. Het spel zelf werkt zonder internet; internet wordt alleen gebruikt om
 * bij GitHub te kijken of er een nieuwe versie is.
 */
public class MainActivity extends ComponentActivity {
  static final String TAG = "Smakenland";
  static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
  static final String EXTRA_SCHERM = "scherm";

  /** De uitgavepagina van Smakenland; hier komt de nieuwste APK vandaan. */
  static final String UPDATE_API =
      "https://api.github.com/repos/Theberas04/smakenland/releases/latest";
  static final String UPDATE_PAGINA = "https://github.com/Theberas04/smakenland/releases/latest";

  private WebView webView;
  private String versieNaam = "?";
  private int versieCode = -1;
  private final AtomicBoolean controleBezig = new AtomicBoolean(false);
  private final Handler hoofd = new Handler(Looper.getMainLooper());

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Rand tot rand: de app tekent onder de systeembalken, en de houder eronder
    // zet de balken als padding. setDecorFitsSystemWindows werkt in elke androidx.core.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    leesEigenVersie();

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

    // De pagina kan hiermee aan de app vragen of er een nieuwe versie is, en ziet
    // meteen welk versienummer er op het toestel staat.
    webView.addJavascriptInterface(new Brug(), "SmakenlandApp");
    // En hiermee laat de pagina het toestel trillen bij een versmelting of een
    // prestatie. Let op: de eigen module van de pagina heet SmakenlandTrillen,
    // anders zou hij deze brug overschrijven.
    webView.addJavascriptInterface(new TrilBrug(), "SmakenlandTril");
    Log.i(TAG, "SmakenlandTril kan=" + Trillen.kan(this));

    // Op Android 13 en hoger mag een app pas meldingen plaatsen als de speler het
    // vraagt. Zonder die toestemming blijft het spel gewoon werken; alleen de
    // melding "je energie is weer vol" komt dan niet.
    if (Build.VERSION.SDK_INT >= 33) {
      if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
          != PackageManager.PERMISSION_GRANTED) {
        requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 1);
      }
    }

    webView.loadUrl(startUrl(getIntent()));

    // Stil op de achtergrond kijken of er een nieuwe versie is. Faalt dit (geen
    // internet), dan merkt de speler daar niets van.
    new Thread(() -> controleerOpUpdates(false)).start();
  }

  /** Wat de pagina van de app mag weten en vragen. */
  private class Brug {
    @JavascriptInterface
    public String versie() {
      return versieNaam;
    }

    @JavascriptInterface
    public boolean isApp() {
      return true;
    }

    /** Handmatige controle: de speler krijgt ook te horen als er niets nieuws is. */
    @JavascriptInterface
    public void controleerOpUpdates() {
      // Let op: zonder MainActivity.this pakt Java de eigen methode van deze brug.
      new Thread(() -> MainActivity.this.controleerOpUpdates(true)).start();
    }

    /**
     * De pagina laat weten hoeveel seconden het nog duurt voordat de energie vol
     * is. Wij zetten daarvoor een wekker (en de vorige wekker af).
     */
    @JavascriptInterface
    public void planEnergieMelding(int seconden) {
      if (seconden <= 0) {
        EnergieMelder.annuleer(MainActivity.this);
        return;
      }
      EnergieMelder.plan(MainActivity.this, seconden);
    }

    /** De speler is terug in de app: geen melding meer nodig. */
    @JavascriptInterface
    public void annuleerEnergieMelding() {
      EnergieMelder.annuleer(MainActivity.this);
    }
  }

  /** Trillen voor de pagina. */
  private class TrilBrug {
    @JavascriptInterface
    public boolean tril(String patroon) {
      return Trillen.doe(MainActivity.this, patroon);
    }

    @JavascriptInterface
    public boolean kan() {
      return Trillen.kan(MainActivity.this);
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    // Terug in de app: de melding en de wekker horen nu niet meer.
    EnergieMelder.annuleer(this);
    Log.i(TAG, "SmakenlandEnergie aanwezig=true gepland=" + EnergieMelder.staatGepland(this));
  }

  private void leesEigenVersie() {
    try {
      PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
      versieNaam = info.versionName == null ? "?" : info.versionName;
      versieCode = Build.VERSION.SDK_INT >= 28
          ? (int) info.getLongVersionCode()
          : info.versionCode;
    } catch (PackageManager.NameNotFoundException e) {
      Log.w(TAG, "eigen versie niet te lezen: " + e.getMessage());
    }
  }

  /**
   * Kijkt bij GitHub of er een nieuwere uitgave is.
   *
   * @param handmatig true als de speler er zelf om vroeg: dan komt er ook een
   *                  bericht als er niets nieuws is of als GitHub onbereikbaar was.
   */
  private void controleerOpUpdates(boolean handmatig) {
    if (!controleBezig.compareAndSet(false, true)) return;
    try {
      String json = haal(UPDATE_API);
      if (json == null) {
        Log.i(TAG, "SmakenlandUpdate mislukt (geen antwoord van GitHub)");
        if (handmatig) meld("Kon GitHub niet bereiken — controleer je verbinding.");
        return;
      }
      int gevonden = Updates.versieCode(Updates.tagUit(json));
      boolean nieuwer = Updates.isNieuwer(gevonden, versieCode);
      Log.i(TAG, "SmakenlandUpdate eigen=" + versieNaam + " (" + versieCode + ")"
          + " gevonden=" + Updates.tagUit(json) + " (" + gevonden + ") nieuwer=" + nieuwer);
      if (!nieuwer) {
        if (handmatig) meld("Je hebt de nieuwste versie (" + versieNaam + ").");
        return;
      }
      final String url = Updates.apkUrlUit(json);
      final String tag = Updates.tagUit(json);
      if (url == null) {
        Log.w(TAG, "SmakenlandUpdate nieuwere uitgave zonder APK: " + tag);
        if (handmatig) meld("Er is een nieuwe versie, maar nog geen downloadbestand.");
        return;
      }
      hoofd.post(() -> vraagBijwerken(tag, url));
    } catch (Exception e) {
      Log.w(TAG, "SmakenlandUpdate mislukt: " + e);
      if (handmatig) meld("Kon niet controleren op updates.");
    } finally {
      controleBezig.set(false);
    }
  }

  private void vraagBijwerken(String tag, String url) {
    if (isFinishing() || isDestroyed()) return;
    new AlertDialog.Builder(this)
        .setTitle("Nieuwe versie " + tag.replaceFirst("^[vV]", ""))
        .setMessage("Je hebt " + versieNaam + ". Wil je bijwerken? Je potje en je sterren blijven bewaard.")
        .setPositiveButton("Bijwerken", (d, w) -> downloadEnInstalleer(url))
        .setNegativeButton("Later", null)
        .show();
  }

  private void downloadEnInstalleer(String url) {
    final String naam = Updates.bestandsnaam(url);
    if (naam == null) {
      meld("De downloadlink klopt niet.");
      return;
    }
    if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
      // Android wil eerst dat de speler deze app laat installeren.
      meld("Zet eerst \u201cOnbekende apps installeren\u201d aan voor Smakenland.");
      try {
        startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getPackageName())));
      } catch (Exception e) {
        Log.w(TAG, "kan de instelpagina niet openen: " + e);
      }
      return;
    }
    final ProgressDialog dialoog = new ProgressDialog(this);
    dialoog.setTitle("Bijwerken");
    dialoog.setMessage("Bezig met downloaden…");
    dialoog.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
    dialoog.setMax(100);
    dialoog.setCancelable(false);
    dialoog.show();

    new Thread(() -> {
      File doel = new File(new File(getCacheDir(), "update"), naam);
      try {
        File map = doel.getParentFile();
        if (map != null && !map.exists() && !map.mkdirs()) throw new IllegalStateException("geen map");
        download(url, doel, procent -> hoofd.post(() -> {
          if (dialoog.isShowing()) dialoog.setProgress(procent);
        }));
        Log.i(TAG, "SmakenlandUpdate gedownload: " + doel.getAbsolutePath()
            + " (" + doel.length() + " bytes)");
        hoofd.post(() -> {
          if (dialoog.isShowing()) dialoog.dismiss();
          installeer(doel);
        });
      } catch (Exception e) {
        Log.w(TAG, "SmakenlandUpdate downloaden mislukt: " + e);
        hoofd.post(() -> {
          if (dialoog.isShowing()) dialoog.dismiss();
          meld("Bijwerken mislukt — probeer het later opnieuw.");
        });
      }
    }).start();
  }

  private void installeer(File apk) {
    try {
      Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".bestanden", apk);
      Intent intent = new Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(intent);
      Log.i(TAG, "SmakenlandUpdate installatie aangeboden");
    } catch (Exception e) {
      Log.w(TAG, "installeren lukt niet, dan maar de pagina: " + e);
      meld("Open " + UPDATE_PAGINA + " om bij te werken.");
    }
  }

  /** Haalt een pagina op als tekst; null als het niet lukt. */
  private String haal(String adres) {
    HttpURLConnection verbinding = null;
    try {
      verbinding = (HttpURLConnection) new URL(adres).openConnection();
      verbinding.setConnectTimeout(8000);
      verbinding.setReadTimeout(8000);
      verbinding.setRequestProperty("Accept", "application/vnd.github+json");
      verbinding.setRequestProperty("User-Agent", "Smakenland-app");
      if (verbinding.getResponseCode() != 200) return null;
      StringBuilder uit = new StringBuilder();
      try (InputStream in = verbinding.getInputStream()) {
        byte[] buffer = new byte[8192];
        int gelezen;
        while ((gelezen = in.read(buffer)) > 0) uit.append(new String(buffer, 0, gelezen, "UTF-8"));
      }
      return uit.toString();
    } catch (Exception e) {
      Log.i(TAG, "SmakenlandUpdate netwerk: " + e);
      return null;
    } finally {
      if (verbinding != null) verbinding.disconnect();
    }
  }

  private interface Voortgang {
    void bij(int procent);
  }

  private void download(String adres, File doel, Voortgang voortgang) throws Exception {
    HttpURLConnection verbinding = (HttpURLConnection) new URL(adres).openConnection();
    try {
      verbinding.setConnectTimeout(10000);
      verbinding.setReadTimeout(30000);
      verbinding.setRequestProperty("User-Agent", "Smakenland-app");
      verbinding.setInstanceFollowRedirects(true);
      if (verbinding.getResponseCode() != 200) throw new IllegalStateException("status " + verbinding.getResponseCode());
      long totaal = verbinding.getContentLengthLong();
      try (InputStream in = verbinding.getInputStream();
           FileOutputStream uit = new FileOutputStream(doel)) {
        byte[] buffer = new byte[16384];
        long gedaan = 0;
        int gelezen;
        while ((gelezen = in.read(buffer)) > 0) {
          uit.write(buffer, 0, gelezen);
          gedaan += gelezen;
          if (totaal > 0) voortgang.bij((int) (gedaan * 100 / totaal));
        }
      }
      if (doel.length() == 0) throw new IllegalStateException("leeg bestand");
    } finally {
      verbinding.disconnect();
    }
  }

  private void meld(String tekst) {
    hoofd.post(() -> Toast.makeText(this, tekst, Toast.LENGTH_LONG).show());
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
    // De lijst met toegestane schermen staat in Schermen.java, zodat er een gewone
    // Java-test op kan lopen: "sudoku16" werd hier eerst afgewezen.
    String gekeurd = Schermen.uit(scherm);
    if (gekeurd == null) {
      Log.w(TAG, "onbekend scherm gevraagd: " + scherm);
      return null;
    }
    return gekeurd;
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
