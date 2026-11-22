import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const C = require('../content.js');

const NU = 1_700_000_000_000;

/** Een potje met genoeg munten en een bord dat niet meteen vol zit. */
function rijk(opts) {
  const s = E.createState(Object.assign({ nu: NU, seed: 42 }, opts || {}));
  s.munten = 5000;
  return s;
}

const prijs = (id) => C.SHOP.find((a) => a.id === id).prijs;

test('de winkel verkoopt boosters die je op de plank legt', () => {
  const s = rijk();
  const leegVoor = s.cells.filter((c) => c).length;
  const r = E.koop(s, 'hamer');
  assert.equal(r.ok, true);
  assert.equal(s.munten, 5000 - prijs('hamer'));
  assert.equal(E.boosterAantal(s, 'hamer'), 1);
  // Een booster neemt geen vak in beslag: je kunt er meerdere hebben.
  assert.equal(s.cells.filter((c) => c).length, leegVoor);
  E.koop(s, 'hamer');
  assert.equal(E.boosterAantal(s, 'hamer'), 2);
});

test('een booster kopen met te weinig munten lukt niet', () => {
  const s = rijk();
  s.munten = 10;
  const r = E.koop(s, 'hamer');
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'munten');
  assert.equal(E.boosterAantal(s, 'hamer'), 0);
});

test('een booster koop je ook als het bord vol ligt', () => {
  const s = rijk();
  for (let i = 0; i < s.cells.length; i++) s.cells[i] = E.maakItem('tuin', 1, 1);
  const r = E.koop(s, 'schaar');
  assert.equal(r.ok, true, 'een booster vraagt geen vrij vak');
  assert.equal(E.boosterAantal(s, 'schaar'), 1);
});

test('de hamer haalt een voorwerp weg', () => {
  const s = rijk();
  s.cells = new Array(E.COLS * E.ROWS).fill(null);
  s.cells[5] = E.maakItem('tuin', 3, 2);
  s.boosters = { hamer: 1 };
  const r = E.gebruikBooster(s, 'hamer', 5);
  assert.equal(r.ok, true);
  assert.equal(s.cells[5], null);
  assert.equal(E.boosterAantal(s, 'hamer'), 0);
});

test('de hamer weigert een leeg vak en een lege voorraad', () => {
  const s = rijk();
  s.cells = new Array(E.COLS * E.ROWS).fill(null);
  s.boosters = { hamer: 1 };
  assert.equal(E.gebruikBooster(s, 'hamer', 12).reden, 'leeg');
  assert.equal(E.boosterAantal(s, 'hamer'), 1, 'een mislukte poging kost niets');
  s.boosters = {};
  s.cells[12] = E.maakItem('tuin', 1, 1);
  assert.equal(E.gebruikBooster(s, 'hamer', 12).reden, 'geen');
  assert.ok(s.cells[12], 'het voorwerp blijft staan');
});

test('de schaar knipt één stuk van een stapel los', () => {
  const s = rijk();
  s.cells = new Array(E.COLS * E.ROWS).fill(null);
  s.cells[10] = E.maakItem('tuin', 2, 3);
  s.boosters = { schaar: 1 };
  const r = E.gebruikBooster(s, 'schaar', 10);
  assert.equal(r.ok, true);
  assert.equal(s.cells[10].count, 2);
  const los = s.cells.filter((c, i) => c && i !== 10);
  assert.equal(los.length, 1, 'er staat precies één los stuk naast');
  assert.equal(los[0].keten, 'tuin');
  assert.equal(los[0].tier, 2);
  assert.equal(los[0].count, 1);
  assert.equal(E.boosterAantal(s, 'schaar'), 0);
});

test('de schaar weigert een enkel stuk en een vol bord', () => {
  const s = rijk();
  s.cells = new Array(E.COLS * E.ROWS).fill(null);
  s.cells[10] = E.maakItem('tuin', 2, 1);
  s.boosters = { schaar: 1 };
  assert.equal(E.gebruikBooster(s, 'schaar', 10).reden, 'niets-te-knippen');

  s.cells[10] = E.maakItem('tuin', 2, 3);
  for (let i = 0; i < s.cells.length; i++) if (!s.cells[i]) s.cells[i] = E.maakItem('tuin', 1, 1);
  assert.equal(E.gebruikBooster(s, 'schaar', 10).reden, 'vol');
  assert.equal(s.cells[10].count, 3, 'er is niets afgeknipt');
});

