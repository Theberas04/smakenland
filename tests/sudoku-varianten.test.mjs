import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../sudoku.js');
require('../sudokus.js');                 // zet SMAKENLAND_SUDOKUS en de varianten klaar

const MATEN = [4, 6, 9, 12, 16];

/** Is deze groep vakjes aan elkaar vast? */
function vast(regio, n, g) {
  const cellen = [];
  for (let i = 0; i < n * n; i++) if (regio[i] === g) cellen.push(i);
  const gezien = new Set([cellen[0]]);
  const stapel = [cellen[0]];
  while (stapel.length) {
    const i = stapel.pop();
    const r = Math.floor(i / n);
    const k = i % n;
    const buren = [];
    if (r > 0) buren.push(i - n);
    if (r < n - 1) buren.push(i + n);
    if (k > 0) buren.push(i - 1);
    if (k < n - 1) buren.push(i + 1);
    for (const b of buren) {
      if (regio[b] !== g || gezien.has(b)) continue;
      gezien.add(b);
      stapel.push(b);
    }
  }
  return gezien.size === cellen.length;
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

test('een ongelijke verdeling geeft n groepen van n vakjes, elk aan elkaar vast', () => {
  // De verdeling kan mislukken (dan komt er null terug en probeert de pagina het
  // met een ander zaadje opnieuw): wat eruit komt moet kloppen, en het grootste
  // deel van de zaadjes moet lukken.
  for (const n of [4, 6, 9, 12]) {
    const zaadjes = [7, 1234, 20261122, 99, 5];
    let gelukt = 0;
    for (const zaad of zaadjes) {
      const regio = S.maakRegio(n, rngMaker(zaad));
      if (!regio) continue;
      keurVerdeling(regio, n);
      gelukt++;
    }
    assert.ok(gelukt >= 3, `n=${n}: ${gelukt} van ${zaadjes.length} zaadjes lukt`);
  }
  const zaadjes16 = [7, 99, 1234, 5, 808, 20261122];
  let gelukt16 = 0;
  for (const zaad of zaadjes16) {
    const regio = S.maakRegio(16, rngMaker(zaad));
    if (!regio) continue;
    keurVerdeling(regio, 16);
    gelukt16++;
  }
  assert.ok(gelukt16 >= 3, `16×16 lukt voor het grootste deel van de zaadjes (${gelukt16} van ${zaadjes16.length})`);
});

test('een ongelijke verdeling heeft van elk cijfer precies één vakje per groep', () => {
  // Dat is de reden dat er altijd een oplossing is: de verdeling wordt uit een
  // bestaand vol bord gebouwd.
  const n = 9;
  // los() werkt op een kopie: het resultaat moet je gebruiken.
  const bord = S.los(new Array(n * n).fill(0), S.maatVan(n));
  assert.ok(bord, 'een vol bord gemaakt');
  const regio = S.maakRegio(n, rngMaker(31), bord);
  assert.ok(regio, 'de verdeling lukt');
  for (let g = 0; g < n; g++) {
    const gezien = new Set();
    for (let i = 0; i < n * n; i++) {
      if (regio[i] !== g) continue;
      gezien.add(bord[i]);
    }
    assert.equal(gezien.size, n, `groep ${g} heeft alle ${n} cijfers`);
  }
  // En dus is dat bord een geldige oplossing voor deze verdeling.
  const m = S.maatMetRegio(n, regio);
  assert.deepEqual(S.conflicten(bord, m), new Array(n * n).fill(false));
});

function keurVerdeling(regio, n) {
  const perGroep = {};
  regio.forEach((g) => { perGroep[g] = (perGroep[g] || 0) + 1; });
  assert.equal(Object.keys(perGroep).length, n, `n=${n}: ${n} groepen`);
  for (const g of Object.keys(perGroep)) {
    assert.equal(perGroep[g], n, `n=${n}: groep ${g} heeft ${n} vakjes`);
    assert.ok(vast(regio, n, Number(g)), `n=${n}: groep ${g} hangt aan elkaar`);
  }
}

test('een ongelijke sudoku is niet stiekem gewoon', () => {
  const n = 9;
  const regio = S.maakRegio(n, rngMaker(5));
  const gewoon = [];
  for (let i = 0; i < n * n; i++) {
    gewoon.push(Math.floor(Math.floor(i / n) / 3) * 3 + Math.floor((i % n) / 3));
  }
  assert.notDeepEqual(regio, gewoon, 'de groepen wijken af van de blokken');
});

test('met de diagonalen erbij moet de oplossing ook op de diagonalen kloppen', () => {
  for (const n of [4, 6, 9, 12]) {
    const m = S.maatDiagonaal(n);
    const p = S.maak(99 + n, 'midden', n, 'diagonaal');
    assert.ok(p, `n=${n} maakt een diagonaal-sudoku`);
    assert.equal(p.variant, 'diagonaal');
    const bord = p.oplossing;
    for (const groep of m.extra) {
      const gezien = new Set();
      for (const i of groep) {
        assert.ok(!gezien.has(bord[i]), `n=${n}: geen dubbel op de diagonaal`);
        gezien.add(bord[i]);
      }
    }
    assert.equal(S.aantalOplossingen(p.opgave, 2, m, 400000), 1, `n=${n}: precies één oplossing`);
  }
});

test('een gewone sudoku met twee keer hetzelfde op een diagonaal is een botsing', () => {
  const n = 4;
  const m = S.maatDiagonaal(n);
  const bord = new Array(n * n).fill(0);
  bord[0] = 1;                 // linksboven
  bord[3 * 4 + 3] = 1;         // rechtsonder: andere rij, andere kolom, ander blok
  const fout = S.conflicten(bord, m);
  assert.equal(fout[0], true, 'het eerste vak is in botsing');
  assert.equal(fout[15], true, 'en het tweede ook');
  // Zonder de diagonaal-eis is dit geen botsing: andere rij, kolom en blok.
  const gewoon = S.conflicten(bord, S.maatVan(n));
  assert.deepEqual(gewoon, new Array(16).fill(false));
});

test('een ongelijke sudoku heeft precies één oplossing met de eigen groepen', () => {
  const n = 9;
  const p = S.maak(4242, 'midden', n, 'ongelijk');
  assert.ok(p, 'de opgave is gemaakt');
  assert.equal(p.variant, 'ongelijk');
  assert.ok(Array.isArray(p.regio) && p.regio.length === n * n, 'de groepen zitten erbij');
  const m = S.maatMetRegio(n, p.regio);
  assert.equal(S.aantalOplossingen(p.opgave, 2, m, 400000), 1, 'precies één oplossing');
  assert.deepEqual(S.conflicten(p.oplossing, m), new Array(n * n).fill(false), 'de oplossing is schoon');
  // En de oplossing gehoorzaamt de groepen: geen dubbele waarde binnen een groep.
  const perGroep = {};
  for (let i = 0; i < n * n; i++) {
    const g = p.regio[i];
    if (!perGroep[g]) perGroep[g] = new Set();
    assert.ok(!perGroep[g].has(p.oplossing[i]), 'geen dubbel binnen groep ' + g);
    perGroep[g].add(p.oplossing[i]);
  }
});

test('de kant-en-klare 16×16 met diagonalen is echt te gebruiken', () => {
  const p = S.uitVerzameling(16, 'midden', 0, 'diagonaal');
  assert.ok(p, 'de verzameling heeft een diagonaal-opgave');
  assert.equal(p.variant, 'diagonaal');
  assert.equal(p.n, 16);
  const m = S.maatDiagonaal(16);
  for (const groep of m.extra) {
    const gezien = new Set();
    for (const i of groep) {
      assert.ok(!gezien.has(p.oplossing[i]), 'geen dubbel op de diagonaal');
      gezien.add(p.oplossing[i]);
    }
  }
  assert.equal(S.aantalOplossingen(p.opgave, 2, m, 2000000), 1, 'precies één oplossing');
});

test('de gewone 16×16 uit de verzameling is niet veranderd', () => {
  const p = S.uitVerzameling(16, 'midden', 0);
  assert.ok(p, 'de gewone opgave staat er nog');
  assert.equal(p.variant, 'gewoon');
  assert.equal(S.aantalOplossingen(p.opgave, 2, S.maatVan(16), 2000000), 1);
});
