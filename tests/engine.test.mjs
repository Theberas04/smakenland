import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const C = require('../content.js');

const NU = 1_700_000_000_000; // vaste tijd, zodat de energie-test niet van de klok afhangt

function leeg() { return E.createState({ leeg: true, nu: NU, seed: 12345 }); }

test('startstand heeft kistjes, items en drie orders', () => {
  const s = E.createState({ nu: NU, seed: 7 });
  assert.equal(s.cells.length, E.COLS * E.ROWS);
  const gens = s.cells.filter((c) => c && c.kind === 'gen');
  assert.equal(gens.length, 2);
  assert.equal(s.orders.length, E.MAX_ORDERS);
  s.orders.forEach((o) => {
    assert.ok(C.CHAINS[o.keten], 'order verwijst naar bestaande keten');
    assert.ok(o.tier >= 1 && o.tier <= E.maxTier(o.keten));
    assert.ok(o.aantal >= 1);
    assert.ok(o.munten > 0 && o.sterren > 0);
  });
});

test('oogsten kost energie van het niveau van de kist en levert een item', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 1);
  s.energie = 5;
  const r = E.oogst(s, E.idx(0, 0));
  assert.equal(r.ok, true);
  assert.equal(s.energie, 4);
  const geplaatst = s.cells.filter((c) => c && c.kind === 'item' && c.keten === 'tuin' && c.tier === 1);
  assert.equal(geplaatst.length, 1);
});

test('een kist van niveau 2 levert direct een item van tier 2 en kost 2 energie', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 2);
  s.energie = 5;
  E.oogst(s, E.idx(0, 0));
  assert.equal(s.energie, 3);
  assert.ok(s.cells.some((c) => c && c.kind === 'item' && c.keten === 'tuin' && c.tier === 2));
});

test('zonder energie wordt er niets geoogst', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 1);
  s.energie = 0;
  const r = E.oogst(s, E.idx(0, 0));
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'energie');
  assert.equal(s.cells.filter(Boolean).length, 1);
});

test('oogsten stapelt op een bestaand gelijk item en versmelt bij drie', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 1);
  s.cells[E.idx(1, 1)] = E.maakItem('tuin', 1);
  s.energie = 10;
  E.oogst(s, E.idx(0, 0)); // -> stapel van 2
  assert.equal(E.telItems(s, 'tuin', 1), 2);
  const r = E.oogst(s, E.idx(0, 0)); // -> derde: versmelt naar tier 2
  assert.ok(r.events.some((e) => e.type === 'merge'));
  assert.equal(E.telItems(s, 'tuin', 1), 0);
  assert.equal(E.telItems(s, 'tuin', 2), 1);
  assert.equal(s.merges, 1);
});

test('3 gelijke items versmelten tot 1 item een tier hoger', () => {
  const s = leeg();
  s.cells[E.idx(2, 2)] = E.maakItem('bakkerij', 1);
  s.cells[E.idx(2, 3)] = E.maakItem('bakkerij', 1);
  s.cells[E.idx(2, 4)] = E.maakItem('bakkerij', 1);
  const r = E.verplaats(s, E.idx(2, 4), E.idx(2, 3));
  assert.equal(r.ok, true);
  assert.equal(s.cells[E.idx(2, 3)].count, 2, 'twee op een stapel');
  assert.equal(E.telItems(s, 'bakkerij', 1), 3, 'de derde ligt nog los');
  const r2 = E.verplaats(s, E.idx(2, 2), E.idx(2, 3)); // derde erbij -> versmelten
  assert.ok(r2.events.some((e) => e.type === 'merge' && e.naar === 2));
  assert.equal(E.telItems(s, 'bakkerij', 1), 0);
  assert.equal(E.telItems(s, 'bakkerij', 2), 1);
  assert.equal(s.cells[E.idx(2, 2)], null, 'broncel komt vrij');
});

test('4 gelijke items geven 1 hoger + 1 over', () => {
  const s = leeg();
  s.cells[E.idx(3, 1)] = E.maakItem('tuin', 2, 2);
  s.cells[E.idx(3, 2)] = E.maakItem('tuin', 2, 2);
  const r = E.verplaats(s, E.idx(3, 1), E.idx(3, 2));
  assert.ok(r.events.some((e) => e.type === 'merge' && e.naar === 3));
  assert.equal(E.telItems(s, 'tuin', 3), 1);
  assert.equal(E.telItems(s, 'tuin', 2), 1, 'de rest blijft liggen');
});

