#!/usr/bin/env python3
"""Controleert een draaiende kopie van Smakenland in een echte browser.

Laadt de opgegeven URL in Chromium, speelt één zet (oogsten uit de eerste kist),
leest de bordtoestand uit en kijkt of er JS-fouten waren. Zo weet je dat een
uitgerolde kopie werkt en niet alleen dat de bestanden bestaan.

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

    try:
        verzoek = urllib.request.Request(f"http://127.0.0.1:{poort}/json/new?{URL}", method="PUT")
        with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
            doel = json.load(antwoord)
        b = CDP(doel["webSocketDebuggerUrl"])
        b.call("Runtime.enable")

        klaar = False
        for _ in range(60):
            if b.js("document.querySelectorAll('.cel').length") == 56:
                klaar = True
                break
            time.sleep(0.5)
        # De foutenhark pas ophangen als de pagina staat: een evaluate tijdens de
        # navigatie belandt in het oude document en verdwijnt daarna.
        b.js("window.__fouten = [];"
             " window.addEventListener('error', e => window.__fouten.push(String(e.message)));"
             " window.addEventListener('unhandledrejection', e => window.__fouten.push('belofte: ' + e.reason));")
        titel = b.js("document.title")
        cellen = b.js("document.querySelectorAll('.cel').length")
        kisten = b.js("document.querySelectorAll('.cel.kist').length")
        # Eén echte zet: de knoppen/het bord aanroepen zoals een speler dat doet.
        b.js("document.getElementById('uitleg-sluiten').click()")
        voor = b.js("Number(document.getElementById('stat-energie').textContent.split('/')[0])")
        b.js("(() => { const el = document.querySelectorAll('.cel.kist')[0];"
             " el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: 100, clientY: 200}));"
             " window.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: 100, clientY: 200}));"
             " return 1; })()")
        time.sleep(0.5)
        na = b.js("Number(document.getElementById('stat-energie').textContent.split('/')[0])")
        bezet = b.js("document.querySelectorAll('.cel.bezet').length")
        fouten = b.js("JSON.stringify(window.__fouten)")

        goed = (cellen == 56 and kisten == 2 and na == voor - 1 and bezet >= 3 and fouten == "[]")
        print(f"url        : {URL}")
        print(f"titel      : {titel}")
        print(f"cellen     : {cellen} (verwacht 56)")
        print(f"kisten     : {kisten} (verwacht 2)")
        print(f"energie    : {voor} -> {na} (verwacht één minder na een tik op de kist)")
        print(f"bezette cel: {bezet}")
        print(f"JS-fouten  : {fouten}")
        print("OORDEEL    : " + ("werkt" if goed else "NIET GOED"))
        proc.terminate()
        sys.exit(0 if goed else 1)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
