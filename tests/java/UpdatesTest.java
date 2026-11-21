import nl.werdens.smakenland.Updates;

/**
 * Controle op het versierekenwerk van de app (Updates.java), zonder Android erbij.
 *
 * Draaien:
 *   javac -d /tmp/updates-test android/app/src/main/java/nl/werdens/smakenland/Updates.java tests/java/UpdatesTest.java
 *   java -cp /tmp/updates-test UpdatesTest
 */
public class UpdatesTest {
  static int fouten = 0;

  static void check(String wat, Object gekregen, Object verwacht) {
    boolean goed = gekregen == null ? verwacht == null : gekregen.equals(verwacht);
    System.out.println((goed ? "ok   " : "FOUT ") + wat
        + (goed ? "" : " — verwacht " + verwacht + ", kreeg " + gekregen));
    if (!goed) fouten++;
  }

  public static void main(String[] args) {
    check("1.0.0 geeft 10000", Updates.versieCode("1.0.0"), 10000);
    check("1.1.1 geeft 10101", Updates.versieCode("1.1.1"), 10101);
    check("met een v ervoor werkt ook", Updates.versieCode("v1.2.3"), 10203);
    check("spaties eromheen mogen", Updates.versieCode("  1.2.3 "), 10203);
    check("een achtervoegsel telt niet mee", Updates.versieCode("1.2.3-rc1"), 10203);
    check("2.10.7 geeft 21007", Updates.versieCode("2.10.7"), 21007);
    check("onzin geeft -1", Updates.versieCode("nieuwste"), -1);
    check("leeg geeft -1", Updates.versieCode(""), -1);
    check("null geeft -1", Updates.versieCode(null), -1);
    check("te veel delen geeft -1", Updates.versieCode("1.2.3.4"), -1);

    check("nieuwer is nieuwer", Updates.isNieuwer(10200, 10101), true);
    check("gelijk is niet nieuwer", Updates.isNieuwer(10101, 10101), false);
    check("ouder is niet nieuwer", Updates.isNieuwer(10100, 10101), false);
    check("onzin is niet nieuwer", Updates.isNieuwer(-1, 10101), false);
    check("zonder eigen versie niets doen", Updates.isNieuwer(10200, -1), false);

    String uitgave = "{\"tag_name\":\"v1.2.0\",\"assets\":["
        + "{\"name\":\"Smakenland-Android-1.2.0.apk\","
        + "\"browser_download_url\":\"https://github.com/Theberas04/smakenland/releases/download/v1.2.0/Smakenland-Android-1.2.0.apk\"}]}";
    check("de tag komt eruit", Updates.tagUit(uitgave), "v1.2.0");
    check("de tag geeft een versiecode", Updates.versieCode(Updates.tagUit(uitgave)), 10200);
    check("de apk-link komt eruit", Updates.apkUrlUit(uitgave),
        "https://github.com/Theberas04/smakenland/releases/download/v1.2.0/Smakenland-Android-1.2.0.apk");
    check("de bestandsnaam komt eruit", Updates.bestandsnaam(Updates.apkUrlUit(uitgave)),
        "Smakenland-Android-1.2.0.apk");
    check("zonder apk in de uitgave niets", Updates.apkUrlUit("{\"tag_name\":\"v1.2.0\",\"assets\":[]}"), null);
    check("een pdf telt niet als apk", Updates.apkUrlUit(
        "{\"assets\":[{\"browser_download_url\":\"https://x/y/brief.pdf\"}]}"), null);
    check("rommel geeft niets", Updates.apkUrlUit("geen json"), null);
    check("null geeft niets", Updates.apkUrlUit(null), null);
    check("bestandsnaam van onzin is null", Updates.bestandsnaam(null), null);
    check("een rare naam wordt veilig gemaakt", Updates.bestandsnaam("https://x/y/../a b.apk"),
        "a_b.apk");
    check("een map-omhoog is geen bestandsnaam", Updates.bestandsnaam("https://x/y/.."), null);
    check("iets anders dan een apk is geen bestandsnaam", Updates.bestandsnaam("https://x/y/brief.pdf"), null);

    System.out.println(fouten == 0 ? "\nalle controles goed" : "\n" + fouten + " FOUTEN");
    if (fouten > 0) System.exit(1);
  }
}
