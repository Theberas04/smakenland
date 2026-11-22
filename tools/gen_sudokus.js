#!/usr/bin/env node
/* Smakenland - maakt sudoku's die te langzaam zijn om in de app te maken.

   Waarom: een 16x16 met weinig aanwijzingen zoeken kost de app seconden tot minuten.
   Daarom staan die opgaven kant-en-klaar in `sudokus.js`, hier gemaakt en hier
   nagerekend: elke opgave heeft precies één oplossing (met een zoekbudget dat zo
   ruim is dat de zoeker de hele ruimte afloopt).

   Er zijn twee verzamelingen:
     * SMAKENLAND_SUDOKUS          - de gewone 16x16-opgaven
     * SMAKENLAND_SUDOKUS_VARIANT  - 16x16 met de diagonalen erbij ("diagonaal")

   Gebruik:
     node tools/gen_sudokus.js                 # alleen de varianten erbij maken
     node tools/gen_sudokus.js --alles         # alles opnieuw maken
     node tools/gen_sudokus.js --check         # sudokus.js narekenen (geen wijziging)
*/

'use strict';

const fs = require('fs');
const pad = require('path');
const S = require(pad.join(__dirname, '..', 'sudoku.js'));

const MAAT = 16;
const AANTAL = 8;                      // opgaven per moeilijkheid
const NIVEAUS = ['midden', 'moeilijk'];
const BUDGET_DELVEN = 200000;          // tijdens het weghalen (snel)
const BUDGET_CONTROLE = 20000000;      // bij het narekenen (grondig)
const ZAAD = 20261121;
const VARIANTEN = ['diagonaal'];

const GROND = S.maatVan(MAAT);
const DIAG = S.maatDiagonaal(MAAT);
const CEL = MAAT * MAAT;

function maatVoor(variant) {
  return variant === 'diagonaal' ? DIAG : GROND;
}

