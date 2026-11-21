#!/usr/bin/env python3
"""Maakt de 300 levels van Smakenland en schrijft ze naar levels.js.

Elk level is een opdracht: lever zoveel items van die tree. Het energietegoed van
een level wordt BEREKEND uit de doelen (niet gegokt): een item van tree T maken
kost 3^(T-kistniveau) oogsten van kistniveau `kistniveau`, elk één energie. Daar
komt een kwart speling bij, zodat een level haalbaar is maar niet gratis.

Gebruik:  python3 tools/gen_levels.py [--check]
--check rekent alle 300 levels na tegen het bestaande levels.js zonder te schrijven.
"""
import json
import math
import os
import random
import re
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WORTEL = os.path.dirname(HIER)
DOEL = os.path.join(WORTEL, "levels.js")

KIST_VAN = {
    "tuin": "zadenkist",
    "bakkerij": "deegkom",
    "bloemen": "bloempot",
    "smidse": "smidsvuur",
    "haven": "visnet",
    "magie": "toverboek",
}

MAX_TIER = {"tuin": 6, "bakkerij": 6, "bloemen": 6, "smidse": 6, "haven": 6, "magie": 6}

# Twaalf hoofdstukken van 25 levels. Elk hoofdstuk opent andere ketens.
HOOFDSTUKKEN = [
    {"naam": "Smakendorp", "ketens": ["tuin"], "e": "🏘️"},
    {"naam": "Bakkerslaan", "ketens": ["tuin", "bakkerij"], "e": "🥖"},
    {"naam": "Bloemenmarkt", "ketens": ["bakkerij", "bloemen"], "e": "🌷"},
    {"naam": "Kruidenhof", "ketens": ["tuin", "bloemen"], "e": "🌿"},
    {"naam": "Smidsebrand", "ketens": ["smidse", "tuin"], "e": "⚒️"},
    {"naam": "Wapenzaal", "ketens": ["smidse", "bakkerij"], "e": "🛡️"},
    {"naam": "Zoute Haven", "ketens": ["haven", "bakkerij"], "e": "⛵"},
    {"naam": "Vismarkt", "ketens": ["haven", "tuin"], "e": "🐟"},
    {"naam": "Sterrenkeuken", "ketens": ["magie", "bloemen"], "e": "✨"},
    {"naam": "Toverkamer", "ketens": ["magie", "smidse"], "e": "🔮"},
    {"naam": "Wolkenmarkt", "ketens": ["magie", "haven"], "e": "☁️"},
    {"naam": "Gouden Tafel", "ketens": ["tuin", "bakkerij", "haven", "magie"], "e": "👑"},
]

LEVELS_PER_HFST = 25
TOTAAL = len(HOOFDSTUKKEN) * LEVELS_PER_HFST

SPELING = 1.25     # een kwart extra energie bovenop wat strikt nodig is
MIN_ENERGIE = 24
MAX_ENERGIE = 150


def kistniveau(tier):
    """Hoe hoger de gevraagde tree, hoe beter de kist moet zijn."""
    return max(1, min(3, tier - 2))


def vraag_energie(doelen, kisten):
    """Energie die strikt nodig is: per keten de oogsten van kistniveau tellen."""
    per_keten = {}
    for doel in doelen:
        per_keten.setdefault(doel["keten"], []).append(doel)
    totaal = 0
    for keten, doelen_van_keten in per_keten.items():
        niveau = min(k["level"] for k in kisten if k["keten"] == keten)
        nodig = 0
        for doel in doelen_van_keten:
            sprongen = doel["tier"] - niveau
            if sprongen < 0:
                raise ValueError(f"doel tree {doel['tier']} onder kistniveau {niveau}")
            eenheden = doel["aantal"] * (3 ** sprongen)
            # Wat er al op het bord ligt, gaat er af (in eenheden van kistniveau).
            voorraad = 0
            for stuk in doel.get("start", []):
                if stuk["keten"] == keten and stuk["tier"] >= niveau:
                    voorraad += stuk["aantal"] * (3 ** (stuk["tier"] - niveau))
            nodig += max(0, eenheden - voorraad)
        totaal += niveau * nodig
    return totaal


