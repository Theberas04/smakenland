#!/usr/bin/env python3
"""Neemt een demonstratiefilmpje van Smakenland op.

Er wordt echt gespeeld: elke tik is een echte pointergebeurtenis op het element
(dus dezelfde code als wanneer een speler tikt), met een zachte cursor in beeld.
Tussen de bedrijven door worden beelden opgevraagd en met ffmpeg tot een mp4 gemaakt.

Gebruik:  python3 scripts/record-demo.py [poort] [uitvoer.mp4]
Zet CDP_HULP naar de map met cdp.py, en CHROME naar het Chromium-pad als dat afwijkt.
"""
import base64
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

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(WORTEL, "docs")
POORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8231
BASIS = f"http://127.0.0.1:{POORT}"
DOEL = sys.argv[2] if len(sys.argv) > 2 else os.path.join(DOCS, "smakenland-demo.mp4")
PROFIEL = os.path.join(tempfile.gettempdir(), "smakenland-demo-profiel")
FRAMES = os.path.join(tempfile.gettempdir(), "smakenland-demo-frames")
BREEDTE, HOOGTE = 1280, 800
SPEEL_LEVEL = 118

CURSOR = """
window.__demo = (function () {
  var vinger = document.createElement('div');
  vinger.id = 'demo-vinger';
  vinger.style.cssText = 'position:fixed;z-index:9999;width:34px;height:34px;border-radius:50%;' +
    'background:rgba(43,39,33,.35);border:2px solid rgba(255,255,255,.9);pointer-events:none;' +
    'transition:left .22s ease, top .22s ease;left:-100px;top:-100px;box-shadow:0 2px 8px rgba(0,0,0,.25)';
  document.body.appendChild(vinger);
  function naar(x, y) { vinger.style.left = (x - 17) + 'px'; vinger.style.top = (y - 17) + 'px'; }
  function midden(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function tik(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return false;
    naar(x, y);
    var opties = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
                   pointerType: 'touch', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opties));
    window.dispatchEvent(new PointerEvent('pointerup', opties));
    // Een echte browser maakt van down+up ook een click; die moeten we zelf sturen,
    // anders reageren knoppen (die naar 'click' luisteren) niet.
    if (el.click) el.click();
    return true;
  }
  function sleep(ms) {
    var tot = Date.now() + ms;
    while (Date.now() < tot) { /* wachten zonder await: de aanroeper regelt de tijd */ }
  }
  return {
    naar: naar,
    midden: midden,
    tik: tik,
    tikKies: function (kiezer) { var el = document.querySelector(kiezer); if (!el) return false;
      var m = midden(el); naar(m.x, m.y); return true; },
    tikElement: function (kiezer) { var el = document.querySelector(kiezer); if (!el) return false;
      var m = midden(el); return tik(m.x, m.y); },
    cel: function (i) { var el = document.querySelectorAll('#bord .cel')[i];
      if (!el) return false; var m = midden(el); naar(m.x, m.y); return { x: m.x, y: m.y }; },
    celTik: function (i) { var el = document.querySelectorAll('#bord .cel')[i];
      if (!el) return false; var m = midden(el); return tik(m.x, m.y); },
    celSleep: function (van, naarIdx) {
      var a = document.querySelectorAll('#bord .cel')[van];
      var b = document.querySelectorAll('#bord .cel')[naarIdx];
      if (!a || !b) return false;
      var ma = midden(a), mb = midden(b);
      naar(ma.x, ma.y);
      var o = function (x, y) { return { bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, pointerType: 'touch', isPrimary: true }; };
      a.dispatchEvent(new PointerEvent('pointerdown', o(ma.x, ma.y)));
      window.dispatchEvent(new PointerEvent('pointermove', o(mb.x, mb.y)));
      window.dispatchEvent(new PointerEvent('pointerup', o(mb.x, mb.y)));
      naar(mb.x, mb.y);
      return true;
    }
  };
})();
"""


def chromium():
    kandidaten = [os.environ["CHROME"]] if os.environ.get("CHROME") else []
    kandidaten += sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
    kandidaten += [p for p in (shutil.which(n) for n in ("google-chrome", "chromium")) if p]
    if not kandidaten:
        sys.exit("Geen Chromium gevonden; zet CHROME=/pad/naar/chrome")
    return kandidaten[-1]


