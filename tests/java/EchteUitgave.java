import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import nl.werdens.smakenland.Updates;

/**
 * Draait het versierekenwerk van de app op een ECHT antwoord van de GitHub-API.
 *
 * Gebruik:
 *   curl -sS -H "Accept: application/vnd.github+json" -H "User-Agent: Smakenland-app" \
 *     https://api.github.com/repos/Theberas04/smakenland/releases/latest -o /tmp/uitgave.json
 *   javac -d /tmp/ut android/app/src/main/java/nl/werdens/smakenland/Updates.java tests/java/EchteUitgave.java
 *   java -cp /tmp/ut EchteUitgave /tmp/uitgave.json
 */
public class EchteUitgave {
  public static void main(String[] args) throws Exception {
    String json = new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8);
    String tag = Updates.tagUit(json);
    int code = Updates.versieCode(tag);
    String url = Updates.apkUrlUit(json);
    System.out.println("tag         : " + tag);
    System.out.println("versiecode  : " + code);
    System.out.println("apk-link    : " + url);
    System.out.println("bestandsnaam: " + Updates.bestandsnaam(url));
    if (tag == null || code <= 0 || url == null) {
      System.out.println("FOUT: de app kan dit antwoord niet lezen");
      System.exit(1);
    }
    if (!url.startsWith("https://github.com/Theberas04/smakenland/releases/download/")) {
      System.out.println("FOUT: de link wijst niet naar de uitgaven van dit project");
      System.exit(1);
    }
    System.out.println("goed: de app leest een echt GitHub-antwoord");
  }
}
