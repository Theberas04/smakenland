package nl.werdens.smakenland;

/**
 * Welke schermen we van buitenaf accepteren.
 *
 * De app kan met een intent-extra op een scherm worden gestart (de emulator-smoketest
 * doet dat, en het is ook handig om een scherm te delen). Wat daar binnenkomt gaat
 * rechtstreeks de WebView in, dus het moet een korte, vaste lijst zijn en geen vrije
 * tekst: vandaar een streng patroon in plaats van een simpele controle op de eerste
 * letters. Gewone Java zonder Android, zodat de test met javac/java kan lopen.
 */
public final class Schermen {

    /** levels, sudoku (met de maat eraan vast), vrij, prestaties en level<nummer>. */
    public static final String PATROON =
        "levels|sudoku|sudoku(4|6|9|12|16)|vrij|prestaties|level[0-9]{1,3}";

    private Schermen() {
    }

    /** Het scherm als het mag, anders null. */
    public static String uit(String scherm) {
        if (scherm == null || scherm.isEmpty()) return null;
        return scherm.matches(PATROON) ? scherm : null;
    }

    public static boolean mag(String scherm) {
        return uit(scherm) != null;
    }
}
