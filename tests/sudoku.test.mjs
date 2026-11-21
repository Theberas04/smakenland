import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../sudoku.js');

test('een nieuwe opgave heeft één oplossing en de oplossing is geldig', () => {
  for (const niveau of ['makkelijk', 'midden', 'moeilijk']) {
    const p = S.maak(1234 + niveau.length, niveau);
    assert.equal(p.opgave.length, 81);
    assert.equal(p.oplossing.length, 81);
    assert.equal(S.aantalOplossingen(p.opgave, 3), 1, `niveau ${niveau} moet uniek zijn`);
    // elke rij, kolom en blok bevat 1..9
    for (let r = 0; r < 9; r++) {
      const inRij = new Set();
      for (let k = 0; k < 9; k++) inRij.add(p.oplossing[r * 9 + k]);
      assert.deepEqual([...inRij].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
    for (let k = 0; k < 9; k++) {
      const inKolom = new Set();
      for (let r = 0; r < 9; r++) inKolom.add(p.oplossing[r * 9 + k]);
      assert.equal(inKolom.size, 9);
    }
  }
});

test('de opgave past bij de moeilijkheid', () => {
  const makkelijk = S.maak(11, 'makkelijk');
  const midden = S.maak(11, 'midden');
  const moeilijk = S.maak(11, 'moeilijk');
  assert.ok(makkelijk.gegevenAantal > midden.gegevenAantal, 'makkelijk heeft meer gegeven cijfers');
  assert.ok(midden.gegevenAantal > moeilijk.gegevenAantal, 'moeilijk heeft minder gegeven cijfers');
  assert.ok(moeilijk.gegevenAantal >= 22, 'er blijven genoeg aanwijzingen over');
  for (const p of [makkelijk, midden, moeilijk]) {
    for (let i = 0; i < 81; i++) {
      if (p.gegeven[i]) assert.equal(p.opgave[i], p.oplossing[i], 'een gegeven cijfer is altijd goed');
    }
  }
});

test('dezelfde seed geeft dezelfde opgave, een andere seed niet', () => {
  const a = S.maak(777, 'midden');
  const b = S.maak(777, 'midden');
  const c = S.maak(778, 'midden');
  assert.deepEqual(a.opgave, b.opgave);
  assert.notDeepEqual(a.opgave, c.opgave);
});

test('mag() kent de sudoku-regels', () => {
  const leeg = new Array(81).fill(0);
  assert.equal(S.mag(leeg, 0, 5), true);
  leeg[1] = 5;                       // zelfde rij
  assert.equal(S.mag(leeg, 0, 5), false);
  leeg[1] = 0;
  leeg[9] = 5;                       // zelfde kolom
  assert.equal(S.mag(leeg, 0, 5), false);
  leeg[9] = 0;
  leeg[10] = 5;                      // zelfde blok
  assert.equal(S.mag(leeg, 0, 5), false);
  leeg[10] = 0;
  assert.equal(S.mag(leeg, 0, 5), true);
});

test('kandidaten geeft alleen waarden die mogen', () => {
  const p = S.maak(4242, 'midden');
  for (let i = 0; i < 81; i++) {
    if (!p.gegeven[i]) continue;
    const bord = p.opgave.slice();
    const kan = S.kandidaten(bord, i);
    assert.ok(!kan.includes(p.opgave[i]), 'een gegeven cijfer staat nooit bij de kandidaten');
  }
});

test('conflicten wijst de foute vakken aan en klaar() alleen een echt vol bord', () => {
  const leeg = new Array(81).fill(0);
  leeg[0] = 4;
  leeg[1] = 4;                       // dubbele in de rij
  const fout = S.conflicten(leeg);
  assert.equal(fout[0], true);
  assert.equal(fout[1], true);
  assert.equal(fout[2], false);

  const p = S.maak(99, 'makkelijk');
  assert.equal(S.klaar(p.opgave, p.oplossing), false);
  assert.equal(S.klaar(p.oplossing, p.oplossing), true);
  const bijna = p.oplossing.slice();
  bijna[0] = (bijna[0] % 9) + 1;
  assert.equal(S.klaar(bijna, p.oplossing), false);
});

test('hint wijst eerst een fout aan, dan een leeg vak', () => {
  const p = S.maak(31, 'makkelijk');
  const bord = p.opgave.slice();
  const eerste = S.hint(bord, p.oplossing, p.gegeven);
  assert.ok(eerste, 'er is altijd een hint');
  assert.equal(eerste.soort, 'leeg');
  const leegVak = bord.findIndex((v) => v === 0);
  bord[leegVak] = (p.oplossing[leegVak] % 9) + 1;    // bewust fout
  const tweede = S.hint(bord, p.oplossing, p.gegeven);
  assert.equal(tweede.soort, 'fout');
  assert.equal(tweede.cel, leegVak);
  assert.equal(tweede.waarde, p.oplossing[leegVak]);
});

test('voortgang telt goed ingevulde vakken', () => {
  const p = S.maak(7, 'makkelijk');
  const half = p.oplossing.map((v, i) => (i < 40 ? v : 0));
  const v = S.voortgang(half, p.oplossing);
  assert.equal(v.totaal, 81);
  assert.ok(v.goed >= 40);
  assert.equal(v.goed + v.open, 81);
});

test('een onmogelijke opgave heeft geen oplossing', () => {
  const bord = new Array(81).fill(0);
  bord[0] = 5;
  bord[1] = 5;
  assert.equal(S.aantalOplossingen(bord, 2), 0);
});
