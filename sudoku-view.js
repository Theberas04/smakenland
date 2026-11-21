/* Smakenland - het sudokupaneel. Gebruikt de regels uit sudoku.js. */
(function () {
  'use strict';

  const S = window.SmakenlandSudoku;
  const SLEUTEL = 'smakenland.sudoku.v1';

  const $ = function (id) { return document.getElementById(id); };
  const N = 9;

  let bord = [];        // 81 velden met de stand van de speler (0 = leeg)
  let notities = [];    // 81 × 9 vlaggen
  let puzzel = null;    // {niveau, opgave, oplossing, gegeven}
  let gekozen = -1;
  let noteerModus = false;
  let fouten = 0;
  let seconden = 0;
  let klaar = false;
  let timer = null;
  let cellen = [];
  let stats = { beste: {}, gewonnen: 0 };

  // --------------------------------------------------------------- opslag

  function bewaar() {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify({
        niveau: puzzel ? puzzel.niveau : 'midden',
        puzzel: puzzel ? { zaad: puzzel.zaad, niveau: puzzel.niveau, opgave: puzzel.opgave, oplossing: puzzel.oplossing, gegeven: puzzel.gegeven } : null,
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
    if (!breedte) return;                       // scherm staat nog verborgen
    houder.style.height = breedte + 'px';
    window.requestAnimationFrame(function () {
      const r = houder.getBoundingClientRect();
      const maat = 'breedte=' + Math.round(r.width) + ' hoogte=' + Math.round(r.height) +
        ' tegel=' + Math.round(r.width / 9);
      if (maat !== laatsteMaat) {
        laatsteMaat = maat;
        console.info('SmakenlandSudoku ' + maat);
      }
    });
  }

  let laatsteMaat = '';

  function niveauKies(niveau) {
    Array.from(document.querySelectorAll('#sudoku-niveaus button')).forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.niveau === niveau ? 'true' : 'false');
    });
  }

  function nieuwSpel(niveau, zaad) {
    puzzel = S.maak(zaad === undefined ? (Date.now() % 1000000) : zaad, niveau);
    bord = puzzel.opgave.slice();
    notities = new Array(81).fill(null).map(function () { return new Array(9).fill(false); });
    fouten = 0;
    seconden = 0;
    klaar = false;
    gekozen = -1;
    niveauKies(puzzel.niveau);
    bewaar();
    render();
    pasMaat();
  }

  // -------------------------------------------------------------- tekenen

  function bouw() {
    const houder = $('sudoku-bord');
    houder.innerHTML = '';
    cellen = [];
    for (let i = 0; i < 81; i++) {
      const cel = document.createElement('button');
      cel.type = 'button';
      cel.className = 'sudoku-cel';
      cel.dataset.cel = i;
      cel.setAttribute('role', 'gridcell');
      cel.addEventListener('click', function () { kiesCel(i); });
      houder.appendChild(cel);
      cellen.push(cel);
    }
    const cijfers = $('sudoku-cijfers');
    cijfers.innerHTML = '';
    for (let v = 1; v <= 9; v++) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.dataset.cijfer = v;
      knop.textContent = v;
      knop.addEventListener('click', function () { zetCijfer(v); });
      cijfers.appendChild(knop);
    }
  }

  function render() {
    if (!puzzel) return;
    const rood = S.conflicten(bord);
    for (let i = 0; i < 81; i++) {
      const cel = cellen[i];
      const waarde = bord[i];
      cel.className = 'sudoku-cel';
      if (puzzel.gegeven[i]) cel.classList.add('geven');
      if (i === gekozen) cel.classList.add('gekozen');
      if (waarde && !puzzel.gegeven[i] && waarde !== puzzel.oplossing[i]) cel.classList.add('fout');
      else if (rood[i] && waarde) cel.classList.add('botsing');
      let binnen = waarde ? String(waarde) : '';
      if (!waarde && notities[i].some(function (v) { return v; })) {
        binnen = '<span class="notitie">' + notities[i].map(function (v, k) {
          return '<i>' + (v ? (k + 1) : '') + '</i>';
        }).join('') + '</span>';
      }
      cel.innerHTML = binnen;
    }
    // Zelfde cijfer overal oplichten, dat zoekt rustiger.
    if (gekozen >= 0 && bord[gekozen]) {
      const v = String(bord[gekozen]);
      for (let i = 0; i < 81; i++) if (String(bord[i]) === v && i !== gekozen) cellen[i].classList.add('zelfde');
    }
    $('sudoku-klok').textContent = klok(seconden);
    const beste = stats.beste[puzzel.niveau];
    $('sudoku-beste').textContent = beste ? 'beste: ' + klok(beste) : 'nog geen tijd';
    const v = S.voortgang(bord, puzzel.oplossing);
    $('sudoku-status').textContent = klaar
      ? 'Klaar in ' + klok(seconden) + ' met ' + fouten + ' fout' + (fouten === 1 ? '' : 'en') + '.'
      : v.goed - 0 >= 81
        ? 'Klaar!'
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
    notities[gekozen] = new Array(9).fill(false);
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
    notities[gekozen] = new Array(9).fill(false);
    render();
    bewaar();
  }

  function hint() {
    if (klaar) return;
    const h = S.hint(bord, puzzel.oplossing, puzzel.gegeven);
    if (!h) return;
    bord[h.cel] = h.waarde;
    notities[h.cel] = new Array(9).fill(false);
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
    const vorige = stats.beste[puzzel.niveau];
    if (!vorige || seconden < vorige) stats.beste[puzzel.niveau] = seconden;
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
        '<h2>' + S.MOEILIJKHEID[puzzel.niveau].naam + ' opgelost</h2>' +
        '<div class="sterren-groot">' + sterrenVoor() + '</div>' +
        '<p>Tijd ' + klok(seconden) + ' · ' + fouten + ' fout' + (fouten === 1 ? '' : 'en') +
          ' · beste tijd ' + klok(stats.beste[puzzel.niveau]) + '</p>' +
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
    let n = 1;
    if (fouten <= 3) n = 3;
    else if (fouten <= 8) n = 2;
    let uit = '';
    for (let i = 1; i <= 3; i++) uit += '<i class="' + (i <= n ? 'aan' : '') + '">★</i>';
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

  function toon() {
    if (!puzzel) {
      const bewaard = laad();
      if (bewaard && bewaard.puzzel) {
        puzzel = {
          niveau: bewaard.niveau || bewaard.puzzel.niveau,
          zaad: bewaard.puzzel.zaad,
          opgave: bewaard.puzzel.opgave,
          oplossing: bewaard.puzzel.oplossing,
          gegeven: bewaard.puzzel.gegeven
        };
        bord = bewaard.bord || puzzel.opgave.slice();
        notities = bewaard.notities ||
          new Array(81).fill(null).map(function () { return new Array(9).fill(false); });
        fouten = bewaard.fouten || 0;
        seconden = bewaard.seconden || 0;
        klaar = !!bewaard.klaar;
        stats = bewaard.stats || stats;
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
    $('sudoku-notitie').addEventListener('click', function () {
      noteerModus = !noteerModus;
      render();
    });
    $('sudoku-wis').addEventListener('click', wis);
    $('sudoku-hint').addEventListener('click', hint);
    $('sudoku-nieuw').addEventListener('click', function () { if (puzzel) nieuwSpel(puzzel.niveau); });

    window.addEventListener('keydown', function (e) {
      const zichtbaar = !$('scherm-sudoku').hidden;
      if (!zichtbaar) return;
      if (e.key >= '1' && e.key <= '9') { zetCijfer(Number(e.key)); e.preventDefault(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { wis(); e.preventDefault(); return; }
      if (gekozen < 0) return;
      const stappen = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
      if (stappen[e.key]) {
        const naar = gekozen + stappen[e.key];
        if (naar >= 0 && naar < 81) { gekozen = naar; render(); }
        e.preventDefault();
      }
    });
  }

  function opnieuw() {
    try { localStorage.removeItem(SLEUTEL); } catch (e) { /* stil */ }
    stats = { beste: {}, gewonnen: 0 };
    puzzel = null;
    nieuwSpel('midden');
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
    bouw();
    bind();
    window.addEventListener('resize', pasMaat);
    window.SmakenlandSudokuView = {
      toon: toon, opnieuw: opnieuw, kop: kop, statistiek: statistiek,
      nieuw: nieuwSpel,
      get bord() { return bord; },
      get puzzel() { return puzzel; },
      get klaar() { return klaar; },
      get fouten() { return fouten; },
      zetCijfer: zetCijfer, kiesCel: kiesCel, wis: wis, hint: hint,
      timerUit: stopTimer, pasMaat: pasMaat
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
