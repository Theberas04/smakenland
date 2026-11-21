#!/usr/bin/env python3
"""Schermafbeeldingen van Smakenland met de eigen Chromium (via CDP).

Speelt eerst met echte acties (oogsten via de UI-laag van de pagina), maakt dan
een bureaubladbeeld, een telefoonbeeld en een beeld van de uitlegkaart.

Gebruik:  python3 scripts/shoot.py [poort-van-de-webserver]
Zet CDP_HULP naar de map met cdp.py als die ergens anders staat, en CHROME naar
het Chromium-pad als dat afwijkt.
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
from cdp import CDP, tabs  # noqa: E402

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(WORTEL, "docs")
POORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8231
BASIS = f"http://127.0.0.1:{POORT}"
PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-profiel")


def chromium():
    eigen = os.environ.get("CHROME")
    kandidaten = [eigen] if eigen else []
    kandidaten += sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
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
        [
            chromium(), "--headless=new", "--no-sandbox", "--disable-gpu",
            "--disable-dev-shm-usage", "--hide-scrollbars", "--mute-audio",
            "--remote-debugging-port=0", f"--user-data-dir={PROFIEL}",
            "--window-size=1460,1120", "about:blank",
        ],
        env=omgeving, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    actief = os.path.join(PROFIEL, "DevToolsActivePort")
    for _ in range(80):
        if os.path.exists(actief):
            break
        time.sleep(0.25)
    else:
        proc.kill()
        sys.exit("Chromium startte niet (geen DevToolsActivePort)")
    with open(actief) as f:
        poort = int(f.readline().strip())
    return proc, poort


def open_tab(poort, url):
    verzoek = urllib.request.Request(f"http://127.0.0.1:{poort}/json/new?{url}", method="PUT")
    with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
        doel = json.load(antwoord)
    return CDP(doel["webSocketDebuggerUrl"])


def wacht_op(b, uitdrukking, seconden=15):
    for _ in range(int(seconden * 5)):
        if b.js(uitdrukking):
            return True
        time.sleep(0.2)
    return False


def meet(b):
    b.call("Runtime.enable")
    return b.js("({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,"
                "vw:window.innerWidth,vh:window.innerHeight})")


def schiet(b, pad, breedte, hoogte, dsf=1, mobiel=False):
    b.call("Emulation.setDeviceMetricsOverride", width=breedte, height=hoogte,
           deviceScaleFactor=dsf, mobile=mobiel)
    time.sleep(0.6)
    b.schermafbeelding(pad)
    return pad


def png_maten(pad):
    with open(pad, "rb") as f:
        kop = f.read(24)
    import struct
    b, h = struct.unpack(">II", kop[16:24])
    return b, h


def main():
    os.makedirs(DOCS, exist_ok=True)
    proc, poort = start_browser()
    try:
        b = open_tab(poort, BASIS + "/index.html?debug=1")
        if not wacht_op(b, "!!(window.SmakenlandUI && window.SmakenlandUI.state)"):
            sys.exit("De pagina kwam niet op gang")
        b.js("document.fonts && document.fonts.ready")

        # 1. Spelen tot in Bakkerslaan, met dezelfde acties als een speler:
        #    oogsten uit de kisten, items versmelten, munten innen en klanten helpen.
        #    De energie wordt per ronde op het maximum gezet: dat is wachten in
        #    één klap, geen verzonnen inhoud.
        stand = b.js("""
        (() => {
          const UI = window.SmakenlandUI, E = window.SmakenlandEngine;
          const s = UI.state;
          const kisten = () => s.cells.map((c, i) => [c, i])
            .filter(([c]) => c && c.kind === 'gen').map(([, i]) => i);
          const ruim = () => {          // gelijke items op elkaar: ruimte en versmeltingen
            for (const k of ['tuin-1', 'tuin-2', 'bakkerij-1', 'bakkerij-2']) {
              const plek = s.cells.map((c, i) => [c, i])
                .filter(([c]) => c && c.kind === 'item' && c.keten + '-' + c.tier === k).map(([, i]) => i);
              for (let n = 0; n + 1 < plek.length; n += 2) {
                const a = plek[n], b2 = plek[n + 1];
                if (s.cells[a] && s.cells[b2] && UI.verplaats(b2, a).ok === false) { /* laat staan */ }
              }
            }
          };
          for (let ronde = 0; ronde < 24 && s.gebied < 1; ronde++) {
            s.energie = s.energieMax;
            for (const i of kisten()) for (let k = 0; k < 4; k++) UI.oogst(i);
            for (const o of s.orders.slice()) if (E.kanLeveren(s, o.id) >= o.aantal) UI.lever(o.id);
            s.cells.forEach((c, i) => { if (c && c.kind === 'item' && c.keten === 'munt') UI.incasseer(i); });
            ruim();
          }
          // In Bakkerslaan zelf nog flink oogsten uit alle kisten: een bord vol
          // items is de eerlijke middenfase van dit spel.
          for (let ronde = 0; ronde < 6; ronde++) {
            s.energie = s.energieMax;
            for (const i of kisten()) for (let k = 0; k < 4; k++) UI.oogst(i);
            if (s.cells.filter(Boolean).length > 40) ruim();
          }
          // Een paar stapels van twee laten staan, zodat de badge te zien is.
          const plek = {};
          s.cells.forEach((c, i) => { if (!c || c.kind !== 'item') return;
            const k = c.keten + '-' + c.tier; (plek[k] = plek[k] || []).push(i); });
          for (const k of Object.keys(plek)) {
            const p = plek[k];
            if (p.length >= 2 && s.cells[p[0]] && s.cells[p[0]].count === 1 &&
                s.cells[p[1]] && s.cells[p[1]].count === 1) UI.verplaats(p[1], p[0]);
          }
          return { gebied: s.gebied, sterren: s.sterren, merges: s.merges,
                   munten: s.munten, bezet: s.cells.filter(Boolean).length };
        })()
        """)
        print("na spelen:", stand)
        b.js("document.getElementById('verhaal-verder').click()")
        b.js("document.getElementById('uitleg-sluiten').click()")
        b.js("window.SmakenlandUI.bewaar()")
        time.sleep(0.6)

        # De hoogte van de echte inhoud meten, niet de schermhoogte: anders staat
        # er een halve pagina leegte onder de panelen.
        inhoud = b.js(
            "(() => { let h = 0; const els = [document.querySelector('.topbalk'),"
            " ...document.querySelectorAll('main > *')];"
            " for (const e of els) h = Math.max(h, e.getBoundingClientRect().bottom + window.scrollY);"
            " return Math.ceil(h); })()")
        m = meet(b)
        hoogte = min(max(int(inhoud) + 16, 900), 1500)
        pad = schiet(b, os.path.join(DOCS, "smakenland-bureaublad.png"), 1440, hoogte)
        print("bureaublad:", png_maten(pad), "inhoud", inhoud, pad)

        # Controle: is er echt gespeeld, of staat er een leeg bord?
        print("stand na spelen:", b.js(
            "(() => { const s = window.SmakenlandUI.state;"
            " return {bezette: s.cells.filter(Boolean).length, merges: s.merges,"
            " munten: s.munten, energie: s.energie, orden: s.orders.length}; })()"))

        # 2. Telefoon (390x844, dichtheid 2 -> 780x1688 beeldpunten).
        pad = schiet(b, os.path.join(DOCS, "smakenland-telefoon.png"), 390, 844, dsf=2, mobiel=True)
        print("telefoon:", png_maten(pad), pad)
        b.call("Emulation.clearDeviceMetricsOverride")

        # 3. De uitlegkaart op een vers potje (opnieuw beginnen zet de stand écht terug;
        #    localStorage wissen gevolgd door een reload bewaart de oude stand weer).
        b.js("document.getElementById('knop-uitleg').click()")
        b.js("document.getElementById('opnieuw').click()")
        b.js("document.getElementById('knop-uitleg').click()")
        time.sleep(0.4)
        breedte, hoogte = 1440, 1000
        pad = schiet(b, os.path.join(DOCS, "smakenland-uitleg.png"), breedte, hoogte)
        print("uitleg:", png_maten(pad), pad)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
