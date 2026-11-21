#!/usr/bin/env python3
"""Schermafbeeldingen van Smakenland met de eigen Chromium (via CDP).

Zet eerst een gespeelde stand klaar (levels gehaald, munten), speelt dan een level
met echte acties, en maakt beelden van de levelkaart, een level, de sudoku en de
telefoonversie.

Gebruik:  python3 scripts/shoot.py [poort-van-de-webserver]
Zet CDP_HULP naar de map met cdp.py als die ergens anders staat, en CHROME naar
het Chromium-pad als dat afwijkt.
"""
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

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(WORTEL, "docs")
POORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8231
BASIS = f"http://127.0.0.1:{POORT}"
PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-profiel")
SPEEL_LEVEL = 118


def chromium():
    kandidaten = [os.environ["CHROME"]] if os.environ.get("CHROME") else []
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
        [chromium(), "--headless=new", "--no-sandbox", "--disable-gpu",
         "--disable-dev-shm-usage", "--hide-scrollbars", "--mute-audio",
         "--remote-debugging-port=0", f"--user-data-dir={PROFIEL}",
         "--window-size=1460,1120", "about:blank"],
        env=omgeving, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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


def wacht_op(b, uitdrukking, seconden=20):
    for _ in range(int(seconden * 4)):
        if b.js(uitdrukking):
            return True
        time.sleep(0.25)
    return False


def png_maten(pad):
    with open(pad, "rb") as f:
        kop = f.read(24)
    return struct.unpack(">II", kop[16:24])


def schiet(b, pad, breedte, hoogte, dsf=1, mobiel=False):
    b.call("Emulation.setDeviceMetricsOverride", width=breedte, height=hoogte,
           deviceScaleFactor=dsf, mobile=mobiel)
    time.sleep(0.7)
    b.schermafbeelding(pad)
    print(f"{os.path.basename(pad)}: {png_maten(pad)} (gevraagd {breedte}x{hoogte}@{dsf})")
    return pad


def inhoud_hoogte(b):
    uit = b.js("""(() => {
      const el = [...document.querySelectorAll('main > *')].filter(e => !e.hidden);
      let h = document.querySelector('.topbalk').getBoundingClientRect().height;
      for (const e of el) h = Math.max(h, e.getBoundingClientRect().bottom + window.scrollY);
      return Math.ceil(h);
    })()""")
    return min(max(int(uit) + 18, 560), 2200)


