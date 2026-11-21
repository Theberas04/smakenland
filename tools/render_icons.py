#!/usr/bin/env python3
"""Tekent het Smakenland-icoon (een pan) in alle maten die nodig zijn.

Geen Pillow nodig: een SVG wordt met de meegeleverde Chromium gerenderd.
Uitvoer:
  icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png   (webapp/PWA)
  android/app/src/main/res/mipmap-*/ic_launcher(.round).png             (Android)
  android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png    (adaptief)

Gebruik:  python3 tools/render_icons.py
"""
import os
import shutil
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WORTEL = os.path.dirname(HIER)
WEB_UIT = os.path.join(WORTEL, "icons")
ANDROID_RES = os.path.join(WORTEL, "android", "app", "src", "main", "res")

# De pan: deksel, twee oren en stoom, op het merk-groen.
PAN = """
<g fill="#ffffff">
  <rect x="52" y="92" width="88" height="60" rx="16"/>
  <rect x="44" y="80" width="104" height="16" rx="8"/>
  <circle cx="96" cy="60" r="10"/>
</g>
<g fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round">
  <path d="M38 104 a14 14 0 1 0 0 24"/>
  <path d="M154 104 a14 14 0 1 1 0 24"/>
</g>
<g fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="9" stroke-linecap="round">
  <path d="M72 58 q8 -12 0 -22"/>
  <path d="M120 58 q8 -12 0 -22"/>
</g>
"""


def svg(grootte, marge=0.86, achtergrond=True, rond=False, vierkant_achtergrond=True):
    """marge 1.0 = de pan vult het vlak; 0.62 houdt de veilige zone vrij (adaptief)."""
    bg = ('<rect width="192" height="192" rx="%d" fill="#3f7a4f"/>' % (42 if vierkant_achtergrond else 0)) if achtergrond else ""
    clip = ('<defs><clipPath id="rond"><circle cx="96" cy="96" r="96"/></clipPath></defs>' if rond else "")
    openen = '<g clip-path="url(#rond)">' if rond else "<g>"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="{grootte}" height="{grootte}">'
        + clip + openen + bg
        + f'<g transform="translate(96 96) scale({marge}) translate(-96 -96)">{PAN}</g>'
        "</g></svg>"
    )


def chromium():
    eigen = os.environ.get("CHROME")
    if eigen:
        return eigen
    basis = os.path.expanduser("~/.hermes/tools")
    kandidaten = []
    if os.path.isdir(basis):
        for naam in sorted(os.listdir(basis)):
            if naam.startswith("chromium-"):
                pad = os.path.join(basis, naam, "chrome-linux64", "chrome")
                if os.path.exists(pad):
                    kandidaten.append(pad)
    for naam in ("google-chrome", "chromium", "chromium-browser"):
        pad = shutil.which(naam)
        if pad:
            kandidaten.append(pad)
    if not kandidaten:
        sys.exit("Geen Chromium gevonden; zet CHROME=/pad/naar/chrome")
    return kandidaten[-1]


def render(svg_tekst, doel, grootte, chrome, transparant=False):
    os.makedirs(os.path.dirname(doel), exist_ok=True)
    pagina = os.path.join(WORTEL, "_icoon.html")
    with open(pagina, "w", encoding="utf-8") as f:
        f.write('<!doctype html><meta charset="utf-8">'
                "<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>"
                + svg_tekst)
    omgeving = dict(os.environ)
    omgeving["LD_LIBRARY_PATH"] = ":".join([
        os.path.expanduser("~/.local/lib"),
        os.path.expanduser("~/.local/chromedeps/root/usr/lib/x86_64-linux-gnu"),
        omgeving.get("LD_LIBRARY_PATH", ""),
    ])
    subprocess.run(
        [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         f"--window-size={grootte},{grootte}", "--force-device-scale-factor=1",
         "--default-background-color=" + ("00000000" if transparant else "ffffffff"),
         f"--screenshot={doel}", "file://" + pagina],
        check=True, env=omgeving, capture_output=True)
    os.remove(pagina)
    return os.path.getsize(doel)


MIPMAPS = [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]


def main():
    chrome = chromium()
    gedaan = []

    for naam, grootte in [("icon-192.png", 192), ("icon-512.png", 512)]:
        pad = os.path.join(WEB_UIT, naam)
        gedaan.append((pad, render(svg(grootte), pad, grootte, chrome)))
    pad = os.path.join(WEB_UIT, "icon-512-maskable.png")
    gedaan.append((pad, render(svg(512, marge=0.62), pad, 512, chrome)))

    for dichtheid, grootte in MIPMAPS:
        for rond in (False, True):
            naam = "ic_launcher_round.png" if rond else "ic_launcher.png"
            pad = os.path.join(ANDROID_RES, "mipmap-" + dichtheid, naam)
            gedaan.append((pad, render(svg(grootte, rond=rond, vierkant_achtergrond=not rond), pad, grootte, chrome,
                                       transparant=rond)))

    pad = os.path.join(ANDROID_RES, "drawable-nodpi", "ic_launcher_foreground.png")
    gedaan.append((pad, render(svg(432, marge=0.62, achtergrond=False), pad, 432, chrome, transparant=True)))

    for naam in ("ic_launcher.xml", "ic_launcher_round.xml"):
        pad = os.path.join(ANDROID_RES, "mipmap-anydpi-v26", naam)
        os.makedirs(os.path.dirname(pad), exist_ok=True)
        with open(pad, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    '  <background android:drawable="@color/ic_launcher_background"/>\n'
                    '  <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
                    '</adaptive-icon>\n')
        gedaan.append((pad, os.path.getsize(pad)))

    for pad, grootte in gedaan:
        print(f"{os.path.relpath(pad, WORTEL)}: {grootte} bytes")


if __name__ == "__main__":
    main()
