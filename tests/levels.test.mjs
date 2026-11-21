import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../engine.js');
const L = require('../levels.js');
const C = require('../content.js');

const NU = 1_700_000_000_000;

test('er zijn 800 levels in 32 hoofdstukken van 25', () => {
  assert.equal(L.levels.length, 800);
  assert.equal(L.hoofdstukken.length, 32);
  assert.equal(L.niveauPerHoofdstuk, 25);
  L.levels.forEach((lv, i) => {
    assert.equal(lv.nr, i + 1, 'de levels zijn op volgorde genummerd');
    assert.equal(lv.hfst, Math.floor(i / 25));
    assert.ok(lv.doelen.length >= 1 && lv.doelen.length <= 3);
    assert.ok(lv.energie >= 20 && lv.energie <= 150);
    assert.ok(lv.kisten.length >= 1);
  });
});

test('elk doel in een level is haalbaar met de kisten van dat level', () => {
  const inKetens = (lv) => new Set(lv.kisten.map((k) => k.keten));
  for (const lv of L.levels) {
    const ketens = inKetens(lv);
    for (const doel of lv.doelen) {
      assert.ok(ketens.has(doel.keten), `level ${lv.nr}: kist voor ${doel.keten}`);
      assert.ok(doel.tier >= 1 && doel.tier <= C.CHAINS[doel.keten].tiers.length,
        `level ${lv.nr}: tree ${doel.tier} bestaat in ${doel.keten}`);
      assert.ok(doel.aantal >= 1 && doel.aantal <= 2,
        `level ${lv.nr}: nooit drie exemplaren (die zouden zelf versmelten)`);
      const kist = lv.kisten.find((k) => k.keten === doel.keten);
      assert.ok(kist.level <= doel.tier, `level ${lv.nr}: kist niet hoger dan het doel`);
    }
    // startstukken liggen onder het laagste doel van hun keten
    for (const stuk of lv.start) {
      const laagste = Math.min(...lv.doelen.filter((d) => d.keten === stuk.keten).map((d) => d.tier));
      assert.ok(stuk.tier < laagste, `level ${lv.nr}: startstuk onder het doel`);
    }
  }
});

test('een level start met de kisten, de startstukken en de doelen van dat level', () => {
  const s = E.startLevel(7, NU);
  const lv = L.levels[6];
  assert.equal(s.modus, 'level');
  assert.equal(s.level, 7);
  assert.equal(s.energie, lv.energie);
  assert.equal(s.energieMax, lv.energie);
  assert.equal(s.orders.length, lv.doelen.length);
  const kisten = s.cells.filter((c) => c && c.kind === 'gen');
  assert.equal(kisten.length, lv.kisten.length);
  assert.deepEqual(kisten.map((k) => k.level), lv.kisten.map((k) => k.level));
  const stukken = s.cells.filter((c) => c && c.kind === 'item');
  assert.equal(stukken.length, lv.start.length);
  s.orders.forEach((o) => assert.equal(o.munten, 0, 'een leveldoel geeft geen munten'));
});

test('in een level groeit de energie niet aan', () => {
  const s = E.startLevel(3, NU);
  s.energie = 5;
  assert.equal(E.tickEnergie(s, NU + 10 * 60 * 1000), 0);
  assert.equal(s.energie, 5);
});

test('een level is klaar als alle doelen geleverd zijn, met sterren naar energie', () => {
  const s = E.startLevel(30, NU);
  const doel = s.orders[0];
  // Genoeg items van het doel op het bord leggen.
  let nodig = doel.aantal;
  for (let i = 0; i < s.cells.length && nodig > 0; i++) {
    if (s.cells[i]) continue;
    s.cells[i] = E.maakItem(doel.keten, doel.tier, Math.min(2, nodig));
    nodig -= Math.min(2, nodig);
  }
  assert.equal(E.levelKlaar(s), false);
  s.sterren = 0;
  while (s.orders.length) {
    const d = s.orders[0];
    let tekort = d.aantal - E.telItems(s, d.keten, d.tier);
    for (let i = 0; i < s.cells.length && tekort > 0; i++) {
      if (s.cells[i]) continue;
      s.cells[i] = E.maakItem(d.keten, d.tier, Math.min(2, tekort));
      tekort -= Math.min(2, tekort);
    }
    const r = E.lever(s, d.id);
    assert.ok(r.ok, 'leveren lukt');
  }
  assert.equal(E.levelKlaar(s), true);
  assert.ok(s.levelSterren >= 1 && s.levelSterren <= 3);
  // met veel energie over zijn het drie sterren
  assert.equal(s.levelSterren, 3);
  assert.equal(s.orders.length, 0, 'een level vult geen nieuwe opdrachten aan');
});

