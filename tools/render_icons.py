#!/usr/bin/env python3
"""Tekent het Smakenland-icoon (een pan) als PNG in de maten die de PWA nodig heeft.

Geen Pillow nodig: een SVG wordt met de meegeleverde Chromium gerenderd.
Gebruik:  python3 tools/render_icons.py
"""
import os
import shutil
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WORTEL = os.path.dirname(HIER)
UIT = os.path.join(WORTEL, "icons")

# De pan: deksel + twee oren + stoom, op het merk-groen.
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


def svg(marge: float) -> str:
    """marge 1.0 = de pan vult het vlak; 0.62 houdt de veilige zone vrij (maskable)."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">'
        '<rect width="192" height="192" fill="#3f7a4f"/>'
        f'<g transform="translate(96 96) scale({marge}) translate(-96 -96)">{PAN}</g>'
        "</svg>"
    )


def chromium() -> str:
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


def render(html: str, doel: str, grootte: int, chrome: str) -> None:
    pagina = os.path.join(UIT, "_icoon.html")
    with open(pagina, "w", encoding="utf-8") as f:
        f.write(html)
    omgeving = dict(os.environ)
    omgeving["LD_LIBRARY_PATH"] = ":".join([
        os.path.expanduser("~/.local/lib"),
        os.path.expanduser("~/.local/chromedeps/root/usr/lib/x86_64-linux-gnu"),
        omgeving.get("LD_LIBRARY_PATH", ""),
    ])
    subprocess.run(
        [
            chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
            f"--window-size={grootte},{grootte}", "--force-device-scale-factor=1",
            "--default-background-color=00000000",
            f"--screenshot={doel}", "file://" + pagina,
        ],
        check=True, env=omgeving, capture_output=True,
    )
    os.remove(pagina)


def main() -> None:
    os.makedirs(UIT, exist_ok=True)
    chrome = chromium()
    taken = [
        (svg(0.86), "icon-192.png", 192),
        (svg(0.86), "icon-512.png", 512),
        (svg(0.62), "icon-512-maskable.png", 512),
    ]
    for html, naam, grootte in taken:
        pad = os.path.join(UIT, naam)
        render(html, pad, grootte, chrome)
        print(f"{naam}: {grootte}x{grootte}, {os.path.getsize(pad)} bytes")


if __name__ == "__main__":
    main()
