#!/usr/bin/env python3
"""Maakt een overzichtsvel van alle kunst, om in één beeld te keuren.

Schrijft docs/kunst-overzicht.png: elke keten een rij, elke tree een kolom.
Gebruik:  python3 tools/contactsheet.py
"""
import glob
import json
import os
import shutil
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WORTEL = os.path.dirname(HIER)
DOEL = os.path.join(WORTEL, "docs", "kunst-overzicht.png")
PROEF = os.path.join(WORTEL, "docs", "_kunstvel.html")

KOP = """<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
body{margin:0;padding:18px;background:#f6f1e7;font:13px/1.3 system-ui,sans-serif;color:#2b2721}
h2{margin:14px 0 6px;font-size:15px}
.rij{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.cel{background:#efe7d6;border-radius:14px;padding:6px;text-align:center;border:1px solid #e2d9c8}
.cel svg{width:100%;height:auto;display:block}
.cel small{color:#7b7266;font-size:11px}
.lucht svg{width:100%;height:auto;display:block;border-radius:10px}
.kistvak{background:#e7dcc4;border:1px dashed #b7a682}
</style></head><body>
"""


def chromium():
    kandidaten = [os.environ["CHROME"]] if os.environ.get("CHROME") else []
    kandidaten += sorted(glob.glob(os.path.expanduser("~/.hermes/tools/chromium-*/chrome-linux64/chrome")))
    kandidaten += [p for p in (shutil.which(n) for n in ("google-chrome", "chromium")) if p]
    if not kandidaten:
        sys.exit("Geen Chromium gevonden; zet CHROME=/pad/naar/chrome")
    return kandidaten[-1]


def main():
    # De kunst via Node uit art.js halen: dat voert het bestand echt uit, zodat het
    # overzicht precies toont wat de pagina laadt (en niet een eigen herlezing).
    uit = subprocess.run(["node", "-e", """
      global.window = {};
      require('%s');
      const a = global.window.SmakenlandArt;
      process.stdout.write(JSON.stringify({ketens: a.ketens, kisten: a.kisten, gebieden: a.gebieden}));
    """ % os.path.join(WORTEL, "art.js").replace("'", "\\'")], capture_output=True, text=True)
    if uit.returncode != 0:
        sys.exit("kon art.js niet lezen: " + uit.stderr[-400:])
    data = json.loads(uit.stdout)

    namen = {
        "tuin": "Tuin", "bakkerij": "Bakkerij", "bloemen": "Bloemen", "smidse": "Smidse",
        "haven": "Haven", "magie": "Magie", "munt": "Munten",
    }
    html = [KOP]
    for keten, rijen in data["ketens"].items():
        html.append(f'<h2>{namen.get(keten, keten)}</h2><div class="rij">')
        for i, svg in enumerate(rijen):
            html.append(f'<div class="cel">{svg}<small>tree {i + 1}</small></div>')
        html.append("</div>")
    html.append('<h2>Kisten (generatoren)</h2><div class="rij">')
    for naam, svg in data["kisten"].items():
        html.append(f'<div class="cel kistvak">{svg}<small>{naam}</small></div>')
    html.append("</div>")
    html.append("</body></html>")

    with open(PROEF, "w", encoding="utf-8") as f:
        f.write("\n".join(html))

    omgeving = dict(os.environ)
    omgeving["LD_LIBRARY_PATH"] = ":".join([
        os.path.expanduser("~/.local/lib"),
        os.path.expanduser("~/.local/chromedeps/root/usr/lib/x86_64-linux-gnu"),
        omgeving.get("LD_LIBRARY_PATH", ""),
    ])
    subprocess.run([
        chromium(), "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--window-size=1120,1180",
        f"--screenshot={DOEL}", "file://" + PROEF,
    ], check=True, env=omgeving, capture_output=True)
    os.remove(PROEF)
    print(f"{DOEL}: {os.path.getsize(DOEL)} bytes")


if __name__ == "__main__":
    main()
