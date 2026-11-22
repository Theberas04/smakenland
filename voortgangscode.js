/* Smakenland - de voortgangscode: je voortgang in één stuk tekst die je kunt
   bewaren of op een ander toestel kunt plakken.

   De code is base64 van een leesbaar tekstblok (zodat een mens er nog iets van
   kan vinden) met een korte controle aan het eind. Klopt die controle niet, dan
   weigert de app de code in plaats van er halve voortgang van te maken.

   Wat er WEL in gaat: je sterren per level, munten, sudokutijden, prestaties en
   je thema. Wat er NIET in gaat: het losse bord van Vrij spelen (daar staan de
   voorwerpen van dit moment in, niet je voortgang).

   Puur en zonder DOM, zodat het in Node te toetsen is. */
(function (root) {
  'use strict';

  const VERSIE = 'SMK1';
  const MAX_LEVELS = 1200;      // 40 gewone hoofdstukken + 8 seizoenshoofdstukken

  // ------------------------------------------------------------- base64

  const TEKENS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  /** Tekst naar UTF-8-bytes: een emoji in de voortgang mag niet stukgaan. */
  function naarBytes(tekst) {
    const uit = [];
    for (let i = 0; i < tekst.length; i++) {
      let code = tekst.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < tekst.length) {
        const volgende = tekst.charCodeAt(i + 1);
        if (volgende >= 0xdc00 && volgende <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (volgende - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) uit.push(code);
      else if (code < 0x800) uit.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) uit.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else uit.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return uit;
  }

  function vanBytes(bytes) {
    let uit = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i];
      let code;
      if (b < 0x80) { code = b; i += 1; }
      else if (b < 0xe0) { code = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
      else if (b < 0xf0) { code = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 3; }
      else {
        code = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
        i += 4;
      }
      if (code > 0xffff) {
        code -= 0x10000;
        uit += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023));
      } else {
        uit += String.fromCharCode(code);
      }
    }
    return uit;
  }

  function naarBase64(tekst) {
    return bytesNaarBase64(naarBytes(tekst));
  }

  /** Bytes naar base64. Let op: dit gaat om BYTES, niet om tekens — anders zou een
   *  byte boven 128 als twee tekens worden weggeschreven (zie sterrenPak). */
  function bytesNaarBase64(bytes) {
    let uit = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      uit += TEKENS.charAt(a >> 2);
      uit += TEKENS.charAt(((a & 3) << 4) | (b >> 4));
      uit += i + 1 < bytes.length ? TEKENS.charAt(((b & 15) << 2) | (c >> 6)) : '=';
      uit += i + 2 < bytes.length ? TEKENS.charAt(c & 63) : '=';
    }
    return uit;
  }

  /** Base64 naar bytes, of null als er iets niet in thuishoort. */
  function base64NaarBytes(ruw) {
    const tekst = String(ruw).replace(/=+$/, '');
    let bits = '';
    for (let i = 0; i < tekst.length; i++) {
      const punt = TEKENS.indexOf(tekst.charAt(i));
      if (punt < 0) return null;                     // geen geldige base64
      bits += punt.toString(2).padStart(6, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return bytes;
  }

  function vanBase64(ruw) {
    const bytes = base64NaarBytes(ruw);
    return bytes === null ? null : vanBytes(bytes);
  }

  /** Kleine controle over de tekst: verandert er één teken, dan klopt hij niet meer. */
  function controle(tekst) {
    let h = 0x811c9dc5;
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ------------------------------------------------ sterren in kort bestek

  /** {1:3, 4:2} -> "0*1,3*1,0*2,2*1" (waarde*aantal, op levelvolgorde). */
  function sterrenReeks(sterren) {
    const rijen = [];
    for (let nr = 1; nr <= MAX_LEVELS; nr++) {
      const s = Math.max(0, Math.min(3, Math.floor((sterren && sterren[nr]) || 0)));
      rijen.push(s);
    }
    let uit = [];
    let waarde = rijen[0];
    let aantal = 1;
    for (let i = 1; i < rijen.length; i++) {
      if (rijen[i] === waarde) { aantal++; continue; }
      uit.push(waarde + '*' + aantal);
      waarde = rijen[i];
      aantal = 1;
    }
    uit.push(waarde + '*' + aantal);
    return uit.join(',');
  }

  function leesSterren(reeks) {
    const uit = {};
    let teller = 1;
    reeks.split(',').forEach(function (stuk) {
      const m = /^([0-3])\*(\d+)$/.exec(stuk.trim());
      if (!m) return;
      const waarde = Number(m[1]);
      const aantal = Number(m[2]);
      if (waarde > 0) {
        for (let i = 0; i < aantal && teller + i <= MAX_LEVELS; i++) uit[teller + i] = waarde;
      }
      teller += aantal;
    });
    return uit;
  }

  /**
   * De sterren ook ingepakt: 2 bits per level, in base64. Voor een bijna leeg spel
   * is de reeksvorm hierboven veel korter, voor een volgespeeld spel deze. De maker
   * kiest de kortste van de twee en zet er 'r' of 'b' voor.
   */
  function sterrenPak(sterren) {
    const bytes = [];
    let byte = 0;
    let bits = 0;
    for (let nr = 1; nr <= MAX_LEVELS; nr++) {
      const s = Math.max(0, Math.min(3, Math.floor((sterren && sterren[nr]) || 0)));
      byte = (byte << 2) | s;
      bits += 2;
      if (bits === 8) { bytes.push(byte); byte = 0; bits = 0; }
    }
    if (bits > 0) bytes.push(byte << (8 - bits));
    return bytesNaarBase64(bytes);
  }

  function leesPak(reeks) {
    const bytes = base64NaarBytes(reeks);
    if (bytes === null) return {};
    const uit = {};
    let nr = 1;
    for (const b of bytes) {
      for (let schuif = 6; schuif >= 0 && nr <= MAX_LEVELS; schuif -= 2) {
        const s = (b >> schuif) & 3;
        if (s > 0) uit[nr] = s;
        nr++;
      }
    }
    return uit;
  }

  // ------------------------------------------------------------- maken

  function maak(gegevens) {
    const g = gegevens || {};
    const regels = [VERSIE];
    // De kortste van de twee vormen; 'r' = reeksen, 'b' = ingepakt.
    const reeks = sterrenReeks(g.sterren);
    const ingepakt = sterrenPak(g.sterren);
    regels.push('sterren:' + (reeks.length <= ingepakt.length ? 'r' + reeks : 'b' + ingepakt));
    regels.push('munten:' + Math.max(0, Math.floor(g.munten || 0)));
    const sudoku = Object.keys(g.sudokuBeste || {}).sort().map(function (k) {
      return k + '=' + Math.max(0, Math.floor(g.sudokuBeste[k]));
    }).join(';');
    regels.push('sudoku:' + sudoku);
    regels.push('gewonnen:' + Math.max(0, Math.floor(g.sudokuGewonnen || 0)));
    regels.push('prestaties:' + (g.prestaties || []).slice().sort().join('|'));
    regels.push('thema:' + (g.thema === 'donker' ? 'donker' : 'licht'));
    const tekst = regels.join('\n');
    return naarBase64(tekst) + '-' + controle(tekst);
  }

  /** Leest een code. Geeft {ok:true, gegevens} of {ok:false, fout:'...'}. */
  function lees(code) {
    if (typeof code !== 'string') return { ok: false, fout: 'Geen code.' };
    // Plakken vanaf een scherm wil nog wel eens regeleindes of spaties meegeven.
    const schoon = code.replace(/\s+/g, '');
    if (!schoon) return { ok: false, fout: 'Geen code ingevuld.' };
    const stukken = schoon.split('-');
    if (stukken.length !== 2) return { ok: false, fout: 'Deze code hoort één streepje te hebben.' };
    const tekst = vanBase64(stukken[0]);
    if (tekst === null) return { ok: false, fout: 'De code bevat tekens die er niet in horen.' };
    if (controle(tekst) !== stukken[1].toLowerCase()) {
      return { ok: false, fout: 'De code klopt niet helemaal (overgetypt of afgekapt?).' };
    }
    const regels = tekst.split('\n');
    if (regels[0] !== VERSIE) {
      return { ok: false, fout: 'Deze code komt uit een andere versie van het spel.' };
    }
    const velden = {};
    regels.slice(1).forEach(function (regel) {
      const m = /^([a-z]+):(.*)$/.exec(regel);
      if (m) velden[m[1]] = m[2];
    });
    const beste = {};
    (velden.sudoku || '').split(';').forEach(function (stuk) {
      const m = /^([0-9]+-[a-z]+)=(\d+)$/.exec(stuk.trim());
      if (m) beste[m[1]] = Number(m[2]);
    });
    return {
      ok: true,
      gegevens: {
        sterren: (function (veld) {
          if (!veld) return {};
          return veld.charAt(0) === 'b' ? leesPak(veld.slice(1)) : leesSterren(veld.slice(1));
        })(velden.sterren),
        munten: Number(velden.munten || 0) || 0,
        sudokuBeste: beste,
        sudokuGewonnen: Number(velden.gewonnen || 0) || 0,
        prestaties: (velden.prestaties || '').split('|').filter(function (x) { return x; }),
        thema: velden.thema === 'donker' ? 'donker' : 'licht'
      }
    };
  }

  const api = { VERSIE: VERSIE, MAX_LEVELS: MAX_LEVELS, maak: maak, lees: lees,
    controle: controle, sterrenReeks: sterrenReeks, leesSterren: leesSterren,
    sterrenPak: sterrenPak, leesPak: leesPak,
    bytesNaarBase64: bytesNaarBase64, base64NaarBytes: base64NaarBytes,
    naarBase64: naarBase64, vanBase64: vanBase64 };

  root.SmakenlandVoortgangscode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
