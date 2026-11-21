/* Smakenland - het sudokupaneel. Gebruikt de regels uit sudoku.js.

   Er zijn vijf maten: 4x4, 6x6, 9x9, 12x12 en 16x16. De maat bepaalt het aantal
   vakken, de tekens in de vakken (bij 12 en 16 komen er letters bij) en hoe groot
   de cijfers op het bord staan. De 16x16 met veel lege vakken komt kant-en-klaar
   uit sudokus.js, want die is in de app te langzaam om te maken. */
(function () {
  'use strict';

  const S = window.SmakenlandSudoku;
  const SLEUTEL = 'smakenland.sudoku.v1';

  const $ = function (id) { return document.getElementById(id); };

  let maatKey = 9;      // 4, 6, 9, 12 of 16
  let maat = S.maatVan(9);
  let n = 9;
  let cel = 81;

  let bord = [];        // cel velden met de stand van de speler (0 = leeg)
  let notities = [];    // cel × n vlaggen
  let puzzel = null;    // {niveau, maat, opgave, oplossing, gegeven}
  let gekozen = -1;
  let noteerModus = false;
  let fouten = 0;
  let seconden = 0;
  let klaar = false;
  let timer = null;
  let cellen = [];
  let stats = { beste: {}, gewonnen: 0 };

  function legeNotities() {
    return new Array(cel).fill(null).map(function () { return new Array(n).fill(false); });
  }

  /** De sleutel waaronder de beste tijd van deze maat en moeilijkheid staat. */
  function statSleutel(niveau) { return niveau + '-' + maatKey; }

  // --------------------------------------------------------------- opslag

  function bewaar() {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify({
        niveau: puzzel ? puzzel.niveau : 'midden',
        maat: maatKey,
        puzzel: puzzel ? {
          zaad: puzzel.zaad, niveau: puzzel.niveau, maat: puzzel.maat,
          opgave: puzzel.opgave, oplossing: puzzel.oplossing, gegeven: puzzel.gegeven
        } : null,
        bord: bord, notities: notities, fouten: fouten, seconden: seconden, klaar: klaar, stats: stats
      }));
    } catch (e) { /* stil */ }
  }

  function laad() {
    let ruw = null;
    try { ruw = localStorage.getItem(SLEUTEL); } catch (e) { ruw = null; }
    if (!ruw) return null;
    try { return JSON.parse(ruw); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- hulp

  function klok(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Maakt het sudokubord vierkant door de hoogte gelijk te zetten aan de breedte.
   * Bewust met de hand en niet met `aspect-ratio`: de WebView van Android 11 kent
   * dat niet, en dan klapt het bord in tot een streep van een paar pixels.
   */
  function pasMaat() {
    const houder = $('sudoku-bord');
    if (!houder) return;
    // De buitenmaat (met randen) is de maat die vierkant moet worden: met
    // border-box is dat precies de hoogte die we moeten zetten.
    const breedte = Math.round(houder.getBoundingClientRect().width);
    if (!breedte) {
      // Het paneel is nog niet zichtbaar (breedte nul). Op een echt toestel komt er
      // daarna geen resize-event, dus blijven we het een aantal beelden opnieuw
      // proberen; anders bleef het bord ingeklapt tot de speler iets aanraakte.
      if (pogingen < 30) {
        pogingen += 1;
        window.requestAnimationFrame(pasMaat);
      }
      return;
    }
    pogingen = 0;
    houder.style.height = breedte + 'px';
    window.requestAnimationFrame(function () {
      const r = houder.getBoundingClientRect();
      const gevuld = cellen.filter(function (c) { return (c.textContent || '').trim(); }).length;
      const maatTekst = 'maat=' + n + 'x' + n + ' breedte=' + Math.round(r.width) +
        ' hoogte=' + Math.round(r.height) + ' tegel=' + Math.round(r.width / n) +
        ' cijfers=' + gevuld;
      if (maatTekst !== laatsteMaat) {
        laatsteMaat = maatTekst;
        console.info('SmakenlandSudoku ' + maatTekst);
      }
    });
  }

  let pogingen = 0;

  let laatsteMaat = '';

  function niveauKies(niveau) {
    Array.from(document.querySelectorAll('#sudoku-niveaus button')).forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.niveau === niveau ? 'true' : 'false');
    });
  }

  function maatKies(key) {
    Array.from(document.querySelectorAll('#sudoku-maten button')).forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.maat) === key ? 'true' : 'false');
    });
    $('sudoku-bord').setAttribute('aria-label', 'Sudoku van ' + key + ' bij ' + key);
  }

  /** Zet de maat klaar: aantal vakken, notitievakken en de tekens van deze maat. */
  function zetMaat(key) {
    maatKey = S.MATEN[key] ? Number(key) : 9;
    maat = S.maatVan(maatKey);
    n = maat.n;
    cel = n * n;
    // Notities op een bord met letters zijn onleesbaar klein; die zetten we uit.
    const notitieKnop = $('sudoku-notitie');
    const magNoteren = n <= 9;
    notitieKnop.hidden = !magNoteren;
    if (!magNoteren) noteerModus = false;
  }

  function nieuwSpel(niveau, key) {
    if (key !== undefined) zetMaat(key);
    niveau = S.MOEILIJKHEID[niveau] ? niveau : 'midden';
    // De 16x16 met veel lege vakken staat kant-en-klaar in sudokus.js; de rest maakt
    // de app zelf (dat is snel genoeg, en dan is elke puzzel weer anders).
    const uitVoorraad = S.uitVerzameling ? S.uitVerzameling(maatKey, niveau) : null;
    puzzel = uitVoorraad || S.maak(Date.now() % 1000000, niveau, maatKey);
    bord = puzzel.opgave.slice();
    notities = legeNotities();
    fouten = 0;
    seconden = 0;
    klaar = false;
    gekozen = -1;
    bouw();
    maatKies(maatKey);
    niveauKies(puzzel.niveau);
    bewaar();
    render();
    pasMaat();
  }

  // -------------------------------------------------------------- tekenen

  function bouw() {
    const houder = $('sudoku-bord');
    houder.className = 'sudoku-bord maat-' + n;
    houder.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
    houder.innerHTML = '';
    cellen = [];
    for (let i = 0; i < cel; i++) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'sudoku-cel';
      c.dataset.cel = i;
      c.setAttribute('role', 'gridcell');
      // De dikkere lijnen tussen de blokken: die hangen van de maat af (bij 6x6 zijn
      // de blokken 2 bij 3, bij 16x16 4 bij 4), dus zetten we ze hier per vak.
      if ((i % n + 1) % maat.bk === 0 && (i % n) !== n - 1) c.classList.add('blok-rechts');
      if ((Math.floor(i / n) + 1) % maat.br === 0 && Math.floor(i / n) !== n - 1) c.classList.add('blok-onder');
      c.addEventListener('click', function () { kiesCel(i); });
      houder.appendChild(c);
      cellen.push(c);
    }
    const cijfers = $('sudoku-cijfers');
    cijfers.className = 'cijfers maat-' + n;
    cijfers.innerHTML = '';
    for (let v = 1; v <= n; v++) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.dataset.cijfer = v;
      knop.textContent = maat.symbolen.charAt(v - 1);
      knop.addEventListener('click', function () { zetCijfer(v); });
      cijfers.appendChild(knop);
    }
  }

  function render() {
    if (!puzzel) return;
    const rood = S.conflicten(bord);
    for (let i = 0; i < cel; i++) {
      const c = cellen[i];
      const waarde = bord[i];
      c.className = 'sudoku-cel';
      if ((i % n + 1) % maat.bk === 0 && (i % n) !== n - 1) c.classList.add('blok-rechts');
      if ((Math.floor(i / n) + 1) % maat.br === 0 && Math.floor(i / n) !== n - 1) c.classList.add('blok-onder');
      if (puzzel.gegeven[i]) c.classList.add('geven');
      if (i === gekozen) c.classList.add('gekozen');
      if (waarde && !puzzel.gegeven[i] && waarde !== puzzel.oplossing[i]) c.classList.add('fout');
      else if (rood[i] && waarde) c.classList.add('botsing');
      let binnen = waarde ? S.teken(waarde, maat) : '';
      if (!waarde && notities[i] && notities[i].some(function (v) { return v; })) {
        binnen = '<span class="notitie" style="grid-template-columns:repeat(' + maat.bk + ',1fr)">' +
          notities[i].map(function (v, k) {
            return '<i>' + (v ? maat.symbolen.charAt(k) : '') + '</i>';
          }).join('') + '</span>';
      }
      c.innerHTML = binnen;
    }
    // Zelfde teken overal oplichten, dat zoekt rustiger.
    if (gekozen >= 0 && bord[gekozen]) {
      const v = bord[gekozen];
      for (let i = 0; i < cel; i++) if (bord[i] === v && i !== gekozen) cellen[i].classList.add('zelfde');
    }
    $('sudoku-klok').textContent = klok(seconden);
    const beste = stats.beste[statSleutel(puzzel.niveau)];
    $('sudoku-beste').textContent = beste ? 'beste: ' + klok(beste) : 'nog geen tijd';
    const v = S.voortgang(bord, puzzel.oplossing);
    $('sudoku-status').textContent = klaar
      ? 'Klaar in ' + klok(seconden) + ' met ' + fouten + ' fout' + (fouten === 1 ? '' : 'en') + '.'
      : (v.totaal - v.open) + ' van ' + v.totaal + ' vakken goed · ' + fouten +
        ' fout' + (fouten === 1 ? '' : 'en');
    $('sudoku-notitie').setAttribute('aria-pressed', noteerModus ? 'true' : 'false');
  }

  // ---------------------------------------------------------------- zetten

  function kiesCel(i) {
    if (klaar) return;
    gekozen = i;
    render();
  }

  function meld(tekst) {
    $('sudoku-status').textContent = tekst;
  }

  function zetCijfer(v) {
    if (klaar || gekozen < 0 || puzzel.gegeven[gekozen]) {
      if (gekozen < 0) meld('Kies eerst een vak.');
      return;
    }
    if (v < 1 || v > n) return;
    if (noteerModus) {
      notities[gekozen][v - 1] = !notities[gekozen][v - 1];
      bord[gekozen] = 0;
      render();
      bewaar();
      return;
    }
    if (bord[gekozen] === v) {         // nog eens tikken wist weer
      bord[gekozen] = 0;
      render();
      bewaar();
      return;
    }
    bord[gekozen] = v;
    notities[gekozen] = new Array(n).fill(false);
    if (v !== puzzel.oplossing[gekozen]) {
      fouten++;
      window.SmakenlandGeluid && window.SmakenlandGeluid.fout();
    } else {
      window.SmakenlandGeluid && window.SmakenlandGeluid.cijfer();
    }
    render();
    bewaar();
    controleerKlaar();
  }

  function wis() {
    if (klaar || gekozen < 0 || puzzel.gegeven[gekozen]) return;
    bord[gekozen] = 0;
    notities[gekozen] = new Array(n).fill(false);
    render();
    bewaar();
  }

  function hint() {
    if (klaar) return;
    const h = S.hint(bord, puzzel.oplossing, puzzel.gegeven);
    if (!h) return;
    bord[h.cel] = h.waarde;
    notities[h.cel] = new Array(n).fill(false);
    gekozen = h.cel;
    fouten += h.soort === 'fout' ? 0 : 1;   // een hint die een fout herstelt is geen fout
    render();
    bewaar();
    controleerKlaar();
  }

  function controleerKlaar() {
    if (!S.klaar(bord, puzzel.oplossing)) return;
    klaar = true;
    stopTimer();
    const sleutel = statSleutel(puzzel.niveau);
    const vorige = stats.beste[sleutel];
    if (!vorige || seconden < vorige) stats.beste[sleutel] = seconden;
    stats.gewonnen = (stats.gewonnen || 0) + 1;
    bewaar();
    render();
    toonGewonnen();
  }

  function toonGewonnen() {
    const oud = document.getElementById('sudoku-gewon');
    if (oud) oud.remove();
    const doek = document.createElement('div');
    doek.className = 'modal';
    doek.id = 'sudoku-gewon';
    doek.innerHTML =
      '<div class="kaart verhaal-kaart" role="dialog" aria-modal="true">' +
        '<span class="kaart-e">🎉</span><small>Sudoku klaar</small>' +
        '<h2>' + n + '×' + n + ' ' + S.MOEILIJKHEID[puzzel.niveau].naam.toLowerCase() + ' opgelost</h2>' +
        '<div class="sterren-groot">' + sterrenVoor() + '</div>' +
        '<p>Tijd ' + klok(seconden) + ' · ' + fouten + ' fout' + (fouten === 1 ? '' : 'en') +
          ' · beste tijd ' + klok(stats.beste[statSleutel(puzzel.niveau)]) + '</p>' +
        '<div class="modal-knoppen">' +
          '<button class="primair" type="button" id="sudoku-nog">Nog een puzzel</button>' +
          '<button type="button" id="sudoku-dicht">Sluiten</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(doek);
    document.getElementById('sudoku-nog').addEventListener('click', function () {
      doek.remove();
      nieuwSpel(puzzel.niveau);
    });
    document.getElementById('sudoku-dicht').addEventListener('click', function () { doek.remove(); });
  }

  function sterrenVoor() {
    let aantal = 1;
    if (fouten <= 3) aantal = 3;
    else if (fouten <= 8) aantal = 2;
    let uit = '';
    for (let i = 1; i <= 3; i++) uit += '<i class="' + (i <= aantal ? 'aan' : '') + '">★</i>';
    return uit;
  }

  // ---------------------------------------------------------------- klok

  function startTimer() {
    if (timer) return;
    timer = setInterval(function () {
      if (klaar) return;
      seconden++;
      $('sudoku-klok').textContent = klok(seconden);
      if (seconden % 10 === 0) bewaar();
    }, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ------------------------------------------------------------------ op

  /** Staat er #sudoku16 in de adresbalk, dan die maat gebruiken. */
  function maatUitHash() {
    const m = /^#sudoku(\d+)$/.exec(window.location.hash || '');
    return m && S.MATEN[m[1]] ? Number(m[1]) : null;
  }

  function toon() {
    if (!puzzel) {
      const gevraagd = maatUitHash();
      if (gevraagd) {
        // Een diepe link met een maat erin (#sudoku16): meteen die maat beginnen.
        nieuwSpel('midden', gevraagd);
        render();
        pasMaat();
        if (!klaar) startTimer();
        return;
      }
      const bewaard = laad();
      if (bewaard && bewaard.puzzel && bewaard.puzzel.opgave && bewaard.puzzel.oplossing) {
        zetMaat(bewaard.maat || bewaard.puzzel.maat || Math.round(Math.sqrt(bewaard.puzzel.opgave.length)));
        puzzel = {
          niveau: bewaard.niveau || bewaard.puzzel.niveau,
          zaad: bewaard.puzzel.zaad,
          maat: maatKey,
          opgave: bewaard.puzzel.opgave,
          oplossing: bewaard.puzzel.oplossing,
          gegeven: bewaard.puzzel.gegeven
        };
        bord = bewaard.bord && bewaard.bord.length === cel ? bewaard.bord : puzzel.opgave.slice();
        notities = bewaard.notities && bewaard.notities.length === cel ? bewaard.notities : legeNotities();
        fouten = bewaard.fouten || 0;
        seconden = bewaard.seconden || 0;
        klaar = !!bewaard.klaar;
        stats = bewaard.stats || stats;
        bouw();
        maatKies(maatKey);
        niveauKies(puzzel.niveau);
      } else {
        nieuwSpel('midden');
      }
    }
    render();
    pasMaat();                 // het bord moet vierkant staan zodra het zichtbaar is
    if (!klaar) startTimer();
  }

  function bind() {
    $('sudoku-niveaus').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('button[data-niveau]') : null;
      if (knop && (!puzzel || knop.dataset.niveau !== puzzel.niveau)) nieuwSpel(knop.dataset.niveau);
    });
    $('sudoku-maten').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('button[data-maat]') : null;
      if (knop && Number(knop.dataset.maat) !== maatKey) {
        nieuwSpel(puzzel ? puzzel.niveau : 'midden', Number(knop.dataset.maat));
      }
    });
    $('sudoku-notitie').addEventListener('click', function () {
      if (n > 9) return;
      noteerModus = !noteerModus;
      render();
    });
    $('sudoku-wis').addEventListener('click', wis);
    $('sudoku-hint').addEventListener('click', hint);
    $('sudoku-nieuw').addEventListener('click', function () { if (puzzel) nieuwSpel(puzzel.niveau); });

    window.addEventListener('keydown', function (e) {
      const zichtbaar = !$('scherm-sudoku').hidden;
      if (!zichtbaar) return;
      const letters = maat.symbolen.slice(9);                      // A en verder
      const letterPos = letters.toLowerCase().indexOf((e.key || '').toLowerCase());
      if (e.key >= '1' && e.key <= '9') { zetCijfer(Number(e.key)); e.preventDefault(); return; }
      if (letterPos >= 0) { zetCijfer(10 + letterPos); e.preventDefault(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { wis(); e.preventDefault(); return; }
      if (gekozen < 0) return;
      const stappen = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n };
      if (stappen[e.key]) {
        const naar = gekozen + stappen[e.key];
        if (naar >= 0 && naar < cel) { gekozen = naar; render(); }
        e.preventDefault();
      }
    });
  }

  function opnieuw() {
    try { localStorage.removeItem(SLEUTEL); } catch (e) { /* stil */ }
    stats = { beste: {}, gewonnen: 0 };
    puzzel = null;
    nieuwSpel('midden', maatKey);
  }

  function kop() {
    const beste = Object.keys(stats.beste).map(function (k) { return stats.beste[k]; });
    return '<div class="stat"><span class="e">🧩</span><b id="kop-sudoku-klaar">' +
        (stats.gewonnen || 0) + '</b></div>' +
      '<div class="stat"><span class="e">⏱️</span><b id="kop-sudoku-beste">' +
        (beste.length ? klok(Math.min.apply(null, beste)) : '—') + '</b></div>';
  }

  function statistiek() { return stats; }

  function start() {
    zetMaat(9);
    bouw();
    maatKies(9);
    bind();
    window.addEventListener('resize', pasMaat);
    // Zodra het bord een maat krijgt (paneel wordt zichtbaar) meteen vierkant maken.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(pasMaat).observe($('sudoku-bord') || document.body);
    }
    window.SmakenlandSudokuView = {
      toon: toon, opnieuw: opnieuw, kop: kop, statistiek: statistiek,
      nieuw: nieuwSpel, maatZet: zetMaat,
      get bord() { return bord; },
      get puzzel() { return puzzel; },
      get klaar() { return klaar; },
      get fouten() { return fouten; },
      get maat() { return n; },
      zetCijfer: zetCijfer, kiesCel: kiesCel, wis: wis, hint: hint,
      timerUit: stopTimer, pasMaat: pasMaat
    };

    // De app start vóór deze view (app.js staat eerder in de pagina), dus een diepe
    // link als #sudoku is dan al toegepast terwijl deze view nog niet bestond: de app
    // zocht een view die er nog niet was en sloeg het vullen over. Staat de sudokutab
    // al open, doe het dan hier alsnog — anders bleef het bord leeg tot je op de tab klikte.
    const tabSudoku = document.querySelector('.tab[data-tab=sudoku]');
    if (tabSudoku && tabSudoku.getAttribute('aria-current') === 'true') toon();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
