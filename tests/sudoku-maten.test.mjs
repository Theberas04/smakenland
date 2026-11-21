/* Sudoku in vijf maten: 4x4, 6x6, 9x9, 12x12 en 16x16.

   Wat hier bewaakt wordt: elke maat levert een geldige en unieke opgave, de
   blokken kloppen (2x2, 2x3, 3x3, 3x4, 4x4), de letters komen er vanaf 10,
   en de zware 16x16-opgaven komen kant-en-klaar uit sudokus.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../sudoku.js');
require('../sudokus.js');                 // zet SMAKENLAND_SUDOKUS klaar

const MATEN = [4, 6, 9, 12, 16];

/** Loopt de oplossing alle rijen, kolommen en blokken langs. */
function oplossingKlopt(oplossing, maat) {
  const n = maat.n;
  const heleRij = Array.from({ length: n }, (_, i) => i + 1);
  for (let r = 0; r < n; r++) {
    const rij = [];
    for (let k = 0; k < n; k++) rij.push(oplossing[r * n + k]);
    if (rij.slice().sort((a, b) => a - b).join(',') !== heleRij.join(',')) return 'rij ' + r;
  }
  for (let k = 0; k < n; k++) {
    const kolom = [];
    for (let r = 0; r < n; r++) kolom.push(oplossing[r * n + k]);
    if (new Set(kolom).size !== n) return 'kolom ' + k;
  }
  const blokken = new Map();
  for (let i = 0; i < n * n; i++) {
    const b = S.blok(i, maat);
    if (!blokken.has(b)) blokken.set(b, []);
    blokken.get(b).push(oplossing[i]);
  }
  if (blokken.size !== n) return 'aantal blokken ' + blokken.size;
  for (const [b, vakken] of blokken) {
    if (vakken.length !== n || new Set(vakken).size !== n) return 'blok ' + b;
  }
  return null;
}

test('de maten staan goed beschreven', () => {
  assert.deepEqual(Object.keys(S.MATEN).map(Number).sort((a, b) => a - b), MATEN);
  for (const n of MATEN) {
    const m = S.maatVan(n);
    assert.equal(m.n, n);
    assert.equal(m.br * m.bk, n, 'de blokken vullen de maat');
    assert.equal(m.symbolen.length, n, 'evenveel tekens als waarden');
  }
  assert.equal(S.maatVan(4).br, 2);
  assert.equal(S.maatVan(6).bk, 3);
  assert.equal(S.maatVan(12).bk, 4);
  assert.equal(S.maatVan(16).br, 4);
  assert.equal(S.maatVan(7).n, 9, 'een onbekende maat valt terug op 9');
});

test('elke maat levert een geldige oplossing en een unieke opgave', () => {
  for (const n of MATEN) {
    for (const niveau of ['makkelijk', 'midden', 'moeilijk']) {
      // De 16x16 met veel lege vakken is in de app te langzaam om te maken en komt
      // kant-en-klaar uit sudokus.js; hier toetsen we alleen wat de app zelf maakt.
      if (n === 16 && niveau !== 'makkelijk') continue;
      const t = Date.now();
      const p = S.maak(31337, niveau, n);
      const m = S.maatVan(n);
      assert.equal(p.opgave.length, n * n, 'de opgave heeft n² vakken');
      assert.equal(p.oplossing.length, n * n);
      assert.equal(oplossingKlopt(p.oplossing, m), null, `${n}x${n} ${niveau}: oplossing klopt`);
      for (let i = 0; i < n * n; i++) {
        if (p.gegeven[i]) assert.equal(p.opgave[i], p.oplossing[i], 'een aanwijzing is altijd goed');
      }
      assert.equal(S.aantalOplossingen(p.opgave, 2, m, 20000000), 1,
        `${n}x${n} ${niveau} moet precies één oplossing hebben`);
      assert.ok(Date.now() - t < 4000, `${n}x${n} ${niveau} hoort vlot te maken`);
    }
  }
});