def main():
    os.makedirs(DOCS, exist_ok=True)
    proc, poort = start_browser()
    try:
        # Een gespeelde stand: 117 levels gehaald en wat munten in het vrije spel.
        voortgang = {"levelSterren": {}, "sudoku": {}}
        for nr in range(1, SPEEL_LEVEL):
            voortgang["levelSterren"][str(nr)] = 1 + (nr * 7) % 3
        b = open_tab(poort, "about:blank")
        b.call("Page.enable")          # zonder Page.enable weigert Chrome het script hieronder
        b.call("Runtime.enable")
        b.call("Page.addScriptToEvaluateOnNewDocument", source=(
            "try { localStorage.setItem('smakenland.voortgang.v1', %s); } catch (e) {}"
            % json.dumps(json.dumps(voortgang))))
        b.call("Page.navigate", url=BASIS + "/index.html?debug=1")
        if not wacht_op(b, "!!(window.SmakenlandUI && document.querySelectorAll('.level-knop').length === 300)"):
            sys.exit("De levelkaart kwam niet op gang")
        b.js("document.getElementById('uitleg-sluiten') && document.getElementById('uitleg-sluiten').click()")
        time.sleep(0.5)

        # 1. De levelkaart
        # De kaart is met 300 levels veel te hoog voor één beeld: het eerste stuk is genoeg.
        pad = schiet(b, os.path.join(DOCS, "smakenland-levelkaart.png"), 1440, 980)

        # 2. Een level spelen met echte acties
        b.js(f"window.SmakenlandUI.startLevel({SPEEL_LEVEL})")
        time.sleep(0.6)
        speel = """(() => {
          const UI = window.SmakenlandUI, E = window.SmakenlandEngine;
          const s = UI.level;
          const kisten = s.cells.map((c, i) => [c, i]).filter(([c]) => c && c.kind === 'gen').map(([, i]) => i);
          // Oogsten tot er genoeg op het bord ligt; de energie steeds aanvullen is
          // wachten in één klap, geen verzonnen inhoud.
          for (let ronde = 0; ronde < 40 && s.cells.filter(Boolean).length < 34; ronde++) {
            s.energie = s.energieMax;
            for (const i of kisten) for (let k = 0; k < 3; k++) UI.oogst(i);
          }
          // De items over het bord verdelen, zoals een speler ook doet: dat laat
          // het speelveld gevuld zien in plaats van alleen een bovenrand.
          const isDoel = (c) => s.orders.some(o => o.keten === c.keten && o.tier === c.tier);
          const boven = s.cells.map((c, i) => [c, i])
            .filter(([c, i]) => c && c.kind === 'item' && i < 21 && !isDoel(c)).map(([, i]) => i);
          const leeg = s.cells.map((c, i) => [c, i])
            .filter(([c, i]) => !c && i >= 14).map(([, i]) => i);
          boven.forEach((van, n) => {
            if (!leeg.length) return;
            const naar = leeg.splice((n * 5) % leeg.length, 1)[0];
            UI.verplaats(van, naar);
          });
          // Een paar stapels van twee maken zodat de badges zichtbaar zijn.
          const plek = {};
          s.cells.forEach((c, i) => { if (!c || c.kind !== 'item') return;
            const k = c.keten + '-' + c.tier; (plek[k] = plek[k] || []).push(i); });
          for (const k of Object.keys(plek)) {
            const p = plek[k];
            for (let n = 0; n + 1 < p.length; n += 2) {
              if (s.cells[p[n]] && s.cells[p[n + 1]] && s.cells[p[n]].count === 1) UI.verplaats(p[n + 1], p[n]);
            }
          }
          return {level: s.level, energie: s.energie, merges: s.merges, bezet: s.cells.filter(Boolean).length};
        })()"""
        stand = b.js(speel)
        print("level gespeeld:", stand)
        time.sleep(0.5)
        schiet(b, os.path.join(DOCS, "smakenland-level.png"), 1440, inhoud_hoogte(b))

        # 3. Sudoku
        b.js("document.querySelector('.tab[data-tab=sudoku]').click()")
        time.sleep(0.8)
        b.js("""(() => {
          const leeg = [...document.querySelectorAll('.sudoku-cel')].filter(c => !c.classList.contains('geven'));
          for (let i = 0; i < 3; i++) { leeg[i].click(); document.querySelectorAll('.cijfers button')[i + 2].click(); }
          leeg[6].click();
          document.getElementById('sudoku-notitie').click();
          [1, 4, 7].forEach(n => document.querySelectorAll('.cijfers button')[n].click());
          document.getElementById('sudoku-notitie').click();
          return 1;
        })()""")
        time.sleep(0.5)
        schiet(b, os.path.join(DOCS, "smakenland-sudoku.png"), 1440, inhoud_hoogte(b))
        b.call("Emulation.clearDeviceMetricsOverride")

        # 4. Telefoon: het level
        b.js("document.querySelector('.tab[data-tab=levels]').click()")
        time.sleep(0.4)
        b.js(f"window.SmakenlandUI.startLevel({SPEEL_LEVEL})")
        time.sleep(0.4)
        b.js(speel.replace("s.energie = s.energieMax;", "s.energie = Math.max(s.energie, s.energieMax);"))
        time.sleep(0.5)
        schiet(b, os.path.join(DOCS, "smakenland-telefoon-level.png"), 390, 844, dsf=2, mobiel=True)

        # 5. Vrij spelen (met het geschilderde gebiedspaneel)
        b.call("Emulation.clearDeviceMetricsOverride")
        b.js("document.querySelector('.tab[data-tab=vrij]').click()")
        time.sleep(0.6)
        b.js("""(() => {
          const UI = window.SmakenlandUI, s = UI.vrij;
          const kisten = s.cells.map((c, i) => [c, i]).filter(([c]) => c && c.kind === 'gen').map(([, i]) => i);
          for (let ronde = 0; ronde < 30 && s.cells.filter(Boolean).length < 26; ronde++) {
            s.energie = s.energieMax;
            for (const i of kisten) for (let k = 0; k < 3; k++) UI.oogst(i);
          }
          return s.cells.filter(Boolean).length;
        })()""")
        time.sleep(0.4)
        schiet(b, os.path.join(DOCS, "smakenland-vrij.png"), 1440, inhoud_hoogte(b))

        # 6. Telefoon: de levelkaart
        b.js("document.querySelector('.tab[data-tab=levels]').click()")
        time.sleep(0.4)
        b.js("document.getElementById('scherm-kaart').scrollIntoView()")
        schiet(b, os.path.join(DOCS, "smakenland-telefoon-kaart.png"), 390, 844, dsf=2, mobiel=True)
        b.call("Emulation.clearDeviceMetricsOverride")

        print("JS-fouten:", b.js("""(() => {
          const e = window.__fouten || [];
          return e.length ? e.slice(0, 5) : 'geen';
        })()"""))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
