#!/usr/bin/env node
/* Smakenland - maakt sudoku's die te langzaam zijn om in de app te maken.

   Waarom: een 16x16 met weinig aanwijzingen zoeken kost de app seconden tot minuten.
   Daarom staan die opgaven kant-en-klaar in `sudokus.js`, hier gemaakt en hier
   nagerekend: elke opgave heeft precies één oplossing (met een zoekbudget dat zo
   ruim is dat de zoeker de hele ruimte afloopt).

   Gebruik:
     node tools/gen_sudokus.js            # schrijft sudokus.js
     node tools/gen_sudokus.js --check     # rekent sudokus.js na (geen wijziging)
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

const m = S.maatVan(MAAT);
const CEL = MAAT * MAAT;

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
function delven(oplossing, doel, rnd, budget) {
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

function tekenReeks(opgave) {
  return opgave.map(function (v) { return v ? m.symbolen.charAt(v - 1) : '.'; }).join('');
}

function leesReeks(reeks) {
  return reeks.split('').map(function (teken) {
    const p = m.symbolen.indexOf(teken);
    return p < 0 ? 0 : p + 1;
  });
}

function maakEen(zaad, niveau, poging) {
  const rnd = rngMaker(zaad + poging * 7919);
  // los() geeft een nieuw, vol bord terug; vul() werkt op een kopie, dus het
  // resultaat moet je gebruiken en niet het lege bord dat je meegaf.
  const oplossing = S.los(new Array(CEL).fill(0), m);
  if (!oplossing) return null;
  const doel = S.doelGegeven(MAAT, niveau);
  const opgave = delven(oplossing, doel, rnd, BUDGET_DELVEN);
  const aantal = S.aantalOplossingen(opgave, 2, m, BUDGET_CONTROLE);
  if (aantal !== 1) return null;                          // niet bewezen uniek
  const gegeven = opgave.filter(function (v) { return v; }).length;
  return { reeks: tekenReeks(opgave), gegeven: gegeven };
}

function genereer() {
  const uit = {};
  for (const niveau of NIVEAUS) {
    const lijst = [];
    let poging = 0;
    while (lijst.length < AANTAL && poging < AANTAL * 6) {
      const t = Date.now();
      const een = maakEen(ZAAD + niveau.length * 100003, niveau, poging);
      poging++;
      if (!een) { console.log('  (poging ' + poging + ' niet uniek, opnieuw)'); continue; }
      lijst.push(een.reeks);
      console.log('  ' + niveau + ' ' + lijst.length + '/' + AANTAL + ': ' + een.gegeven +
        ' aanwijzingen, uniek, ' + (Date.now() - t) + ' ms');
    }
    uit[niveau] = lijst;
  }
  return uit;
}

function schrijf(uit) {
  const bestand = pad.join(__dirname, '..', 'sudokus.js');
  const kop = '/* Smakenland - kant-en-klare sudoku\'s die de app niet zelf kan maken.\n' +
    '   Een 16x16 met weinig aanwijzingen zoeken duurt in de app seconden tot minuten;\n' +
    '   deze opgaven staan daarom klaar. Gegenereerd met tools/gen_sudokus.js en\n' +
    '   nagerekend: elke opgave heeft precies één oplossing. Niet met de hand aanpassen.\n\n' +
    '   \'.\' is een leeg vak; de letters staan voor 10 en hoger (A=10 ... G=16). */\n';
  const inhoud = JSON.stringify(uit);
  const staart = '/* Zowel in de browser als in Node (voor de tests en de gereedschappen). */\n' +
    '(function (root) {\n' +
    '  root.SMAKENLAND_SUDOKUS = ' + inhoud + ';\n' +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = root.SMAKENLAND_SUDOKUS;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n";
  fs.writeFileSync(bestand, kop + staart);
  console.log('geschreven: sudokus.js (' + Math.round(inhoud.length / 1024) + ' kB, ' +
    Object.keys(uit).map(function (k) { return uit[k].length + ' × ' + k; }).join(', ') + ')');
}

function controleer() {
  const bestand = pad.join(__dirname, '..', 'sudokus.js');
  // eslint-disable-next-line global-require
  require(bestand.replace(/\.js$/, '.js'));
  const verzameling = global.SMAKENLAND_SUDOKUS;
  if (!verzameling || !verzameling[MAAT]) { console.error('FOUT: geen verzameling in sudokus.js'); process.exit(1); }
  let fout = 0;
  let totaal = 0;
  for (const niveau of Object.keys(verzameling[MAAT])) {
    for (const reeks of verzameling[MAAT][niveau]) {
      totaal++;
      const opgave = leesReeks(reeks);
      const gegeven = opgave.filter(function (v) { return v; }).length;
      const aantal = S.aantalOplossingen(opgave, 2, m, BUDGET_CONTROLE);
      const oplossing = S.los(opgave, m);
      const ok = aantal === 1 && oplossing !== null;
      if (!ok) fout++;
      console.log((ok ? 'goed' : 'FOUT') + '  ' + niveau.padEnd(9) + ' ' + gegeven + ' aanwijzingen, ' +
        aantal + ' oplossing(en)');
    }
  }
  console.log((fout ? 'FOUT: ' : 'goed: ') + totaal + ' opgaven nagekeken, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

if (process.argv.includes('--check')) {
  controleer();
} else {
  console.log('16x16-opgaven maken (dit duurt een paar minuten)...');
  const uit = genereer();
  schrijf({ 16: uit });
}
