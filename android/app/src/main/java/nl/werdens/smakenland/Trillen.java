package nl.werdens.smakenland;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

/**
 * Trillen voor de pagina.
 *
 * De pagina stuurt een patroon als "16,30,16" (milliseconden, om en om aan en
 * uit). Op een toestel zonder trilblokje — of als de gebruiker het trillen in de
 * app heeft uitgezet — gebeurt er niets; dat is geen fout, want de pagina vraagt
 * het alleen als de speler het aan heeft staan.
 */
public class Trillen {
  private static final String TAG = "Smakenland";

  /** Het langste patroon dat we aannemen: vijf tikken van hooguit een seconde. */
  private static final int MAX_DELEN = 12;
  private static final long MAX_TIK = 1000;

  private Trillen() {
  }

  /** Trilt het patroon. Geeft terug of het toestel een trilblokje heeft. */
  public static boolean doe(Context context, String patroon) {
    Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    if (v == null || !v.hasVibrator()) return false;
    long[] tijden = lees(patroon);
    if (tijden.length == 0) return false;
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        v.vibrate(VibrationEffect.createWaveform(tijden, -1));
      } else {
        v.vibrate(tijden, -1);
      }
    } catch (SecurityException e) {
      // Geen VIBRATE-recht (of door de gebruiker uitgezet): stil doorgaan.
      Log.w(TAG, "trillen mag niet: " + e.getMessage());
      return true;
    }
    return true;
  }

  /**
   * Leest "12" of "16,30,16" als trilpatroon. Onzin negeren we liever dan er een
   * uitzondering van te maken: de pagina blijft gewoon spelen als het patroon niet
   * klopt.
   */
  static long[] lees(String patroon) {
    if (patroon == null) return new long[0];
    String[] delen = patroon.split(",");
    long[] uit = new long[Math.min(delen.length, MAX_DELEN)];
    int n = 0;
    for (String deel : delen) {
      if (n >= uit.length) break;
      try {
        long ms = Long.parseLong(deel.trim());
        if (ms < 0) return new long[0];
        uit[n++] = Math.min(ms, MAX_TIK);
      } catch (NumberFormatException e) {
        return new long[0];
      }
    }
    if (n == 0) return new long[0];
    long[] precies = new long[n];
    System.arraycopy(uit, 0, precies, 0, n);
    return precies;
  }

  /** Heeft dit toestel een trilblokje? De pagina verbergt de knop als dat niet zo is. */
  public static boolean kan(Context context) {
    Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    return v != null && v.hasVibrator();
  }
}