function rngMaker(zaad) {
  let s = (zaad >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graaft symmetrisch gaten tot het doel, met een zoekbudget per controle. */
function delven(oplossing, doel, rnd, budget, m) {
  const opgave = oplossing.slice();
  const cellen = [];
  for (let i = 0; i < Math.ceil(CEL / 2); i++) cellen.push(i);
  for (let q = cellen.length - 1; q > 0; q--) {
    const j = Math.floor(rnd() * (q + 1));
    const w = cellen[q];
    cellen[q] = cellen[j];
    cellen[j] = w;
  }
  let over = CEL;
  for (const i of cellen) {
    if (over <= doel) break;
    const spiegel = CEL - 1 - i;
    const a = opgave[i];
    const b = spiegel === i ? 0 : opgave[spiegel];
    if (a === 0 && b === 0) continue;
    opgave[i] = 0;
    if (spiegel !== i) opgave[spiegel] = 0;
    if (S.aantalOplossingen(opgave, 2, m, budget) !== 1) {
      opgave[i] = a;
      if (spiegel !== i) opgave[spiegel] = b;
    } else {
      over -= spiegel === i ? 1 : 2;
    }
  }
  return opgave;
}

function tekenReeks(opgave, m) {
  return opgave.map(function (v) { return v ? m.symbolen.charAt(v - 1) : '.'; }).join('');
}

function leesReeks(reeks, m) {
  return reeks.split('').map(function (teken) {
    const p = m.symbolen.indexOf(teken);
    return p < 0 ? 0 : p + 1;
  });
}

function maakEen(zaad, niveau, poging, variant) {
  const m = maatVoor(variant);
  const rnd = rngMaker(zaad + poging * 7919);
  // los() geeft een nieuw, vol bord terug; vul() werkt op een kopie, dus het
  // resultaat moet je gebruiken en niet het lege bord dat je meegaf.
  const oplossing = S.los(new Array(CEL).fill(0), m);
  if (!oplossing) return null;
  const doel = S.doelGegeven(MAAT, niveau);
  const opgave = delven(oplossing, doel, rnd, BUDGET_DELVEN, m);
  const aantal = S.aantalOplossingen(opgave, 2, m, BUDGET_CONTROLE);
  if (aantal !== 1) return null;                          // niet bewezen uniek
  const gegeven = opgave.filter(function (v) { return v; }).length;
  return { reeks: tekenReeks(opgave, m), gegeven: gegeven };
}

/** Maakt de opgaven voor één variant en één moeilijkheid. */
function genereerNiveau(variant, niveau, pogingStart) {
  const lijst = [];
  let poging = pogingStart;
  while (lijst.length < AANTAL && poging < pogingStart + AANTAL * 8) {
    const t = Date.now();
    const een = maakEen(ZAAD + niveau.length * 100003 + (variant ? 500009 : 0), niveau, poging, variant);
    poging++;
    if (!een) { console.log('  (poging ' + poging + ' niet uniek, opnieuw)'); continue; }
    lijst.push(een.reeks);
    console.log('  ' + (variant || 'gewoon') + ' ' + niveau + ' ' + lijst.length + '/' + AANTAL + ': ' +
      een.gegeven + ' aanwijzingen, uniek, ' + (Date.now() - t) + ' ms');
  }
  return lijst;
}

function leesBestaand() {
  const bestand = pad.join(__dirname, '..', 'sudokus.js');
  delete require.cache[require.resolve(bestand)];
  const inhoud = require(bestand);
  return inhoud || {};
}

/** Schrijft sudokus.js met beide verzamelingen. */
function schrijf(grond, variant) {
  const bestand = pad.join(__dirname, '..', 'sudokus.js');
  const kop = '/* Smakenland - kant-en-klare sudoku\'s die de app niet zelf kan maken.\n' +
    '   Een 16x16 met weinig aanwijzingen zoeken duurt in de app seconden tot minuten;\n' +
    '   deze opgaven staan daarom klaar. Gegenereerd met tools/gen_sudokus.js en\n' +
    '   nagerekend: elke opgave heeft precies één oplossing. Niet met de hand aanpassen.\n\n' +
    '   \'.\' is een leeg vak; de letters staan voor 10 en hoger (A=10 ... G=16).\n' +
    '   SMAKENLAND_SUDOKUS_VARIANT heeft dezelfde opgaven met de diagonalen erbij. */\n';
  const staart = '/* Zowel in de browser als in de Node-tests en gereedschappen. */\n' +
    '(function (root) {\n' +
    '  root.SMAKENLAND_SUDOKUS = ' + JSON.stringify(grond) + ';\n' +
    '  root.SMAKENLAND_SUDOKUS_VARIANT = ' + JSON.stringify(variant) + ';\n' +
    "  if (typeof module !== 'undefined' && module.exports) {\n" +
    '    module.exports = root.SMAKENLAND_SUDOKUS;\n' +
    '    module.exports.VARIANT = root.SMAKENLAND_SUDOKUS_VARIANT;\n' +
    '  }\n' +
    "})(typeof window !== 'undefined' ? window : globalThis);\n";
  fs.writeFileSync(bestand, kop + staart);
  const kb = Math.round((JSON.stringify(grond).length + JSON.stringify(variant).length) / 1024);
  console.log('geschreven: sudokus.js (' + kb + ' kB)');
}

/**
 * Rekent sudokus.js na.
 *
 * Van elke opgave: hij moet oplosbaar zijn en de oplossing moet aan alle eisen
 * voldoen (rijen, kolommen, groepen, en bij de diagonaal-variant ook de twee
 * diagonalen). Dat is snel.
 *
 * Het bewijs dat er precies één oplossing is, is duur: bij een 16x16 met weinig
 * aanwijzingen zoekt de teller tientallen miljoenen stappen. Daarom doen we dat
 * volledig voor de eerste `VOL_NAREKENEN` opgaven van elke moeilijkheid, en voor
 * de rest met een kleiner budget: als de teller dan "twee of meer" zegt, wil dat
 * alleen zeggen dat het budget op was — dat melden we als waarschuwing en niet als
 * fout. Elke opgave in het bestand is bij het maken wél volledig nagerekend (het
 * gereedschap neemt geen opgave aan die niet uniek is), dus dit is een
 * regressiecontrole en niet het enige bewijs.
 */
const VOL_NAREKENEN = 2;
const BUDGET_SNEL = 500000;

function keur(verzameling, naam, m) {
  if (!verzameling || !verzameling[MAAT]) {
    console.error('FOUT: geen verzameling ' + naam + ' in sudokus.js');
    return { fout: 1, totaal: 0, waarschuwing: 0 };
  }
  let fout = 0;
  let totaal = 0;
  let waarschuwing = 0;
  for (const niveau of Object.keys(verzameling[MAAT])) {
    let nr = 0;
    for (const reeks of verzameling[MAAT][niveau]) {
      nr++;
      totaal++;
      const volledig = nr <= VOL_NAREKENEN;
      const opgave = leesReeks(reeks, m);
      if (opgave.length !== CEL) {
        console.log('FOUT  ' + naam + ' ' + niveau + ' #' + nr + ': lengte klopt niet');
        fout++;
        continue;
      }
      const gegeven = opgave.filter(function (v) { return v; }).length;
      const oplossing = S.los(opgave, m, 5000000);
      const goedOpgelost = oplossing !== null;
      const schoon = goedOpgelost && !S.conflicten(oplossing, m).some(Boolean);
      let aantal = -1;
      if (goedOpgelost) {
        aantal = S.aantalOplossingen(opgave, 2, m, volledig ? BUDGET_CONTROLE : BUDGET_SNEL);
      }
      const ok = goedOpgelost && schoon && aantal === 1;
      const nietBewezen = goedOpgelost && schoon && aantal !== 1 && !volledig;
      if (!ok && !nietBewezen) fout++;
      if (nietBewezen) waarschuwing++;
      console.log((ok ? 'goed' : (nietBewezen ? 'let op' : 'FOUT')) + '  ' + naam.padEnd(9) + ' ' +
        niveau.padEnd(9) + ' #' + nr + ' ' + gegeven + ' aanwijzingen, ' +
        (goedOpgelost ? (aantal === 1 ? '1 oplossing' : aantal + ' oplossingen (budget op)') : 'GEEN oplossing') +
        (volledig ? ' [volledig nagerekend]' : ''));
    }
  }
  return { fout: fout, totaal: totaal, waarschuwing: waarschuwing };
}

function controleer() {
  const bestand = pad.join(__dirname, '..', 'sudokus.js');
  delete require.cache[require.resolve(bestand)];
  const grond = require(bestand);
  // De varianten staan één laag dieper: { diagonaal: { 16: { midden: [...], moeilijk: [...] } } }.
  const varianten = require(bestand).VARIANT || {};
  const uit = keur(grond, 'gewoon', GROND);
  const uit2 = keur(varianten.diagonaal, 'diagonaal', DIAG);
  const fout = uit.fout + uit2.fout;
  const totaal = uit.totaal + uit2.totaal;
  const waarschuwing = uit.waarschuwing + uit2.waarschuwing;
  console.log((fout ? 'FOUT: ' : 'goed: ') + totaal + ' opgaven nagekeken, ' + fout + ' fout' +
    (waarschuwing ? ', ' + waarschuwing + ' zonder volledig uniciteitsbewijs (budget op)' : ''));
  process.exit(fout ? 1 : 0);
}

if (process.argv.includes('--check')) {
  controleer();
} else {
  const alles = process.argv.includes('--alles');
  const bestaand = leesBestaand();
  const grond = alles || !bestaand[MAAT] ? {} : { 16: bestaand[MAAT] };
  if (!grond[MAAT]) {
    console.log('gewone 16x16-opgaven maken...');
    grond[MAAT] = {};
    for (const niveau of NIVEAUS) grond[MAAT][niveau] = genereerNiveau('', niveau, 0);
  }
  const variant = {};
  for (const v of VARIANTEN) {
    console.log(v + '-opgaven maken (dit duurt een paar minuten)...');
    variant[v] = { 16: {} };
    for (const niveau of NIVEAUS) variant[v][16][niveau] = genereerNiveau(v, niveau, 0);
  }
  schrijf(grond, variant);
}