def ffmpeg():
    for kandidaat in ("/home/hermes/ffmpeg-local/usr/bin/ffmpeg", "/home/hermes/ffmpeg-local/ffmpeg",
                      shutil.which("ffmpeg")):
        if kandidaat and os.path.exists(kandidaat):
            return kandidaat
    sys.exit("Geen ffmpeg gevonden")


class Opname:
    def __init__(self, b):
        self.b = b
        self.frames = []
        self.start = time.time()

    def schiet(self, aantal=1, dt=0.08):
        for _ in range(aantal):
            pad = os.path.join(FRAMES, f"f{len(self.frames):05d}.jpg")
            uit = self.b.call("Page.captureScreenshot", format="jpeg", quality=85, fromSurface=True)
            with open(pad, "wb") as f:
                f.write(base64.b64decode(uit["data"]))
            self.frames.append((pad, time.time() - self.start))
            time.sleep(dt)

    def seconde(self, duur, dt=0.08):
        einde = time.time() + duur
        while time.time() < einde:
            self.schiet(1, dt)

    def wacht(self, seconden):
        """Pauze zonder beelden: de vorige frame blijft dan langer staan."""
        time.sleep(seconden)

    def beweeg_naar(self, uitdrukking, duur=0.45):
        self.b.js(uitdrukking)
        self.seconde(duur)


