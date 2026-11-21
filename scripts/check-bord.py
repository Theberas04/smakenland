#!/usr/bin/env python3
"""Meet na of het bord op telefoonformaat volledig in beeld staat.

Gebruik: python3 scripts/check-bord.py [poort] [breedte] [hoogte]
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

PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-bord-profiel")


def chromium():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    k = sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
    k += [p for p in (shutil.which(n) for n in ("google-chrome", "chromium")) if p]
    if not k:
        sys.exit("Geen Chromium gevonden")
    return k[-1]


def main():
    poort = int(sys.argv[1]) if len(sys.argv) > 1 else 8231
    breedte = int(sys.argv[2]) if len(sys.argv) > 2 else 411
    hoogte = int(sys.argv[3]) if len(sys.argv) > 3 else 686
    shutil.rmtree(PROFIEL, ignore_errors=True)
    os.makedirs(PROFIEL, exist_ok=True)
    omg = dict(os.environ)
    omg["LD_LIBRARY_PATH"] = ":".join([
        os.path.expanduser("~/.local/lib"),
        os.path.expanduser("~/.local/chromedeps/root/usr/lib/x86_64-linux-gnu"),
        omg.get("LD_LIBRARY_PATH", "")])
    proc = subprocess.Popen(
        [chromium(), "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
         "--hide-scrollbars", "--mute-audio", "--remote-debugging-port=0",
         f"--user-data-dir={PROFIEL}", f"--window-size={breedte},{hoogte}", "about:blank"],
        env=omg, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    actief = os.path.join(PROFIEL, "DevToolsActivePort")
    for _ in range(80):
        if os.path.exists(actief):
            break
        time.sleep(0.25)
    else:
        proc.kill()
        sys.exit("Chromium startte niet")
    with open(actief) as f:
        devtools = int(f.readline().strip())
    try:
        verzoek = urllib.request.Request(
            f"http://127.0.0.1:{devtools}/json/new?about:blank",
            method="PUT")
        with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
            b = CDP(json.load(antwoord)["webSocketDebuggerUrl"])
        b.call("Page.enable")
        b.call("Runtime.enable")
        b.call("Emulation.setDeviceMetricsOverride", width=breedte, height=hoogte,
               deviceScaleFactor=2, mobile=True)
        b.call("Page.navigate", url=f"http://127.0.0.1:{poort}/index.html?debug=1#level1")
        for _ in range(60):
            if b.js("document.querySelectorAll('#bord .cel').length") == 56:
                break
            time.sleep(0.25)
        time.sleep(1.5)
        uit = b.js("""(() => {
          const bord = document.getElementById('bord');
          const r = bord.getBoundingClientRect();
          const cellen = [...bord.querySelectorAll('.cel')];
          const maten = cellen.map(c => c.getBoundingClientRect());
          const zichtbaar = maten.filter(m => m.bottom > r.top + 1 && m.top < r.bottom - 1
                                            && m.right > r.left + 1 && m.left < r.right - 1).length;
          const rijen = new Set(maten.map(m => Math.round(m.top))).size;
          return {cellen: cellen.length, bordHoogte: Math.round(r.height),
                  bordBreedte: Math.round(r.width),
                  eersteTegel: Math.round(maten[0].width) + 'x' + Math.round(maten[0].height),
                  rijen: rijen, zichtbaar: zichtbaar,
                  laagsteOnderkant: Math.round(Math.max(...maten.map(m => m.bottom))),
                  bordOnderkant: Math.round(r.bottom), venster: window.innerHeight,
                  tegelVar: getComputedStyle(document.documentElement).getPropertyValue('--tegel'),
                  celCssHoogte: getComputedStyle(cellen[0]).height,
                  celCssBreedte: getComputedStyle(cellen[0]).width};
        })()""")
        print(json.dumps(uit, ensure_ascii=False, indent=2))
        if uit["cellen"] != 56:
            print("FOUT: niet alle 56 cellen bestaan")
        elif uit["zichtbaar"] != 56:
            print(f"FOUT: {56 - uit['zichtbaar']} cellen vallen buiten het bord")
        elif uit["rijen"] != 8:
            print(f"FOUT: {uit['rijen']} rijen in plaats van 8")
        else:
            print(f"goed: 8 rijen, alle 56 cellen binnen het bord ({uit['bordBreedte']}x{uit['bordHoogte']})")
        if uit["eersteTegel"].split("x")[0] != uit["eersteTegel"].split("x")[1]:
            print(f"FOUT: de tegels zijn niet vierkant: {uit['eersteTegel']}")

        # En het sudokubord: dat moet vierkant zijn, ook zonder `aspect-ratio`
        # (die kent de WebView van Android 11 niet).
        b.js("document.querySelector('.tab[data-tab=sudoku]').click()")
        time.sleep(1.2)
        sud = b.js("""(() => {
          const b = document.getElementById('sudoku-bord');
          const r = b.getBoundingClientRect();
          return {breedte: Math.round(r.width), hoogte: Math.round(r.height),
                  vakken: b.querySelectorAll('.sudoku-cel').length,
                  cel: Math.round(b.querySelector('.sudoku-cel').getBoundingClientRect().width)};
        })()""")
        print("sudoku:", json.dumps(sud))
        if sud["vakken"] != 81:
            print("FOUT: geen 81 sudokuvakken")
        elif abs(sud["breedte"] - sud["hoogte"]) > 4:
            print(f"FOUT: het sudokubord is niet vierkant: {sud['breedte']}x{sud['hoogte']}")
        elif sud["hoogte"] < 200:
            print(f"FOUT: het sudokubord is maar {sud['hoogte']} px hoog")
        else:
            print(f"goed: sudokubord vierkant ({sud['breedte']}x{sud['hoogte']}, vakjes {sud['cel']} px)")
    finally:
        proc.kill()


if __name__ == "__main__":
    main()