test('dubbelmunten verdubbelt drie leveringen en daarna niet meer', () => {
  const s = rijk();
  s.cells = new Array(E.COLS * E.ROWS).fill(null);
  s.boosters = { dubbel: 1 };
  assert.equal(E.gebruikBooster(s, 'dubbel').ok, true);
  assert.equal(s.dubbel, 3);
  assert.equal(E.gebruikBooster(s, 'dubbel').reden, 'geen', 'je kunt er maar één tegelijk aan hebben');

  for (let beurt = 1; beurt <= 4; beurt++) {
    s.orders = [{
      id: 'o' + beurt, keten: 'tuin', tier: 1, aantal: 1, munten: 100, sterren: 1, klant: 'Test'
    }];
    s.cells[0] = E.maakItem('tuin', 1, 1);
    const voor = s.munten;
    const r = E.lever(s, 'o' + beurt);
    assert.equal(r.ok, true);
    const ev = r.events.find((e) => e.type === 'levering');
    assert.equal(ev.munten, beurt <= 3 ? 200 : 100, 'beurt ' + beurt);
    assert.equal(s.munten - voor, beurt <= 3 ? 200 : 100);
  }
  assert.equal(s.dubbel, 0);
});

test('dubbelmunten weigert in een level, want daar zijn geen munten te halen', () => {
  const s = E.startLevel(1, NU, { dubbel: 1 });
  assert.equal(s.modus, 'level');
  const r = E.gebruikBooster(s, 'dubbel');
  assert.equal(r.ok, false);
  assert.equal(r.reden, 'niet-in-level');
  assert.equal(E.boosterAantal(s, 'dubbel'), 1, 'hij blijft op de plank liggen');
});

test('boosters gaan mee het level in en raken daar op', () => {
  const s = E.startLevel(1, NU, { hamer: 2, schaar: 1 });
  assert.equal(E.boosterAantal(s, 'hamer'), 2);
  const cel = s.cells.findIndex((c) => c);
  assert.ok(cel >= 0, 'er ligt iets op het bord');
  assert.equal(E.gebruikBooster(s, 'hamer', cel).ok, true);
  assert.equal(E.boosterAantal(s, 'hamer'), 1);
  assert.equal(E.boosterAantal(s, 'schaar'), 1);
});

test('een level zonder meegebrachte boosters begint met een lege plank', () => {
  const s = E.startLevel(2, NU);
  assert.deepEqual(s.boosters, {});
  assert.equal(E.boosterAantal(s, 'hamer'), 0);
});

test('de tuin: kopen, munten eraf, en niet twee keer hetzelfde', () => {
  const s = rijk();
  const stuk = C.TUIN[0];
  const r = E.koopTuin(s, stuk.id);
  assert.equal(r.ok, true);
  assert.equal(s.munten, 5000 - stuk.prijs);
  assert.deepEqual(s.tuin, [stuk.id]);
  assert.equal(E.koopTuin(s, stuk.id).reden, 'al-in-tuin');
  assert.equal(s.munten, 5000 - stuk.prijs, 'een tweede poging kost niets');
  assert.equal(E.koopTuin(s, 'bestaat-niet').reden, 'onbekend');
});

test('de tuin weigert als er te weinig munten zijn', () => {
  const s = rijk();
  s.munten = 5;
  assert.equal(E.koopTuin(s, C.TUIN[0].id).reden, 'munten');
  assert.deepEqual(s.tuin, []);
});

test('elke versiering in de tuin heeft een eigen vak in het tuinbeeld', () => {
  const vakken = new Set();
  for (const t of C.TUIN) {
    assert.ok(t.prijs > 0, t.id + ' heeft een prijs');
    assert.ok(Array.isArray(t.vak) && t.vak.length === 2, t.id + ' heeft een vak');
    const sleutel = t.vak.join(',');
    assert.ok(!vakken.has(sleutel), 'vak ' + sleutel + ' is al bezet');
    vakken.add(sleutel);
    assert.ok(t.vak[0] >= 0 && t.vak[0] <= 5 && t.vak[1] >= 0 && t.vak[1] <= 2);
  }
});

test('een oud potje zonder boosters en tuin blijft te laden', () => {
  const s = E.createState({ nu: NU, seed: 7 });
  const tekst = JSON.stringify(s).replace(/"boosters":\{[^}]*\},?/, '')
    .replace(/"tuin":\[[^\]]*\],?/, '');
  const terug = E.laad(tekst, NU);
  assert.ok(terug, 'het oude potje laadt');
  assert.deepEqual(terug.boosters, {});
  assert.deepEqual(terug.tuin, []);
  assert.deepEqual(terug.dag, { reeks: 0, laatste: 0, dagen: [] });
  assert.equal(terug.zetten, 0);
});