test('verschillende items versmelten niet en ook een lege sleepcel is ongeldig', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakItem('tuin', 1);
  s.cells[E.idx(0, 1)] = E.maakItem('haven', 1);
  assert.equal(E.verplaats(s, E.idx(0, 0), E.idx(0, 1)).ok, false);
  assert.equal(E.verplaats(s, E.idx(0, 0), E.idx(0, 0)).ok, false);
  assert.equal(E.verplaats(s, E.idx(5, 5), E.idx(5, 6)).ok, false);
});

test('het hoogste tier versmelt niet verder', () => {
  const s = leeg();
  const top = E.maxTier('tuin');
  s.cells[E.idx(1, 1)] = E.maakItem('tuin', top);
  s.cells[E.idx(1, 2)] = E.maakItem('tuin', top);
  s.cells[E.idx(1, 3)] = E.maakItem('tuin', top);
  E.verplaats(s, E.idx(1, 3), E.idx(1, 2));
  E.verplaats(s, E.idx(1, 1), E.idx(1, 2));
  assert.equal(E.telItems(s, 'tuin', top), 3);
  assert.equal(E.telItems(s, 'tuin', top + 1), 0);
  assert.equal(s.merges, 0);
});

test('3 kisten van hetzelfde niveau worden een kist van niveau 2', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 1);
  s.cells[E.idx(0, 1)] = E.maakGen('zadenkist', 1);
  s.cells[E.idx(0, 2)] = E.maakGen('zadenkist', 1);
  E.verplaats(s, E.idx(0, 2), E.idx(0, 1));
  const r = E.verplaats(s, E.idx(0, 0), E.idx(0, 1));
  assert.ok(r.events.some((e) => e.type === 'merge' && e.gen === 'zadenkist'));
  const gen = s.cells[E.idx(0, 1)];
  assert.equal(gen.kind, 'gen');
  assert.equal(gen.level, 2);
});

test('kisten van verschillende ketens versmelten niet', () => {
  const s = leeg();
  s.cells[E.idx(0, 0)] = E.maakGen('zadenkist', 1);
  s.cells[E.idx(0, 1)] = E.maakGen('geldkist', 1);
  assert.equal(E.verplaats(s, E.idx(0, 0), E.idx(0, 1)).ok, false);
});

test('munten innen levert de waarde per tier en maakt de cel leeg', () => {
  const s = leeg();
  s.munten = 0;
  s.cells[E.idx(0, 0)] = E.maakItem('munt', 1);
  s.cells[E.idx(0, 1)] = E.maakItem('munt', 2);
  s.cells[E.idx(0, 2)] = E.maakItem('munt', 3);
  E.incasseer(s, E.idx(0, 0));
  E.incasseer(s, E.idx(0, 1));
  E.incasseer(s, E.idx(0, 2));
  assert.equal(s.munten, C.MUNT_WAARDE.munt[0] + C.MUNT_WAARDE.munt[1] + C.MUNT_WAARDE.munt[2]);
  assert.equal(s.cells.filter(Boolean).length, 0);
  assert.equal(E.incasseer(s, E.idx(0, 0)).ok, false);
});

test('een order levert munten en sterren en wordt vervangen', () => {
  const s = leeg();
  s.orders = [{ id: 'test', keten: 'tuin', tier: 1, aantal: 3, munten: 50, sterren: 2 }];
  s.cells[E.idx(0, 0)] = E.maakItem('tuin', 1, 2);
  s.cells[E.idx(0, 1)] = E.maakItem('tuin', 1, 1);
  assert.equal(E.kanLeveren(s, 'test'), 3);
  const r = E.lever(s, 'test');
  assert.equal(r.ok, true);
  assert.equal(s.munten, 50);
  assert.equal(s.sterren, 2);
  assert.equal(s.ordersKlaar, 1);
  assert.equal(E.telItems(s, 'tuin', 1), 0);
  assert.equal(s.orders.length, E.MAX_ORDERS, 'nieuwe order vult de lijst aan');
  assert.ok(!s.orders.some((o) => o.id === 'test'));
});

test('te weinig items betekent geen levering', () => {
  const s = leeg();
  s.orders = [{ id: 'test', keten: 'bloemen', tier: 2, aantal: 1, munten: 20, sterren: 1 }];
  s.cells[E.idx(0, 0)] = E.maakItem('bloemen', 1, 3);
  const r = E.lever(s, 'test');
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'te-weinig');
  assert.equal(s.munten, 0);
});

