#!/usr/bin/env python3
"""Tekent alle voorwerpen van Smakenland als SVG en bundelt ze in art.js.

Eén bron voor de kunst: dit script. De pagina laadt `art.js` (gewone <script src>),
zodat alles offline in de app zit. Gebruik:  python3 tools/gen_art.py [--check]

--check controleert het bestaande art.js tegen wat dit script zou maken en telt
de onderdelen, zonder iets te schrijven (zodat het niet kan weglopen van de app).
"""
import hashlib
import os
import re
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WORTEL = os.path.dirname(HIER)
DOEL = os.path.join(WORTEL, "art.js")

DOOS = 'viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"'


# ---------------------------------------------------------------- gereedschap

def verloop(pid, stops, x1=0, y1=0, x2=0, y2=1):
    """Een lineair verloop; stops is [[offset, kleur], ...]."""
    binnen = "".join(f'<stop offset="{o}" stop-color="{k}"/>' for o, k in stops)
    return (f'<linearGradient id="{pid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'{binnen}</linearGradient>')


def straal(pid, stops, cx=0.42, cy=0.35, r=0.75):
    """Een radiaal verloop voor glans/volume."""
    binnen = "".join(f'<stop offset="{o}" stop-color="{k}"/>' for o, k in stops)
    return (f'<radialGradient id="{pid}" cx="{cx}" cy="{cy}" r="{r}">'
            f'{binnen}</radialGradient>')


def schaduw(cx=50, cy=86, rx=26, ry=6, dek=0.22):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#2b2721" opacity="{dek}"/>'


def glans(cx, cy, rx, ry, dek=0.45, rot=0):
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffffff" '
            f'opacity="{dek}" transform="rotate({rot} {cx} {cy})"/>')


def item(pid, binnen):
    return f'<svg {DOOS} class="kunst">{binnen}</svg>'


# --------------------------------------------------------------------- tuin

def zaadje(p):
    return item(p, schaduw(50, 82, 17, 4) + f'''
<defs>{verloop(p + '-a', [[0, '#b98557'], [1, '#7d5330']])}</defs>
<path d="M50 20 C68 36 72 56 50 76 C28 56 32 36 50 20 Z" fill="url(#{p}-a)"/>
<path d="M50 26 C62 40 65 55 50 70" fill="none" stroke="#e0b98c" stroke-width="3" opacity=".7" stroke-linecap="round"/>
<ellipse cx="44" cy="42" rx="6" ry="10" fill="#ffffff" opacity=".25" transform="rotate(-18 44 42)"/>''')


