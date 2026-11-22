import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const L = require('../levels.js');

/** Een vaste dag, zodat de test niet van de klok afhangt. */
const DAG = new Date(2026, 10, 22, 12, 0, 0);          // 22 november 2026, middag
const morgen = (d) => new Date(d.getTime() + 86400000);

test('de dagelijkse opgave is elke dag hetzelfde level en schuift op', () => {
  const nr = E.dagNummer(DAG);
  const a = E.dagLevel(nr);
  const b = E.dagLevel(nr, 1200);
  assert.equal(a, b);
  assert.ok(a >= 1 && a <= L.levels.length, 'het level bestaat');
  assert.ok(E.levelVan(a), 'en het is een echt level');

  // Over tien dagen komen er meerdere verschillende levels langs (geen vast hangijzer).
  const gezien = new Set();
  for (let i = 0; i < 10; i++) gezien.add(E.dagLevel(nr + i));
  assert.ok(gezien.size >= 7, 'de opgave wisselt: ' + gezien.size + ' van 10 verschillend');
});

test('de dagstand laat zeven dagen zien met vandaag achteraan', () => {
  const s = E.createState({ seed: 3 });
  const stand = E.dagStand(s, DAG);
  assert.equal(stand.week.length, 7);
  assert.equal(stand.week[6].vandaag, true);
  assert.equal(stand.week[6].nummer, E.dagNummer(DAG));
  assert.equal(stand.week[0].nummer, E.dagNummer(DAG) - 6);
  assert.equal(stand.gedaanVandaag, false);
  assert.equal(stand.reeks, 0);
});

test('een gehaalde dagelijkse opgave levert munten op en zet de reeks op één', () => {
  const s = E.createState({ seed: 3 });
  s.munten = 0;
  const r = E.dagKlaar(s, DAG);
  assert.equal(r.ok, true);
  assert.equal(r.reeks, 1);
  assert.equal(r.munten, E.dagBonus(1));
  assert.equal(s.munten, r.munten);
  assert.equal(E.dagStand(s, DAG).gedaanVandaag, true);
});

test('dezelfde dag nog eens halen levert niets extra op', () => {
  const s = E.createState({ seed: 3 });
  E.dagKlaar(s, DAG);
  const munten = s.munten;
  const r = E.dagKlaar(s, DAG);
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'al-gedaan');
  assert.equal(s.munten, munten, 'de munten blijven staan');
  assert.equal(s.dag.reeks, 1, 'de reeks loopt niet op');
});

test('de reeks loopt door als je de volgende dag weer meedoet', () => {
  const s = E.createState({ seed: 3 });
  for (let i = 0; i < 5; i++) {
    const r = E.dagKlaar(s, morgen(new Date(DAG.getTime() + i * 86400000)));
    assert.equal(r.ok, true);
    assert.equal(r.reeks, i + 1);
    assert.equal(r.munten, E.dagBonus(i + 1));
  }
  assert.equal(s.dag.besteReeks, 5);
  assert.equal(E.dagStand(s, new Date(DAG.getTime() + 4 * 86400000)).reeks, 5);
});

test('een dag overslaan begint de reeks opnieuw, en de bonus is nooit meer dan het plafond', () => {
  const s = E.createState({ seed: 3 });
  E.dagKlaar(s, DAG);
  const overmorgen = new Date(DAG.getTime() + 2 * 86400000);
  assert.equal(E.dagStand(s, overmorgen).reeks, 0, 'de reeks is afgebroken');
  const r = E.dagKlaar(s, overmorgen);
  assert.equal(r.reeks, 1, 'we beginnen opnieuw');
  assert.ok(E.dagBonus(1) < E.dagBonus(3));
  assert.ok(E.dagBonus(99) <= 300, 'het plafond houdt de bonus in toom');
});

test('de daggeschiedenis groeit niet onbeperkt door', () => {
  const s = E.createState({ seed: 3 });
  for (let i = 0; i < 45; i++) E.dagKlaar(s, new Date(DAG.getTime() + i * 86400000));
  assert.ok(s.dag.dagen.length <= 30, 'hooguit dertig dagen: ' + s.dag.dagen.length);
  assert.ok(s.dag.dagen.indexOf(E.dagNummer(DAG)) < 0, 'de oudste vallen eraf');
});

test('een level houdt bij hoeveel zetten er gedaan zijn', () => {
  const s = E.startLevel(1, DAG.getTime());
  assert.equal(s.zetten, 0);
  const kist = s.cells.findIndex((c) => c && c.kind === 'gen');
  assert.ok(kist >= 0);
  const r = E.oogst(s, kist);
  assert.equal(r.ok, true);
  assert.equal(s.zetten, 1, 'oogsten is een zet');
  E.oogst(s, kist);
  assert.equal(s.zetten, 2);
});

test('een record verbetert alleen als het echt beter is', () => {
  const eerste = E.samenvoegenRecord(null, { zetten: 20, ms: 90000 });
  assert.deepEqual(eerste.record, { zetten: 20, ms: 90000 });
  assert.deepEqual(eerste.verbeterd.sort(), ['ms', 'zetten']);
  assert.equal(eerste.nieuw, true);

  const slechter = E.samenvoegenRecord(eerste.record, { zetten: 30, ms: 120000 });
  assert.deepEqual(slechter.record, { zetten: 20, ms: 90000 }, 'het oude record blijft');
  assert.deepEqual(slechter.verbeterd, []);
  assert.equal(slechter.nieuw, false);

  const half = E.samenvoegenRecord(eerste.record, { zetten: 12, ms: 120000 });
  assert.deepEqual(half.record, { zetten: 12, ms: 90000 }, 'alleen de zetten verbeteren');
  assert.deepEqual(half.verbeterd, ['zetten']);

  const gelijk = E.samenvoegenRecord(eerste.record, { zetten: 20, ms: 90000 });
  assert.deepEqual(gelijk.verbeterd, [], 'even goed is geen verbetering');
});

test('een record zonder tijd of zetten laat het oude staan', () => {
  const oud = { zetten: 20, ms: 90000 };
  const r = E.samenvoegenRecord(oud, { zetten: 0, ms: 0 });
  assert.deepEqual(r.record, oud);
  assert.deepEqual(r.verbeterd, []);
});