test('genoeg sterren opent het volgende gebied en geeft de nieuwe kist', () => {
  const s = leeg();
  s.sterren = C.AREAS[1].sterren;
  const g = E.checkGebied(s);
  assert.ok(g, 'gebied 2 gaat open');
  assert.equal(s.gebied, 1);
  assert.equal(g.naam, C.AREAS[1].naam);
  assert.ok(g.verhaal.length > 40, 'het gebied heeft een verhaal');
  assert.ok(s.cells.some((c) => c && c.kind === 'gen' && c.gen === C.AREAS[1].generator));
  assert.equal(E.checkGebied(s), null, 'niet twee keer achter elkaar');
});

test('een groot aantal sterren slaat meerdere gebieden over', () => {
  const s = leeg();
  s.sterren = 200;
  const g = E.checkGebied(s);
  assert.equal(s.gebied, C.AREAS.length - 1);
  assert.equal(g.naam, C.AREAS[C.AREAS.length - 1].naam);
});

test('orders komen alleen uit ontgrendelde ketens', () => {
  const s = leeg();
  const begin = E.ontgrendeldeKetenen(s);
  assert.deepEqual(begin, ['tuin']);
  for (let i = 0; i < 50; i++) {
    const o = E.nieuweOrder(s);
    assert.ok(begin.includes(o.keten), 'geen onbekende keten: ' + o.keten);
    assert.notEqual(o.keten, 'munt', 'munten zijn geen order-item');
  }
  s.sterren = 200;
  E.checkGebied(s);
  assert.ok(E.ontgrendeldeKetenen(s).length >= C.AREAS.length - 1);
});

test('een vol bord meldt dat er geen plek is', () => {
  const s = leeg();
  s.cells = s.cells.map((_, i) => E.maakItem('tuin', 2, i % 2 === 0 ? 1 : 2));
  s.energie = 10;
  s.cells[0] = E.maakGen('zadenkist', 1);
  const r = E.oogst(s, 0);
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'vol');
});

test('energie herstelt over tijd en stopt bij het maximum', () => {
  const s = leeg();
  s.energie = 10;
  s.energieMax = 20;
  s.laatsteEnergie = NU;
  assert.equal(E.tickEnergie(s, NU + 5000), 0);
  assert.equal(s.energie, 10);
  assert.equal(E.tickEnergie(s, NU + 35000), 2);
  assert.equal(s.energie, 12);
  assert.equal(E.tickEnergie(s, NU + 10 * 60 * 1000), 8);
  assert.equal(s.energie, 20);
  assert.equal(E.tickEnergie(s, NU + 60 * 60 * 1000), 0);
  assert.equal(s.energie, 20);
  assert.ok(E.secondenTotEnergie(s, NU) === 0);
  assert.ok(E.secondenTotEnergie(Object.assign({}, s, { energie: 0, laatsteEnergie: NU }), NU + 1000) > 0);
});

test('de winkel verkoopt energie en een extra kist, en niet zonder munten', () => {
  const s = leeg();
  s.munten = 0;
  assert.equal(E.koop(s, 'energie').reden, 'munten');
  s.munten = 500;
  s.energie = 10;
  assert.equal(E.koop(s, 'energie').ok, true);
  assert.equal(s.energie, 35);
  assert.equal(s.munten, 440);
  assert.equal(E.koop(s, 'zadenkist').ok, true);
  assert.ok(s.cells.some((c) => c && c.kind === 'gen' && c.gen === 'zadenkist'));
  assert.equal(E.koop(s, 'onzin').ok, false);
});

test('bewaren en laden geeft dezelfde stand terug', () => {
  const s = E.createState({ nu: NU, seed: 99 });
  s.munten = 777;
  s.sterren = 12;
  E.oogst(s, E.idx(0, 3));
  const tekst = E.serialiseer(s);
  const t = E.laad(tekst, NU + 60_000);
  assert.equal(t.munten, 777);
  assert.equal(t.sterren, 12);
  assert.deepEqual(t.cells, s.cells);
  assert.equal(t.orders.length, E.MAX_ORDERS);
  assert.equal(E.laad('{onzin', NU), null);
  assert.equal(E.laad('{"v":99,"cells":[]}', NU), null);
  assert.ok(E.laad(null, NU) === null);
});

test('laden vult een ontbrekende orderlijst aan in plaats van te crashen', () => {
  const s = E.createState({ nu: NU, seed: 5 });
  const ruw = JSON.parse(E.serialiseer(s));
  ruw.orders = [];
  const t = E.laad(JSON.stringify(ruw), NU);
  assert.equal(t.orders.length, E.MAX_ORDERS);
});