def maak_level(nr, doelen, heeft):
    """Bouwt één level: kisten, startstukken, energietegoed en beloning."""
    ketens = sorted({d["keten"] for d in doelen})
    kisten = []
    for keten in ketens:
        niveau = max(kistniveau(d["tier"]) for d in doelen if d["keten"] == keten)
        kisten.append({"keten": keten, "gen": KIST_VAN[keten], "level": niveau})

    # Startstukken liggen ALTIJD een tree onder het laagste doel van die keten:
    # hoger zou het doel gratis weggeven, gelijk zou de speler zijn doelstukken
    # per ongeluk kunnen versmelten, en bij een doel van tree 1 kan er niets onder.
    start = []
    for keten in ketens:
        laagste = min(d["tier"] for d in doelen if d["keten"] == keten)
        if laagste >= 2:
            start.append({"keten": keten, "tier": laagste - 1, "aantal": 2})

    doelen_volledig = []
    for doel in doelen:
        stuk = dict(doel)
        stuk["start"] = [s for s in start if s["keten"] == doel["keten"]]
        doelen_volledig.append(stuk)

    nodig = vraag_energie(doelen_volledig, kisten)
    energie = int(min(MAX_ENERGIE, max(MIN_ENERGIE, math.ceil(nodig * SPELING) + 6)))

    munten = 20 + 6 * max(d["tier"] for d in doelen) * len(doelen)
    return {
        "nr": nr,
        "hfst": (nr - 1) // LEVELS_PER_HFST,
        "kisten": kisten,
        "start": start,
        "energie": energie,
        "doelen": [{"keten": d["keten"], "tier": d["tier"], "aantal": d["aantal"]} for d in doelen],
        "munten": munten,
        "nodig": nodig,
        "heeft": heeft,
    }


