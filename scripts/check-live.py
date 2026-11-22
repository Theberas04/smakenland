#!/usr/bin/env python3
"""Controleert een draaiende kopie van Smakenland in een echte browser.

Kijkt of de levelkaart er is, opent level 1, speelt één tik op een kist,
controleert de sudoku-tab en meldt JS-fouten. Zo weet je dat een uitgerolde
kopie werkt en niet alleen dat de bestanden bestaan.

Gebruik:  python3 scripts/check-live.py [url]
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.expanduser(os.environ.get("CDP_HULP", "~/tools")))
from cdp import CDP  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else "https://theberas04.github.io/smakenland/"
PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-live-profiel")


def chromium():
    kandidaten = [os.environ["CHROME"]] if os.environ.get("CHROME") else []
    kandidaten += sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
    kandidaten += [p for p in (shutil.which(n) for n in ("google-chrome", "chromium")) if p]
    if not kandidaten:
        sys.exit("Geen Chromium gevonden; zet CHROME=/pad/naar/chrome")
    return kandidaten[-1]


def meld(naam, waar, verwacht, goed):
    print(f"{'ok  ' if goed else 'FOUT'} {naam}: {waar} (verwacht {verwacht})")
    return goed


def main():
    shutil.rmtree(PROFIEL, ignore_errors=True)
    os.makedirs(PROFIEL, exist_ok=True)
    omgeving = dict(os.environ)
    omgeving["LD_LIBRARY_PATH"] = ":".join([
        os.path.expanduser("~/.local/lib"),
        os.path.expanduser("~/.local/chromedeps/root/usr/lib/x86_64-linux-gnu"),
        omgeving.get("LD_LIBRARY_PATH", ""),
    ])
    proc = subprocess.Popen(
        [chromium(), "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
         "--hide-scrollbars", "--mute-audio", "--remote-debugging-port=0",
         f"--user-data-dir={PROFIEL}", "--window-size=1440,1000", "about:blank"],
        env=omgeving, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    actief = os.path.join(PROFIEL, "DevToolsActivePort")
    for _ in range(80):
        if os.path.exists(actief):
            break
        time.sleep(0.25)
    else:
        proc.kill()
        sys.exit("Chromium startte niet")
    with open(actief) as f:
        poort = int(f.readline().strip())

    alles_goed = True
    try:
        # Met ?debug=1 hangt de pagina zijn controle-API aan het venster; dat is
        # dezelfde pagina die een speler krijgt, alleen met de sleutel erbij.
        met_debug = URL + ("&" if "?" in URL else "?") + "debug=1"
        verzoek = urllib.request.Request(f"http://127.0.0.1:{poort}/json/new?{met_debug}", method="PUT")
        with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
            doel = json.load(antwoord)
        b = CDP(doel["webSocketDebuggerUrl"])
        b.call("Runtime.enable")

        klaar = False
        for _ in range(60):
            if b.js("document.querySelectorAll('.level-knop').length") == 1050:
                klaar = True
                break
            time.sleep(0.5)
        b.js("window.__fouten = [];"
             " window.addEventListener('error', e => window.__fouten.push(String(e.message)));"
             " window.addEventListener('unhandledrejection', e => window.__fouten.push('belofte: ' + e.reason));")
        print(f"url        : {URL}")
        print(f"titel      : {b.js('document.title')}")
        aantal_hfst = b.js("document.querySelectorAll('.hoofdstuk').length")   # 40 gewone hoofdstukken + 2 van dit seizoen
        aantal_open = b.js("document.querySelectorAll('.level-knop:not(.op-slot)').length")
        alles_goed &= meld("levelkaart", b.js("document.querySelectorAll('.level-knop').length"), 1050, klaar)
        alles_goed &= meld("hoofdstukken", aantal_hfst, 42, aantal_hfst == 42)
        # Open staan: level 1 plus het eerste level van elk seizoenshoofdstuk van dit
        # seizoen (dat zijpad begint open).
        seizoen_hfst = b.js("window.SmakenlandEngine.zichtbareHoofdstukken()"
                            ".filter(x => x.hoofdstuk.seizoen).length")
        alles_goed &= meld("open levels", aantal_open, f"1 + {seizoen_hfst} (seizoen)",
                           aantal_open == 1 + seizoen_hfst)
        alles_goed &= meld("seizoenshoofdstukken te zien", seizoen_hfst, 2, seizoen_hfst == 2)

        # Level 1 openen en één keer oogsten met een echte tik op het bord.
        b.js("document.getElementById('uitleg-sluiten').click()")
        b.js("document.querySelector('.level-knop:not(.op-slot)').click()")
        time.sleep(0.8)
        cellen = b.js("document.querySelectorAll('#bord .cel').length")
        kisten = b.js("document.querySelectorAll('#bord .cel.kist').length")
        kunst = b.js("document.querySelectorAll('#bord .cel svg').length")
        doelen = b.js("document.querySelectorAll('#orders .order').length")
        alles_goed &= meld("bordcellen", cellen, 56, cellen == 56)
        alles_goed &= meld("kisten", kisten, "minstens 1", kisten >= 1)
        alles_goed &= meld("kunst in de tegels", kunst, "minstens 1", kunst >= 1)
        alles_goed &= meld("doelen van het level", doelen, "minstens 1", doelen >= 1)
        voor = b.js("Number(document.getElementById('stat-energie').textContent.split('/')[0])")
        b.js("(() => { const el = document.querySelectorAll('#bord .cel.kist')[0];"
             " el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: 100, clientY: 200}));"
             " window.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: 100, clientY: 200}));"
             " return 1; })()")
        time.sleep(0.5)
        na = b.js("Number(document.getElementById('stat-energie').textContent.split('/')[0])")
        alles_goed &= meld("oogsten", f"{voor} -> {na}", "één minder", na == voor - 1)

        # Een tweede oogst met een echte tik: het item hoort op een eigen vrij vak
        # te komen en niet vanzelf op de eerste stapel (dat is het spel).
        b.js("(() => { const el = document.querySelectorAll('#bord .cel.kist')[0];"
             " el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: 100, clientY: 200}));"
             " window.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: 100, clientY: 200}));"
             " return 1; })()")
        time.sleep(0.5)
        losse = b.js("(() => { const l = window.SmakenlandUI.level;"
                     " return l.cells.filter(c => c && c.kind === 'item').length; })()")
        stapels = b.js("(() => { const l = window.SmakenlandUI.level;"
                       " return l.cells.filter(c => c && c.kind === 'item' && c.count > 1).length; })()")
        alles_goed &= meld("losse items na twee oogsten", losse, 2, losse == 2)
        alles_goed &= meld("gestapeld zonder te slepen", stapels, 0, stapels == 0)

        # Sudoku-tab
        b.js("document.querySelector('.tab[data-tab=sudoku]').click()")
        time.sleep(0.6)
        vakken = b.js("document.querySelectorAll('.sudoku-cel').length")
        gegeven = b.js("document.querySelectorAll('.sudoku-cel.geven').length") or 0
        alles_goed &= meld("sudokuvakken", vakken, 81, vakken == 81)
        alles_goed &= meld("gegeven cijfers", gegeven, "tussen 20 en 50", 20 <= gegeven <= 50)
        b.js("(() => { const leeg = [...document.querySelectorAll('.sudoku-cel')]"
             ".find(c => !c.classList.contains('geven')); leeg.click(); return 1; })()")
        b.js("document.querySelector('.cijfers button').click()")
        alles_goed &= meld("een vak gekozen en een cijfer getikt",
                           b.js("!!document.querySelector('.sudoku-cel.gekozen')"), True,
                           b.js("!!document.querySelector('.sudoku-cel.gekozen')"))

        fouten = b.js("JSON.stringify(window.__fouten)")
        # Prestaties: het scherm opent en is gevuld.
        b.js("document.querySelector('.tab[data-tab=prestaties]').click()")
        time.sleep(0.5)
        kaartjes = b.js("document.querySelectorAll('.prestatie').length")
        teller = b.js("document.getElementById('prestaties-teller').textContent")
        balken = b.js("document.querySelectorAll('.prestatie-balk i').length")
        alles_goed &= meld("prestatiekaartjes", kaartjes, "minstens 15", kaartjes >= 15)
        alles_goed &= meld("voortgangsbalken bij de prestaties", balken, kaartjes, balken == kaartjes)
        alles_goed &= meld("de teller noemt het totaal", teller, "x van y",
                           " van " in teller and teller.split(" van ")[1].strip() == str(kaartjes))

        # Thema: de knop zet het donker en weer terug.
        thema_voor = b.js("document.documentElement.getAttribute('data-thema')")
        b.js("document.getElementById('knop-thema').click()")
        time.sleep(0.3)
        thema_na = b.js("document.documentElement.getAttribute('data-thema')")
        alles_goed &= meld("het thema wisselt", f"{thema_voor} -> {thema_na}", "anders",
                           thema_voor != thema_na and thema_na in ("donker", "licht"))

        # Voortgangscode: er staat een code klaar, en een verpeste code wordt geweigerd.
        b.js("document.getElementById('knop-uitleg').click()")
        time.sleep(0.4)
        code = b.js("document.getElementById('code-uit').value")
        alles_goed &= meld("de voortgangscode is er", f"{len(code)} tekens", "minstens 60",
                           len(code) >= 60)
        b.js("(() => { const vak = document.getElementById('code-uit');"
             " const verpest = vak.value.slice(0, 30) + (vak.value[30] === 'A' ? 'B' : 'A')"
             " + vak.value.slice(31);"
             " document.getElementById('code-in').value = verpest;"
             " window.confirm = () => true;"
             " document.getElementById('code-terug').click(); return 1; })()")
        time.sleep(0.4)
        melding = b.js("document.getElementById('code-melding').className")
        alles_goed &= meld("een verpeste code wordt geweigerd", melding, "fout", "fout" in melding)
        b.js("document.getElementById('uitleg-sluiten').click()")

        alles_goed &= meld("JS-fouten", fouten, "[]", fouten == "[]")
        print("OORDEEL    : " + ("werkt" if alles_goed else "NIET GOED"))
        proc.terminate()
        sys.exit(0 if alles_goed else 1)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
