#!/usr/bin/env python3
"""Maakt één schermafbeelding van de updateregel die alleen in de Android-app staat.

De browser heeft geen brug naar de app, dus die regel bestaat daar niet. Hier
zetten we de brug precies zoals de app hem aan het venster hangt (versie() plus
controleerOpUpdates()), en fotograferen we de uitleg zoals een speler hem in de
app ziet. Zo is de updateregel te laten zien zonder emulator.

Gebruik:  python3 scripts/shoot-update.py [poort] [uitvoerbestand]
"""
import base64
import glob
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.expanduser(os.environ.get("CDP_HULP", "~/tools")))
from cdp import CDP  # noqa: E402

PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-update-profiel")
DOCS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")


def chromium():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    kandidaten = sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
    kandidaten += [p for p in (shutil.which(n) for n in ("google-chrome", "chromium")) if p]
    if not kandidaten:
        sys.exit("Geen Chromium gevonden; zet CHROME=/pad/naar/chrome")
    return kandidaten[-1]


def start_browser():
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
         f"--user-data-dir={PROFIEL}", "--window-size=1200,1100", "about:blank"],
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
    return proc, poort


def png_maten(pad):
    with open(pad, "rb") as f:
        kop = f.read(24)
    return struct.unpack(">II", kop[16:24])


def main():
    poort = int(sys.argv[1]) if len(sys.argv) > 1 else 8231
    doel = sys.argv[2] if len(sys.argv) > 2 else os.path.join(DOCS, "smakenland-update.png")
    versie = open(os.path.join(os.path.dirname(DOCS), "version.txt")).read().strip()
    os.makedirs(DOCS, exist_ok=True)

    proc, devtools = start_browser()
    try:
        verzoek = urllib.request.Request(f"http://127.0.0.1:{devtools}/json/new?about:blank", method="PUT")
        with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
            b = CDP(json.load(antwoord)["webSocketDebuggerUrl"])
        b.call("Page.enable")
        b.call("Runtime.enable")
        # Precies zoals MainActivity de brug aan het venster hangt.
        b.call("Page.addScriptToEvaluateOnNewDocument", source=(
            "window.SmakenlandDebug = true;"
            "window.SmakenlandApp = {"
            "  versie: function () { return %s; },"
            "  isApp: function () { return true; },"
            "  controleerOpUpdates: function () { window.__gecontroleerd = (window.__gecontroleerd || 0) + 1; }"
            "};" % json.dumps(versie)))
        b.call("Page.navigate", url=f"http://127.0.0.1:{poort}/index.html?debug=1")
        for _ in range(60):
            if b.js("!!document.getElementById('controleer-updates')"):
                break
            time.sleep(0.25)
        else:
            sys.exit("de updateregel kwam niet in de pagina")

        # De uitleg staat bij een eerste bezoek open; anders openen we hem.
        b.js("(() => { const m = document.getElementById('modal-uitleg');"
             " if (m && m.hidden) { const k = document.querySelector('[data-uitleg], #uitleg-open');"
             " if (k) k.click(); } return m && !m.hidden; })()")
        time.sleep(0.6)
        # De knop echt aanklikken, zodat op de foto te zien is dat hij werkt.
        b.js("document.getElementById('controleer-updates').click()")
        time.sleep(0.4)
        geklikt = b.js("window.__gecontroleerd || 0")
        print(f"de knop gaf {geklikt} keer een verzoek aan de app door")
        if geklikt != 1:
            sys.exit("de knop deed niets")

        doos = json.loads(b.js("JSON.stringify((() => { const e = document.querySelector('#modal-uitleg .kaart');"
                               " const r = e.getBoundingClientRect();"
                               " return {x: r.x, y: r.y, width: r.width, height: r.height}; })())"))
        b.call("Emulation.setDeviceMetricsOverride", width=1000, height=1000,
               deviceScaleFactor=2, mobile=False)
        time.sleep(0.5)
        doos = json.loads(b.js("JSON.stringify((() => { const e = document.querySelector('#modal-uitleg .kaart');"
                               " const r = e.getBoundingClientRect();"
                               " return {x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8),"
                               " width: r.width + 16, height: r.height + 16, scale: 1}; })())"))
        b.schermafbeelding(doel, clip=doos)
        print(f"{os.path.basename(doel)}: {png_maten(doel)}")
        print("JS-fouten:", b.js("(window.__fout || []).length || 0"))
    finally:
        proc.kill()


if __name__ == "__main__":
    main()