def bouw():
    levels = []
    rng = random.Random(20261121)
    for nr in range(1, TOTAAL + 1):
        hfst = (nr - 1) // LEVELS_PER_HFST
        li = (nr - 1) % LEVELS_PER_HFST
        ketens = HOOFDSTUKKEN[hfst]["ketens"]

        # Moeilijkheid binnen een hoofdstuk: de hoogste tree loopt op van 1 naar 5,
        # en het aantal doelen van 1 naar 3. Elk volgend doel vraagt een tree lager,
        # zodat een level nooit drie keer dezelfde opdracht is.
        top = min(5, 1 + li // 5)
        aantal_doelen = 1 + min(2, li // 10)
        gekozen = rng.sample(ketens, min(aantal_doelen, len(ketens)))
        while len(gekozen) < aantal_doelen:          # kleine hoofdstukken opvullen
            gekozen.append(rng.choice(ketens))

        doelen = []
        gebruikt = set()
        for i, keten in enumerate(gekozen):
            t = max(1, min(top - i, MAX_TIER[keten]))
            # Nooit meer dan twee exemplaren: bij drie zouden ze zelf versmelten
            # voordat de speler ze kan inleveren.
            aantal = 1
            if t == 1 and (li + hfst) % 3 == 0:
                aantal = 2
            elif t == 2 and (li + hfst) % 4 == 0:
                aantal = 2
            elif t == 3 and li >= 20:
                aantal = 2
            sleutel = (keten, t)
            if sleutel in gebruikt:
                continue
            gebruikt.add(sleutel)
            doelen.append({"keten": keten, "tier": t, "aantal": aantal})
        if not doelen:                                # altijd minstens één doel
            doelen.append({"keten": ketens[0], "tier": top, "aantal": 1})

        levels.append(maak_level(nr, doelen, heeft=True))
    return levels


# ------------------------------------------------------------------ controle

def simuleer(level):
    """Narekening: kan dit level met dit energietegoed gehaald worden?

    We rekenen met dezelfde regel als het spel: 3 items van tree t worden 1 item
    van tree t+1, oogsten uit een kist van niveau n kost n energie.
    """
    kisten = {k["keten"]: k["level"] for k in level["kisten"]}
    voorraad = {}
    for stuk in level["start"]:
        voorraad[stuk["keten"]] = voorraad.get(stuk["keten"], 0) + stuk["aantal"] * (3 ** (stuk["tier"] - 1))
    energie = level["energie"]
    for doel in level["doelen"]:
        keten = doel["keten"]
        if keten not in kisten:
            return False, f"level {level['nr']}: geen kist voor {keten}"
        niveau = kisten[keten]
        if doel["tier"] > MAX_TIER[keten]:
            return False, f"level {level['nr']}: tree {doel['tier']} bestaat niet voor {keten}"
        # Alles teruggerekend naar tree-1-waarde: 3 items van tree t zijn samen
        # één item van tree t+1, dus een item van tree t is 3^(t-1) waard.
        waarde_nodig = doel["aantal"] * (3 ** (doel["tier"] - 1))
        waarde_heb = voorraad.get(keten, 0)
        tekort = max(0, waarde_nodig - waarde_heb)
        voorraad[keten] = max(0, waarde_heb - waarde_nodig)
        if tekort:
            if niveau > doel["tier"]:
                return False, f"level {level['nr']}: kist hoger dan het doel"
            oogsten = math.ceil(tekort / (3 ** (niveau - 1)))
            kosten = niveau * oogsten
            if kosten > energie:
                return False, f"level {level['nr']}: {kosten} energie nodig, {energie} tegoed"
            energie -= kosten
    return True, ""


def bundel(levels):
    uit = ["/* Gegenereerd door tools/gen_levels.py - niet met de hand aanpassen. */",
           "(function (root) {",
           "  'use strict';",
           "  var levels = {",
           "    niveauPerHoofdstuk: %d," % LEVELS_PER_HFST,
           "    hoofdstukken: ["]
    for h in HOOFDSTUKKEN:
        uit.append('      {naam: %s, e: %s, ketens: %s},'
                   % (json.dumps(h["naam"], ensure_ascii=False),
                      json.dumps(h["e"], ensure_ascii=False),
                      json.dumps(h["ketens"])))
    uit.append("    ],")
    uit.append("    levels: [")
    for lv in levels:
        uit.append("      " + json.dumps({
            "nr": lv["nr"], "hfst": lv["hfst"], "kisten": lv["kisten"], "start": lv["start"],
            "energie": lv["energie"], "munten": lv["munten"],
            "doelen": lv["doelen"],
        }, ensure_ascii=False, separators=(",", ":")) + ",")
    uit.append("    ]")
    uit.append("  };")
    uit.append("  root.SmakenlandLevels = levels;")
    uit.append("  if (typeof module !== 'undefined' && module.exports) module.exports = levels;")
    uit.append("})(typeof globalThis !== 'undefined' ? globalThis : this);")
    return "\n".join(uit) + "\n"


def main():
    levels = bouw()
    tekst = bundel(levels)
    problemen = []
    for lv in levels:
        goed, waarom = simuleer(lv)
        if not goed:
            problemen.append(waarom)
    tiers = {}
    for lv in levels:
        for d in lv["doelen"]:
            tiers[d["tier"]] = tiers.get(d["tier"], 0) + 1
    print(f"{len(levels)} levels, {len(HOOFDSTUKKEN)} hoofdstukken, {len(tekst)} bytes")
    print("doelen per tree:", dict(sorted(tiers.items())))
    print("energie: min %d, gemiddeld %.0f, max %d" % (
        min(l["energie"] for l in levels),
        sum(l["energie"] for l in levels) / len(levels),
        max(l["energie"] for l in levels)))
    if problemen:
        print("ONHAALBARE LEVELS:")
        for p in problemen[:10]:
            print(" ", p)
        return 1
    print("alle 300 levels zijn met het meegeleverde energietegoed te halen")

    if "--check" in sys.argv:
        if not os.path.exists(DOEL):
            print("FOUT: levels.js ontbreekt")
            return 1
        bestaand = open(DOEL, encoding="utf-8").read()
        if bestaand != tekst:
            print("FOUT: levels.js loopt uit de pas met tools/gen_levels.py; draai het script opnieuw")
            return 1
        print("ok: levels.js komt overeen")
        return 0

    with open(DOEL, "w", encoding="utf-8") as f:
        f.write(tekst)
    print("geschreven:", DOEL)
    return 0


if __name__ == "__main__":
    sys.exit(main())