test('de sterren zakken als er weinig energie over is', () => {
  const s = E.startLevel(1, NU);
  s.energie = Math.floor(s.energieMax * 0.2);
  assert.equal(E.levelSterren(s), 2);
  s.energie = Math.floor(s.energieMax * 0.1);
  assert.equal(E.levelSterren(s), 1);
  s.energie = s.energieMax;
  assert.equal(E.levelSterren(s), 3);
});

test('hulp geeft tien energie, een paar keer per level en dan op', () => {
  const s = E.startLevel(5, NU);
  const voor = s.energie;
  assert.equal(E.hulpOver(s), E.HULP_PER_LEVEL);
  for (let i = 0; i < E.HULP_PER_LEVEL; i++) {
    const r = E.hulp(s);
    assert.equal(r.ok, true, 'beurt ' + (i + 1) + ' moet mogen');
    assert.equal(r.over, E.HULP_PER_LEVEL - i - 1);
    assert.equal(E.hulpOver(s), E.HULP_PER_LEVEL - i - 1);
  }
  assert.equal(s.energie, voor + E.HULP_PER_LEVEL * E.HULP_ENERGIE);
  const teveel = E.hulp(s);
  assert.equal(teveel.ok, false, 'daarna is het op');
  assert.equal(teveel.over, 0);
  // Het maximum groeit mee, anders zou de hulp de sterren opblazen.
  assert.equal(E.levelSterren(s), 3);
  const vrij = E.createState({ nu: NU, seed: 3 });
  assert.equal(E.hulp(vrij).ok, false, 'in vrij spelen bestaat geen hulp');
  assert.equal(E.hulpOver(vrij), 0);
});

test('een oud potje met hulpGebruikt als ja/nee blijft werken', () => {
  const s = E.startLevel(5, NU);
  s.hulpGebruikt = true;                       // zoals een eerder spel het bewaarde
  assert.equal(E.hulpOver(s), E.HULP_PER_LEVEL - 1);
  assert.equal(E.hulp(s).ok, true);
});

test('een level gaat pas open als het vorige gehaald is', () => {
  const voortgang = { 1: 3, 2: 1 };
  assert.equal(E.levelOpen(voortgang, 1), true);
  assert.equal(E.levelOpen(voortgang, 2), true);
  assert.equal(E.levelOpen(voortgang, 3), true);
  assert.equal(E.levelOpen(voortgang, 4), false, 'level 4 wacht op level 3');
  assert.equal(E.levelOpen({}, 1), true);
  assert.equal(E.levelOpen({}, 2), false);
});

test('een levelnummer buiten bereik bestaat niet', () => {
  assert.equal(E.levelVan(0), null);
  assert.equal(E.levelVan(801), null);
  assert.equal(E.startLevel(0, NU), null);
  assert.equal(E.levelVan(800).nr, 800);
  assert.equal(E.levelVan(801), null, 'voorbij het laatste level is er niets');
});

test('vrij spelen blijft gewoon werken naast de levels', () => {
  const s = E.createState({ nu: NU, seed: 42 });
  assert.notEqual(s.modus, 'level');
  assert.equal(s.orders.length, E.MAX_ORDERS);

  s.orders = [{ id: 'x', keten: 'bloemen', tier: 3, aantal: 1, munten: 10, sterren: 1 }];
  assert.equal(E.lever(s, 'x').ok, false, 'nog niets in huis');

  s.energie = 20;
  const o = E.oogst(s, E.idx(0, 3));
  assert.equal(o.ok, true);

  // Een opdracht die past bij wat er op het bord ligt, wordt aangevuld tot drie.
  s.munten = 0;
  s.orders = [{ id: 'y', keten: 'tuin', tier: 1, aantal: 2, munten: 40, sterren: 1 }];
  const r = E.lever(s, 'y');
  assert.equal(r.ok, true);
  assert.equal(s.munten, 40);
  assert.equal(s.orders.length, E.MAX_ORDERS, 'vrij spelen vult opdrachten aan');
  assert.equal(s.ordersKlaar, 1);
});
