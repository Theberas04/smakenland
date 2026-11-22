package nl.werdens.smakenland;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * De melding "je energie is weer vol".
 *
 * Een WebView mag op de achtergrond niets plannen, dus doet de pagina het niet
 * zelf: die zegt alleen hoe lang het nog duurt voordat de energie vol is, en deze
 * klasse laat het toestel op dat moment wakker worden. Dat gaat met een wekker
 * (AlarmManager) in plaats van een klus van een kwartier, want de energie vult
 * zich per twaalf seconden aan en is dus vaak binnen enkele minuten vol.
 *
 * Het is bewust `setAndAllowWhileIdle`: dat mag zonder aparte toestemming. De
 * keerzijde is dat Android de wekker een paar minuten mag uitstellen — een
 * melding "ongeveer vol" dus, en geen secondewerk.
 */
public class EnergieMelder extends BroadcastReceiver {
  static final String KANAAL = "energie";
  static final int MELDING_ID = 4711;
  private static final String TAG = "Smakenland";
  private static final String EXTRA_SMALLER = "SmakenlandEnergie";

  /** Zet de wekker: over `seconden` laat het toestel zich horen. */
  public static void plan(Context context, long seconden) {
    AlarmManager beheer = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (beheer == null) return;
    annuleer(context);
    long wachttijd = Math.max(5000L, Math.min(seconden, 3600L) * 1000L);
    long wanneer = System.currentTimeMillis() + wachttijd;
    try {
      beheer.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, wanneer, wekker(context));
      Log.i(TAG, "SmakenlandEnergie wekker over " + (wachttijd / 1000) + " s");
    } catch (SecurityException e) {
      Log.w(TAG, "SmakenlandEnergie wekker geweigerd: " + e.getMessage());
    }
  }

  /** Geen melding meer nodig (de speler is terug in de app). */
  public static void annuleer(Context context) {
    AlarmManager beheer = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (beheer == null) return;
    PendingIntent bestaand = PendingIntent.getBroadcast(context, MELDING_ID, intent(context),
        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
    if (bestaand != null) {
      beheer.cancel(bestaand);
      bestaand.cancel();
      Log.i(TAG, "SmakenlandEnergie wekker afgezegd");
    }
    NotificationManager melder = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (melder != null) melder.cancel(MELDING_ID);
  }

  /** Is er op dit moment een wekker gezet? (voor de rooktest) */
  public static boolean staatGepland(Context context) {
    return PendingIntent.getBroadcast(context, MELDING_ID, intent(context),
        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE) != null;
  }

  private static Intent intent(Context context) {
    Intent intent = new Intent(context, EnergieMelder.class);
    intent.setAction(EXTRA_SMALLER);
    return intent;
  }

  private static PendingIntent wekker(Context context) {
    return PendingIntent.getBroadcast(context, MELDING_ID, intent(context),
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    meld(context);
  }

  /** De eigenlijke melding. Tik erop en het spel opent weer. */
  static void meld(Context context) {
    NotificationManager melder = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (melder == null) return;
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel kanaal = new NotificationChannel(KANAAL, "Energie",
          NotificationManager.IMPORTANCE_DEFAULT);
      kanaal.setDescription("Laat weten wanneer je energie weer vol is.");
      melder.createNotificationChannel(kanaal);
    }
    Intent open = new Intent(context, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int vlaggen = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) vlaggen |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent tik = PendingIntent.getActivity(context, MELDING_ID, open, vlaggen);

    Notification.Builder bouwer = Build.VERSION.SDK_INT >= 26
        ? new Notification.Builder(context, KANAAL)
        : new Notification.Builder(context);
    bouwer.setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Je energie is weer vol")
        .setContentText("Kom terug naar Smakenland om verder te oogsten.")
        .setAutoCancel(true)
        .setContentIntent(tik);
    try {
      melder.notify(MELDING_ID, bouwer.build());
      Log.i(TAG, "SmakenlandEnergie melding geplaatst");
    } catch (SecurityException e) {
      // Geen meldingsrecht (Android 13+ en de speler heeft het geweigerd).
      Log.w(TAG, "SmakenlandEnergie melding geweigerd: " + e.getMessage());
    }
  }
}
