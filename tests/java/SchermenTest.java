import nl.werdens.smakenland.Schermen;

/**
 * Controle op de schermnamen die de app van buitenaf accepteert.
 *
 * Draaien:  javac -d /tmp/schermentest Schermen.java SchermenTest.java && java -cp /tmp/schermentest SchermenTest
 *
 * De aanleiding: de app kreeg "sudoku16" binnen (de 16x16-sudoku) en wees dat af,
 * want het patroon kende alleen "sudoku". De app startte dan gewoon op de levelkaart
 * en de emulator-smoketest wachtte tevergeefs. Deze test houdt de lijst bij.
 */
public final class SchermenTest {

    private static int goed = 0;
    private static int fout = 0;

    private static void moet(String scherm, boolean toegestaan) {
        boolean uitkomst = Schermen.mag(scherm);
        if (uitkomst == toegestaan) {
            goed++;
        } else {
            fout++;
            System.out.println("FOUT: \"" + scherm + "\" is " + (uitkomst ? "toegestaan" : "geweigerd")
                    + " maar hoort " + (toegestaan ? "toegestaan" : "geweigerd") + " te zijn");
        }
    }

    public static void main(String[] args) {
        // De gewone schermen.
        moet("levels", true);
        moet("sudoku", true);
        moet("vrij", true);
        moet("prestaties", true);
        moet("level1", true);
        moet("level12", true);
        moet("level800", true);

        // De sudoku in elke maat.
        moet("sudoku4", true);
        moet("sudoku6", true);
        moet("sudoku9", true);
        moet("sudoku12", true);
        moet("sudoku16", true);

        // Wat er niet door mag: geen willekeurige tekst de WebView in.
        moet("sudoku5", false);
        moet("sudoku17", false);
        moet("sudoku0", false);
        moet("sudoku16x", false);
        moet("sudoku 16", false);
        moet("prestaties2", false);
        moet("Prestaties", false);
        moet("level1234", false);
        moet("levels/../etc", false);
        moet("javascript:alert(1)", false);
        moet("", false);
        moet(null, false);

        // En het teruggeven van de naam werkt hetzelfde.
        if ("sudoku16".equals(Schermen.uit("sudoku16")) && Schermen.uit("sudoku5") == null
                && Schermen.uit(null) == null) {
            goed++;
        } else {
            fout++;
            System.out.println("FOUT: uit() geeft niet de naam terug of keurt verkeerd");
        }

        System.out.println(goed + " controles goed, " + fout + " fout");
        if (fout > 0) System.exit(1);
    }
}
