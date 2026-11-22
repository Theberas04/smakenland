/* De voortgangscode: hij moet rondgaan (eruit en er weer in hetzelfde) en hij moet
   een code die niet klopt weigeren in plaats van er halve voortgang van te maken. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const VC = require('../voortgangscode.js');

const VOORBEELD = {
  sterren: { 1: 3, 2: 1, 3: 2, 25: 3, 400: 1, 1000: 3, 1001: 2 },
  munten: 1234,
  sudokuBeste: { '9-midden': 312, '16-moeilijk': 1450, '4-makkelijk': 41 },
  sudokuGewonnen: 7,
  prestaties: ['eerste-level', 'honderd-versmeltingen', 'sudoku-groot'],
  thema: 'donker'
};

test('een code gaat eruit en er weer in, precies hetzelfde', () => {
  const code = VC.maak(VOORBEELD);
  assert.equal(typeof code, 'string');
  assert.ok(code.length > 20);
  const uit = VC.lees(code);
  assert.equal(uit.ok, true, uit.fout);
  assert.deepEqual(uit.gegevens.sterren, VOORBEELD.sterren);
  assert.equal(uit.gegevens.munten, 1234);
  assert.deepEqual(uit.gegevens.sudokuBeste, { '16-moeilijk': 1450, '4-makkelijk': 41, '9-midden': 312 });
  assert.equal(uit.gegevens.sudokuGewonnen, 7);
  assert.deepEqual(uit.gegevens.prestaties.slice().sort(),
    ['eerste-level', 'honderd-versmeltingen', 'sudoku-groot']);
  assert.equal(uit.gegevens.thema, 'donker');
});

test('een lege speler levert een korte code op', () => {
  const code = VC.maak({ sterren: {}, munten: 0 });
  assert.ok(code.length < 200, 'een lege code hoort kort te zijn: ' + code.length + ' tekens');
  // Een volle code (veel losse sterren) mag niet ontsporen.
  const vol = {};
  for (let nr = 1; nr <= VC.MAX_LEVELS; nr++) vol[nr] = (nr % 3) + 1;
  assert.ok(VC.maak({ sterren: vol }).length < 1200, 'ook een volle code blijft behapbaar');
  const uit = VC.lees(code);
  assert.equal(uit.ok, true);
  assert.deepEqual(uit.gegevens.sterren, {});
  assert.equal(uit.gegevens.munten, 0);
  assert.equal(uit.gegevens.thema, 'licht');
  assert.deepEqual(uit.gegevens.prestaties, []);
});

test('dezelfde voortgang geeft altijd dezelfde code', () => {
  assert.equal(VC.maak(VOORBEELD), VC.maak(VOORBEELD));
  // Ook als de prestaties in een andere volgorde staan.
  const ander = Object.assign({}, VOORBEELD, { prestaties: VOORBEELD.prestaties.slice().reverse() });
  assert.equal(VC.maak(ander), VC.maak(VOORBEELD));
});

test('een code met een fout erin wordt geweigerd', () => {
  const code = VC.maak(VOORBEELD);
  // Eén teken in het midden veranderen: de controle moet dat opmerken.
  const midden = Math.floor(code.length / 2);
  const oud = code.charAt(midden);
  const nieuw = oud === 'A' ? 'B' : 'A';
  const verpest = code.slice(0, midden) + nieuw + code.slice(midden + 1);
  const uit = VC.lees(verpest);
  assert.equal(uit.ok, false);
  assert.match(uit.fout, /klopt niet|tekens/i);
});

test('onzin wordt met een nette boodschap geweigerd', () => {
  assert.equal(VC.lees('').ok, false);
  assert.equal(VC.lees('hallo allemaal').ok, false);
  assert.equal(VC.lees('geen-base64-hier!').ok, false);
  assert.equal(VC.lees(null).ok, false);
  assert.equal(VC.lees('!!!-' + VC.controle('x')).ok, false);
  // Een code uit een andere versie.
  const andereVersie = VC.naarBase64('SMK9\nmunten:5') + '-' + VC.controle('SMK9\nmunten:5');
  const uit = VC.lees(andereVersie);
  assert.equal(uit.ok, false);
  assert.match(uit.fout, /andere versie/i);
});

test('spaties en regeleindes bij het plakken maken niet uit', () => {
  const code = VC.maak(VOORBEELD);
  const metRommel = '  ' + code.slice(0, 20) + '\n' + code.slice(20, 40) + '  ' + code.slice(40) + '\n';
  assert.equal(VC.lees(metRommel).ok, true);
});

test('de sterrenreeks is kort voor een bijna leeg spel en leesbaar terug', () => {
  const reeks = VC.sterrenReeks({ 1: 3, 2: 3, 3: 1 });
  assert.equal(reeks, '3*2,1*1,0*' + (VC.MAX_LEVELS - 3));
  assert.deepEqual(VC.leesSterren(reeks), { 1: 3, 2: 3, 3: 1 });
  // En een reeks die niet klopt wordt zo goed mogelijk gelezen in plaats van te knallen.
  assert.deepEqual(VC.leesSterren('onzin'), {});
  assert.deepEqual(VC.leesSterren('2*2,xx,1*1'), { 1: 2, 2: 2, 3: 1 });
});

test('base64 heen en weer voor rare tekens', () => {
  for (const tekst of ['', 'a', 'ab', 'abc', 'abcd', 'Smakenland 🍰', '\n\t']) {
    assert.equal(VC.vanBase64(VC.naarBase64(tekst)), tekst, JSON.stringify(tekst));
  }
});

test('de ingepakte sterrenvorm werkt net zo goed als de reeksvorm', () => {
  assert.deepEqual(VC.leesPak(VC.sterrenPak({})), {});
  assert.deepEqual(VC.leesPak(VC.sterrenPak({ 1: 3, 2: 1, 1200: 2 })), { 1: 3, 2: 1, 1200: 2 });
  // Beide vormen komen door dezelfde lezer heen.
  const metReeks = { sterren: { 5: 2 }, munten: 1 };
  const code = VC.maak(metReeks);
  const veld = VC.lees(code).gegevens.sterren;
  assert.deepEqual(veld, { 5: 2 });
});
