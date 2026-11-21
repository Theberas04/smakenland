package nl.werdens.smakenland;

/**
 * Het rekenwerk achter "is er een nieuwe versie?".
 *
 * Alles hier is gewone Java zonder Android erin: geen netwerk, geen scherm. Zo kan
 * het nagespeeld worden met een testje op de computer in plaats van "we hopen dat
 * het klopt op een telefoon".
 *
 * Versienummers lopen in dezelfde vorm als version.txt: major.minor.patch, met
 * dezelfde code als in build.gradle (major*10000 + minor*100 + patch).
 */
public final class Updates {
  private Updates() {}

  /** "v1.2.3" of "1.2.3" (of met een achtervoegsel) naar 10203. Onleesbaar geeft -1. */
  public static int versieCode(String naam) {
    if (naam == null) return -1;
    String tekst = naam.trim();
    if (tekst.startsWith("v") || tekst.startsWith("V")) tekst = tekst.substring(1);
    int streepje = tekst.indexOf('-');            // 1.2.3-rc1 telt als 1.2.3
    if (streepje >= 0) tekst = tekst.substring(0, streepje);
    String[] delen = tekst.split("\\.");
    if (delen.length < 1 || delen.length > 3) return -1;
    int[] getallen = new int[] {0, 0, 0};
    for (int i = 0; i < delen.length; i++) {
      if (!delen[i].matches("[0-9]{1,4}")) return -1;
      getallen[i] = Integer.parseInt(delen[i]);
    }
    return getallen[0] * 10000 + getallen[1] * 100 + getallen[2];
  }

  /** Is de gevonden versie nieuwer dan wat er op het toestel staat? */
  public static boolean isNieuwer(int gevonden, int huidig) {
    return gevonden > 0 && huidig > 0 && gevonden > huidig;
  }

  /** De tag uit de GitHub-uitgave ("v1.2.3"), of null. */
  public static String tagUit(String json) {
    return waardeVan(json, "tag_name");
  }

  /**
   * De downloadlink van het eerste APK-bestand in de uitgave.
   *
   * Bewust met tekstzoeken en niet met een JSON-bibliotheek: dan is dit bestand
   * gewone Java en kan het op de computer getest worden. De uitgave bevat één APK.
   */
  public static String apkUrlUit(String json) {
    if (json == null) return null;
    int einde = -1;
    int vanaf = 0;
    while (true) {
      int i = json.indexOf("\"browser_download_url\"", vanaf);
      if (i < 0) break;
      String waarde = waardeVan(json.substring(i), "browser_download_url");
      if (waarde != null && waarde.startsWith("https://") && waarde.endsWith(".apk")) {
        einde = i;
        break;
      }
      vanaf = i + 1;
    }
    if (einde < 0) return null;
    return waardeVan(json.substring(einde), "browser_download_url");
  }

  /** De bestandsnaam uit een downloadlink, veilig gemaakt voor het cache-bestand. */
  public static String bestandsnaam(String url) {
    if (url == null) return null;
    int vraag = url.indexOf('?');
    String pad = vraag >= 0 ? url.substring(0, vraag) : url;
    int schuin = pad.lastIndexOf('/');
    String naam = schuin >= 0 ? pad.substring(schuin + 1) : pad;
    naam = naam.replaceAll("[^A-Za-z0-9._-]", "_");
    if (naam.isEmpty() || !naam.endsWith(".apk")) return null;
    if (naam.replace(".", "").isEmpty()) return null;   // ".." mag nooit een map omhoog
    return naam;
  }

  private static String waardeVan(String json, String sleutel) {
    if (json == null) return null;
    String zoek = "\"" + sleutel + "\"";
    int i = json.indexOf(zoek);
    if (i < 0) return null;
    int dubbele = json.indexOf(':', i + zoek.length());
    if (dubbele < 0) return null;
    int begin = json.indexOf('"', dubbele + 1);
    if (begin < 0) return null;
    StringBuilder uit = new StringBuilder();
    for (int p = begin + 1; p < json.length(); p++) {
      char c = json.charAt(p);
      if (c == '\\' && p + 1 < json.length()) {
        uit.append(json.charAt(++p));
        continue;
      }
      if (c == '"') return uit.toString();
      uit.append(c);
    }
    return null;
  }
}
