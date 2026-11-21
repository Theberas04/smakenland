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
  function blok(i, m) {
    const mm = m || MATEN[N];
    const n = mm.n;
    return Math.floor(Math.floor(i / n) / mm.br) * (n / mm.br) + Math.floor((i % n) / mm.bk);
  }

  /** De bovenste rij en linkerkolom van het blok waarin dit vak ligt. */
  function blokHoek(i, m) {
    const n = m.n;
    const r = Math.floor(i / n);
    const k = i % n;
    const b = blok(i, m);
    const kolommenPerBlok = n / m.br;
    const br = Math.floor(b / kolommenPerBlok) * m.br;
    const bk = (b % kolommenPerBlok) * m.bk;
    return { r: br, k: bk, rijen: m.br, kolommen: m.bk, r0: r, k0: k };
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
    const h = blokHoek(i, mm);
    for (let x = 0; x < h.rijen; x++) {
      for (let y = 0; y < h.kolommen; y++) {
        if (bord[(h.r + x) * n + (h.k + y)] === waarde) return false;
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

  // Bitmaskers per rij, kolom en blok: de zoeker hieronder werkt daarmee, want
  // een sudoku met weinig aanwijzingen is met losse vergelijkingen per stap te
  // traag (dat liep vast op een opgave met een fout erin).
  function maskers(bord, m) {
    const mm = m || maatVanBord(bord) || MATEN[N];
    const n = mm.n;
    const cel = n * n;
    const r = new Array(n).fill(0);
    const k = new Array(n).fill(0);
    const b = new Array(n).fill(0);
    for (let i = 0; i < cel; i++) {
      const v = bord[i];
      if (!v) continue;
      if (v > n) return null;
      const bit = 1 << v;
      const R = rij(i, mm);
      const K = kolom(i, mm);
      const B = blok(i, mm);
      if ((r[R] & bit) || (k[K] & bit) || (b[B] & bit)) return null;   // al dubbel
      r[R] |= bit;
      k[K] |= bit;
      b[B] |= bit;
    }
    return { r: r, k: k, b: b, m: mm, alle: alleBits(n), cel: cel };
  }

  function vrijBits(mk, i) {
    return ~(mk.r[rij(i, mk.m)] | mk.k[kolom(i, mk.m)] | mk.b[blok(i, mk.m)]) & mk.alle;
  }

  function telBits(bits, n) {
    let aantal = 0;
    for (let v = 1; v <= n; v++) if (bits & (1 << v)) aantal++;
    return aantal;
  }

  function vul(bord, rnd, m) {
    const mk = maskers(bord, m);
    if (!mk) return false;
    const n = mk.m.n;
    const cel = mk.cel;
    function stap() {
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
      const R = rij(keuze, mk.m);
      const K = kolom(keuze, mk.m);
      const B = blok(keuze, mk.m);
      for (const v of waarden) {
        const bit = 1 << v;
        bord[keuze] = v;
        mk.r[R] |= bit; mk.k[K] |= bit; mk.b[B] |= bit;
        if (stap()) return true;
        bord[keuze] = 0;
        mk.r[R] &= ~bit; mk.k[K] &= ~bit; mk.b[B] &= ~bit;
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
      const R = rij(keuze, mk.m);
      const K = kolom(keuze, mk.m);
      const B = blok(keuze, mk.m);
      for (let v = 1; v <= n; v++) {
        if (!(beste & (1 << v))) continue;
        const bit = 1 << v;
        werk[keuze] = v;
        mk.r[R] |= bit; mk.k[K] |= bit; mk.b[B] |= bit;
        stap();
        werk[keuze] = 0;
        mk.r[R] &= ~bit; mk.k[K] &= ~bit; mk.b[B] &= ~bit;
        if (gevonden >= max) return;
      }
    })();
    return gevonden;
  }

  function los(bord, m) {
    const werk = bord.slice();
    if (!vul(werk, rngMaker(7), m)) return null;
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
   */
  function maak(zaad, niveau, maatKey) {
    const m = maatVan(maatKey);
    const n = m.n;
    const cel = n * n;
    const sleutel = MATEN[maatKey] ? Number(maatKey) : m.n;
    const niveauNaam = MOEILIJKHEID[niveau] ? niveau : 'midden';
    const doel = doelGegeven(n, niveauNaam);
    const rnd = rngMaker(zaad);
    const oplossing = new Array(cel).fill(0);
    vul(oplossing, rnd, m);

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
      n: n,
      symbolen: m.symbolen,
      opgave: opgave,
      oplossing: oplossing,
      gegeven: opgave.map(function (v) { return v !== 0; }),
      gegevenAantal: opgave.filter(function (v) { return v !== 0; }).length
    };
  }

  /** Een opgave uit de kant-en-klare verzameling (zie sudokus.js), of null. */
  function uitVerzameling(maatKey, niveau, keuze) {
    const verzameling = root.SMAKENLAND_SUDOKUS;
    const m = maatVan(maatKey);
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
    const oplossing = los(opgave, m);
    if (!oplossing) return null;
    return {
      zaad: m.n * 1000000 + index,
      niveau: niveau,
      maat: m.n,
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

  function conflicten(bord) {
    const m = maatVanBord(bord) || MATEN[N];
    const cel = bord.length;
    const fout = new Array(cel).fill(false);
    for (let i = 0; i < cel; i++) {
      const v = bord[i];
      if (!v) continue;
      for (let j = 0; j < cel; j++) {
        if (j === i || bord[j] !== v) continue;
        if (rij(j, m) === rij(i, m) || kolom(j, m) === kolom(i, m) || blok(j, m) === blok(i, m)) {
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
    N: N, CEL: CEL, MATEN: MATEN, MOEILIJKHEID: MOEILIJKHEID,
    maatVan: maatVan, maatVanBord: maatVanBord, doelGegeven: doelGegeven,
    rij: rij, kolom: kolom, blok: blok, mag: mag, kandidaten: kandidaten,
    maak: maak, uitVerzameling: uitVerzameling, los: los,
    aantalOplossingen: aantalOplossingen, teken: teken,
    conflicten: conflicten, klaar: klaar, hint: hint, voortgang: voortgang
  };

  root.SmakenlandSudoku = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