def kiemplant(p):
    return item(p, schaduw(50, 84, 22, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#7bc47f'], [1, '#3f8f4f']])}
{verloop(p + '-b', [[0, '#a2784f'], [1, '#6b4a2c']])}</defs>
<path d="M34 84 C34 74 66 74 66 84 Z" fill="url(#{p}-b)"/>
<path d="M50 76 L50 46" fill="none" stroke="#4e8f45" stroke-width="4" stroke-linecap="round"/>
<path d="M50 60 C34 58 26 48 24 38 C40 36 50 46 50 60 Z" fill="url(#{p}-a)"/>
<path d="M50 56 C66 54 74 44 76 34 C60 32 50 42 50 56 Z" fill="url(#{p}-a)"/>
<path d="M50 52 C44 46 38 44 30 43" fill="none" stroke="#2f6b36" stroke-width="1.4" opacity=".5"/>''')


def tomaat(p):
    return item(p, schaduw(50, 84, 26, 6) + f'''
<defs>{straal(p + '-a', [[0, '#ff7a63'], [0.55, '#e0392a'], [1, '#a81f18']])}
{verloop(p + '-b', [[0, '#5faa4f'], [1, '#2f6b36']])}</defs>
<circle cx="50" cy="56" r="27" fill="url(#{p}-a)"/>
<path d="M50 30 C54 22 62 20 68 22 C64 30 58 32 52 32 Z" fill="url(#{p}-b)"/>
<path d="M50 31 C46 23 38 21 32 23 C36 31 42 33 48 32 Z" fill="url(#{p}-b)"/>
<path d="M50 28 L50 38" stroke="#2f6b36" stroke-width="3" stroke-linecap="round"/>
''' + glans(40, 46, 8, 5, 0.5, -25))


def salade(p):
    return item(p, schaduw(50, 86, 30, 6) + f'''
<defs>{straal(p + '-a', [[0, '#ffffff'], [1, '#dfd6c4']])}
{verloop(p + '-b', [[0, '#8fd07a'], [1, '#3f8f4f']])}</defs>
<circle cx="36" cy="42" r="13" fill="url(#{p}-b)"/>
<circle cx="60" cy="38" r="14" fill="url(#{p}-b)"/>
<circle cx="48" cy="46" r="15" fill="url(#{p}-b)"/>
<ellipse cx="52" cy="40" rx="7" ry="6" fill="#e0392a"/>
<ellipse cx="66" cy="48" rx="6" ry="5" fill="#e0392a"/>
<path d="M18 48 C18 74 82 74 82 48 Z" fill="url(#{p}-a)"/>
<path d="M18 48 C18 54 82 54 82 48" fill="none" stroke="#ffffff" stroke-width="3" opacity=".8"/>
<ellipse cx="50" cy="72" rx="30" ry="4" fill="#ffffff" opacity=".25"/>''')


def soep(p):
    return item(p, schaduw(50, 86, 28, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#ffffff'], [1, '#d8cfbb']])}
{straal(p + '-b', [[0, '#f7b25a'], [1, '#c86a1c']])}</defs>
<path d="M18 46 C18 76 82 76 82 46 Z" fill="url(#{p}-a)"/>
<ellipse cx="50" cy="46" rx="32" ry="9" fill="url(#{p}-b)"/>
<ellipse cx="42" cy="45" rx="8" ry="3" fill="#ffd79b" opacity=".8"/>
<path d="M40 30 C46 22 34 18 40 8" fill="none" stroke="#ffffff" stroke-width="3.4" opacity=".75" stroke-linecap="round"/>
<path d="M60 32 C66 24 54 20 60 10" fill="none" stroke="#ffffff" stroke-width="3.4" opacity=".6" stroke-linecap="round"/>
<path d="M18 46 C26 53 74 53 82 46" fill="none" stroke="#bfb6a2" stroke-width="2"/>''')


def feestmaal(p):
    return item(p, schaduw(50, 88, 30, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#fdfdfd'], [0.5, '#c8cdd4'], [1, '#8d949e']])}
{verloop(p + '-b', [[0, '#f0c25c'], [1, '#b8860f']])}</defs>
<ellipse cx="50" cy="72" rx="38" ry="9" fill="url(#{p}-b)"/>
<path d="M24 68 C24 38 76 38 76 68 Z" fill="url(#{p}-a)"/>
<circle cx="50" cy="34" r="4.5" fill="url(#{p}-b)"/>
<path d="M50 38 L50 44" stroke="#b8860f" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="36" cy="54" rx="7" ry="12" fill="#ffffff" opacity=".35" transform="rotate(-16 36 54)"/>
<path d="M78 26 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 z" fill="#ffd75e"/>
<path d="M20 34 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" fill="#ffe9a8"/>''')


# ---------------------------------------------------------------- bakkerij

def koren(p):
    return item(p, schaduw(50, 86, 18, 4) + f'''
<defs>{verloop(p + '-a', [[0, '#f2cd6b'], [1, '#c08b1c']])}</defs>
<path d="M50 22 L50 80" stroke="#b8860f" stroke-width="3" stroke-linecap="round"/>
{
  "".join(
    f'<ellipse cx="{50 + dx}" cy="{y}" rx="6" ry="9" fill="url(#{p}-a)" transform="rotate({-22 if dx < 0 else (22 if dx else 0)} {50 + dx} {y})"/>'
    for y, dx in [(30, -5), (30, 5), (42, -6), (42, 6), (54, -6), (54, 6), (66, -5), (66, 5)])
}
<ellipse cx="50" cy="82" rx="4" ry="3" fill="#b8860f"/>''')


def stokbrood(p):
    return item(p, schaduw(50, 84, 32, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#f0bf73'], [0.5, '#d99a3f'], [1, '#a86a1c']])}</defs>
<g transform="rotate(-16 50 56)">
  <rect x="14" y="42" width="72" height="28" rx="14" fill="url(#{p}-a)"/>
  <path d="M30 44 l6 24 M46 44 l6 24 M62 44 l6 24" stroke="#8c5410" stroke-width="2.6" opacity=".55" stroke-linecap="round"/>
  <ellipse cx="34" cy="50" rx="14" ry="5" fill="#ffffff" opacity=".28"/>
</g>''')


def boerenbrood(p):
    return item(p, schaduw(50, 86, 30, 6) + f'''
<defs>{straal(p + '-a', [[0, '#e8b46a'], [1, '#b57a26']])}</defs>
<circle cx="50" cy="58" r="28" fill="url(#{p}-a)"/>
<path d="M30 44 C40 36 60 36 70 44" fill="none" stroke="#f7dcae" stroke-width="3" opacity=".6" stroke-linecap="round"/>
<path d="M32 54 L68 54 M50 40 L50 74" stroke="#8c5a16" stroke-width="3" opacity=".45" stroke-linecap="round"/>
<circle cx="38" cy="70" r="1.6" fill="#f7dcae"/><circle cx="62" cy="66" r="1.6" fill="#f7dcae"/>
<circle cx="50" cy="80" r="1.6" fill="#f7dcae"/>''')


def croissants(p):
    def een(cx, cy, s):
        return (f'<g transform="translate({cx} {cy}) scale({s})">'
                f'<path d="M-22 12 C-14 -10 14 -10 22 12 C14 16 10 8 0 8 C-10 8 -14 16 -22 12 Z" fill="url(#{p}-a)"/>'
                f'<path d="M-10 2 C-6 -6 6 -6 10 2" fill="none" stroke="#a86a1c" stroke-width="2" opacity=".5"/>'
                f'</g>')
    return item(p, schaduw(50, 84, 30, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#f4c777'], [1, '#c1801f']])}</defs>
{een(42, 62, 1.0)}{een(64, 44, 0.72)}''')


def taart(p):
    return item(p, schaduw(50, 86, 28, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#ffe6c2'], [1, '#e3bd85']])}
{verloop(p + '-b', [[0, '#e0556f'], [1, '#b02a48']])}</defs>
<path d="M26 50 L74 50 L74 78 C74 82 26 82 26 78 Z" fill="url(#{p}-a)"/>
<path d="M26 58 C40 66 60 66 74 58 L74 52 L26 52 Z" fill="url(#{p}-b)"/>
<path d="M24 50 C24 42 76 42 76 50 Z" fill="#fff6e8"/>
<path d="M34 46 C36 40 44 40 46 46 C48 40 56 40 58 46 C60 40 68 40 70 46" fill="none" stroke="#f7e2c4" stroke-width="4" stroke-linecap="round"/>
<circle cx="50" cy="38" r="5" fill="#c0392b"/>
<path d="M50 33 C50 27 54 25 58 26" fill="none" stroke="#4e8f45" stroke-width="2.4" stroke-linecap="round"/>''')


def bruidstaart(p):
    return item(p, schaduw(50, 90, 30, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#fffaf2'], [1, '#e6d3bb']])}
{verloop(p + '-b', [[0, '#f0c25c'], [1, '#b8860f']])}</defs>
<rect x="20" y="76" width="60" height="12" rx="4" fill="#cbb79b"/>
<rect x="24" y="56" width="52" height="22" rx="5" fill="url(#{p}-a)"/>
<rect x="31" y="38" width="38" height="20" rx="5" fill="url(#{p}-a)"/>
<rect x="38" y="22" width="24" height="18" rx="4" fill="url(#{p}-a)"/>
<path d="M24 60 C34 66 66 66 76 60 M31 42 C40 48 60 48 69 42" fill="none" stroke="#f3bfd2" stroke-width="3"/>
<path d="M42 22 L50 8 L58 22 Z" fill="url(#{p}-b)"/>
<circle cx="50" cy="8" r="3" fill="#ffd75e"/>''')


# ---------------------------------------------------------------- bloemen

def klavertje(p):
    return item(p, schaduw(50, 84, 22, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#8fd07a'], [1, '#2f6b36']])}</defs>
<path d="M50 78 C46 66 50 56 54 48" fill="none" stroke="#3f8f4f" stroke-width="3.4" stroke-linecap="round"/>
{
  "".join(
    f'<path d="M{cx} {cy} c-12 -4 -14 -20 0 -22 c14 2 12 18 0 22 z" fill="url(#{p}-a)" transform="rotate({rot} {cx} {cy})"/>'
    for cx, cy, rot in [(50, 28, 0), (32, 48, -110), (68, 48, 110)])
}
<circle cx="50" cy="40" r="3" fill="#e8f5e0"/>''')


def tulp(p):
    return item(p, schaduw(50, 86, 20, 4) + f'''
<defs>{verloop(p + '-a', [[0, '#ff7ea6'], [1, '#c0284f']])}
{verloop(p + '-b', [[0, '#8fd07a'], [1, '#2f6b36']])}</defs>
<path d="M50 78 L50 44" stroke="#3f8f4f" stroke-width="3.6" stroke-linecap="round"/>
<path d="M50 62 C36 62 28 52 26 42 C40 42 50 50 50 62 Z" fill="url(#{p}-b)"/>
<path d="M38 44 C38 26 44 18 50 18 C56 18 62 26 62 44 C56 50 44 50 38 44 Z" fill="url(#{p}-a)"/>
<path d="M44 22 C46 32 46 40 44 46 M56 22 C54 32 54 40 56 46" fill="none" stroke="#a81f45" stroke-width="1.6" opacity=".6"/>''')


def zonnebloem(p):
    bloemblaadjes = "".join(
        f'<ellipse cx="50" cy="26" rx="7" ry="15" fill="url(#{p}-a)" transform="rotate({i * 30} 50 50)"/>'
        for i in range(12))
    return item(p, schaduw(50, 86, 24, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#ffe066'], [1, '#e8a30c']])}
{straal(p + '-b', [[0, '#8a5a25'], [1, '#4a2c0e']])}</defs>
{bloemblaadjes}
<circle cx="50" cy="50" r="17" fill="url(#{p}-b)"/>
<circle cx="50" cy="50" r="17" fill="none" stroke="#3a2109" stroke-width="1.4" opacity=".5"/>
<circle cx="44" cy="44" r="2" fill="#c99a11"/><circle cx="56" cy="46" r="2" fill="#c99a11"/>
<circle cx="50" cy="57" r="2" fill="#c99a11"/>''')


def boeket(p):
    def bloempje(cx, cy, kleur):
        return (f'<g transform="translate({cx} {cy})">'
                + "".join(f'<ellipse cx="0" cy="-8" rx="5" ry="8" fill="{kleur}" transform="rotate({i * 72})"/>'
                          for i in range(5))
                + '<circle r="3.4" fill="#ffd75e"/></g>')
    return item(p, schaduw(50, 88, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#fff6e8'], [1, '#d9c7ac']])}</defs>
<path d="M30 62 C34 84 66 84 70 62 Z" fill="url(#{p}-a)"/>
<path d="M34 60 L42 78 M66 60 L58 78" stroke="#c9b393" stroke-width="2" opacity=".8"/>
{bloempje(38, 40, '#ff7ea6')}{bloempje(62, 38, '#c86ae2')}{bloempje(50, 26, '#ffd166')}
<path d="M50 50 L50 66" stroke="#3f8f4f" stroke-width="2.4"/>''')


def lotus(p):
    return item(p, schaduw(50, 84, 28, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#ffd9ec'], [1, '#d05b96']])}
{verloop(p + '-b', [[0, '#ffeaf4'], [1, '#e88ab5']])}</defs>
<ellipse cx="30" cy="56" rx="16" ry="9" fill="url(#{p}-b)" transform="rotate(18 30 56)"/>
<ellipse cx="70" cy="56" rx="16" ry="9" fill="url(#{p}-b)" transform="rotate(-18 70 56)"/>
<ellipse cx="50" cy="52" rx="15" ry="13" fill="url(#{p}-a)"/>
<ellipse cx="50" cy="60" rx="24" ry="10" fill="url(#{p}-b)" opacity=".95"/>
<path d="M50 44 C54 50 54 58 50 64" fill="none" stroke="#b8447a" stroke-width="1.6" opacity=".5"/>
<path d="M42 46 C46 52 46 58 42 62 M58 46 C54 52 54 58 58 62" fill="none" stroke="#b8447a" stroke-width="1.4" opacity=".4"/>''')


def blossem(p):
    return item(p, schaduw(50, 84, 24, 5) + f'''
<defs>{straal(p + '-a', [[0, '#ffffff'], [0.6, '#ffc4dd'], [1, '#e8749f']])}</defs>
{
  "".join(f'<ellipse cx="50" cy="30" rx="11" ry="16" fill="url(#{p}-a)" transform="rotate({i * 72} 50 52)"/>'
          for i in range(5))
}
<circle cx="50" cy="52" r="9" fill="#ffe9a8"/>
<circle cx="50" cy="52" r="9" fill="none" stroke="#e8b93c" stroke-width="1.2"/>
{
  "".join(f'<path d="M50 46 L52 50 L56 51 L52 53 L50 57 L48 53 L44 51 L48 50 Z" fill="#e8b93c" '
          f'transform="rotate({i * 45} 50 52)"/>' for i in range(4))
}
<path d="M20 22 l2 4.6 4.6 2 -4.6 2 -2 4.6 -2 -4.6 -4.6 -2 4.6 -2 z" fill="#ffffff" opacity=".9"/>
<path d="M80 30 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="#ffffff" opacity=".75"/>''')


# ---------------------------------------------------------------- smidse

def erts(p):
    return item(p, schaduw(50, 86, 28, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#9aa3b0'], [1, '#5a6577']])}
{verloop(p + '-b', [[0, '#ffd75e'], [1, '#c9911a']])}</defs>
<path d="M22 76 L34 38 L54 26 L76 38 L80 66 L62 80 Z" fill="url(#{p}-a)"/>
<path d="M34 38 L54 26 L60 44 L44 52 Z" fill="#ffffff" opacity=".16"/>
<path d="M46 50 L58 46 L66 58 L54 68 L42 62 Z" fill="url(#{p}-b)"/>
<circle cx="52" cy="58" r="2.6" fill="#fff3c4"/>
<circle cx="62" cy="52" r="1.8" fill="#fff3c4"/>''')


def spijker(p):
    return item(p, schaduw(50, 86, 22, 4) + f'''
<defs>{verloop(p + '-a', [[0, '#f4f7fa'], [0.5, '#b6bfc9'], [1, '#6d7681']])}</defs>
<g transform="rotate(28 50 56)">
  <rect x="34" y="34" width="32" height="8" rx="4" fill="url(#{p}-a)"/>
  <rect x="46" y="42" width="8" height="34" fill="url(#{p}-a)"/>
  <path d="M46 76 L54 76 L50 88 Z" fill="#8d949e"/>
</g>''')


def hamer(p):
    return item(p, schaduw(50, 88, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#c8cdd4'], [1, '#6d7681']])}
{verloop(p + '-b', [[0, '#c08b4a'], [1, '#7d5330']])}</defs>
<g transform="rotate(-20 50 56)">
  <rect x="44" y="42" width="10" height="46" rx="4" fill="url(#{p}-b)"/>
  <rect x="24" y="26" width="52" height="20" rx="6" fill="url(#{p}-a)"/>
  <rect x="24" y="30" width="16" height="12" rx="4" fill="#eef1f4" opacity=".7"/>
</g>''')


def zwaard(p):
    return item(p, schaduw(50, 88, 22, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#ffffff'], [0.45, '#c8cdd4'], [1, '#7c848f']])}
{verloop(p + '-b', [[0, '#f0c25c'], [1, '#b8860f']])}</defs>
<g transform="rotate(20 50 56)">
  <path d="M50 12 L58 26 L58 66 L50 76 L42 66 L42 26 Z" fill="url(#{p}-a)"/>
  <path d="M50 16 L50 70" stroke="#ffffff" stroke-width="2" opacity=".7"/>
  <rect x="30" y="66" width="40" height="9" rx="4.5" fill="url(#{p}-b)"/>
  <rect x="45" y="75" width="10" height="16" rx="4" fill="#7d5330"/>
  <circle cx="50" cy="92" r="4" fill="url(#{p}-b)"/>
</g>''')


def schild(p):
    return item(p, schaduw(50, 88, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#5fa8d3'], [1, '#1f5f8a']])}
{verloop(p + '-b', [[0, '#f0c25c'], [1, '#b8860f']])}</defs>
<path d="M50 16 C64 24 74 26 80 26 C80 56 68 74 50 84 C32 74 20 56 20 26 C26 26 36 24 50 16 Z" fill="url(#{p}-b)"/>
<path d="M50 22 C61 29 69 31 74 31 C74 55 64 70 50 78 C36 70 26 55 26 31 C31 31 39 29 50 22 Z" fill="url(#{p}-a)"/>
<path d="M50 34 L56 48 L70 50 L59 59 L62 72 L50 65 L38 72 L41 59 L30 50 L44 48 Z" fill="#ffd75e" opacity=".95"/>''')


def trofee(p):
    return item(p, schaduw(50, 90, 24, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#ffe9a8'], [0.5, '#e8b93c'], [1, '#a8760a']])}</defs>
<path d="M30 24 L70 24 L66 56 C66 66 58 72 50 72 C42 72 34 66 34 56 Z" fill="url(#{p}-a)"/>
<path d="M30 28 C18 28 18 46 32 48 M70 28 C82 28 82 46 68 48" fill="none" stroke="#c9911a" stroke-width="4"/>
<rect x="46" y="72" width="8" height="8" fill="#c9911a"/>
<rect x="34" y="80" width="32" height="7" rx="3" fill="#a8760a"/>
<path d="M40 32 L40 50" stroke="#fff6d0" stroke-width="3" opacity=".6" stroke-linecap="round"/>
<path d="M50 34 l2 4.6 4.6 2 -4.6 2 -2 4.6 -2 -4.6 -4.6 -2 4.6 -2 z" fill="#fff6d0" opacity=".9"/>''')


# ----------------------------------------------------------------- haven

def schelp(p):
    return item(p, schaduw(50, 86, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#fff3f6'], [1, '#e8a9bd']])}</defs>
<path d="M50 82 C24 70 16 46 24 30 C34 20 66 20 76 30 C84 46 76 70 50 82 Z" fill="url(#{p}-a)"/>
{
  "".join(f'<path d="M50 80 C{x} {58} {x} {40} {x + 6} 28" fill="none" stroke="#c98aa2" stroke-width="1.8" opacity=".7"/>'
          for x in range(28, 76, 8))
}
<path d="M34 40 C38 32 42 28 44 26" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7"/>''')


def vis(p):
    return item(p, schaduw(50, 82, 28, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#8fd6f0'], [0.5, '#3d8fc4'], [1, '#1f5f8a']])}
{verloop(p + '-b', [[0, '#ffffff'], [1, '#c8cdd4']])}</defs>
<path d="M22 54 C34 34 68 34 78 52 C68 70 34 70 22 54 Z" fill="url(#{p}-a)"/>
<path d="M78 52 L92 38 L88 52 L92 66 Z" fill="url(#{p}-b)"/>
<path d="M46 36 C50 28 56 26 62 26 C60 34 56 38 50 38 Z" fill="url(#{p}-b)"/>
<circle cx="36" cy="50" r="4" fill="#ffffff"/><circle cx="35" cy="50" r="2" fill="#2b2721"/>
<path d="M40 62 C52 68 66 66 74 60" fill="none" stroke="#1f5f8a" stroke-width="1.6" opacity=".6"/>''')


def inktvis(p):
    return item(p, schaduw(50, 84, 24, 5) + f'''
<defs>{straal(p + '-a', [[0, '#e88ab5'], [1, '#8e2a5e']])}</defs>
<path d="M50 18 C64 26 70 42 66 58 C62 70 38 70 34 58 C30 42 36 26 50 18 Z" fill="url(#{p}-a)"/>
<circle cx="42" cy="40" r="4" fill="#ffffff"/><circle cx="58" cy="40" r="4" fill="#ffffff"/>
<circle cx="42" cy="41" r="2" fill="#2b2721"/><circle cx="58" cy="41" r="2" fill="#2b2721"/>
<path d="M34 60 C26 70 28 80 22 84 M42 64 C38 74 42 82 38 86 M50 66 C50 76 54 82 50 88 M58 64 C62 74 58 82 62 86 M66 60 C74 70 72 80 78 84"
      fill="none" stroke="#8e2a5e" stroke-width="4" stroke-linecap="round"/>
<path d="M44 26 C48 22 52 22 56 26" fill="none" stroke="#ffffff" stroke-width="2.4" opacity=".5"/>''')


def kreeft(p):
    return item(p, schaduw(50, 90, 24, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#ff9a76'], [0.5, '#e2542c'], [1, '#a02a10']])}
{verloop(p + '-b', [[0, '#ff8a6b'], [1, '#b03318']])}</defs>
<!-- scharen -->
<path d="M30 40 C18 32 8 34 6 42 C10 50 22 52 30 48 Z" fill="url(#{p}-b)"/>
<path d="M70 40 C82 32 92 34 94 42 C90 50 78 52 70 48 Z" fill="url(#{p}-b)"/>
<path d="M12 34 C18 26 26 26 30 32" fill="none" stroke="#a02a10" stroke-width="3.4" stroke-linecap="round"/>
<path d="M88 34 C82 26 74 26 70 32" fill="none" stroke="#a02a10" stroke-width="3.4" stroke-linecap="round"/>
<path d="M14 44 C8 38 4 38 2 42 M86 44 C92 38 96 38 98 42" fill="none" stroke="#a02a10" stroke-width="2.6" stroke-linecap="round"/>
<!-- lijf -->
<path d="M50 34 C64 34 70 46 68 60 C66 74 58 80 50 80 C42 80 34 74 32 60 C30 46 36 34 50 34 Z" fill="url(#{p}-a)"/>
<path d="M34 52 C42 57 58 57 66 52 M34 60 C42 65 58 65 66 60 M36 68 C43 73 57 73 64 68" fill="none" stroke="#8c2a12" stroke-width="1.8" opacity=".7"/>
<!-- staart -->
<path d="M42 80 L34 92 L44 88 L50 94 L56 88 L66 92 L58 80 Z" fill="url(#{p}-a)"/>
<!-- voetjes -->
<path d="M32 56 L20 62 M32 66 L20 74 M68 56 L80 62 M68 66 L80 74" stroke="#a02a10" stroke-width="3.4" stroke-linecap="round"/>
<!-- ogen en voelsprieten -->
<path d="M44 36 C42 26 36 22 30 22 M56 36 C58 26 64 22 70 22" fill="none" stroke="#a02a10" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="43" cy="40" r="3.4" fill="#ffffff"/><circle cx="57" cy="40" r="3.4" fill="#ffffff"/>
<circle cx="43" cy="41" r="2" fill="#2b2721"/><circle cx="57" cy="41" r="2" fill="#2b2721"/>
<path d="M44 28 C48 24 52 24 56 28" fill="none" stroke="#ffffff" stroke-width="2" opacity=".5"/>''')


def walvis(p):
    return item(p, schaduw(50, 84, 30, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#a9e0f5'], [0.6, '#3d8fc4'], [1, '#1b4f73']])}</defs>
<path d="M16 58 C24 36 66 32 80 50 C84 56 82 62 76 64 C60 72 28 74 16 58 Z" fill="url(#{p}-a)"/>
<path d="M80 50 C88 42 92 36 96 30 C92 42 92 52 96 62 C90 60 84 56 80 50 Z" fill="#1b4f73"/>
<path d="M30 62 C38 70 56 70 66 64" fill="none" stroke="#ffffff" stroke-width="3" opacity=".5"/>
<circle cx="34" cy="50" r="3.4" fill="#ffffff"/><circle cx="33" cy="50" r="1.8" fill="#2b2721"/>
<path d="M40 44 C44 38 52 36 58 38" fill="none" stroke="#ffffff" stroke-width="6" opacity=".35" stroke-linecap="round"/>
<path d="M38 30 C40 22 34 20 36 14 M46 30 C48 22 42 20 44 14" fill="none" stroke="#ffffff" stroke-width="2.6" opacity=".6" stroke-linecap="round"/>''')


def zeedraak(p):
    return item(p, schaduw(50, 86, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#7be0b8'], [0.5, '#1f9e74'], [1, '#0e5b45']])}
{verloop(p + '-b', [[0, '#ffe9a8'], [1, '#c9911a']])}</defs>
<path d="M22 74 C22 46 34 30 52 30 C70 30 80 44 80 58 C80 72 68 80 54 80 C42 80 34 76 22 74 Z" fill="url(#{p}-a)"/>
<path d="M52 30 C48 20 56 14 64 16 C62 24 58 28 52 30 Z" fill="url(#{p}-b)"/>
<path d="M28 46 L16 40 L28 54 Z" fill="#0e5b45"/>
<path d="M34 40 L30 30 L42 38 Z" fill="url(#{p}-b)"/>
<circle cx="60" cy="48" r="4.4" fill="#fff6d0"/><circle cx="61" cy="48" r="2.2" fill="#2b2721"/>
<path d="M74 60 C66 62 58 62 52 60" fill="none" stroke="#0e5b45" stroke-width="2.2"/>
<path d="M46 40 C52 36 60 36 66 40" fill="none" stroke="#ffffff" stroke-width="2" opacity=".4"/>
<path d="M40 62 L36 70 L44 68 L46 76 L52 68" fill="#ffe9a8" opacity=".9"/>''')


# ----------------------------------------------------------------- magie

def sterrenstof(p):
    return item(p, schaduw(50, 86, 20, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#dff1ff'], [1, '#a8c6dd']])}
{straal(p + '-b', [[0, '#ffe9a8'], [1, '#c9911a']])}</defs>
<path d="M38 30 L62 30 L60 44 L40 44 Z" fill="#8d949e"/>
<rect x="44" y="20" width="12" height="10" rx="3" fill="#a8760a"/>
<path d="M40 44 L38 76 C38 82 62 82 62 76 L60 44 Z" fill="url(#{p}-a)" opacity=".9"/>
<path d="M42 60 C44 74 56 74 58 60 C54 66 46 66 42 60 Z" fill="url(#{p}-b)"/>
<circle cx="48" cy="70" r="1.6" fill="#fff6d0"/><circle cx="54" cy="74" r="1.4" fill="#fff6d0"/>
<circle cx="52" cy="66" r="1.2" fill="#fff6d0"/>
<path d="M26 34 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" fill="#ffe9a8"/>
<path d="M76 50 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="#fff6d0" opacity=".9"/>''')


def kristal(p):
    return item(p, schaduw(50, 86, 24, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#e2c9ff'], [0.5, '#a06ae0'], [1, '#5b2a9e']])}
{verloop(p + '-b', [[0, '#f4e8ff'], [0.6, '#c39cf0'], [1, '#7a4fc0']])}</defs>
<path d="M50 16 L66 40 L58 78 L42 78 L34 40 Z" fill="url(#{p}-a)"/>
<path d="M28 44 L38 36 L44 78 L30 78 Z" fill="url(#{p}-b)" opacity=".95"/>
<path d="M72 46 L62 40 L56 78 L70 78 Z" fill="url(#{p}-b)" opacity=".8"/>
<path d="M50 16 L58 40 L50 78" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".5"/>
<path d="M44 30 L48 44 L44 60" fill="none" stroke="#ffffff" stroke-width="2" opacity=".6"/>''')


def toverdrank(p):
    return item(p, schaduw(50, 88, 20, 5) + f'''
<defs>{straal(p + '-a', [[0, '#ffd0ec'], [0.5, '#e0559c'], [1, '#8e1a5e']])}
{verloop(p + '-b', [[0, '#dff1ff'], [1, '#9fb8cc']])}</defs>
<rect x="44" y="18" width="12" height="10" rx="3" fill="#8c5a16"/>
<path d="M42 28 C42 34 34 38 34 52 C34 72 44 80 50 80 C56 80 66 72 66 52 C66 38 58 34 58 28 Z" fill="url(#{p}-b)" opacity=".85"/>
<path d="M36 56 C36 74 44 80 50 80 C56 80 64 74 64 56 C58 64 42 64 36 56 Z" fill="url(#{p}-a)"/>
<circle cx="44" cy="68" r="2.4" fill="#ffd0ec" opacity=".9"/>
<circle cx="54" cy="72" r="1.8" fill="#ffd0ec" opacity=".9"/>
<path d="M40 40 C42 36 44 34 46 32" fill="none" stroke="#ffffff" stroke-width="3" opacity=".6" stroke-linecap="round"/>''')


def toverstaf(p):
    return item(p, schaduw(50, 88, 22, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#d9b98a'], [1, '#7d5330']])}
{straal(p + '-b', [[0, '#fff6d0'], [1, '#e8b93c']])}</defs>
<g transform="rotate(24 50 56)">
  <rect x="46" y="34" width="9" height="52" rx="4" fill="url(#{p}-a)"/>
  <path d="M50 8 L56 22 L71 23 L60 33 L63 47 L50 40 L37 47 L40 33 L29 23 L44 22 Z" fill="#ffd75e"/>
  <path d="M50 8 L56 22 L71 23 L60 33 L63 47 L50 40 Z" fill="url(#{p}-b)"/>
</g>
<path d="M22 30 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" fill="#ffe9a8"/>
<path d="M78 44 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="#fff6d0"/>''')


def tovenaar(p):
    return item(p, schaduw(50, 88, 30, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#6a8fe0'], [1, '#2a3f8e']])}
{verloop(p + '-b', [[0, '#a06ae0'], [1, '#5b2a9e']])}</defs>
<path d="M50 10 C58 26 74 56 80 72 C62 78 38 78 20 72 C26 56 42 26 50 10 Z" fill="url(#{p}-a)"/>
<path d="M22 66 C38 72 62 72 78 66 C78 72 78 76 78 78 C60 84 40 84 22 78 C22 76 22 72 22 66 Z" fill="url(#{p}-b)"/>
<path d="M50 14 C54 30 62 52 68 68" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".25"/>
<path d="M44 44 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" fill="#ffe9a8"/>
<path d="M60 54 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 z" fill="#fff6d0"/>''')


def sterrenkroon(p):
    return item(p, schaduw(50, 84, 26, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#fff3c4'], [0.5, '#e8b93c'], [1, '#a8760a']])}
{straal(p + '-b', [[0, '#ffffff'], [1, '#ffdc6b']])}</defs>
<path d="M20 68 L26 30 L38 48 L50 20 L62 48 L74 30 L80 68 Z" fill="url(#{p}-a)"/>
<rect x="20" y="66" width="60" height="12" rx="5" fill="url(#{p}-a)"/>
<circle cx="50" cy="72" r="3.4" fill="#b03318"/>
<circle cx="32" cy="72" r="2.6" fill="#2a7ea8"/>
<circle cx="68" cy="72" r="2.6" fill="#3f8f4f"/>
<circle cx="50" cy="18" r="7" fill="url(#{p}-b)"/>
<circle cx="50" cy="18" r="11" fill="#ffffff" opacity=".25"/>
<path d="M36 44 L38 52 M64 44 L62 52" stroke="#fff6d0" stroke-width="2.4" opacity=".7"/>''')


# ----------------------------------------------------------------- munt

def munt(p):
    return item(p, schaduw(50, 82, 22, 5) + f'''
<defs>{straal(p + '-a', [[0, '#fff3c4'], [0.55, '#e8b93c'], [1, '#a8760a']])}</defs>
<circle cx="50" cy="52" r="28" fill="url(#{p}-a)"/>
<circle cx="50" cy="52" r="22" fill="none" stroke="#fff6d0" stroke-width="2" opacity=".8"/>
<path d="M50 36 L56 48 L69 49 L59 57 L62 70 L50 63 L38 70 L41 57 L31 49 L44 48 Z" fill="#a8760a" opacity=".85"/>
<ellipse cx="40" cy="40" rx="8" ry="5" fill="#ffffff" opacity=".4" transform="rotate(-30 40 40)"/>''')


def buidel(p):
    return item(p, schaduw(50, 86, 24, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#d9a86a'], [1, '#8a5a25']])}
{straal(p + '-b', [[0, '#fff3c4'], [1, '#c9911a']])}</defs>
<circle cx="34" cy="70" r="8" fill="url(#{p}-b)"/>
<circle cx="64" cy="72" r="7" fill="url(#{p}-b)"/>
<path d="M50 26 C68 34 78 52 76 66 C74 80 26 80 24 66 C22 52 32 34 50 26 Z" fill="url(#{p}-a)"/>
<path d="M38 34 C44 30 56 30 62 34" fill="none" stroke="#6b4a2c" stroke-width="4" stroke-linecap="round"/>
<path d="M42 32 L58 32" stroke="#c9911a" stroke-width="3" stroke-linecap="round"/>
<path d="M36 62 C42 68 58 68 64 62" fill="none" stroke="#6b4a2c" stroke-width="1.6" opacity=".5"/>''')


def schat(p):
    return item(p, schaduw(50, 86, 30, 5) + f'''
<defs>{verloop(p + '-a', [[0, '#a8763c'], [1, '#6b4423']])}
{straal(p + '-b', [[0, '#fff3c4'], [1, '#c9911a']])}</defs>
<path d="M20 44 C20 32 34 26 50 26 C66 26 80 32 80 44 L80 50 L20 50 Z" fill="url(#{p}-a)"/>
<circle cx="36" cy="36" r="7" fill="url(#{p}-b)"/>
<circle cx="52" cy="33" r="8" fill="url(#{p}-b)"/>
<circle cx="66" cy="37" r="6" fill="url(#{p}-b)"/>
<rect x="18" y="50" width="64" height="30" rx="4" fill="url(#{p}-a)"/>
<rect x="18" y="50" width="64" height="7" fill="#c9911a" opacity=".85"/>
<rect x="44" y="52" width="12" height="14" rx="3" fill="url(#{p}-b)"/>
<circle cx="50" cy="59" r="2" fill="#6b4423"/>
<path d="M18 62 L82 62" stroke="#4a2c12" stroke-width="2" opacity=".5"/>''')


# ------------------------------------------------------------------ kisten

def kist(hout, extra, deksel=None):
    return (schaduw(50, 88, 30, 6) + f'''
<defs>{verloop(hout + '-a', [[0, '#c79a5e'], [1, '#8a5a25']])}
{verloop(hout + '-b', [[0, '#b98a4e'], [1, '#6b4423']])}</defs>
<rect x="16" y="46" width="68" height="40" rx="6" fill="url(#{hout}-a)"/>
<rect x="16" y="46" width="68" height="9" fill="url(#{hout}-b)"/>
<rect x="28" y="42" width="44" height="10" rx="4" fill="url(#{hout}-b)"/>
<path d="M26 56 L26 82 M74 56 L74 82 M50 52 L50 86" stroke="#5f3a1a" stroke-width="2.4" opacity=".45"/>
<rect x="16" y="70" width="68" height="6" fill="#5f3a1a" opacity=".25"/>''' + (deksel or "") + extra)


def kist_zaden(p):
    return item(p, kist(p, f'''
<path d="M50 42 L50 26" stroke="#3f8f4f" stroke-width="3.4" stroke-linecap="round"/>
<path d="M50 36 C40 34 34 26 34 20 C44 20 50 28 50 36 Z" fill="#5faa4f"/>
<path d="M50 32 C60 30 66 22 66 16 C56 16 50 24 50 32 Z" fill="#7bc47f"/>
<rect x="30" y="72" width="40" height="9" rx="3" fill="#c9911a" opacity=".8"/>'''))


def kist_deeg(p):
    return item(p, schaduw(50, 88, 28, 6) + f'''
<defs>{straal(p + '-a', [[0, '#ffffff'], [1, '#cfc4ae']])}
{verloop(p + '-b', [[0, '#f4dcae'], [1, '#c9a86a']])}</defs>
<ellipse cx="50" cy="46" rx="32" ry="12" fill="url(#{p}-b)"/>
<ellipse cx="50" cy="44" rx="27" ry="9" fill="#f7e6c4"/>
<path d="M18 48 C18 78 82 78 82 48 Z" fill="url(#{p}-a)"/>
<path d="M18 48 C26 56 74 56 82 48" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7"/>
<path d="M40 36 C46 30 56 30 62 36" fill="none" stroke="#c9a86a" stroke-width="3" opacity=".6"/>''')


def kist_bloem(p):
    return item(p, schaduw(50, 88, 26, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#e08a5a'], [1, '#a04a22']])}
{verloop(p + '-b', [[0, '#8fd07a'], [1, '#2f6b36']])}</defs>
<path d="M30 52 L30 40 L34 40 L34 52 Z" fill="url(#{p}-a)"/>
<ellipse cx="50" cy="40" rx="6" ry="4" fill="#5f3a1a"/>
<path d="M50 38 L50 26" stroke="#3f8f4f" stroke-width="3" stroke-linecap="round"/>
<path d="M50 30 C42 28 36 22 36 16 C44 16 50 22 50 30 Z" fill="url(#{p}-b)"/>
<path d="M50 26 C58 24 64 18 64 12 C56 12 50 18 50 26 Z" fill="#7bc47f"/>
<path d="M26 52 L74 52 L68 84 L32 84 Z" fill="url(#{p}-a)"/>
<rect x="24" y="48" width="52" height="9" rx="4" fill="#c5663a"/>''')


def kist_vuur(p):
    return item(p, schaduw(50, 88, 28, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#8d949e'], [1, '#4f5866']])}
{straal(p + '-b', [[0, '#fff3c4'], [0.5, '#ff9a3c'], [1, '#c2331a']])}</defs>
<path d="M22 80 L34 62 L72 62 L84 80 Z" fill="url(#{p}-a)"/>
<rect x="34" y="50" width="40" height="12" rx="4" fill="#6d7681"/>
<path d="M46 50 C40 44 44 36 50 30 C50 38 56 40 56 46 C60 42 60 38 58 34 C66 40 68 50 62 54 C58 58 46 58 46 50 Z" fill="url(#{p}-b)"/>
<circle cx="52" cy="66" r="6" fill="#ff9a3c" opacity=".75"/>
<path d="M30 74 L74 74" stroke="#3a414d" stroke-width="2" opacity=".5"/>''')


def kist_net(p):
    return item(p, schaduw(50, 88, 26, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#dfe8ef'], [1, '#9fb0bd']])}
{verloop(p + '-b', [[0, '#8fd6f0'], [1, '#1f5f8a']])}</defs>
<path d="M50 26 C68 34 78 50 76 64 C74 78 26 78 24 64 C22 50 32 34 50 26 Z" fill="url(#{p}-a)" opacity=".92"/>
{
      "".join(f'<path d="M{24 + i * 9} 34 C{30 + i * 9} 52 {30 + i * 9} 62 {26 + i * 9} 76" fill="none" stroke="#6d7d8a" stroke-width="1.6" opacity=".7"/>'
              for i in range(6))
}
<path d="M{24} 52 C40 60 60 60 76 52" fill="none" stroke="#6d7d8a" stroke-width="1.4" opacity=".6"/>
<path d="M46 20 C54 14 64 14 70 18" fill="none" stroke="#c9911a" stroke-width="3.4" stroke-linecap="round"/>
<path d="M56 62 C64 58 72 60 74 66 C68 70 60 68 56 62 Z" fill="url(#{p}-b)"/>''')


def kist_boek(p):
    return item(p, schaduw(50, 88, 28, 6) + f'''
<defs>{verloop(p + '-a', [[0, '#6a8fe0'], [1, '#2a3f8e']])}
{straal(p + '-b', [[0, '#fff6d0'], [1, '#e8b93c']])}</defs>
<path d="M22 30 C22 24 78 24 78 30 L78 78 C78 84 22 84 22 78 Z" fill="url(#{p}-a)"/>
<path d="M26 32 L26 78 M74 32 L74 78" stroke="#1d2c66" stroke-width="2" opacity=".6"/>
<path d="M36 40 C42 44 58 44 64 40 L64 74 C58 78 42 78 36 74 Z" fill="#fff6e8" opacity=".92"/>
<path d="M50 50 L54 58 L63 59 L56 65 L58 74 L50 69 L42 74 L44 65 L37 59 L46 58 Z" fill="url(#{p}-b)"/>
<path d="M30 34 C42 28 58 28 70 34" fill="none" stroke="#8fa9f0" stroke-width="3" opacity=".7"/>''')


def kist_geld(p):
    return item(p, kist(p, f'''
<rect x="30" y="66" width="40" height="9" rx="3" fill="#c9911a" opacity=".8"/>
<circle cx="50" cy="60" r="5" fill="#ffd75e"/>''',
                      deksel='<rect x="16" y="42" width="68" height="8" rx="4" fill="#8a5a25"/>'))


KISTEN = {
    "zadenkist": kist_zaden,
    "deegkom": kist_deeg,
    "bloempot": kist_bloem,
    "smidsvuur": kist_vuur,
    "visnet": kist_net,
    "toverboek": kist_boek,
    "geldkist": kist_geld,
}

KETENS = {
    "tuin": [zaadje, kiemplant, tomaat, salade, soep, feestmaal],
    "bakkerij": [koren, stokbrood, boerenbrood, croissants, taart, bruidstaart],
    "bloemen": [klavertje, tulp, zonnebloem, boeket, lotus, blossem],
    "smidse": [erts, spijker, hamer, zwaard, schild, trofee],
    "haven": [schelp, vis, inktvis, kreeft, walvis, zeedraak],
    "magie": [sterrenstof, kristal, toverdrank, toverstaf, tovenaar, sterrenkroon],
    "munt": [munt, buidel, schat],
}


# --------------------------------------------------------------- achtergrond

def achtergrond(kleuren, naam):
    """Een zacht geschilderd tafereel per gebied: lucht, heuvels, ondergrond."""
    p = "bg-" + naam
    verre, horizon, grond = kleuren[0], kleuren[1], kleuren[2]
    zicht = []
    # Heuvels op de achtergrond
    zicht.append(f'<path d="M0 300 C160 250 300 296 480 250 C620 214 720 262 800 240 L800 400 L0 400 Z" fill="{horizon}" opacity=".55"/>')
    zicht.append(f'<path d="M0 330 C120 292 260 340 420 306 C560 276 700 320 800 300 L800 400 L0 400 Z" fill="{horizon}" opacity=".8"/>')
    # Huizen/gebouwen als silhouet
    for x, w, h in [(60, 54, 70), (130, 40, 52), (620, 60, 78), (700, 46, 58)]:
        zicht.append(f'<rect x="{x}" y="{300 - h}" width="{w}" height="{h}" fill="{verre}" opacity=".5" rx="4"/>')
        zicht.append(f'<path d="M{x - 6} {300 - h} L{x + w / 2} {300 - h - 22} L{x + w + 6} {300 - h} Z" fill="{verre}" opacity=".65"/>')
    zicht.append(f'<rect x="0" y="300" width="800" height="100" fill="{grond}"/>')
    return ('<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" '
            'xmlns="http://www.w3.org/2000/svg" class="lucht">'
            f'<defs>{verloop(p, [[0, kleuren[3]], [1, kleuren[0]]])}</defs>'
            f'<rect width="800" height="400" fill="url(#{p})"/>'
            + "".join(zicht) + '</svg>')


GEBIEDEN = {
    "dorp": (["#cfe6c4", "#8fbf82", "#4f7a4a", "#f2f7e8"], "dorp"),
    "bakkerij": (["#f3dcae", "#d9b072", "#8a5a25", "#fdf4e2"], "bakkerij"),
    "bloemen": (["#f7d6e6", "#e897bb", "#8e3a63", "#fdf1f6"], "bloemen"),
    "smidse": (["#cfd6e0", "#8d97a8", "#3f4756", "#eef1f5"], "smidse"),
    "haven": (["#cfe9f5", "#7bb8d6", "#1f5f8a", "#eef7fc"], "haven"),
    "sterrenkeuken": (["#ddd0f5", "#a97fe0", "#4a2c7a", "#f6f0ff"], "sterrenkeuken"),
}


def bundel():
    """Alle kunst als één JS-bestand."""
    stukken = ["/* Gegenereerd door tools/gen_art.py - niet met de hand aanpassen. */",
               "window.SmakenlandArt = (function () {",
               "  var art = { ketens: {}, kisten: {}, gebieden: {} };"]
    for keten, functies in KETENS.items():
        stukken.append(f'  art.ketens["{keten}"] = [')
        for i, f in enumerate(functies):
            stukken.append(f'    {js_tekst(f(f"{keten}{i + 1}"))},')
        stukken.append("  ];")
    for naam, f in KISTEN.items():
        stukken.append(f'  art.kisten["{naam}"] = {js_tekst(f("kist-" + naam))};')
    for naam, (kleuren, p) in GEBIEDEN.items():
        stukken.append(f'  art.gebieden["{naam}"] = {js_tekst(achtergrond(kleuren, p))};')
    stukken.append("  return art;")
    stukken.append("})();")
    return "\n".join(stukken) + "\n"


def js_tekst(svg):
    """SVG als JS-string, netjes op één regel en zonder ongewenste tekens."""
    plat = re.sub(r"\s+", " ", svg).strip()
    plat = plat.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + plat + '"'


def tel():
    return (sum(len(v) for v in KETENS.values()), len(KISTEN), len(GEBIEDEN))


def main():
    nieuwe = bundel()
    items, kisten, gebieden = tel()
    print(f"kunst: {items} items, {kisten} kisten, {gebieden} gebiedsachtergronden, "
          f"{len(nieuwe)} bytes")
    if "--check" in sys.argv:
        if not os.path.exists(DOEL):
            print("FOUT: art.js ontbreekt")
            return 1
        bestaand = open(DOEL, encoding="utf-8").read()
        if bestaand != nieuwe:
            print("FOUT: art.js loopt uit de pas met tools/gen_art.py; draai het script opnieuw")
            return 1
        print(f"ok: art.js komt overeen (sha256 {hashlib.sha256(nieuwe.encode()).hexdigest()[:12]})")
        return 0
    with open(DOEL, "w", encoding="utf-8") as f:
        f.write(nieuwe)
    print(f"geschreven: {DOEL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