test('meer vakken betekent ook meer aanwijzingen', () => {
  assert.ok(S.doelGegeven(4, 'midden') < S.doelGegeven(9, 'midden'));
  assert.ok(S.doelGegeven(9, 'midden') < S.doelGegeven(16, 'midden'));
  assert.ok(S.doelGegeven(16, 'makkelijk') > S.doelGegeven(16, 'moeilijk'));
});

test('de zware 16x16-opgaven komen uit sudokus.js en zijn uniek', () => {
  const m = S.maatVan(16);
  const verzameling = globalThis.SMAKENLAND_SUDOKUS;
  assert.ok(verzameling && verzameling[16], 'sudokus.js is geladen');
  for (const niveau of ['midden', 'moeilijk']) {
    const lijst = verzameling[16][niveau];
    assert.ok(lijst && lijst.length >= 4, `er staan opgaven klaar voor ${niveau}`);
    for (const reeks of lijst) {
      assert.equal(reeks.length, 256, 'een 16x16-opgave heeft 256 vakken');
      assert.match(reeks, /^[1-9A-G.]{256}$/, 'alleen tekens van deze maat');
    }
    // Eén ervan helemaal narekenen, met een ruim budget.
    const p = S.uitVerzameling(16, niveau, 0);
    assert.ok(p, 'de opgave is te lezen');
    assert.equal(p.opgave.length, 256);
    assert.equal(oplossingKlopt(p.oplossing, m), null);
    assert.ok(p.gegevenAantal >= 80, 'een 16x16 houdt genoeg aanwijzingen');
    assert.equal(S.aantalOplossingen(p.opgave, 2, m, 20000000), 1, `${niveau} is uniek`);
  }
  assert.equal(S.uitVerzameling(16, 'makkelijk'), null,
    'makkelijk maken we zelf, die staat niet in de verzameling');
  assert.equal(S.uitVerzameling(9, 'midden'), null, 'voor 9x9 is er geen verzameling');
});

test('de tekens van een maat: 10 wordt A, 16 wordt G', () => {
  const m16 = S.maatVan(16);
  const m12 = S.maatVan(12);
  const m9 = S.maatVan(9);
  assert.equal(S.teken(1, m9), '1');
  assert.equal(S.teken(9, m9), '9');
  assert.equal(S.teken(10, m12), 'A');
  assert.equal(S.teken(12, m12), 'C');
  assert.equal(S.teken(10, m16), 'A');
  assert.equal(S.teken(16, m16), 'G');
  assert.equal(S.teken(0, m16), '', 'een leeg vak is leeg');
});

test('spelen in een grote maat: conflicten, hint en voortgang', () => {
  const p = S.uitVerzameling(16, 'midden', 1);
  assert.ok(p);
  const m = S.maatVan(16);
  const bord = p.opgave.slice();
  const leeg = bord.findIndex((v) => v === 0);
  bord[leeg] = p.oplossing[leeg];
  assert.equal(S.klaar(bord, p.oplossing), false);
  const hint = S.hint(bord, p.oplossing, p.gegeven);
  assert.ok(hint && hint.soort === 'leeg');
  const voortgang = S.voortgang(bord, p.oplossing);
  assert.equal(voortgang.totaal, 256);
  // Twee dezelfde waarden naast elkaar in een rij van 16 moet opvallen.
  const dubbel = p.opgave.slice();
  const rij = 5;
  let eerste = -1;
  for (let k = 0; k < 16; k++) if (dubbel[rij * 16 + k]) { eerste = rij * 16 + k; break; }
  assert.ok(eerste >= 0);
  const ander = rij * 16 + ((eerste % 16) + 1);
  dubbel[ander] = dubbel[eerste];
  const fout = S.conflicten(dubbel);
  assert.equal(fout[eerste], true);
  assert.equal(fout[ander], true);
  assert.equal(S.mag(dubbel, ander, dubbel[eerste], m), false);
});
