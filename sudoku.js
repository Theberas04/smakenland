/* Smakenland - Sudoku: generator en regels, puur en zonder DOM.
   Werkt in de browser (window.SmakenlandSudoku) en in Node (module.exports).

   Er zijn meerdere maten: 4x4, 6x6, 9x9, 12x12 en 16x16. Alles hier werkt met een
   `maat`-beschrijving (zie MATEN). De speelfuncties (conflicten, klaar, hint,
   voortgang) leiden de maat af uit de lengte van het bord, zodat de aanroepen
   hetzelfde blijven voor wie alleen 9x9 gebruikt. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- maten

  // br x bk = de blokken (aantal rijen x aantal kolommen per blok).
  // symbolen: wat de speler in een vak ziet staan, op volgorde van waarde 1..n.
  const MATEN = {
    4: { n: 4, br: 2, bk: 2, symbolen: '1234', naam: '4×4 (blokken 2×2)' },
    6: { n: 6, br: 2, bk: 3, symbolen: '123456', naam: '6×6 (blokken 2×3)' },
    9: { n: 9, br: 3, bk: 3, symbolen: '123456789', naam: '9×9 (blokken 3×3)' },
    12: { n: 12, br: 3, bk: 4, symbolen: '123456789ABC', naam: '12×12 (blokken 3×4)' },
    16: { n: 16, br: 4, bk: 4, symbolen: '123456789ABCDEFG', naam: '16×16 (blokken 4×4)' }
  };

  // De standaardmaat en de moeilijkheden. Het aandeel ingevulde vakken schaalt mee
  // met de maat: een 16×16 met 26 aanwijzingen is niet te doen, een 4×4 met 42 kan
  // niet eens.
  const N = 9;
  const CEL = 81;

  const MOEILIJKHEID = {
    makkelijk: { naam: 'Makkelijk', deel: 0.52, hints: 5, sterren: 1 },
    midden: { naam: 'Midden', deel: 0.41, hints: 3, sterren: 2 },
    moeilijk: { naam: 'Moeilijk', deel: 0.32, hints: 1, sterren: 3 }
  };

  function maatVan(key) {
    const m = MATEN[key] || MATEN[N];
    return m;
  }

  // ------------------------------------------------------------ varianten
  //
  // Een variant voegt eisen toe aan de gewone sudoku (rij, kolom, blok):
  //   * diagonaal: ook de twee lange diagonalen mogen elk cijfer maar één keer hebben;
  //   * ongelijk: de blokken zijn geen rechthoeken maar slierten van n vakjes.
  // Allebei zitten ze in de maat-beschrijving, zodat de rest van de code (de zoeker,
  // de conflicten, het tekenen) er niets van hoeft te weten: die vraagt gewoon
  // "welke groep hoort bij dit vak".

  const VARIANTEN = {
    gewoon: { naam: 'Gewoon', tekst: 'Rijen, kolommen en blokken.' },
    diagonaal: { naam: 'Diagonaal', tekst: 'De twee diagonalen tellen ook mee.' },
    ongelijk: { naam: 'Ongelijk', tekst: 'Blokken met een andere vorm.' }
  };

  /** De vakken van de twee lange diagonalen, als extra groepen. */
  function diagonalen(n) {
    const hoofd = [];
    const dwars = [];
    for (let i = 0; i < n; i++) {
      hoofd.push(i * n + i);
      dwars.push(i * n + (n - 1 - i));
    }
    return [hoofd, dwars];
  }

  /** Bij welke groep hoort dit vak? De slierten van een ongelijke sudoku, of het blok. */
  function regioVan(i, m) {
    const mm = m || MATEN[N];
    return mm.regio ? mm.regio[i] : blok(i, mm);
  }

  /** De vakken per groep, één keer uitgerekend per maat. */
  function regioCellen(m) {
    if (m._regioCellen) return m._regioCellen;
    const n = m.n;
    const uit = [];
    for (let g = 0; g < n; g++) uit.push([]);
    for (let i = 0; i < n * n; i++) uit[regioVan(i, m)].push(i);
    m._regioCellen = uit;
    return uit;
  }

  /** Welke extra groepen (diagonalen) dit vak raken. */
  function extraVan(i, m) {
    if (!m.extra) return null;
    if (!m._extraVan) {
      m._extraVan = [];
      for (let c = 0; c < m.n * m.n; c++) m._extraVan.push([]);
      m.extra.forEach(function (groep, g) {
        groep.forEach(function (c) { m._extraVan[c].push(g); });
      });
    }
    return m._extraVan[i];
  }

  /** Een maat met de diagonalen erbij. */
  function maatDiagonaal(key) {
    const basis = maatVan(key);
    return Object.assign({}, basis, { variant: 'diagonaal', extra: diagonalen(basis.n) });
  }

  /** Een maat met zelfgekozen groepen in plaats van rechthoekige blokken. */
  function maatMetRegio(key, regio) {
    const basis = maatVan(key);
    return Object.assign({}, basis, { variant: 'ongelijk', regio: regio });
  }

  /**
   * Verdeelt een bord in n groepen van n vakjes, elk aan elkaar vast, en niet
   * rechthoekig.
   *
   * Dat gaat in twee stappen. Eerst een gewoon vol bord en de gewone blokken: die
   * horen bij elkaar, dus er is zeker een oplossing. Daarna ruilen we vakjes tussen
   * twee groepen — en dat mag alleen als beide groepen aan elkaar vast blijven én
   * als elke groep van elk cijfer nog steeds precies één vakje houdt. Zo blijft het
   * bord dat we al hebben een oplossing, en dat is precies wat we willen: van een
   * willekeurige indeling bestaat namelijk meestal géén oplossing (bij 9×9 in drie
   * van de vier gevallen), en dan zit de app te zoeken naar iets dat niet bestaat.
   *
   * `oplossing` mag meegegeven worden; zonder opgave maken we er eerst zelf een.
   */
  function maakRegio(n, rnd, oplossing) {
    const cel = n * n;
    let bord = oplossing;
    if (!bord) {
      bord = new Array(cel).fill(0);
      if (!vul(bord, rnd, MATEN[n] || MATEN[N])) return null;
    }
    const maat = MATEN[n] || MATEN[N];
    const regio = new Array(cel);
    const perCijfer = {};
    for (let d = 1; d <= n; d++) perCijfer[d] = [];
    for (let i = 0; i < cel; i++) {
      const g = blok(i, maat);
      regio[i] = g;
      perCijfer[bord[i]].push(i);
    }

    // Ruilen kan alleen tussen twee vakjes met hetzelfde cijfer: dan houdt elke
    // groep van elk cijfer precies één vakje. Twee vakjes met hetzelfde cijfer
    // liggen nooit naast elkaar, dus zo'n ruil raakt nooit de rijen of kolommen.
    // We zoeken per ronde gericht verder als de eerste poging niet lukt — met
    // blinde gokken lukte het bij kleine borden vaak helemaal niet.
    const rondes = 60 * n;
    let gelukt = 0;
    for (let ronde = 0; ronde < rondes; ronde++) {
      const d = 1 + Math.floor(rnd() * n) % n;
      const lijst = perCijfer[d];
      if (!lijst || lijst.length < 2) continue;
      const i = lijst[Math.floor(rnd() * lijst.length) % lijst.length];
      const a = regio[i];
      const orde = lijst.slice();
      for (let q = orde.length - 1; q > 0; q--) {
        const k = Math.floor(rnd() * (q + 1));
        const w = orde[q];
        orde[q] = orde[k];
        orde[k] = w;
      }
      for (const j of orde) {
        if (j === i) continue;
        const b = regio[j];
        if (a === b) continue;
        regio[i] = b;
        regio[j] = a;
        if (vast(regio, n, a) && vast(regio, n, b)) {
          gelukt++;
          break;
        }
        regio[i] = a;
        regio[j] = b;
      }
    }
    // Zonder genoeg geslaagde ruilen lijkt het nog te veel op een gewone sudoku.
    if (gelukt < 2 * n) return null;
    return regio;
  }

  /**
   * Een ongelijke sudoku in één keer: de verdeling én de oplossing die erbij
   * hoort. Die twee horen bij elkaar — het opnieuw laten zoeken van een oplossing
   * bij een bestaande verdeling kan lang duren, terwijl we de oplossing al hadden.
   */
  function maakOngelijk(n, rnd) {
    const bord = new Array(n * n).fill(0);
    if (!vul(bord, rnd, MATEN[n] || MATEN[N])) return null;
    const regio = maakRegio(n, rnd, bord);
    if (!regio) return null;
    return { regio: regio, oplossing: bord };
  }

  /** Ligt groep g nog aan elkaar vast? */
  function vast(regio, n, g) {
    let start = -1;
    let totaal = 0;
    for (let i = 0; i < n * n; i++) {
      if (regio[i] !== g) continue;
      totaal++;
      if (start < 0) start = i;
    }
    if (start < 0) return false;
    const gezien = new Array(n * n).fill(false);
    const stapel = [start];
    gezien[start] = true;
    let aantalGezien = 1;
    while (stapel.length) {
      const i = stapel.pop();
      for (const b of buurVakken(i, n)) {
        if (regio[b] !== g || gezien[b]) continue;
        gezien[b] = true;
        aantalGezien++;
        stapel.push(b);
      }
    }
    return aantalGezien === totaal;
  }

  /** De vier (of minder, aan de rand) vakjes naast deze cel. */
  function buurVakken(i, n) {
    const r = Math.floor(i / n);
    const k = i % n;
    const uit = [];
    if (r > 0) uit.push(i - n);
    if (r < n - 1) uit.push(i + n);
    if (k > 0) uit.push(i - 1);
    if (k < n - 1) uit.push(i + 1);
    return uit;
  }

  /** Ligt elke groep aan elkaar vast, en heeft elke groep precies n vakjes? */
  function verbonden(regio, n) {
    for (let g = 0; g < n; g++) {
      const cellen = [];
      for (let i = 0; i < n * n; i++) if (regio[i] === g) cellen.push(i);
      if (cellen.length !== n) return false;
      const gezien = {};
      const stapel = [cellen[0]];
      gezien[cellen[0]] = true;
      let aantal = 1;
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
          if (regio[b] !== g || gezien[b]) continue;
          gezien[b] = true;
          aantal++;
          stapel.push(b);
        }
      }
      if (aantal !== n) return false;
    }
    return true;
  }

  /** De maat die bij een bord hoort (lengte = n²). */
  function maatVanBord(bord) {
    const n = Math.round(Math.sqrt(bord.length));
    return MATEN[n] || null;
  }

  function alleBits(n) { return (1 << (n + 1)) - 2; }   // bits 1 t/m n

  // ------------------------------------------------------------ kleine rng

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

  function rij(i, m) { const n = (m || MATEN[N]).n; return Math.floor(i / n); }
  function kolom(i, m) { const n = (m || MATEN[N]).n; return i % n; }
  /**
   * Het nummer van de groep (het blok) waarin dit vakje ligt, van 0 tot n-1.
   *
   * Let op de deler: het aantal blokken naast elkaar is n / bk (het aantal kolommen
   * per blok), niet n / br. Bij 9×9 en 16×16 is dat hetzelfde en viel het niet op,
   * maar bij 6×6 (blokken 2×3) en 12×12 (3×4) kwamen er nummers uit die buiten 0..n-1
   * vielen. Die nummers gebruikten we wel om maskers en groepen op te zoeken, dus
   * dat liep mis zodra er per groep iets werd bijgehouden.
   */
  function blok(i, m) {
    const mm = m || MATEN[N];
    const n = mm.n;
    return Math.floor(Math.floor(i / n) / mm.br) * (n / mm.bk) + Math.floor((i % n) / mm.bk);
  }

  // ------------------------------------------------------------- sudoku-eil

  function mag(bord, i, waarde, m) {
    const mm = m || maatVanBord(bord) || MATEN[N];
    const n = mm.n;
    const r = rij(i, mm);
    const k = kolom(i, mm);
    for (let j = 0; j < n; j++) {
      if (bord[r * n + j] === waarde) return false;
      if (bord[j * n + k] === waarde) return false;
    }
    const cellen = regioCellen(mm)[regioVan(i, mm)];
    for (const c of cellen) if (bord[c] === waarde) return false;
    const extra = extraVan(i, mm);
    if (extra) {
      for (const g of extra) {
        for (const c of mm.extra[g]) if (bord[c] === waarde) return false;
      }
    }
    return true;
  }

  function kandidaten(bord, i, m) {
    const mm = m || maatVanBord(bord) || MATEN[N];
    const uit = [];
    for (let v = 1; v <= mm.n; v++) if (mag(bord, i, v, mm)) uit.push(v);
    return uit;
  }

  // Bitmaskers per rij, kolom en groep: de zoeker hieronder werkt daarmee, want
  // een sudoku met weinig aanwijzingen is met losse vergelijkingen per stap te
  // traag (dat liep vast op een opgave met een fout erin). De groepen zijn de
  // blokken, of de slierten van een ongelijke sudoku.
  function maskers(bord, m) {
    const mm = m || maatVanBord(bord) || MATEN[N];
    const n = mm.n;
    const cel = n * n;
    const r = new Array(n).fill(0);
    const k = new Array(n).fill(0);
    const b = new Array(n).fill(0);
    const x = new Array(mm.extra ? mm.extra.length : 0).fill(0);
    const mk = { r: r, k: k, b: b, x: x, m: mm, alle: alleBits(n), cel: cel };
    for (let i = 0; i < cel; i++) {
      const v = bord[i];
      if (!v) continue;
      if (v > n) return null;
      const bit = 1 << v;
      if (!(vrijBits(mk, i) & bit)) return null;   // al dubbel in rij, kolom, groep of diagonaal
      zetBits(mk, i, bit);
    }
    return mk;
  }

  function vrijBits(mk, i) {
    let bits = ~(mk.r[rij(i, mk.m)] | mk.k[kolom(i, mk.m)] | mk.b[regioVan(i, mk.m)]) & mk.alle;
    const extra = extraVan(i, mk.m);
    if (extra) {
      for (const g of extra) bits &= ~mk.x[g];
    }
    return bits & mk.alle;
  }

  /** Zet een waarde in de maskers van deze cel (rij, kolom, groep en diagonalen). */
  function zetBits(mk, i, bit) {
    mk.r[rij(i, mk.m)] |= bit;
    mk.k[kolom(i, mk.m)] |= bit;
    mk.b[regioVan(i, mk.m)] |= bit;
    const extra = extraVan(i, mk.m);
    if (extra) for (const g of extra) mk.x[g] |= bit;
  }

  /** En haal hem er weer uit (bij het terugzoeken). */
  function wisBits(mk, i, bit) {
    mk.r[rij(i, mk.m)] &= ~bit;
    mk.k[kolom(i, mk.m)] &= ~bit;
    mk.b[regioVan(i, mk.m)] &= ~bit;
    const extra = extraVan(i, mk.m);
    if (extra) for (const g of extra) mk.x[g] &= ~bit;
  }

  function telBits(bits, n) {
    let aantal = 0;
    for (let v = 1; v <= n; v++) if (bits & (1 << v)) aantal++;
    return aantal;
  }

  /**
   * Vult een leeg bord volgens de eisen van deze maat. Geeft false terug als het
   * niet lukt — en ook als het zoeken te lang duurt: bij een ongelijke sudoku kan
   * de verdeling van de groepen onmogelijk zijn, en dan zou de zoeker de hele
   * ruimte aflopen (dat liep op een telefoon minuten vast). Met een plafond op het
   * aantal stappen zeggen we "deze verdeling lukt niet" en probeert de aanroeper
   * een andere.
   */
  function vul(bord, rnd, m, budget) {
    const mk = maskers(bord, m);
    if (!mk) return false;
    const max = budget === undefined ? 200000 : budget;
    const n = mk.m.n;
    const cel = mk.cel;
    let stappen = 0;
    function stap() {
      if (++stappen > max) return false;
      let keuze = -1;
      let min = n + 1;
      let beste = 0;
      for (let i = 0; i < cel; i++) {
        if (bord[i]) continue;
        const bits = vrijBits(mk, i);
        const aantal = telBits(bits, n);
        if (aantal === 0) return false;
        if (aantal < min) { min = aantal; keuze = i; beste = bits; if (aantal === 1) break; }
      }
      if (keuze < 0) return true;                 // bord vol
      const waarden = [];
      for (let v = 1; v <= n; v++) if (beste & (1 << v)) waarden.push(v);
      for (let q = waarden.length - 1; q > 0; q--) {
        const j = Math.floor(rnd() * (q + 1));
        const w = waarden[q];
        waarden[q] = waarden[j];
        waarden[j] = w;
      }
      for (const v of waarden) {
        const bit = 1 << v;
        bord[keuze] = v;
        zetBits(mk, keuze, bit);
        if (stap()) return true;
        bord[keuze] = 0;
        wisBits(mk, keuze, bit);
      }
      return false;
    }
    return stap();
  }

  /**
   * Hoeveel oplossingen heeft deze opgave? Stopt bij `max` (2 is genoeg).
   *
   * `budget` is het aantal stappen dat de zoeker mag doen. Grote borden met weinig
   * aanwijzingen (16x16, moeilijk) kunnen anders minuten zoeken: dan zeggen we
   * "niet bewezen uniek" (we geven `max` terug) en blijft de aanwijzing staan.
   * Zo kan het maken van een opgave nooit blijven hangen, ook niet op een telefoon.
   */
  function aantalOplossingen(bord, max, m, budget) {
    max = max || 2;
    if (budget === undefined) budget = 200000;
    const mk = maskers(bord, m);
    if (!mk) return 0;                              // twee dezelfde waarden in een rij/kolom/blok
    const n = mk.m.n;
    const cel = mk.cel;
    const werk = bord.slice();
    let gevonden = 0;
    let stappen = 0;
    (function stap() {
      if (gevonden >= max) return;
      if (++stappen > budget) { gevonden = max; return; }
      let keuze = -1;
      let beste = 0;
      let min = n + 1;
      for (let i = 0; i < cel; i++) {
        if (werk[i]) continue;
        const bits = vrijBits(mk, i);
        const aantal = telBits(bits, n);
        if (aantal === 0) return;
        if (aantal < min) { min = aantal; keuze = i; beste = bits; if (aantal === 1) break; }
      }
      if (keuze < 0) { gevonden++; return; }
      for (let v = 1; v <= n; v++) {
        if (!(beste & (1 << v))) continue;
        const bit = 1 << v;
        werk[keuze] = v;
        zetBits(mk, keuze, bit);
        stap();
        werk[keuze] = 0;
        wisBits(mk, keuze, bit);
        if (gevonden >= max) return;
      }
    })();
    return gevonden;
  }

  function los(bord, m, budget) {
    const werk = bord.slice();
    if (!vul(werk, rngMaker(7), m, budget)) return null;
    return werk;
  }

  // -------------------------------------------------------------- maken

  /** Hoeveel aanwijzingen een opgave van deze maat en moeilijkheid mikt. */
  function doelGegeven(n, niveau) {
    const instelling = MOEILIJKHEID[niveau] || MOEILIJKHEID.midden;
    return Math.max(4, Math.round(n * n * instelling.deel));
  }

  /**
   * Maakt een nieuwe opgave met precies één oplossing.
   * `maatKey` is 4, 6, 9, 12 of 16 (of een maat-beschrijving), standaard 9.
   * `variant` is 'gewoon' (standaard), 'diagonaal' of 'ongelijk'.
   */
  function maak(zaad, niveau, maatKey, variant) {
    const basis = maatVan(maatKey);
    const n = basis.n;
    const cel = n * n;
    const sleutel = MATEN[maatKey] ? Number(maatKey) : basis.n;
    const niveauNaam = MOEILIJKHEID[niveau] ? niveau : 'midden';
    const soort = VARIANTEN[variant] ? variant : 'gewoon';
    const rnd = rngMaker(zaad);

    let m = basis;
    let klaarBord = null;
    if (soort === 'diagonaal') m = maatDiagonaal(maatKey);
    if (soort === 'ongelijk') {
      const uit = maakOngelijk(n, rnd);
      if (!uit) return null;              // geen vorm te vinden: de aanroeper probeert iets anders
      m = maatMetRegio(maatKey, uit.regio);
      klaarBord = uit.oplossing;          // die hoort bij deze verdeling; niet opnieuw zoeken
    }

    const doel = doelGegeven(n, niveauNaam);
    const oplossing = klaarBord ? klaarBord.slice() : new Array(cel).fill(0);
    if (!klaarBord) {
      // Ruim budget: bij een ongelijke sudoku mag het zoeken best wat moeite kosten,
      // maar het mag nooit blijven hangen. Lukt het niet, dan probeert de aanroeper
      // een andere opgave (zie ook de toelichting bij vul).
      if (!vul(oplossing, rnd, m, 2000000)) return null;
    }

    const opgave = oplossing.slice();
    // Symmetrisch weghalen (draaipunt in het midden): dat leest rustiger en is
    // de klassieke vorm van een sudoku.
    const cellen = [];
    for (let i = 0; i < Math.ceil(cel / 2); i++) cellen.push(i);
    for (let q = cellen.length - 1; q > 0; q--) {
      const j = Math.floor(rnd() * (q + 1));
      const w = cellen[q];
      cellen[q] = cellen[j];
      cellen[j] = w;
    }

    let over = cel;
    for (const i of cellen) {
      if (over <= doel) break;
      const spiegel = cel - 1 - i;
      const a = opgave[i];
      const b = spiegel === i ? 0 : opgave[spiegel];
      if (a === 0 && b === 0) continue;
      opgave[i] = 0;
      if (spiegel !== i) opgave[spiegel] = 0;
      if (aantalOplossingen(opgave, 2, m) !== 1) {       // niet uniek: terugzetten
        opgave[i] = a;
        if (spiegel !== i) opgave[spiegel] = b;
      } else {
        over -= spiegel === i ? 1 : 2;
      }
    }

    return {
      zaad: zaad >>> 0,
      niveau: niveauNaam,
      maat: sleutel,
      variant: soort,
      regio: m.regio || null,
      n: n,
      symbolen: m.symbolen,
      opgave: opgave,
      oplossing: oplossing,
      gegeven: opgave.map(function (v) { return v !== 0; }),
      gegevenAantal: opgave.filter(function (v) { return v !== 0; }).length
    };
  }

  /**
   * Een opgave uit de kant-en-klare verzameling (zie sudokus.js), of null.
   * `variant` is 'gewoon' (standaard) of 'diagonaal': voor de varianten staat er
   * een eigen verzameling, want met de diagonalen erbij moet een opgave opnieuw
   * gemaakt en nagerekend worden.
   */
  function uitVerzameling(maatKey, niveau, keuze, variant) {
    const m = maatVan(maatKey);
    const soort = VARIANTEN[variant] ? variant : 'gewoon';
    const verzameling = soort === 'gewoon'
      ? root.SMAKENLAND_SUDOKUS
      : (root.SMAKENLAND_SUDOKUS_VARIANT || {})[soort];
    if (!verzameling || !verzameling[m.n] || !verzameling[m.n][niveau]) return null;
    const lijst = verzameling[m.n][niveau];
    if (!lijst.length) return null;
    const index = ((keuze === undefined ? Math.floor(Math.random() * lijst.length) : keuze) % lijst.length + lijst.length) % lijst.length;
    const opgave = lijst[index].split('').map(function (teken) {
      const p = m.symbolen.indexOf(teken);
      return p < 0 ? 0 : p + 1;
    });
    const cel = m.n * m.n;
    if (opgave.length !== cel) return null;
    const mm = soort === 'diagonaal' ? maatDiagonaal(maatKey) : m;
    const oplossing = los(opgave, mm, 5000000);
    if (!oplossing) return null;
    return {
      zaad: m.n * 1000000 + index,
      niveau: niveau,
      maat: m.n,
      variant: soort,
      regio: null,
      n: m.n,
      symbolen: m.symbolen,
      verzamelingIndex: index,
      opgave: opgave,
      oplossing: oplossing,
      gegeven: opgave.map(function (v) { return v !== 0; }),
      gegevenAantal: opgave.filter(function (v) { return v !== 0; }).length
    };
  }

  // -------------------------------------------------------------- spelen

  /** Een waarde als wat de speler ziet: 10 -> 'A', 16 -> 'G'. */
  function teken(waarde, m) {
    const mm = m || null;
    const symbolen = mm ? mm.symbolen : MATEN[N].symbolen;
    return waarde ? symbolen.charAt(waarde - 1) : '';
  }

  /** Zitten twee vakken in dezelfde extra groep (bijvoorbeeld dezelfde diagonaal)? */
  function zelfdeExtra(i, j, m) {
    const extra = extraVan(i, m);
    if (!extra) return false;
    for (const g of extra) if (m.extra[g].indexOf(j) >= 0) return true;
    return false;
  }

  function conflicten(bord, m) {
    const mm = m || maatVanBord(bord) || MATEN[N];
    const cel = bord.length;
    const fout = new Array(cel).fill(false);
    for (let i = 0; i < cel; i++) {
      const v = bord[i];
      if (!v) continue;
      for (let j = 0; j < cel; j++) {
        if (j === i || bord[j] !== v) continue;
        if (rij(j, mm) === rij(i, mm) || kolom(j, mm) === kolom(i, mm) ||
            regioVan(j, mm) === regioVan(i, mm) || zelfdeExtra(i, j, mm)) {
          fout[i] = true;
          fout[j] = true;
        }
      }
    }
    return fout;
  }

  function klaar(bord, oplossing) {
    for (let i = 0; i < bord.length; i++) if (bord[i] !== oplossing[i]) return false;
    return true;
  }

  /** Een zet die de speler zelf zou kunnen doen: eerst een fout, dan een leeg vak. */
  function hint(bord, oplossing, gegeven) {
    for (let i = 0; i < bord.length; i++) {
      if (bord[i] !== 0 && bord[i] !== oplossing[i]) return { cel: i, waarde: oplossing[i], soort: 'fout' };
    }
    for (let i = 0; i < bord.length; i++) {
      if (bord[i] === 0) return { cel: i, waarde: oplossing[i], soort: 'leeg' };
    }
    return null;
  }

  /** Hoeveel van de nog lege vakken zijn goed ingevuld (voor de voortgangsbalk). */
  function voortgang(bord, oplossing) {
    let open = 0;
    let goed = 0;
    for (let i = 0; i < bord.length; i++) {
      if (oplossing[i] === bord[i]) { goed++; continue; }
      if (bord[i] === 0) open++;
    }
    return { goed: goed, open: open, totaal: bord.length };
  }

  const api = {
    N: N, CEL: CEL, MATEN: MATEN, MOEILIJKHEID: MOEILIJKHEID, VARIANTEN: VARIANTEN,
    maatVan: maatVan, maatVanBord: maatVanBord, doelGegeven: doelGegeven,
    maatDiagonaal: maatDiagonaal, maatMetRegio: maatMetRegio, maakRegio: maakRegio,
    regioVan: regioVan, blok: blok,
    rij: rij, kolom: kolom, mag: mag, kandidaten: kandidaten,
    maak: maak, uitVerzameling: uitVerzameling, los: los,
    aantalOplossingen: aantalOplossingen, teken: teken,
    conflicten: conflicten, klaar: klaar, hint: hint, voortgang: voortgang
  };

  root.SmakenlandSudoku = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
