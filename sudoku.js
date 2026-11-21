/* Smakenland - Sudoku: generator en regels, puur en zonder DOM.
   Werkt in de browser (window.SmakenlandSudoku) en in Node (module.exports). */
(function (root) {
  'use strict';

  const N = 9;
  const CEL = 81;

  const MOEILIJKHEID = {
    makkelijk: { naam: 'Makkelijk', gegeven: 42, hints: 5, sterren: 1 },
    midden: { naam: 'Midden', gegeven: 33, hints: 3, sterren: 2 },
    moeilijk: { naam: 'Moeilijk', gegeven: 26, hints: 1, sterren: 3 }
  };

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

  function rij(i) { return Math.floor(i / N); }
  function kolom(i) { return i % N; }
  function blok(i) { return Math.floor(rij(i) / 3) * 3 + Math.floor(kolom(i) / 3); }

  // ------------------------------------------------------------- sudoku-eil

  function mag(bord, i, waarde) {
    const r = rij(i);
    const k = kolom(i);
    const b = blok(i);
    for (let j = 0; j < N; j++) {
      const inRij = r * N + j;
      const inKolom = j * N + k;
      if (bord[inRij] === waarde || bord[inKolom] === waarde) return false;
    }
    const br = Math.floor(b / 3) * 3;
    const bk = (b % 3) * 3;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (bord[(br + x) * N + (bk + y)] === waarde) return false;
      }
    }
    return true;
  }

  function kandidaten(bord, i) {
    const uit = [];
    for (let v = 1; v <= 9; v++) if (mag(bord, i, v)) uit.push(v);
    return uit;
  }

  // Bitmaskers per rij, kolom en blok: de zoeker hieronder werkt daarmee, want
  // een sudoku met weinig aanwijzingen is met 81 losse vergelijkingen per stap
  // te traag (dat liep vast op een opgave met een fout erin).
  function maskers(bord) {
    const r = new Array(N).fill(0);
    const k = new Array(N).fill(0);
    const b = new Array(N).fill(0);
    for (let i = 0; i < CEL; i++) {
      const v = bord[i];
      if (!v) continue;
      const bit = 1 << v;
      const R = rij(i);
      const K = kolom(i);
      const B = blok(i);
      if ((r[R] & bit) || (k[K] & bit) || (b[B] & bit)) return null;   // al dubbel
      r[R] |= bit;
      k[K] |= bit;
      b[B] |= bit;
    }
    return { r: r, k: k, b: b };
  }

  const ALLE = 0b1111111110;   // bits 1 t/m 9

  function vrijBits(m, i) {
    return ~(m.r[rij(i)] | m.k[kolom(i)] | m.b[blok(i)]) & ALLE;
  }

  function telBits(bits) {
    let n = 0;
    for (let v = 1; v <= 9; v++) if (bits & (1 << v)) n++;
    return n;
  }

  function vul(bord, rnd) {
    const m = maskers(bord);
    if (!m) return false;
    function stap() {
      let keuze = -1;
      let min = 10;
      let beste = 0;
      for (let i = 0; i < CEL; i++) {
        if (bord[i]) continue;
        const bits = vrijBits(m, i);
        const n = telBits(bits);
        if (n === 0) return false;
        if (n < min) { min = n; keuze = i; beste = bits; if (n === 1) break; }
      }
      if (keuze < 0) return true;                 // bord vol
      const waarden = [];
      for (let v = 1; v <= 9; v++) if (beste & (1 << v)) waarden.push(v);
      for (let n = waarden.length - 1; n > 0; n--) {
        const j = Math.floor(rnd() * (n + 1));
        const w = waarden[n];
        waarden[n] = waarden[j];
        waarden[j] = w;
      }
      const R = rij(keuze);
      const K = kolom(keuze);
      const B = blok(keuze);
      for (const v of waarden) {
        const bit = 1 << v;
        bord[keuze] = v;
        m.r[R] |= bit; m.k[K] |= bit; m.b[B] |= bit;
        if (stap()) return true;
        bord[keuze] = 0;
        m.r[R] &= ~bit; m.k[K] &= ~bit; m.b[B] &= ~bit;
      }
      return false;
    }
    return stap();
  }

  /** Hoeveel oplossingen heeft deze opgave? Stopt bij `max` (2 is genoeg). */
  function aantalOplossingen(bord, max) {
    max = max || 2;
    const m = maskers(bord);
    if (!m) return 0;                              // twee dezelfde cijfers in een rij/kolom/blok
    const werk = bord.slice();
    let gevonden = 0;
    (function stap() {
      if (gevonden >= max) return;
      let keuze = -1;
      let beste = 0;
      let min = 10;
      for (let i = 0; i < CEL; i++) {
        if (werk[i]) continue;
        const bits = vrijBits(m, i);
        const n = telBits(bits);
        if (n === 0) return;
        if (n < min) { min = n; keuze = i; beste = bits; if (n === 1) break; }
      }
      if (keuze < 0) { gevonden++; return; }
      const R = rij(keuze);
      const K = kolom(keuze);
      const B = blok(keuze);
      for (let v = 1; v <= 9; v++) {
        if (!(beste & (1 << v))) continue;
        const bit = 1 << v;
        werk[keuze] = v;
        m.r[R] |= bit; m.k[K] |= bit; m.b[B] |= bit;
        stap();
        werk[keuze] = 0;
        m.r[R] &= ~bit; m.k[K] &= ~bit; m.b[B] &= ~bit;
        if (gevonden >= max) return;
      }
    })();
    return gevonden;
  }

  function los(bord) {
    const werk = bord.slice();
    if (!vul(werk, rngMaker(7))) return null;
    return werk;
  }

  // -------------------------------------------------------------- maken

  /** Maakt een nieuwe opgave met precies één oplossing. */
  function maak(zaad, niveau) {
    const instelling = MOEILIJKHEID[niveau] || MOEILIJKHEID.midden;
    const rnd = rngMaker(zaad);
    const oplossing = new Array(CEL).fill(0);
    vul(oplossing, rnd);

    const opgave = oplossing.slice();
    // Symmetrisch weghalen (draaipunt in het midden): dat leest rustiger en is
    // de klassieke vorm van een sudoku.
    const cellen = [];
    for (let i = 0; i < Math.ceil(CEL / 2); i++) cellen.push(i);
    for (let n = cellen.length - 1; n > 0; n--) {
      const j = Math.floor(rnd() * (n + 1));
      const w = cellen[n];
      cellen[n] = cellen[j];
      cellen[j] = w;
    }

    let over = CEL;
    for (const i of cellen) {
      if (over <= instelling.gegeven) break;
      const spiegel = CEL - 1 - i;
      const a = opgave[i];
      const b = spiegel === i ? 0 : opgave[spiegel];
      if (a === 0 && b === 0) continue;
      opgave[i] = 0;
      if (spiegel !== i) opgave[spiegel] = 0;
      if (aantalOplossingen(opgave, 2) !== 1) {       // niet uniek: terugzetten
        opgave[i] = a;
        if (spiegel !== i) opgave[spiegel] = b;
      } else {
        over -= spiegel === i ? 1 : 2;
      }
    }

    return {
      zaad: zaad >>> 0,
      niveau: MOEILIJKHEID[niveau] ? niveau : 'midden',
      opgave: opgave,
      oplossing: oplossing,
      gegeven: opgave.map(function (v) { return v !== 0; }),
      gegevenAantal: opgave.filter(function (v) { return v !== 0; }).length
    };
  }

  // -------------------------------------------------------------- spelen

  function conflicten(bord) {
    const fout = new Array(CEL).fill(false);
    for (let i = 0; i < CEL; i++) {
      const v = bord[i];
      if (!v) continue;
      for (let j = 0; j < CEL; j++) {
        if (j === i || bord[j] !== v) continue;
        if (rij(j) === rij(i) || kolom(j) === kolom(i) || blok(j) === blok(i)) {
          fout[i] = true;
          fout[j] = true;
        }
      }
    }
    return fout;
  }

  function klaar(bord, oplossing) {
    for (let i = 0; i < CEL; i++) if (bord[i] !== oplossing[i]) return false;
    return true;
  }

  /** Een zet die de speler zelf zou kunnen doen: eerst een fout, dan een leeg vak. */
  function hint(bord, oplossing, gegeven) {
    for (let i = 0; i < CEL; i++) {
      if (bord[i] !== 0 && bord[i] !== oplossing[i]) return { cel: i, waarde: oplossing[i], soort: 'fout' };
    }
    for (let i = 0; i < CEL; i++) {
      if (bord[i] === 0) return { cel: i, waarde: oplossing[i], soort: 'leeg' };
    }
    return null;
  }

  /** Hoeveel van de nog lege vakken zijn goed ingevuld (voor de voortgangsbalk). */
  function voortgang(bord, oplossing) {
    let open = 0;
    let goed = 0;
    for (let i = 0; i < CEL; i++) {
      if (oplossing[i] === bord[i]) { goed++; continue; }
      if (bord[i] === 0) open++;
    }
    return { goed: goed, open: open, totaal: CEL };
  }

  const api = {
    N: N, CEL: CEL, MOEILIJKHEID: MOEILIJKHEID,
    rij: rij, kolom: kolom, blok: blok, mag: mag, kandidaten: kandidaten,
    maak: maak, los: los, aantalOplossingen: aantalOplossingen,
    conflicten: conflicten, klaar: klaar, hint: hint, voortgang: voortgang
  };

  root.SmakenlandSudoku = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
