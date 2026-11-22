/* Smakenland - spellogica (puur, zonder DOM).
   Werkt in de browser (window.SmakenlandEngine) en in Node (module.exports),
   zodat dezelfde regels door de test-suite en de pagina worden gebruikt. */
(function (root) {
  'use strict';

  // In de browser zet content.js dit op globalThis; in Node laden we het hiernaast.
  const C = root.SmakenlandContent ||
    (typeof require !== 'undefined' ? require('./content.js') : null);

  const COLS = 7;
  const ROWS = 8;
  const MAX_GEN_LEVEL = 3;
  const ENERGIE_MAX = 60;
  const ENERGIE_START = 40;
  const ENERGIE_MS = 12000; // 1 energie per 12 seconden
  const HULP_PER_LEVEL = 4;   // zo vaak mag je per level energie bijvragen
  const HULP_ENERGIE = 10;    // en dat is hoeveel er per keer bij komt
  const MAX_ORDERS = 3;
  const LEVELS = root.SmakenlandLevels ||
    (typeof require !== 'undefined' ? require('./levels.js') : null);

  // ---------------------------------------------------------------- hulpjes

  function idx(r, c) { return r * COLS + c; }
  function rij(i) { return Math.floor(i / COLS); }
  function kolom(i) { return i % COLS; }

  function maakItem(keten, tier, count) {
    return { kind: 'item', keten: keten, tier: tier, count: count || 1 };
  }
  function maakGen(gen, level, count) {
    return { kind: 'gen', gen: gen, level: level || 1, count: count || 1 };
  }

  function maxTier(keten) { return C.CHAINS[keten].tiers.length; }
  function ketenNaam(keten) { return C.CHAINS[keten].naam; }
  function itemNaam(item) {
    if (item.kind === 'gen') return C.GENERATORS[item.gen].naam;
    return C.CHAINS[item.keten].tiers[item.tier - 1].n;
  }

  // Kleine deterministische RNG (mulberry32) - de seed reist mee in de save,
  // zodat een potje altijd hetzelfde verloopt en de tests niet gokken.
  function rng(state) {
    state.seed = (state.seed + 0x6D2B79F5) >>> 0;
    let t = state.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function kies(state, lijst) { return lijst[Math.floor(rng(state) * lijst.length) % lijst.length]; }
  function tussen(state, min, max) { return min + Math.floor(rng(state) * (max - min + 1)); }

  function vrijeCell(state, vanaf) {
    // Zoek een lege cel, het dichtst bij `vanaf`.
    let beste = -1;
    let besteAfstand = 1e9;
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i]) continue;
      const d = Math.abs(rij(i) - rij(vanaf)) + Math.abs(kolom(i) - kolom(vanaf));
      if (d < besteAfstand) { besteAfstand = d; beste = i; }
    }
    return beste;
  }

  // Hoeveel items er omhoog gaan bij een totaal aantal op één stapel.
  // 3 -> 1 · 4 -> 1 + 1 over · 5 -> 2 · 6 -> 2 · 9 -> 3
  function verdeling(total) {
    if (total < 3) return { omhoog: 0, over: total };
    if (total === 4) return { omhoog: 1, over: 1 };
    if (total === 5) return { omhoog: 2, over: 0 };
    const omhoog = Math.floor(total / 3);
    return { omhoog: omhoog, over: total - omhoog * 3 };
  }

  // ------------------------------------------------------------ beginstand

  function createState(opts) {
    opts = opts || {};
    const state = {
      v: 1,
      seed: opts.seed === undefined ? (Date.now() >>> 0) : (opts.seed >>> 0),
      cols: COLS,
      rows: ROWS,
      cells: new Array(COLS * ROWS).fill(null),
      energie: ENERGIE_START,
      energieMax: ENERGIE_MAX,
      laatsteEnergie: opts.nu === undefined ? Date.now() : opts.nu,
      munten: 25,
      sterren: 0,
      gebied: 0,
      orders: [],
      ordersKlaar: 0,
      merges: 0,
      gezien: {} // verhaalkaarten die al getoond zijn
    };
    if (opts.leeg) {
      // Een leeg bord voor tests en voor een nieuw potje zonder startspullen.
      state.munten = 0;
      state.energie = 0;
      return state;
    }

    // Startkistjes en een handjevol items om het versmelten te leren.
    state.cells[idx(0, 3)] = maakGen('zadenkist', 1);
    state.cells[idx(0, 5)] = maakGen('geldkist', 1);
    state.cells[idx(1, 2)] = maakItem('tuin', 1);
    state.cells[idx(1, 3)] = maakItem('tuin', 1);
    state.cells[idx(1, 4)] = maakItem('tuin', 1);
    state.cells[idx(2, 4)] = maakItem('tuin', 2);
    state.cells[idx(2, 3)] = maakItem('tuin', 2);
    state.cells[idx(3, 3)] = maakItem('munt', 1);
    state.cells[idx(3, 4)] = maakItem('munt', 1);
    state.cells[idx(3, 5)] = maakItem('munt', 1);

    while (state.orders.length < MAX_ORDERS) nieuweOrder(state);
    return state;
  }

  // -------------------------------------------------------------- energie

  function tickEnergie(state, nu) {
    nu = nu === undefined ? Date.now() : nu;
    // In een level is het energietegoed vast: het level moet met dat tegoed
    // gespeeld worden, anders zeggen de sterren niets.
    if (state.modus === 'level') return 0;
    let hersteld = 0;
    if (state.energie < state.energieMax) {
      const verstreken = nu - state.laatsteEnergie;
      if (verstreken >= ENERGIE_MS) {
        hersteld = Math.floor(verstreken / ENERGIE_MS);
        hersteld = Math.min(hersteld, state.energieMax - state.energie);
        state.energie += hersteld;
        state.laatsteEnergie += hersteld * ENERGIE_MS;
      }
    } else {
      state.laatsteEnergie = nu;
    }
    return hersteld;
  }

  function secondenTotEnergie(state, nu) {
    nu = nu === undefined ? Date.now() : nu;
    if (state.energie >= state.energieMax) return 0;
    const over = ENERGIE_MS - ((nu - state.laatsteEnergie) % ENERGIE_MS);
    return Math.max(1, Math.ceil(over / 1000));
  }

  // ------------------------------------------------------------ versmelten

  // Voegt `bron` (een item/gen op een cel) toe aan de cel `doelIdx`.
  // Regels: 2 = stapel, 3 = 1 tree hoger, 4 = 1 tree hoger + 1 over.
  function combineer(state, doelIdx, bron, bronIdx, events) {
    const doel = state.cells[doelIdx];
    const isGen = doel.kind === 'gen';
    const top = isGen ? MAX_GEN_LEVEL : maxTier(doel.keten);
    const niveau = isGen ? doel.level : doel.tier;
    const total = doel.count + bron.count;
    const maak = function (tier, count) {
      return isGen ? maakGen(doel.gen, tier, count) : maakItem(doel.keten, tier, count);
    };

    // Nog geen drie bij elkaar, of al op het hoogste niveau: gewoon stapelen.
    if (total < 3 || niveau >= top) {
      doel.count = Math.min(total, 4);
      events.push({ type: 'stapel', cel: doelIdx, aantal: doel.count });
      return;
    }

    const v = verdeling(total);
    state.cells[doelIdx] = maak(niveau + 1, Math.min(v.omhoog, 2));
    events.push({
      type: 'merge',
      cel: doelIdx,
      keten: isGen ? null : doel.keten,
      van: niveau,
      naar: niveau + 1,
      aantal: v.omhoog,
      gen: isGen ? doel.gen : null
    });
    state.merges++;

    // Restanten (extra hogere items, of wat overblijft) naast de stapel leggen.
    const plekken = [];
    if (bronIdx !== null && bronIdx !== undefined) plekken.push(bronIdx);
    const restant = [];
    for (let i = Math.min(v.omhoog, 2); i < v.omhoog; i++) restant.push({ tier: niveau + 1, count: 1 });
    if (v.over > 0) restant.push({ tier: niveau, count: v.over });
    for (const p of restant) {
      let cel = plekken.shift();
      if (cel === undefined) cel = vrijeCell(state, doelIdx);
      if (cel < 0) break; // bord vol: restant vervalt
      state.cells[cel] = maak(p.tier, p.count);
    }
  }

  // Tik op een generator: kost energie, zet een item op het bord.
  function oogst(state, celIdx) {
    const bron = state.cells[celIdx];
    const events = [];
    if (!bron || bron.kind !== 'gen') return { ok: false, reden: 'geen-generator', events: events };
    const kosten = bron.level;
    if (state.energie < kosten) return { ok: false, reden: 'energie', events: events };

    const keten = C.GENERATORS[bron.gen].keten;
    const tier = Math.min(bron.level, maxTier(keten));

    // Het item komt ALTIJD op een vrij vak. De speler bepaalt zelf of en wanneer
    // er iets op elkaar gaat: dat is het spel. Automatisch stapelen (en dus
    // automatisch versmelten) haalt die keuze weg en dan versmelt een doelstuk
    // weg zonder dat je het wilde.
    const doel = vrijeCell(state, celIdx);
    if (doel < 0) return { ok: false, reden: 'vol', events: events };

    state.energie -= kosten;
    if (state.energie >= state.energieMax) state.laatsteEnergie = Date.now();

    state.cells[doel] = maakItem(keten, tier, 1);
    events.push({ type: 'oogst', cel: doel, keten: keten, tier: tier });
    events.unshift({ type: 'energie', waarde: state.energie });
    return { ok: true, cel: doel, events: events };
  }

  // Sleeppen: van cel naar cel.
  function verplaats(state, van, naar) {
    const events = [];
    const bron = state.cells[van];
    const doel = state.cells[naar];
    if (!bron || van === naar) return { ok: false, reden: 'leeg', events: events };
    if (!doel) {
      state.cells[naar] = bron;
      state.cells[van] = null;
      events.push({ type: 'verplaats', van: van, naar: naar });
      return { ok: true, events: events };
    }
    const zelfde =
      bron.kind === doel.kind &&
      (bron.kind === 'gen'
        ? bron.gen === doel.gen && bron.level === doel.level
        : bron.keten === doel.keten && bron.tier === doel.tier);
    if (!zelfde) return { ok: false, reden: 'past-niet', events: events };

    // Ruil van cel naar doel; de bron-cel komt vrij (of krijgt de rest).
    state.cells[van] = null;
    combineer(state, naar, bron, van, events);
    return { ok: true, events: events };
  }

  // Tik op een munt-item: innen.
  function incasseer(state, celIdx) {
    const cel = state.cells[celIdx];
    const events = [];
    if (!cel || cel.kind !== 'item' || cel.keten !== 'munt') return { ok: false, events: events };
    const waarde = C.MUNT_WAARDE.munt[cel.tier - 1] * cel.count;
    state.munten += waarde;
    state.cells[celIdx] = null;
    events.push({ type: 'munten', bedrag: waarde, totaal: state.munten, cel: celIdx });
    return { ok: true, waarde: waarde, events: events };
  }

  // --------------------------------------------------------------- orders

  function ontgrendeldeKetenen(state) {
    const lijst = ['tuin'];
    for (let i = 0; i <= state.gebied && i < C.AREAS.length; i++) {
      const keten = C.GENERATORS[C.AREAS[i].generator].keten;
      if (keten !== 'munt' && lijst.indexOf(keten) < 0) lijst.push(keten);
    }
    return lijst;
  }

  function maxOrderTier(state) {
    return Math.max(2, Math.min(4, 2 + Math.floor(state.gebied / 1.5)));
  }

  function nieuweOrder(state) {
    const ketens = ontgrendeldeKetenen(state);
    // Niet twee keer dezelfde wens naast elkaar: dat leest als een fout.
    let keten = kies(state, ketens);
    let tier = tussen(state, 1, Math.min(maxOrderTier(state), maxTier(keten)));
    for (let poging = 0; poging < 6; poging++) {
      const dubbel = state.orders.some(function (o) { return o.keten === keten && o.tier === tier; });
      if (!dubbel) break;
      keten = kies(state, ketens);
      tier = tussen(state, 1, Math.min(maxOrderTier(state), maxTier(keten)));
    }
    let aantal = tussen(state, 1, tier >= 3 ? 2 : 3);
    // In gebied 1 is er maar één keten; twee keer "2× Zaadje" leest als een fout.
    if (state.orders.some(function (o) { return o.keten === keten && o.tier === tier && o.aantal === aantal; })) {
      aantal = (aantal % 3) + 1;
    }
    const ruw = 8 * tier * tier * aantal * (0.8 + rng(state) * 0.5);
    const order = {
      id: 'o' + (state.ordersKlaar + state.orders.length + 1) + '-' + Math.floor(rng(state) * 1000),
      keten: keten,
      tier: tier,
      aantal: aantal,
      munten: Math.round(ruw / 5) * 5,
      sterren: 1 + Math.floor(tier / 2),
      klant: KLANTEN[(state.ordersKlaar + state.orders.length + tier * 2) % KLANTEN.length]
    };
    state.orders.push(order);
    return order;
  }

  const KLANTEN = ['Buurvrouw Nel', 'Bakker Bram', 'Marktmeesteres Roos', 'Smid Gijs', 'Havenmeester Ot',
    'Sterrenkok Lumi', 'Reiziger Tijs', 'Kleine Suus', 'Vos Vos', 'Meester Koriander'];

  function klantVoor(state, order) {
    // Klantnamen zijn puur versiering; de order zelf is leidend.
    if (!order.klant) order.klant = KLANTEN[(order.aantal + order.tier * 3 + order.keten.length) % KLANTEN.length];
    return order.klant;
  }

  function telItems(state, keten, tier) {
    let n = 0;
    for (const c of state.cells) {
      if (c && c.kind === 'item' && c.keten === keten && c.tier === tier) n += c.count;
    }
    return n;
  }

  function kanLeveren(state, orderId) {
    const order = state.orders.find(function (o) { return o.id === orderId; });
    if (!order) return 0;
    return telItems(state, order.keten, order.tier);
  }

  function lever(state, orderId) {
    const events = [];
    const i = state.orders.findIndex(function (o) { return o.id === orderId; });
    if (i < 0) return { ok: false, reden: 'onbekend', events: events };
    const order = state.orders[i];
    if (telItems(state, order.keten, order.tier) < order.aantal) {
      return { ok: false, reden: 'te-weinig', events: events };
    }
    let nodig = order.aantal;
    for (let cel = 0; cel < state.cells.length && nodig > 0; cel++) {
      const c = state.cells[cel];
      if (!c || c.kind !== 'item' || c.keten !== order.keten || c.tier !== order.tier) continue;
      const weg = Math.min(nodig, c.count);
      nodig -= weg;
      c.count -= weg;
      if (c.count <= 0) state.cells[cel] = null;
    }
    state.munten += order.munten;
    state.sterren += order.sterren;
    state.ordersKlaar++;
    state.orders.splice(i, 1);
    events.push({
      type: 'levering', keten: order.keten, tier: order.tier, aantal: order.aantal,
      munten: order.munten, sterren: order.sterren, muntenTotaal: state.munten, sterrenTotaal: state.sterren
    });
    if (state.modus === 'level') {
      // Een level heeft vaste doelen: geen nieuwe opdracht erbij. Zodra alles
      // geleverd is, is het level klaar en verdient de speler sterren.
      if (state.orders.length === 0) {
        state.levelSterren = levelSterren(state);
        events.push({ type: 'level-klaar', level: state.level, sterren: state.levelSterren, energie: state.energie });
      }
    } else {
      nieuweOrder(state);
      while (state.orders.length < MAX_ORDERS) nieuweOrder(state);
      const gebied = checkGebied(state);
      if (gebied) events.push(gebied);
    }
    return { ok: true, events: events };
  }

  // ------------------------------------------------------------- seizoenen

  // De seizoenshoofdstukken zijn een zijpad: de app laat alleen de hoofdstukken van
  // het seizoen zien dat het op dat moment is. De maanden staan erbij zodat dit te
  // toetsen is (een functie met een datum erin, geen blik op de klok middenin).
  const SEIZOENEN = {
    lente: { naam: 'Lente', maanden: [3, 4, 5], e: '🌷' },
    zomer: { naam: 'Zomer', maanden: [6, 7, 8], e: '🌞' },
    herfst: { naam: 'Herfst', maanden: [9, 10, 11], e: '🍂' },
    winter: { naam: 'Winter', maanden: [12, 1, 2], e: '❄️' }
  };

  /** Welk seizoen hoort bij een maand (1 = januari)? */
  function seizoenVanMaand(maand) {
    for (const sleutel of Object.keys(SEIZOENEN)) {
      if (SEIZOENEN[sleutel].maanden.indexOf(maand) >= 0) return sleutel;
    }
    return null;
  }

  /** Welk seizoen is het op deze datum? Zonder datum: nu. */
  function seizoenNu(datum) {
    const d = datum || new Date();
    return seizoenVanMaand(d.getMonth() + 1);
  }

  function hoofdstukVan(nr) {
    const lv = levelVan(nr);
    if (!lv || !LEVELS) return null;
    return LEVELS.hoofdstukken[lv.hfst] || null;
  }

  /** Het seizoen van het hoofdstuk waarin dit level ligt, of null. */
  function seizoenVanLevel(nr) {
    const h = hoofdstukVan(nr);
    return h ? (h.seizoen || null) : null;
  }

  /** Is dit level in dit seizoen te zien? Gewone levels altijd. */
  function levelZichtbaar(nr, seizoen) {
    const eigen = seizoenVanLevel(nr);
    if (!eigen) return true;
    const nu = seizoen === undefined ? seizoenNu() : seizoen;
    return eigen === nu;
  }

  /** De hoofdstukken die nu te zien zijn: alles behalve de andere seizoenen. */
  function zichtbareHoofdstukken(seizoen) {
    if (!LEVELS) return [];
    const nu = seizoen === undefined ? seizoenNu() : seizoen;
    const uit = [];
    LEVELS.hoofdstukken.forEach(function (h, i) {
      if (h.seizoen && h.seizoen !== nu) return;
      uit.push({ hfst: i, hoofdstuk: h });
    });
    return uit;
  }

  /** Hoeveel levels er nu te zien zijn (voor "x van y gehaald"). */
  function aantalZichtbareLevels(seizoen) {
    return zichtbareHoofdstukken(seizoen).length * (LEVELS ? LEVELS.niveauPerHoofdstuk : 0);
  }

  /** De seizoenen die nu niet meedoen, met hun hoofdstukken. */
  function andereSeizoenen(seizoen) {
    if (!LEVELS) return [];
    const nu = seizoen === undefined ? seizoenNu() : seizoen;
    return Object.keys(SEIZOENEN).filter(function (s) { return s !== nu; }).map(function (s) {
      return {
        seizoen: s, naam: SEIZOENEN[s].naam, e: SEIZOENEN[s].e,
        hoofdstukken: LEVELS.hoofdstukken
          .map(function (h, i) { return { hfst: i, hoofdstuk: h }; })
          .filter(function (x) { return x.hoofdstuk.seizoen === s; })
          .map(function (x) { return x.hoofdstuk.naam; })
      };
    });
  }

  // ---------------------------------------------------------------- levels

  function levels() { return LEVELS; }

  function levelVan(nr) {
    if (!LEVELS || nr < 1 || nr > LEVELS.levels.length) return null;
    return LEVELS.levels[nr - 1];
  }

  /** Stars voor een gehaald level: hoe meer energie er over is, hoe beter. */
  function levelSterren(state) {
    const deel = state.energieMax > 0 ? state.energie / state.energieMax : 0;
    if (deel >= 0.4) return 3;
    if (deel >= 0.15) return 2;
    return 1;
  }

  function levelKlaar(state) {
    return state.modus === 'level' && state.orders.length === 0;
  }

  /** Een verse stand voor één level: vast bord, vast energietegoed. */
  function startLevel(nr, nu) {
    const lv = levelVan(nr);
    if (!lv) return null;
    const state = createState({ leeg: true, nu: nu, seed: (1000003 * nr) >>> 0 });
    state.modus = 'level';
    state.level = nr;
    state.energie = lv.energie;
    state.energieMax = lv.energie;
    state.laatsteEnergie = nu === undefined ? Date.now() : nu;
    state.munten = 0;
    state.sterren = 0;
    state.levelSterren = 0;
    state.hulpGebruikt = 0;

    // Kisten bovenin, om en om verdeeld over de rij.
    lv.kisten.forEach(function (k, i) {
      const kolom = 2 + (i * 2) % 5;
      let cel = idx(0, Math.min(COLS - 1, kolom));
      if (state.cells[cel]) cel = vrijeCell(state, cel);
      if (cel >= 0) state.cells[cel] = maakGen(k.gen, k.level);
    });
    // Startstukken eronder, per keten bij elkaar.
    lv.start.forEach(function (stuk, i) {
      let cel = vrijeCell(state, idx(2 + (i % 3), 1 + (i % 5)));
      if (cel >= 0) state.cells[cel] = maakItem(stuk.keten, stuk.tier, stuk.aantal);
    });
    // De doelen van dit level.
    lv.doelen.forEach(function (d, i) {
      state.orders.push({
        id: 'doel' + i,
        keten: d.keten,
        tier: d.tier,
        aantal: d.aantal,
        munten: 0,
        sterren: 0,
        klant: KLANTEN[(nr + i * 3) % KLANTEN.length]
      });
    });
    return state;
  }

  /**
   * Een handje energie in een level. Dat mag een paar keer per level: één keer
   * is te weinig als je een level verknoeit, en oneindig maakt de sterren
   * waardeloos (elke beurt gaat zowel het tegoed als het maximum omhoog, dus
   * de verhouding — en daarmee de sterren — blijft eerlijk).
   */
  function hulp(state) {
    if (state.modus !== 'level') return { ok: false, reden: 'geen-hulp' };
    const gebruikt = hulpGebruikt(state);
    if (gebruikt >= HULP_PER_LEVEL) return { ok: false, reden: 'geen-hulp', over: 0 };
    state.hulpGebruikt = gebruikt + 1;
    state.energie += HULP_ENERGIE;
    state.energieMax = Math.max(state.energieMax, state.energie);
    return {
      ok: true, energie: state.energie, over: HULP_PER_LEVEL - state.hulpGebruikt,
      events: [{ type: 'energie', waarde: state.energie }]
    };
  }

  /** Hoe vaak de hulp al gebruikt is (oude potjes bewaarden een ja/nee). */
  function hulpGebruikt(state) {
    const n = Number(state.hulpGebruikt);
    return Number.isFinite(n) ? n : 0;
  }

  /** Hoe vaak je in dit level nog om energie mag vragen. */
  function hulpOver(state) {
    if (state.modus !== 'level') return 0;
    return Math.max(0, HULP_PER_LEVEL - hulpGebruikt(state));
  }

  /**
   * Is dit level te openen? Level 1 altijd, daarna pas na het vorige.
   *
   * Seizoenshoofdstukken zijn een zijpad: hun eerste level staat open zodra het
   * seizoen er is, ook als de speler het hoofdpad nog niet uit is. Buiten het
   * seizoen is zo'n level niet te openen (de app laat het dan ook niet zien).
   * `seizoen` is er om te kunnen toetsen; zonder opgave is het het echte seizoen.
   */
  function levelOpen(voortgang, nr, seizoen) {
    const nu = seizoen === undefined ? seizoenNu() : seizoen;
    if (nr <= 1) return true;
    const perHfst = LEVELS ? LEVELS.niveauPerHoofdstuk : 25;
    const eersteVanHoofdstuk = (nr - 1) % perHfst === 0;
    const eigen = seizoenVanLevel(nr);
    if (eigen) {
      if (eigen !== nu) return false;              // buiten het seizoen: dicht
      if (eersteVanHoofdstuk) return true;         // zijpad begint open
    }
    return !!(voortgang && voortgang[nr - 1]);
  }

  // --------------------------------------------------------------- gebied

  function checkGebied(state) {
    let nieuw = null;
    for (let i = C.AREAS.length - 1; i > state.gebied; i--) {
      if (state.sterren >= C.AREAS[i].sterren) { nieuw = i; break; }
    }
    if (nieuw === null) return null;
    state.gebied = nieuw;
    const area = C.AREAS[nieuw];
    const gen = area.generator;
    const vrij = vrijeCell(state, idx(Math.floor(ROWS / 2), Math.floor(COLS / 2)));
    if (vrij >= 0) state.cells[vrij] = maakGen(gen, 1);
    return {
      type: 'gebied', gebied: nieuw, naam: area.naam, verhaal: area.verhaal,
      e: area.e, generator: gen, generatorNaam: C.GENERATORS[gen].naam
    };
  }

  function volgendGebied(state) {
    const i = state.gebied + 1;
    return i < C.AREAS.length ? C.AREAS[i] : null;
  }

  // --------------------------------------------------------------- winkel

  function koop(state, id) {
    const events = [];
    const artikel = C.SHOP.find(function (a) { return a.id === id; });
    if (!artikel) return { ok: false, reden: 'onbekend', events: events };
    if (state.munten < artikel.prijs) return { ok: false, reden: 'munten', events: events };
    const vrij = vrijeCell(state, idx(Math.floor(ROWS / 2), Math.floor(COLS / 2)));
    if (vrij < 0 && id !== 'energie') return { ok: false, reden: 'vol', events: events };

    state.munten -= artikel.prijs;
    if (id === 'energie') {
      state.energie = Math.min(state.energieMax + 25, state.energie + 25);
      events.push({ type: 'energie', waarde: state.energie });
    } else {
      const gen = id === 'zadenkist' ? 'zadenkist' : id === 'geldkist' ? 'geldkist' : 'deegkom';
      state.cells[vrij] = maakGen(gen, 1);
      events.push({ type: 'kist', cel: vrij, gen: gen });
    }
    events.push({ type: 'munten', bedrag: -artikel.prijs, totaal: state.munten });
    return { ok: true, events: events };
  }

  // --------------------------------------------------------------- opslag

  function serialiseer(state) {
    return JSON.stringify(state);
  }

  function laad(tekst, nu) {
    let ruw;
    try { ruw = typeof tekst === 'string' ? JSON.parse(tekst) : tekst; } catch (e) { return null; }
    if (!ruw || ruw.v !== 1 || !Array.isArray(ruw.cells) || ruw.cells.length !== COLS * ROWS) return null;
    const state = ruw;
    if (typeof state.sterren !== 'number') state.sterren = 0;
    if (!Array.isArray(state.orders) || state.orders.length === 0) {
      state.orders = [];
      while (state.orders.length < MAX_ORDERS) nieuweOrder(state);
    }
    if (!state.gezien) state.gezien = {};
    tickEnergie(state, nu);
    return state;
  }

  function tijdTotVol(state, nu) {
    nu = nu === undefined ? Date.now() : nu;
    const tekort = state.energieMax - state.energie;
    if (tekort <= 0) return 0;
    return secondenTotEnergie(state, nu) + (tekort - 1) * (ENERGIE_MS / 1000);
  }

  const engine = {
    COLS: COLS, ROWS: ROWS, ENERGIE_MS: ENERGIE_MS, MAX_ORDERS: MAX_ORDERS, MAX_GEN_LEVEL: MAX_GEN_LEVEL,
    idx: idx, rij: rij, kolom: kolom,
    maakItem: maakItem, maakGen: maakGen, itemNaam: itemNaam, ketenNaam: ketenNaam, maxTier: maxTier,
    createState: createState, tickEnergie: tickEnergie, secondenTotEnergie: secondenTotEnergie,
    tijdTotVol: tijdTotVol,
    oogst: oogst, verplaats: verplaats, incasseer: incasseer,
    nieuweOrder: nieuweOrder, klantVoor: klantVoor, telItems: telItems, kanLeveren: kanLeveren, lever: lever,
    ontgrendeldeKetenen: ontgrendeldeKetenen, maxOrderTier: maxOrderTier,
    checkGebied: checkGebied, volgendGebied: volgendGebied, koop: koop,
    levels: levels, levelVan: levelVan, startLevel: startLevel, levelSterren: levelSterren,
    levelKlaar: levelKlaar, levelOpen: levelOpen, hulp: hulp, hulpOver: hulpOver,
    SEIZOENEN: SEIZOENEN, seizoenVanMaand: seizoenVanMaand, seizoenNu: seizoenNu,
    hoofdstukVan: hoofdstukVan, seizoenVanLevel: seizoenVanLevel, levelZichtbaar: levelZichtbaar,
    zichtbareHoofdstukken: zichtbareHoofdstukken, aantalZichtbareLevels: aantalZichtbareLevels,
    andereSeizoenen: andereSeizoenen,
    HULP_PER_LEVEL: HULP_PER_LEVEL, HULP_ENERGIE: HULP_ENERGIE,
    serialiseer: serialiseer, laad: laad,
    vrijeCell: vrijeCell
  };

  root.SmakenlandEngine = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