def main():
    os.makedirs(DOCS, exist_ok=True)
    shutil.rmtree(FRAMES, ignore_errors=True)
    os.makedirs(FRAMES, exist_ok=True)
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
         f"--user-data-dir={PROFIEL}", f"--window-size={BREEDTE},{HOOGTE}", "about:blank"],
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
        verzoek = urllib.request.Request(f"http://127.0.0.1:{poort}/json/new?about:blank", method="PUT")
        with urllib.request.urlopen(verzoek, timeout=10) as antwoord:
            doel = json.load(antwoord)
        b = CDP(doel["webSocketDebuggerUrl"])
        b.call("Page.enable")
        b.call("Runtime.enable")
        b.call("Emulation.setDeviceMetricsOverride", width=BREEDTE, height=HOOGTE,
               deviceScaleFactor=1, mobile=False)

        voortgang = {"levelSterren": {str(n): 1 + (n * 7) % 3 for n in range(1, SPEEL_LEVEL)},
                     "sudoku": {}}
        b.call("Page.addScriptToEvaluateOnNewDocument", source=
               "try { localStorage.setItem('smakenland.voortgang.v1', %s);"
               " localStorage.setItem('smakenland.geluid', 'uit'); } catch (e) {}"
               % json.dumps(json.dumps(voortgang)))
        b.call("Page.navigate", url=BASIS + "/index.html?debug=1")
        for _ in range(60):
            if b.js("document.querySelectorAll('.level-knop').length") == 800:
                break
            time.sleep(0.4)
        b.js(CURSOR)

        op = Opname(b)
        op.seconde(1.2)

        # 0. De uitleg staat open bij een nieuw potje; die tikken we weg (en dat is
        #    meteen een aardige binnenkomer voor het filmpje).
        if b.js("!!(document.getElementById('modal-uitleg') && !document.getElementById('modal-uitleg').hidden)"):
            b.js("window.__demo.tikKies('#uitleg-sluiten')")
            op.seconde(0.5)
            b.js("window.__demo.tikElement('#uitleg-sluiten')")
            op.seconde(1.0)
        b.js("window.__demo.naar(200, 300)")

        # 1. De levelkaart: rustig langs de hoofdstukken scrollen.
        b.js("window.__demo.naar(200, 300)")
        op.seconde(0.8)
        for y in (240, 420, 600, 780, 940, 700, 420, 240):
            b.js(f"window.scrollTo(0, {y})")
            op.seconde(0.45)

        # 2. Een level openen (level 118, midden in de reis).
        b.js(f"window.scrollTo(0, 0)")
        op.seconde(0.4)
        b.js("window.SmakenlandUI.startLevel(%d)" % SPEEL_LEVEL)
        op.seconde(0.9)
        maat = b.js("JSON.stringify((() => { const el = document.querySelectorAll('#bord .cel.kist')[0];"
                    " const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2,"
                    " y: r.top + r.height / 2}; })())")
        kist = json.loads(maat)

        # 3. Oogsten: echte tikken op de kisten, met de cursor in beeld.
        kisten = json.loads(b.js("JSON.stringify((() => { const s = window.SmakenlandUI.level;"
                                 " return s.cells.map((c, i) => [c, i])"
                                 ".filter(([c]) => c && c.kind === 'gen').map(([, i]) => i); })())"))
        for i in range(5):
            cel = kisten[i % len(kisten)]
            b.js(f"window.__demo.cel({cel})")
            op.seconde(0.35)
            b.js(f"window.__demo.celTik({cel})")
            op.seconde(0.6)

        # 4. Versmelten: twee gelijke items op elkaar slepen met de echte sleepbeweging.
        b.js("""(() => {
          const UI = window.SmakenlandUI, s = UI.level;
          const plek = {};
          s.cells.forEach((c, i) => { if (!c || c.kind !== 'item' || c.count !== 1) return;
            const k = c.keten + '-' + c.tier; (plek[k] = plek[k] || []).push(i); });
          const k = Object.keys(plek).find(k => plek[k].length >= 2);
          window.__sleep = k ? plek[k].slice(0, 2) : null;
          return k;
        })()""")
        paren = b.js("JSON.stringify(window.__sleep)")
        if paren and paren != "null":
            van, naar = json.loads(paren)
            b.js(f"window.__demo.cel({van})")
            op.seconde(0.5)
            b.js(f"window.__demo.celSleep({van}, {naar})")
            op.seconde(1.1)
            # en nog een keer, zodat er echt een versmelting te zien is
            b.js(f"window.__demo.cel({van})")
            op.seconde(0.4)

        # 5. Een kort level helemaal uitspelen: dat laat het sterrenkaartje zien.
        b.js("window.SmakenlandUI.startLevel(2)")
        op.seconde(0.9)
        kisten2 = json.loads(b.js("JSON.stringify((() => { const s = window.SmakenlandUI.level;"
                                  " return s.cells.map((c, i) => [c, i])"
                                  ".filter(([c]) => c && c.kind === 'gen').map(([, i]) => i); })())"))
        for i in range(3):
            cel = kisten2[i % len(kisten2)]
            b.js(f"window.__demo.cel({cel})")
            op.seconde(0.3)
            b.js(f"window.__demo.celTik({cel})")
            op.seconde(0.6)
            if b.js("document.querySelectorAll('[data-lever]:not([disabled])').length"):
                break
        if b.js("document.querySelectorAll('[data-lever]:not([disabled])').length"):
            b.js("window.__demo.tikKies('[data-lever]:not([disabled])')")
            op.seconde(0.5)
            b.js("window.__demo.tikElement('[data-lever]:not([disabled])')")
            op.seconde(1.8)     # het sterrenkaartje komt met een korte pauze

        # 6. Het sterrenkaartje wegklikken en op de kaart kijken wat er staat.
        if b.js("!document.getElementById('modal-level').hidden"):
            b.js("window.__demo.tikKies('#level-terug')")
            op.seconde(0.5)
            b.js("window.__demo.tikElement('#level-terug')")
            op.seconde(1.2)
            b.js("window.scrollTo(0, 0)")
            op.seconde(0.8)
        else:
            print("let op: level 2 leverde geen sterrenkaartje op")

        # 7. Sudoku: een vak kiezen, cijfers invullen, hint en notities.
        b.js("window.__demo.tikKies('.tab[data-tab=sudoku]')")
        op.seconde(0.4)
        b.js("window.__demo.tikElement('.tab[data-tab=sudoku]')")
        op.seconde(1.3)
        b.js("""(() => {
          const leeg = [...document.querySelectorAll('.sudoku-cel')].filter(c => !c.classList.contains('geven'));
          window.__leeg = leeg.slice(0, 5).map(c => Number(c.dataset.cel));
          return window.__leeg.length;
        })()""")
        for cel in json.loads(b.js("JSON.stringify(window.__leeg)"))[:3]:
            cijfer = b.js("(() => { const S = window.SmakenlandSudokuView;"
                          " if (!S || !S.puzzel) return null; return S.puzzel.oplossing[%d]; })()" % cel)
            if cijfer is None:
                print("let op: geen sudoku-stand om te spelen; stap overgeslagen")
                break
            b.js("window.__demo.tikElement('.sudoku-cel[data-cel=\"%d\"]')" % cel)
            op.seconde(0.5)
            b.js("window.__demo.tikElement('.cijfers button[data-cijfer=\"%d\"]')" % int(cijfer))
            op.seconde(0.75)
        b.js("window.__demo.tikElement('#sudoku-hint')")
        op.seconde(0.9)
        b.js("window.__demo.tikElement('#sudoku-notitie')")
        op.seconde(0.4)
        b.js("window.__demo.tikElement('.sudoku-cel[data-cel=\"%d\"]')"
             % (json.loads(b.js("JSON.stringify(window.__leeg)"))[3]
                if len(json.loads(b.js("JSON.stringify(window.__leeg)"))) > 3 else 0))
        op.seconde(0.4)
        b.js("window.__demo.tikElement('.cijfers button[data-cijfer=\"3\"]')")
        op.seconde(0.7)
        b.js("window.__demo.tikElement('#sudoku-notitie')")
        op.seconde(0.5)

        # 8. Vrij spelen: een klant helpen.
        b.js("window.__demo.tikKies('.tab[data-tab=vrij]')")
        op.seconde(0.4)
        b.js("window.__demo.tikElement('.tab[data-tab=vrij]')")
        op.seconde(1.2)
        b.js("""(() => {
          const UI = window.SmakenlandUI, s = UI.vrij;
          const kisten = s.cells.map((c, i) => [c, i]).filter(([c]) => c && c.kind === 'gen').map(([, i]) => i);
          for (let ronde = 0; ronde < 26 && s.cells.filter(Boolean).length < 22; ronde++) {
            s.energie = s.energieMax;
            for (const i of kisten) UI.oogst(i);
          }
          UI.render();
          return s.cells.filter(Boolean).length;
        })()""")
        op.seconde(1.0)
        vrijKisten = json.loads(b.js("JSON.stringify((() => { const s = window.SmakenlandUI.vrij;"
                                     " return s.cells.map((c, i) => [c, i])"
                                     ".filter(([c]) => c && c.kind === 'gen').map(([, i]) => i); })())"))
        for i in range(4):
            cel = vrijKisten[i % len(vrijKisten)]
            b.js(f"window.__demo.cel({cel})")
            op.seconde(0.3)
            b.js(f"window.__demo.celTik({cel})")
            op.seconde(0.55)
        if b.js("document.querySelectorAll('[data-lever]:not([disabled])').length"):
            b.js("window.__demo.tikKies('[data-lever]:not([disabled])')")
            op.seconde(0.5)
            b.js("window.__demo.tikElement('[data-lever]:not([disabled])')")
            op.seconde(1.3)
        op.seconde(1.2)

        print(f"{len(op.frames)} beelden in {op.frames[-1][1]:.1f} seconden")
        maak_video(op, DOEL)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def maak_video(op, doel):
    lijst = os.path.join(FRAMES, "frames.txt")
    with open(lijst, "w") as f:
        for i, (pad, ts) in enumerate(op.frames):
            if i + 1 < len(op.frames):
                duur = max(0.02, op.frames[i + 1][1] - ts)
            else:
                duur = 0.6
            f.write(f"file '{pad}'\nduration {duur:.3f}\n")
        f.write(f"file '{op.frames[-1][0]}'\n")
    subprocess.run([ffmpeg(), "-y", "-f", "concat", "-safe", "0", "-i", lijst,
                    "-vf", f"scale={BREEDTE}:{HOOGTE}:flags=lanczos,fps=12",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", doel],
                   check=True, capture_output=True)
    uit = subprocess.run([shutil.which("ffprobe") or "/usr/bin/ffprobe", "-v", "error",
                          "-show_entries", "format=duration,size:stream=width,height,nb_frames",
                          "-of", "default=nw=1", doel], capture_output=True, text=True).stdout
    print(uit.strip())
    print(f"{doel}: {os.path.getsize(doel)} bytes")


if __name__ == "__main__":
    main()
