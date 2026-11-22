/* De prestaties: elke prestatie moet op zijn eigen teller reageren, en een teller
   die nog niet bestaat mag geen fout geven (een oud potje heeft ze niet). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../prestaties.js');

test('de lijst zelf is in orde', () => {
  assert.ok(P.LIJST.length >= 15, 'er zijn genoeg prestaties');
  const ids = new Set();
  P.LIJST.forEach((p) => {
    assert.ok(/^[a-z0-9-]+$/.test(p.id), 'nette id: ' + p.id);
    assert.ok(!ids.has(p.id), 'geen dubbele id: ' + p.id);
    ids.add(p.id);
    assert.ok(p.naam && p.tekst && p.e, 'naam, tekst en een teken: ' + p.id);
    assert.ok(p.doel > 0, 'een doel boven nul: ' + p.id);
    assert.ok(typeof p.stand === 'string' && p.stand, 'een teller: ' + p.id);
  });
});

test('een lege speler heeft nog niets behaald', () => {
  const uit = P.bereken({});
  assert.equal(uit.filter((p) => p.behaald).length, 0);
  const tel = P.tel({});
  assert.equal(tel.behaald, 0);
  assert.equal(tel.totaal, P.LIJST.length);
});

test('een teller die het doel haalt, maakt de prestatie behaald', () => {
  const uit = P.bereken({ levelsGehaald: 1, versmeltingen: 1, sudokuGewonnen: 1 });
  const behaald = uit.filter((p) => p.behaald).map((p) => p.id).sort();
  assert.deepEqual(behaald, ['eerste-level', 'eerste-versmelting', 'sudoku-eerste']);
});

test('een teller er net onder is nog niet behaald, en de balk klopt', () => {
  const bijna = P.bereken({ levelsGehaald: 9 });
  const tien = bijna.find((p) => p.id === 'tien-levels');
  assert.equal(tien.behaald, false);
  assert.equal(tien.nu, 9);
  assert.equal(tien.doel, 10);
  assert.ok(Math.abs(tien.deel - 0.9) < 1e-9);
  const wel = P.bereken({ levelsGehaald: 10 }).find((p) => p.id === 'tien-levels');
  assert.equal(wel.behaald, true);
  assert.equal(wel.deel, 1);
});

test('onzin in de tellers wordt niet overgenomen', () => {
  const uit = P.bereken({ levelsGehaald: 'veel', versmeltingen: -5, sterren: NaN, klanten: 3.7 });
  const vind = (id) => uit.find((p) => p.id === id);
  assert.equal(vind('eerste-level').nu, 0);
  assert.equal(vind('eerste-versmelting').nu, 0);
  assert.equal(vind('honderd-sterren').nu, 0);
  assert.equal(vind('klanten').nu, 3, 'kommagetallen naar beneden afronden');
});

test('nieuwe() geeft alleen wat er sinds de vorige keer bij kwam', () => {
  const eerder = [];
  const eersteKeer = P.nieuwe({ levelsGehaald: 1 }, eerder);
  assert.deepEqual(eersteKeer.map((p) => p.id), ['eerste-level']);
  const nu = eerder.concat(eersteKeer.map((p) => p.id));
  assert.deepEqual(P.nieuwe({ levelsGehaald: 1 }, nu), [], 'niets nieuws de tweede keer');
  const later = P.nieuwe({ levelsGehaald: 10, versmeltingen: 100 }, nu);
  assert.deepEqual(later.map((p) => p.id).sort(),
    ['eerste-versmelting', 'honderd-versmeltingen', 'tien-levels']);
});

test('alle prestaties zijn met een eerlijke stand te halen', () => {
  const topstand = {};
  P.LIJST.forEach((p) => { topstand[p.stand] = p.doel; });
  const tel = P.tel(topstand);
  assert.equal(tel.behaald, tel.totaal, 'met alle tellers op hun doel is alles behaald');
});
