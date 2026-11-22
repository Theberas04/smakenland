/* Smakenland - de schil: tabs, bord, levelkaart, en de panelen eromheen. */
(function () {
  'use strict';

  const E = window.SmakenlandEngine;
  const C = window.SmakenlandContent;
  const ART = window.SmakenlandArt;
  const LV = window.SmakenlandLevels;
  const DEBUG = /[?&](debug|test)=1/.test(window.location.search) || window.SmakenlandDebug === true;

  const SLEUTEL_VRIJ = 'smakenland.vrij.v2';
  const SLEUTEL_VOORTGANG = 'smakenland.voortgang.v1';
  const SLEUTEL_GELUID = 'smakenland.geluid';
  const SLEUTEL_THEMA = 'smakenland.thema';

  const PRE = window.SmakenlandPrestaties;          // de prestaties (los te toetsen)
  const VC = window.SmakenlandVoortgangscode;       // de voortgangscode

  const $ = function (id) { return document.getElementById(id); };
  const bord = $('bord');
  const zwevend = $('zwevend');

  let vrij = null;         // stand van het vrije spel
  let level = null;        // stand van het level dat nu gespeeld wordt
  /** Een lege voortgang, inclusief de tellers voor de prestaties. */
  function legeVoortgang() {
    return { levelSterren: {}, sudoku: {}, stats: {}, prestaties: [], thema: 'licht' };
  }

  let voortgang = legeVoortgang();
  let volgendLevel = null;   // welk level de knop "Volgende level" opent
  let tab = 'levels';
  let scherm = 'kaart';    // 'kaart' | 'level' | 'vrij' | 'sudoku'
  let borden = [];         // de 56 cel-elementen van het bord
  let gekozen = -1;
  let sleept = null;
  let laatsteBewaard = 0;

  // ------------------------------------------------------------- geluid

  const geluid = (function () {
    let ctx = null;
    let aan = true;
    try { aan = localStorage.getItem(SLEUTEL_GELUID) !== 'uit'; } catch (e) { aan = true; }

    function context() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return ctx;
    }

    function toon(freq, duur, soort, vertraging, sterkte) {
      if (!aan) return;
      const c = context();
      if (!c) return;
      const start = c.currentTime + (vertraging || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = soort || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(sterkte || 0.06, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + duur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(start);
      osc.stop(start + duur + 0.02);
    }

    return {
      tik: function () { toon(420, 0.07, 'triangle', 0, 0.05); },
      munt: function () { toon(880, 0.1, 'square', 0, 0.035); toon(1320, 0.14, 'square', 0.06, 0.03); },
      versmelt: function () { toon(520, 0.12, 'sine'); toon(780, 0.16, 'sine', 0.07); toon(1040, 0.22, 'sine', 0.14, 0.05); },
      feest: function () { [660, 880, 1100, 1320].forEach(function (f, i) { toon(f, 0.18, 'triangle', i * 0.08, 0.05); }); },
      weg: function () { toon(240, 0.16, 'sawtooth', 0, 0.035); },
      cijfer: function () { toon(560, 0.05, 'triangle', 0, 0.04); },
      fout: function () { toon(200, 0.18, 'sawtooth', 0, 0.045); toon(150, 0.2, 'sawtooth', 0.06, 0.03); },
      isAan: function () { return aan; },
      zet: function (v) {
        aan = v;
        try { localStorage.setItem(SLEUTEL_GELUID, v ? 'aan' : 'uit'); } catch (e) { /* stil */ }
        if (v) context();
      }
    };
  })();

  // ---------------------------------------------------------- kunst-kaart

  // De sudoku gebruikt hetzelfde geluid als het bord.
  window.SmakenlandGeluid = geluid;

  function itemBeeld(item) {
    if (item.kind === 'gen') return ART.kisten[item.gen] || '';
    const rij = ART.ketens[item.keten];
    return rij ? rij[item.tier - 1] : '';
  }

  function naamVan(cel) {
    if (cel.kind === 'gen') return C.GENERATORS[cel.gen].naam;
    return C.CHAINS[cel.keten].tiers[cel.tier - 1].n;
  }

  function kleinBeeld(keten, tier, grootte) {
    const rij = ART.ketens[keten];
    const maat = grootte || 26;
    return '<span class="mini-kunst" style="width:' + maat + 'px;height:' + maat + 'px">' +
      (rij ? rij[tier - 1] : '') + '</span>';
  }

  // ------------------------------------------------------------- opslag

  function bewaarVoortgang() {
    try { localStorage.setItem(SLEUTEL_VOORTGANG, JSON.stringify(voortgang)); } catch (e) { /* stil */ }
  }

  function laadVoortgang() {
    let ruw = null;
    try { ruw = localStorage.getItem(SLEUTEL_VOORTGANG); } catch (e) { ruw = null; }
    if (!ruw) return legeVoortgang();
    try {
      const p = JSON.parse(ruw);
      return {
        levelSterren: p.levelSterren || {},
        sudoku: p.sudoku || {},
        stats: p.stats || {},
        prestaties: p.prestaties || [],
        thema: p.thema === 'donker' ? 'donker' : 'licht'
      };
    } catch (e) {
      return legeVoortgang();
    }
  }

  function bewaarVrij(nu) {
    const t = nu || Date.now();
    if (t - laatsteBewaard < 400) return;
    laatsteBewaard = t;
    try { localStorage.setItem(SLEUTEL_VRIJ, E.serialiseer(vrij)); } catch (e) { /* stil */ }
  }

  function bewaarVrijNu() {
    laatsteBewaard = 0;
    try { localStorage.setItem(SLEUTEL_VRIJ, E.serialiseer(vrij)); } catch (e) { /* stil */ }
  }

  function laadVrij() {
    let tekst = null;
    try { tekst = localStorage.getItem(SLEUTEL_VRIJ); } catch (e) { tekst = null; }
    const uitOpslag = tekst ? E.laad(tekst) : null;
    vrij = uitOpslag || E.createState();
    return !!uitOpslag;
  }

  // -------------------------------------------------------------- effect

  function rectVan(celIdx) {
    const el = borden[celIdx];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function zwevendeTekst(x, y, tekst, soort) {
    const d = document.createElement('div');
    d.className = 'vlucht' + (soort ? ' ' + soort : '');
    d.textContent = tekst;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    zwevend.appendChild(d);
    setTimeout(function () { d.remove(); }, 1100);
  }

  function pufjes(x, y) {
    for (let i = 0; i < 7; i++) {
      const p = document.createElement('div');
      p.className = 'puf';
      const hoek = (Math.PI * 2 * i) / 7;
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', Math.round(Math.cos(hoek) * 34) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(hoek) * 34) + 'px');
      p.style.background = i % 2 ? 'var(--ster)' : 'var(--accent)';
      zwevend.appendChild(p);
      setTimeout(function () { p.remove(); }, 650);
    }
  }

  function actieveStand() { return scherm === 'level' ? level : vrij; }

  function verwerk(events, anker) {
    const s = actieveStand();
    (events || []).forEach(function (ev) {
      const p = ev.cel !== undefined ? rectVan(ev.cel) : (anker || { x: 40, y: 90 });
      if (ev.type === 'merge') {
        telOp('versmeltingen');
        const doel = s && s.cells[ev.cel];
        if (doel && p) { zwevendeTekst(p.x, p.y, (ev.aantal > 1 ? ev.aantal + '× ' : '') + naamVan(doel)); pufjes(p.x, p.y); }
        geluid.versmelt();
        if (borden[ev.cel]) {
          borden[ev.cel].classList.add('net-versmelt');
          setTimeout(function () { if (borden[ev.cel]) borden[ev.cel].classList.remove('net-versmelt'); }, 500);
        }
      } else if (ev.type === 'oogst') {
        telOp('oogsten');
        geluid.tik();
        if (borden[ev.cel]) {
          borden[ev.cel].classList.add('net-geoogst');
          setTimeout(function () { if (borden[ev.cel]) borden[ev.cel].classList.remove('net-geoogst'); }, 350);
        }
      } else if (ev.type === 'munten') {
        if (ev.bedrag > 0) {
          telOp('muntenVerdiend', ev.bedrag);
          geluid.munt();
          if (p) zwevendeTekst(p.x, p.y, '+' + ev.bedrag + ' 🪙', 'munten');
        }
      } else if (ev.type === 'levering') {
        telOp('klanten');
        if (ev.munten > 0) telOp('muntenVerdiend', ev.munten);
        geluid.feest();
        zwevendeTekst(window.innerWidth / 2, 120,
          ev.munten > 0 ? '+' + ev.munten + ' 🪙  +' + ev.sterren + ' ⭐' : 'Doel gehaald!', 'munten');
      } else if (ev.type === 'gebied') {
        toonVerhaal(ev);
      } else if (ev.type === 'level-klaar') {
        setTimeout(function () { toonLevelKlaar(ev); }, 450);
      }
    });
  }

  // ------------------------------------------------------------- schermen

  // De adresbalk onthoudt waar je bent (#sudoku, #vrij, #levels, #level12). Dat is
  // meteen een diepe link, en de Android-app kan er een scherm mee openen.
  function zetHash(waarde) {
    try { history.replaceState(null, '', '#' + waarde); } catch (e) { /* stil */ }
  }

  function meldScherm() {
    if (!window.console || !console.info) return;
    const aantal = LV ? LV.levels.length : 0;
    console.info('SmakenlandScherm=' + scherm + ' tab=' + tab + ' levels=' + aantal);
  }

  function zetTab(naam, opties) {
    opties = opties || {};
    if (naam !== 'levels' && naam !== 'sudoku' && naam !== 'vrij' && naam !== 'prestaties') naam = 'levels';
    tab = naam;
    Array.from(document.querySelectorAll('.tab')).forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.tab === naam ? 'true' : 'false');
    });
    if (naam === 'sudoku') scherm = 'sudoku';
    else if (naam === 'prestaties') scherm = 'prestaties';
    else if (naam === 'levels') scherm = opties.level ? 'level' : 'kaart';
    else scherm = 'vrij';
    if (scherm === 'level' && !level) scherm = 'kaart';
    renderAlles();
    if (naam === 'sudoku' && window.SmakenlandSudokuView) window.SmakenlandSudokuView.toon();
    if (naam === 'prestaties') checkPrestaties();
    // De maat van de sudoku hoort in de adresbalk te blijven staan: stond er
    // #sudoku16, dan mag dat geen #sudoku worden, want dan raakt de maat kwijt
    // voordat de sudokuvieuw hem kan lezen.
    zetHash(scherm === 'level' ? ('level' + level.level)
      : (scherm === 'kaart' ? 'levels'
        : (scherm === 'sudoku' && sudokuMaat ? 'sudoku' + sudokuMaat : scherm)));
    meldScherm();
  }

  /** De sudokumaat uit de adresbalk (#sudoku16), zolang die maat gekozen is. */
  let sudokuMaat = null;

  /** Wat de adresbalk vraagt, bijvoorbeeld #sudoku of #level12. */
  function pasHashToe() {
    const ruw = (window.location.hash || '').replace(/^#/, '');
    if (!ruw) return false;
    const sud = /^sudoku(4|6|9|12|16)$/.exec(ruw);
    if (sud) { sudokuMaat = Number(sud[1]); zetTab('sudoku'); return true; }
    if (ruw === 'sudoku') { sudokuMaat = null; zetTab('sudoku'); return true; }
    if (ruw === 'vrij') { zetTab('vrij'); return true; }
    if (ruw === 'prestaties') { zetTab('prestaties'); return true; }
    if (ruw === 'levels' || ruw === 'kaart') { zetTab('levels'); return true; }
    const m = /^level(\d+)$/.exec(ruw);
    if (m) {
      const nr = Number(m[1]);
      if (E.levelVan(nr) && E.levelOpen(voortgang.levelSterren, nr)) {
        startLevel(nr);
        return true;
      }
    }
    return false;
  }

  function toonScherm() {
    const breed = scherm === 'kaart' || scherm === 'sudoku' || scherm === 'prestaties';
    document.querySelector('main').dataset.scherm = breed ? 'breed' : 'kolommen';
    $('scherm-kaart').hidden = scherm !== 'kaart';
    $('scherm-sudoku').hidden = scherm !== 'sudoku';
    $('scherm-prestaties').hidden = scherm !== 'prestaties';
    $('bord-paneel').hidden = breed;
    $('links-paneel').hidden = breed;
    $('rechts-paneel').hidden = breed;
  }

  // ------------------------------------------------------------------ kop

  function pil(inhoud, extra) {
    return '<div class="stat' + (extra ? ' ' + extra : '') + '">' + inhoud + '</div>';
  }

  function renderKop() {
    const houder = $('statistieken');
    if (tab === 'prestaties') {
      const stand = spelerStand();
      const tel = PRE.tel(stand);
      houder.innerHTML = pil('<span class="e">🏆</span><b id="kop-prestaties">' +
        tel.behaald + '/' + tel.totaal + '</b>') +
        pil('<span class="e">⭐</span><b>' + stand.sterren + '</b>');
      $('merk-klein').textContent = 'prestaties';
      return;
    }
    if (tab === 'sudoku') {
      const view = window.SmakenlandSudokuView;
      houder.innerHTML = view ? view.kop() : '';
      $('merk-klein').textContent = 'sudoku';
      // Het sudokubord is pas te meten als het zichtbaar is.
      if (view && view.pasMaat) view.pasMaat();
      return;
    }
    if (scherm === 'kaart') {
      houder.innerHTML = pil('<span class="e">⭐</span><b id="stat-sterren">' +
        Object.keys(voortgang.levelSterren).reduce(function (n, k) { return n + voortgang.levelSterren[k]; }, 0) +
        '</b>') + pil('<span class="e">🎯</span><b id="stat-doelen">' +
        Object.keys(voortgang.levelSterren).length + '</b>');
      $('merk-klein').textContent = 'reis door Smakenland';
      return;
    }
    const s = scherm === 'level' ? level : vrij;
    if (!s) { houder.innerHTML = ''; return; }
    const sterren = scherm === 'level' ? (voortgang.levelSterren[s.level] || 0) + ' ⭐' : s.sterren + '';
    houder.innerHTML =
      (scherm === 'level'
        ? pil('<span class="e">🎯</span><b id="stat-doelen">' + s.orders.length + '</b>')
        : pil('<span class="e">🪙</span><b id="stat-munten">' + s.munten + '</b>')) +
      pil('<span class="e">⚡</span><span class="energie-houder"><b id="stat-energie">' +
          s.energie + '/' + s.energieMax + '</b><span class="balk"><i id="energie-vulling" style="width:' +
          Math.round((s.energie / Math.max(1, s.energieMax)) * 100) + '%"></i></span></span>' +
          (scherm === 'level' ? '' : '<small id="energie-timer"></small>'), 'stat-energie') +
      pil('<span class="e">⭐</span><b id="stat-sterren">' + sterren + '</b>');
    $('merk-klein').textContent = scherm === 'level' ? ('level ' + s.level) : 'vrij spelen';
    if (scherm !== 'level') {
      const sec = E.secondenTotEnergie(s);
      const timer = $('energie-timer');
      if (timer) {
        timer.textContent = s.energie >= s.energieMax
          ? 'vol'
          : '+' + (sec >= 60 ? Math.floor(sec / 60) + 'm' : sec + 's');
      }
    }
  }

  function renderStats() {
    const s = actieveStand();
    if (!s) return;
    const energie = $('stat-energie');
    const balk = $('energie-vulling');
    if (energie) energie.textContent = s.energie + '/' + s.energieMax;
    if (balk) {
      balk.style.width = Math.round((s.energie / Math.max(1, s.energieMax)) * 100) + '%';
      balk.classList.toggle('vol', s.energie >= s.energieMax);
    }
    const munten = $('stat-munten');
    if (munten) munten.textContent = s.munten;
    const doelen = $('stat-doelen');
    if (doelen) doelen.textContent = s.orders.length;
    const vulling = $('level-energie-vulling');
    if (vulling && scherm === 'level') {
      vulling.style.width = Math.round((s.energie / Math.max(1, s.energieMax)) * 100) + '%';
      const tekst = $('level-energie-tekst');
      if (tekst) tekst.textContent = s.energie + '/' + s.energieMax;
    }
  }

  // ----------------------------------------------------------------- bord

  function renderBord() {
    const s = actieveStand();
    if (!s) return;
    for (let i = 0; i < s.cells.length; i++) {
      const cel = s.cells[i];
      const el = borden[i];
      el.className = 'cel';
      el.style.background = '';
      el.style.borderColor = '';
      el.innerHTML = '';
      if (!cel) continue;

      if (cel.kind === 'gen') {
        el.classList.add('bezet', 'kist');
        const niveau = document.createElement('span');
        niveau.className = 'niveau';
        for (let n = 1; n <= E.MAX_GEN_LEVEL; n++) {
          const stip = document.createElement('i');
          if (n <= cel.level) stip.className = 'aan';
          niveau.appendChild(stip);
        }
        el.appendChild(niveau);
        el.insertAdjacentHTML('beforeend',
          '<span class="kunst-houder">' + (ART.kisten[cel.gen] || '') + '</span>' +
          (cel.count > 1 ? '<span class="stapel">×' + cel.count + '</span>' : ''));
      } else {
        const keten = C.CHAINS[cel.keten];
        el.classList.add('bezet', 'item');
        if (cel.keten === 'munt') el.classList.add('munt');
        el.style.background = 'linear-gradient(160deg,' + keten.kleur + '33,' + keten.kleur + '1a)';
        el.style.borderColor = keten.kleur + '55';
        el.insertAdjacentHTML('beforeend',
          '<span class="tree">' + cel.tier + '</span>' +
          '<span class="kunst-houder">' + itemBeeld(cel) + '</span>' +
          (cel.count > 1 ? '<span class="stapel">×' + cel.count + '</span>' : ''));
      }
      if (i === gekozen) el.classList.add('gekozen');
    }
    $('knop-kiezen').hidden = gekozen < 0;
  }

  function renderHint() {
    const s = actieveStand();
    if (!s) return;
    let tekst;
    if (scherm === 'level') {
      tekst = s.orders.length === 0
        ? 'Level gehaald!'
        : (s.energie <= 0 ? 'Energie op — gebruik de hulp links of start opnieuw' : 'Haal de doelen rechts');
    } else if (s.energie <= 0) {
      tekst = 'Energie is op — wacht even of koop een drankje';
    } else {
      const klaar = s.orders.filter(function (o) { return E.kanLeveren(s, o.id) >= o.aantal; }).length;
      tekst = klaar > 0
        ? (klaar === 1 ? 'Een klant staat klaar om te leveren' : klaar + ' klanten staan klaar')
        : 'Tik op een kist om te oogsten — sleep gelijke items op elkaar';
    }
    $('bord-hint').textContent = tekst;
  }

  // --------------------------------------------------------------- acties

  function doeOogst(celIdx) {
    const r = E.oogst(actieveStand(), celIdx);
    if (!r.ok) {
      if (r.reden === 'energie' || r.reden === 'vol') {
        geluid.weg();
        zwevendeTekst(window.innerWidth / 2, 110,
          r.reden === 'energie' ? 'Geen energie meer' : 'Het bord is vol — versmelt eerst wat weg');
      }
      if (borden[celIdx]) {
        borden[celIdx].classList.add('weiger');
        setTimeout(function () { if (borden[celIdx]) borden[celIdx].classList.remove('weiger'); }, 320);
      }
      bewaar();
      return r;
    }
    verwerk(r.events, rectVan(celIdx));
    renderAlles();
    bewaar();
    return r;
  }

  function doeVerplaats(van, naar) {
    const r = E.verplaats(actieveStand(), van, naar);
    if (r.ok) {
      verwerk(r.events, rectVan(naar));
      renderAlles();
      bewaar();
    } else if (borden[naar]) {
      geluid.weg();
      borden[naar].classList.add('weiger');
      setTimeout(function () { if (borden[naar]) borden[naar].classList.remove('weiger'); }, 320);
    }
    return r;
  }

  function doeIncasseer(celIdx) {
    const r = E.incasseer(actieveStand(), celIdx);
    if (r.ok) { verwerk(r.events, rectVan(celIdx)); renderAlles(); bewaar(); }
    return r;
  }

  function doeLever(orderId) {
    const r = E.lever(actieveStand(), orderId);
    if (r.ok) { verwerk(r.events, null); renderAlles(); bewaar(); }
    return r;
  }

  function doeKoop(id) {
    const r = E.koop(vrij, id);
    if (r.ok) {
      verwerk(r.events, null);
      if (id === 'energie') zwevendeTekst(window.innerWidth / 2, 110, '⚡ +25 energie');
      renderAlles();
    } else {
      geluid.weg();
    }
    return r;
  }

  function bewaar() {
    if (scherm === 'vrij') bewaarVrij();
  }

  // --------------------------------------------------------------- tikken

  function tik(celIdx) {
    const s = actieveStand();
    const cel = s.cells[celIdx];
    if (!cel) {
      if (gekozen >= 0) {
        const van = gekozen;
        gekozen = -1;
        doeVerplaats(van, celIdx);
      }
      return;
    }
    if (cel.kind === 'gen') { gekozen = -1; doeOogst(celIdx); return; }
    if (cel.keten === 'munt') { gekozen = -1; doeIncasseer(celIdx); return; }
    if (gekozen === celIdx) { gekozen = -1; renderBord(); return; }
    if (gekozen >= 0) {
      const van = gekozen;
      gekozen = -1;
      doeVerplaats(van, celIdx);
      return;
    }
    gekozen = celIdx;
    geluid.tik();
    renderBord();
  }

  // -------------------------------------------------------------- slepen

  function doelKlassen(van) {
    const s = actieveStand();
    const bron = s.cells[van];
    for (let i = 0; i < s.cells.length; i++) {
      const doel = s.cells[i];
      borden[i].classList.remove('doel', 'leeg-doel');
      if (i === van) continue;
      if (!doel) { borden[i].classList.add('leeg-doel'); continue; }
      const zelfde = doel.kind === bron.kind && (bron.kind === 'gen'
        ? doel.gen === bron.gen && doel.level === bron.level
        : doel.keten === bron.keten && doel.tier === bron.tier);
      if (zelfde) borden[i].classList.add('doel');
    }
  }

  function wisDoelKlassen() {
    borden.forEach(function (el) { el.classList.remove('doel', 'leeg-doel', 'sleep-bron'); });
  }

  function celOnder(x, y) {
    const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    const cel = el && el.closest ? el.closest('.cel') : null;
    return cel ? borden.indexOf(cel) : -1;
  }

  function startSleep(van, x, y) {
    const bron = actieveStand().cells[van];
    const geest = document.createElement('div');
    geest.className = 'sleep-geest';
    geest.innerHTML = '<span class="kunst-houder">' + itemBeeld(bron) + '</span>';
    geest.style.left = x + 'px';
    geest.style.top = y + 'px';
    document.body.appendChild(geest);
    sleept = { van: van, geest: geest, verplaatst: 0, startX: x, startY: y };
    borden[van].classList.add('sleep-bron');
    doelKlassen(van);
  }

  function stopSleep(x, y) {
    if (!sleept) return;
    const van = sleept.van;
    const geest = sleept.geest;
    const verplaatst = sleept.verplaatst;
    sleept = null;
    if (geest) geest.remove();
    wisDoelKlassen();
    if (verplaatst < 8) { tik(van); return; }
    const naar = celOnder(x, y);
    if (naar >= 0 && naar !== van) doeVerplaats(van, naar);
    else renderBord();
  }

  function bindBord() {
    bord.addEventListener('pointerdown', function (e) {
      const cel = e.target.closest ? e.target.closest('.cel') : null;
      if (!cel) return;
      const i = borden.indexOf(cel);
      if (i < 0 || !actieveStand().cells[i]) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      startSleep(i, e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', function (e) {
      if (!sleept) return;
      const dx = e.clientX - sleept.startX;
      const dy = e.clientY - sleept.startY;
      sleept.verplaatst = Math.max(sleept.verplaatst, Math.abs(dx) + Math.abs(dy));
      sleept.geest.style.left = e.clientX + 'px';
      sleept.geest.style.top = e.clientY + 'px';
      if (sleept.verplaatst > 8) {
        const cel = celOnder(e.clientX, e.clientY);
        wisDoelKlassen();
        if (borden[sleept.van]) borden[sleept.van].classList.add('sleep-bron');
        doelKlassen(sleept.van);
        if (cel >= 0 && borden[cel]) borden[cel].classList.add('doel');
      }
    }, { passive: true });
    window.addEventListener('pointerup', function (e) { stopSleep(e.clientX, e.clientY); });
    window.addEventListener('pointercancel', function () {
      if (!sleept) return;
      if (sleept.geest) sleept.geest.remove();
      sleept = null;
      wisDoelKlassen();
      renderBord();
    });
  }

  let laatsteBordMaat = '';

  function pasMaat() {
    const breedte = bord.clientWidth;
    if (!breedte) return;
    const stijl = window.getComputedStyle(bord);
    const gap = parseFloat(stijl.columnGap) || 4;
    const pad = parseFloat(stijl.paddingLeft) || 8;
    const tegel = (breedte - 2 * pad - (E.COLS - 1) * gap) / E.COLS;
    document.documentElement.style.setProperty('--tegel', tegel.toFixed(1) + 'px');
    // Meld de GEMETEN maat van het bord, niet de bedoelde: de emulator-smoketest
    // leest dit uit logcat en ziet zo dat het bord op een echt toestel acht rijen
    // hoog is. Op de WebView van Android 11 klapte het bord in doordat `aspect-ratio`
    // daar niet bestaat — met deze regel valt dat meteen op.
    window.requestAnimationFrame(function () {
      if (bord.offsetParent === null) return;    // bord staat op een verborgen tab
      const hoogte = Math.round(bord.getBoundingClientRect().height);
      const maat = E.COLS + 'x' + E.ROWS + ' hoogte=' + hoogte + ' tegel=' + Math.round(tegel);
      if (maat !== laatsteBordMaat) {
        laatsteBordMaat = maat;
        console.info('SmakenlandBord=' + maat);
      }
    });
  }

  function bouwBord() {
    bord.innerHTML = '';
    borden = [];
    for (let i = 0; i < E.COLS * E.ROWS; i++) {
      const el = document.createElement('div');
      el.className = 'cel';
      el.dataset.cel = i;
      el.setAttribute('role', 'gridcell');
      bord.appendChild(el);
      borden.push(el);
    }
    pasMaat();
  }

  // ---------------------------------------------------------- levelkaart

  function sterrenBeeld(aantal) {
    let uit = '';
    for (let i = 1; i <= 3; i++) uit += '<i class="' + (i <= aantal ? 'aan' : '') + '">★</i>';
    return uit;
  }

  function klokTekst(seconden) {
    const m = Math.floor(seconden / 60);
    const s = Math.floor(seconden % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderKaart() {
    const houder = $('hoofdstukken');
    houder.innerHTML = '';
    let gehaald = 0;
    let sterren = 0;
    Object.keys(voortgang.levelSterren).forEach(function (nr) {
      gehaald++;
      sterren += voortgang.levelSterren[nr] || 0;
    });
    // Alleen de hoofdstukken van dit seizoen; de andere seizoenen komen later terug
    // (die staan onderaan de kaart vermeld).
    const zichtbaar = E.zichtbareHoofdstukken();
    const perHfst = LV.niveauPerHoofdstuk;
    const aantalZichtbaar = E.aantalZichtbareLevels();
    let sterrenZichtbaar = 0;
    let gehaaldZichtbaar = 0;
    zichtbaar.forEach(function (x) {
      const van0 = x.hfst * perHfst + 1;
      for (let nr = van0; nr < van0 + perHfst; nr++) {
        if (voortgang.levelSterren[nr]) gehaaldZichtbaar++;
        sterrenZichtbaar += voortgang.levelSterren[nr] || 0;
      }
    });
    $('kaart-titel').textContent = LV.levels.length + ' levels';
    const uitlegLevels = $('uitleg-levels');
    if (uitlegLevels) {
      uitlegLevels.textContent = LV.levels.length + ' levels over ' + LV.hoofdstukken.length +
        ' hoofdstukken, waarvan twee per seizoen';
    }
    $('kaart-sterren').textContent = sterrenZichtbaar + ' / ' + (aantalZichtbaar * 3) + ' ⭐';
    $('kaart-gehaald').textContent = gehaaldZichtbaar + ' van ' + aantalZichtbaar + ' gehaald · ' +
      LV.hoofdstukken.length + ' hoofdstukken';
    zichtbaar.forEach(function (punt) {
      const hfst = punt.hoofdstuk;
      const h = punt.hfst;
      const blok = document.createElement('section');
      blok.className = 'hoofdstuk' + (hfst.seizoen ? ' seizoen' : '');
      const van = h * perHfst + 1;
      const tot = van + perHfst - 1;
      let hfstSterren = 0;
      let hfstGehaald = 0;
      for (let nr = van; nr <= tot; nr++) {
        if (voortgang.levelSterren[nr]) hfstGehaald++;
        hfstSterren += voortgang.levelSterren[nr] || 0;
      }
      blok.innerHTML =
        '<div class="hoofdstuk-kop">' +
          '<span class="hoofdstuk-e">' + hfst.e + '</span>' +
          '<div class="hoofdstuk-tekst"><b>' + hfst.naam +
            (hfst.seizoen ? ' <span class="seizoen-vlag">' + E.SEIZOENEN[hfst.seizoen].e + ' ' +
              E.SEIZOENEN[hfst.seizoen].naam.toLowerCase() + '</span>' : '') +
            '</b><small>level ' + van + '–' + tot + ' · ' +
            hfst.ketens.map(function (k) { return C.CHAINS[k].naam; }).join(', ') + '</small></div>' +
          '<span class="hoofdstuk-sterren">' + hfstGehaald + '/' + LV.niveauPerHoofdstuk +
            ' · ' + hfstSterren + ' ⭐</span>' +
        '</div>';
      const rooster = document.createElement('div');
      rooster.className = 'levels';
      for (let nr = van; nr <= tot; nr++) {
        const open = E.levelOpen(voortgang.levelSterren, nr);
        const s = voortgang.levelSterren[nr] || 0;
        const knop = document.createElement('button');
        knop.type = 'button';
        knop.className = 'level-knop' + (open ? '' : ' op-slot') + (s ? ' gehaald' : '');
        knop.dataset.level = nr;
        knop.setAttribute('aria-label', 'Level ' + nr + (open ? (s ? ', ' + s + ' sterren' : '') : ', nog op slot'));
        knop.innerHTML = '<span class="level-nr">' + nr + '</span>' +
          (open ? '<span class="level-sterren">' + sterrenBeeld(s) + '</span>'
                : '<span class="level-slot">🔒</span>');
        rooster.appendChild(knop);
      }
      blok.appendChild(rooster);
      houder.appendChild(blok);
    });

    // Wat er nog meer is: de andere seizoenen, met de naam van hun hoofdstukken.
    const andere = E.andereSeizoenen();
    const anderBestaand = andere.filter(function (s) { return s.hoofdstukken.length; });
    if (anderBestaand.length) {
      const doos = document.createElement('section');
      doos.className = 'seizoen-noot';
      doos.innerHTML = '<div class="hoofdstuk-kop"><span class="hoofdstuk-e">🗓️</span>' +
        '<div class="hoofdstuk-tekst"><b>Seizoenshoofdstukken</b><small>' +
        'Elk seizoen heeft twee eigen hoofdstukken. Nu: ' +
        E.SEIZOENEN[E.seizoenNu()].e + ' ' + E.SEIZOENEN[E.seizoenNu()].naam.toLowerCase() + '.</small></div></div>' +
        '<div class="seizoen-lijst">' + anderBestaand.map(function (s) {
          return '<span class="seizoen-regel"><b>' + s.e + ' ' + s.naam + '</b>: ' +
            s.hoofdstukken.join(', ') + ' <i>(komt terug in de ' + s.naam.toLowerCase() + ')</i></span>';
        }).join('') + '</div>';
      houder.appendChild(doos);
    }
  }

  // -------------------------------------------------------- levels spelen

  function tekenLevelPanelen() {
    if (!level) return;
    const lv = E.levelVan(level.level);
    const gebied = C.AREAS[lv.hfst % C.AREAS.length];
    $('links-paneel').innerHTML =
      '<div class="gebied-kaart level-kop" style="background:linear-gradient(160deg,' +
        gebied.kleuren[0] + ',' + gebied.kleuren[1] + ')">' +
        '<span class="lucht-houder">' + (ART.gebieden[gebied.id] || '') + '</span>' +
        '<span class="gebied-e">' + LV.hoofdstukken[lv.hfst].e + '</span>' +
        '<div><small>' + LV.hoofdstukken[lv.hfst].naam + '</small>' +
        '<h2>Level ' + lv.nr + '</h2></div>' +
      '</div>' +
      '<p class="verhaal">Haal de doelen hiernaast. Je hebt <b>' + level.energieMax +
        ' energie</b> voor dit level; wat je overhoudt bepaalt je sterren.</p>' +
      '<div class="voortgang">' +
        '<div class="voortgang-kop"><span>Energie over</span><span id="level-energie-tekst">' +
          level.energie + '/' + level.energieMax + '</span></div>' +
        '<div class="balk groot"><i id="level-energie-vulling" style="width:' +
          Math.round((level.energie / level.energieMax) * 100) + '%"></i></div>' +
      '</div>' +
      '<div class="sterren-rij">' + sterrenBeeld(E.levelSterren(level)) + '</div>' +
      '<div class="knop-rij">' +
        '<button type="button" id="level-hulp"' +
          (E.hulpOver(level) ? '' : ' disabled') + '>⚡ +10 energie' +
          (E.hulpOver(level) ? ' <small>(' + E.hulpOver(level) + '× over)</small>' : ' <small>(op)</small>') +
        '</button>' +
        '<button type="button" id="level-opnieuw-2">🔄 Opnieuw</button>' +
        '<button type="button" id="level-kaart">🗺️ Kaart</button>' +
      '</div>';

    $('level-hulp').addEventListener('click', function () {
      const r = E.hulp(level);
      if (r.ok) {
        geluid.munt();
        zwevendeTekst(window.innerWidth / 2, 110, '⚡ +10 energie');
        renderAlles();
        zwevendeTekst(window.innerWidth / 2, 150, r.over ? 'nog ' + r.over + '×' : 'dat was de laatste');
      } else {
        geluid.weg();
        zwevendeTekst(window.innerWidth / 2, 110, 'De hulp is voor dit level op — start het opnieuw');
      }
    });
    $('level-opnieuw-2').addEventListener('click', function () { startLevel(level.level); });
    $('level-kaart').addEventListener('click', function () { zetTab('levels'); });
  }

  function tekenDoelen() {
    const houder = $('rechts-paneel');
    if (!level) return;
    houder.innerHTML = '<h2>Doelen van dit level</h2><div class="orders" id="orders"></div>';
    const orders = $('orders');
    level.orders.forEach(function (order) {
      const keten = C.CHAINS[order.keten];
      const tier = keten.tiers[order.tier - 1];
      const heb = E.kanLeveren(level, order.id);
      const kaart = document.createElement('div');
      kaart.className = 'order' + (heb >= order.aantal ? ' klaar' : '');
      kaart.dataset.order = order.id;
      kaart.innerHTML =
        '<div class="order-kop"><b>' + E.klantVoor(level, order) + '</b><small>' + keten.naam + '</small></div>' +
        '<div class="order-wens">' + kleinBeeld(order.keten, order.tier, 34) +
          '<span class="tekst"><b>' + tier.n + '</b><small>tree ' + order.tier + ' · ' + order.aantal +
          '× nodig</small></span>' +
          '<span class="order-heb ' + (heb >= order.aantal ? 'ok' : 'mis') + '">' + heb + '/' +
          order.aantal + '</span></div>' +
        '<div class="order-voet"><span class="order-beloning">' +
          (heb >= order.aantal ? 'klaar om in te leveren' : 'nog niet compleet') + '</span>' +
        '<button class="lever" type="button" data-lever="' + order.id + '"' +
        (heb >= order.aantal ? '' : ' disabled') + '>Inleveren</button></div>';
      orders.appendChild(kaart);
    });
    if (level.orders.length === 0) {
      orders.innerHTML = '<p class="verhaal">Alle doelen zijn gehaald.</p>';
    }
  }

  function startLevel(nr) {
    const nieuw = E.startLevel(nr);
    if (!nieuw) return false;
    level = nieuw;
    gekozen = -1;
    tab = 'levels';
    scherm = 'level';
    Array.from(document.querySelectorAll('.tab')).forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.tab === 'levels' ? 'true' : 'false');
    });
    renderAlles();
    zetHash('level' + nr);
    meldScherm();
    return true;
  }

  function toonLevelKlaar(ev) {
    const oud = voortgang.levelSterren[ev.level] || 0;
    if (ev.sterren > oud) {
      voortgang.levelSterren[ev.level] = ev.sterren;
      bewaarVoortgang();
    }
    // Het volgende level dat nu te spelen is: na het laatste gewone level (1000)
    // komt het seizoenshoofdstuk, en dat is er alleen in zijn eigen seizoen.
    let volgende = ev.level + 1;
    while (E.levelVan(volgende) && !E.levelZichtbaar(volgende)) volgende++;
    const bestaat = !!E.levelVan(volgende);
    volgendLevel = bestaat ? volgende : null;    // de knop "Volgende level" staat elders
    $('level-e').textContent = ev.sterren === 3 ? '🏆' : '⭐';
    $('level-klein').textContent = 'Level ' + ev.level + ' gehaald';
    $('level-titel').textContent = ev.sterren === 3 ? 'Perfect gespeeld!' : 'Goed gedaan!';
    $('level-sterren').innerHTML = sterrenBeeld(ev.sterren);
    $('level-tekst').textContent = 'Je hield ' + ev.energie + ' energie over.' +
      (ev.sterren < 3 ? ' Met meer energie over verdien je drie sterren.' : ' Mooi zuinig gespeeld.');
    $('level-volgende').hidden = !bestaat;
    $('modal-level').hidden = false;
    // Prestaties nakijken (en vieren) nadat de uitslag in de voortgang staat.
    if (level && level.hulpGebruikt === 0) telOp('levelZonderHulp');
    bewaarVoortgang();
    checkPrestaties();
  }

  function bindLevelModal() {
    $('level-volgende').addEventListener('click', function () {
      $('modal-level').hidden = true;
      if (!volgendLevel || !startLevel(volgendLevel)) zetTab('levels');
    });
    $('level-opnieuw').addEventListener('click', function () {
      $('modal-level').hidden = true;
      startLevel(level.level);
    });
    $('level-terug').addEventListener('click', function () {
      $('modal-level').hidden = true;
      zetTab('levels');
    });
  }

  // ------------------------------------------------------------ vrij spelen

  function tekenReisPaneel() {
    const houder = $('links-paneel');
    const area = C.AREAS[vrij.gebied];
    const volgend = E.volgendGebied(vrij);
    const deel = volgend
      ? Math.max(0, Math.min(100, Math.round(((vrij.sterren - area.sterren) /
          Math.max(1, volgend.sterren - area.sterren)) * 100)))
      : 100;
    houder.innerHTML =
      '<div class="gebied-kaart" style="background:linear-gradient(160deg,' +
        area.kleuren[0] + ',' + area.kleuren[1] + ')">' +
        '<span class="lucht-houder">' + (ART.gebieden[area.id] || '') + '</span>' +
        '<span class="gebied-e">' + area.e + '</span>' +
        '<div><small>Gebied ' + (vrij.gebied + 1) + ' van ' + C.AREAS.length + '</small>' +
        '<h2>' + area.naam + '</h2></div>' +
      '</div>' +
      '<p class="verhaal">' + area.verhaal + '</p>' +
      '<div class="voortgang">' +
        '<div class="voortgang-kop"><span>' +
          (volgend ? 'nog ' + Math.max(0, volgend.sterren - vrij.sterren) + ' ⭐ tot ' + volgend.naam
                   : 'Alle gebieden verkend') + '</span><span>' +
          (volgend ? Math.min(vrij.sterren, volgend.sterren) + '/' + volgend.sterren : vrij.sterren + ' ⭐') +
        '</span></div>' +
        '<div class="balk groot"><i style="width:' + deel + '%"></i></div>' +
      '</div>' +
      '<h3>Jouw ketens</h3><div class="ketens">' +
        Object.keys(C.CHAINS).map(function (id) {
          const open = E.ontgrendeldeKetenen(vrij).indexOf(id) >= 0 || id === 'munt';
          const keten = C.CHAINS[id];
          return '<span class="keten-chip' + (open ? '' : ' op-slot') + '">' +
            '<span class="kunst-houder klein">' + (ART.ketens[id] ? ART.ketens[id][0] : '') + '</span>' +
            (open ? keten.naam : '🔒 ' + keten.naam) + '</span>';
        }).join('') +
      '</div>';
  }

  function tekenKlantenPaneel() {
    const houder = $('rechts-paneel');
    houder.innerHTML =
      '<h2>Klanten <small id="orders-klaar">' + vrij.ordersKlaar + ' geholpen</small></h2>' +
      '<div class="orders" id="orders"></div>' +
      '<h2>Winkel</h2><div class="winkel" id="winkel"></div>';
    const orders = $('orders');
    vrij.orders.forEach(function (order) {
      const keten = C.CHAINS[order.keten];
      const tier = keten.tiers[order.tier - 1];
      const heb = E.kanLeveren(vrij, order.id);
      const kaart = document.createElement('div');
      kaart.className = 'order' + (heb >= order.aantal ? ' klaar' : '');
      kaart.dataset.order = order.id;
      kaart.innerHTML =
        '<div class="order-kop"><b>' + E.klantVoor(vrij, order) + '</b><small>' + keten.naam + '</small></div>' +
        '<div class="order-wens">' + kleinBeeld(order.keten, order.tier, 34) +
          '<span class="tekst"><b>' + tier.n + '</b><small>tree ' + order.tier + ' · ' + order.aantal +
          '× nodig</small></span>' +
          '<span class="order-heb ' + (heb >= order.aantal ? 'ok' : 'mis') + '">' + heb + '/' +
          order.aantal + '</span></div>' +
        '<div class="order-voet"><span class="order-beloning">🪙 ' + order.munten + ' · ⭐ ' +
          order.sterren + '</span>' +
        '<button class="lever" type="button" data-lever="' + order.id + '"' +
        (heb >= order.aantal ? '' : ' disabled') + '>Leveren</button></div>';
      orders.appendChild(kaart);
    });
    const winkel = $('winkel');
    C.SHOP.forEach(function (artikel) {
      const div = document.createElement('div');
      div.className = 'artikel';
      const kan = vrij.munten >= artikel.prijs;
      div.innerHTML =
        '<span class="e">' + artikel.e + '</span>' +
        '<span class="tekst"><b>' + artikel.naam + '</b><small>' + artikel.tekst + '</small></span>' +
        '<button type="button" data-koop="' + artikel.id + '"' + (kan ? '' : ' disabled') +
        '>🪙 ' + artikel.prijs + '</button>';
      winkel.appendChild(div);
    });
  }

  // --------------------------------------------------------------- tekenen

  // ------------------------------------------------------- prestaties

  /** Een teller ophogen. De tellers staan in `voortgang.stats` en worden bewaard. */
  function telOp(naam, hoeveel) {
    if (!voortgang.stats) voortgang.stats = {};
    voortgang.stats[naam] = (voortgang.stats[naam] || 0) + (hoeveel === undefined ? 1 : hoeveel);
  }

  /** Hoeveel sterren er in een hoofdstuk zitten, en hoeveel levels eruit zijn. */
  function hoofdstukStand(hfst) {
    const perHfst = LV.niveauPerHoofdstuk;
    const van = hfst * perHfst + 1;
    let gehaald = 0;
    let perfect = true;
    let sterren = 0;
    for (let nr = van; nr < van + perHfst; nr++) {
      const s = voortgang.levelSterren[nr] || 0;
      if (s > 0) gehaald++;
      else perfect = false;
      if (s !== 3) perfect = false;
      sterren += s;
    }
    return { gehaald: gehaald, perfect: perfect && gehaald === perHfst, sterren: sterren };
  }

  /**
   * De stand van de speler waar de prestaties naar kijken. Alles wat te herleiden is
   * (sterren, levels, hoofdstukken) rekenen we hier uit; de rest zijn tellers uit
   * `voortgang.stats` en het sudokupaneel. Zo hoeft er nergens anders bijgehouden te
   * worden wat een prestatie is.
   */
  function spelerStand() {
    const stats = voortgang.stats || {};
    let levelsGehaald = 0;
    let sterren = 0;
    let seizoensLevels = 0;
    Object.keys(voortgang.levelSterren).forEach(function (nr) {
      const s = voortgang.levelSterren[nr] || 0;
      if (!s) return;
      levelsGehaald++;
      sterren += s;
      if (E.seizoenVanLevel(Number(nr))) seizoensLevels++;
    });
    let hoofdstukkenUit = 0;
    let perfecteHoofdstukken = 0;
    if (LV) {
      LV.hoofdstukken.forEach(function (h, i) {
        const stand = hoofdstukStand(i);
        if (stand.gehaald === LV.niveauPerHoofdstuk) hoofdstukkenUit++;
        if (stand.perfect) perfecteHoofdstukken++;
      });
    }
    const sudoku = window.SmakenlandSudokuView ? window.SmakenlandSudokuView.statistiek() : null;
    const sudokuMaten = sudoku && sudoku.gewonnenPerMaat
      ? Object.keys(sudoku.gewonnenPerMaat).filter(function (k) { return sudoku.gewonnenPerMaat[k] > 0; }).length
      : 0;
    return {
      levelsGehaald: levelsGehaald,
      sterren: sterren,
      seizoensLevels: seizoensLevels,
      hoofdstukkenUit: hoofdstukkenUit,
      perfecteHoofdstukken: perfecteHoofdstukken,
      versmeltingen: stats.versmeltingen || 0,
      oogsten: stats.oogsten || 0,
      levelZonderHulp: stats.levelZonderHulp || 0,
      muntenVerdiend: stats.muntenVerdiend || 0,
      klanten: vrij ? (vrij.ordersKlaar || 0) : 0,
      dagenOpRij: stats.dagenOpRij || 0,
      dagenGespeeld: stats.dagenGespeeld || 0,
      sudokuGewonnen: sudoku ? (sudoku.gewonnen || 0) : 0,
      sudokuFoutloos: sudoku ? (sudoku.gewonnenFoutloos || 0) : 0,
      sudokuGroot: sudoku && sudoku.gewonnenPerMaat ? (sudoku.gewonnenPerMaat['16'] || 0) : 0,
      sudokuMaten: sudokuMaten
    };
  }

  function renderPrestaties() {
    const rooster = $('prestaties-rooster');
    if (!rooster) return;
    const stand = spelerStand();
    const lijst = PRE.bereken(stand);
    const tel = PRE.tel(stand);
    $('prestaties-teller').textContent = tel.behaald + ' van ' + tel.totaal;
    $('prestaties-klein').textContent = tel.behaald === tel.totaal
      ? 'Alles gehaald! Petje af.'
      : 'Speel verder om de rest te halen';
    // De emulator-smoketest leest deze regel uit logcat: zo is op een echt toestel
    // te zien dat het scherm niet alleen opent, maar ook gevuld is.
    console.info('SmakenlandPrestaties behaald=' + tel.behaald + ' van=' + tel.totaal +
      ' kaartjes=' + document.querySelectorAll('.prestatie').length);
    rooster.innerHTML = lijst.map(function (p) {
      const percentage = Math.round(p.deel * 100);
      return '<div class="prestatie' + (p.behaald ? ' behaald' : '') + '">' +
        '<span class="prestatie-e">' + (p.behaald ? p.e : '🔒') + '</span>' +
        '<div class="prestatie-tekst"><b>' + p.naam + '</b>' +
          '<small>' + p.tekst + '</small>' +
          '<span class="prestatie-balk"><i style="width:' + percentage + '%"></i></span>' +
          '<span class="prestatie-teller">' + p.nu + ' / ' + p.doel + '</span>' +
        '</div></div>';
    }).join('');
  }

  /** Kijkt of er een prestatie bijgekomen is en viert dat met een klein venster. */
  function checkPrestaties() {
    const stand = spelerStand();
    const nieuw = PRE.nieuwe(stand, voortgang.prestaties || []);
    if (!nieuw.length) return;
    nieuw.forEach(function (p) { voortgang.prestaties.push(p.id); });
    bewaarVoortgang();
    if (tab === 'prestaties') renderPrestaties();
    toonPrestatie(nieuw[0], nieuw.length);
  }

  function toonPrestatie(p, aantal) {
    const oud = document.getElementById('prestatie-viering');
    if (oud) oud.remove();
    const doos = document.createElement('div');
    doos.className = 'prestatie-viering';
    doos.id = 'prestatie-viering';
    doos.innerHTML = '<span class="prestatie-e">' + p.e + '</span>' +
      '<div><small>Prestatie behaald</small><b>' + p.naam + '</b>' +
      '<small>' + p.tekst + (aantal > 1 ? ' (+' + (aantal - 1) + ' meer)' : '') + '</small></div>';
    document.body.appendChild(doos);
    setTimeout(function () { doos.classList.add('weg'); }, 3200);
    setTimeout(function () { doos.remove(); }, 3800);
  }

  // ------------------------------------------------------ voortgangscode

  function codeGegevens() {
    const sudoku = window.SmakenlandSudokuView ? window.SmakenlandSudokuView.statistiek() : null;
    return {
      sterren: voortgang.levelSterren,
      munten: vrij ? vrij.munten : 0,
      sudokuBeste: (sudoku && sudoku.beste) || {},
      sudokuGewonnen: (sudoku && sudoku.gewonnen) || 0,
      prestaties: voortgang.prestaties || [],
      thema: voortgang.thema || 'licht'
    };
  }

  function vulCode() {
    if (!$('code-uit')) return;
    $('code-uit').value = VC.maak(codeGegevens());
  }

  function meldCode(tekst, goed) {
    const vak = $('code-melding');
    vak.textContent = tekst;
    vak.className = 'code-melding' + (goed === undefined ? '' : (goed ? ' goed' : ' fout'));
  }

  function laadCode() {
    const uit = VC.lees($('code-in').value);
    if (!uit.ok) { meldCode(uit.fout, false); return; }
    const g = uit.gegevens;
    if (!window.confirm('Je huidige voortgang wordt vervangen door de code. Zeker weten?')) {
      meldCode('Niets veranderd.', false);
      return;
    }
    voortgang.levelSterren = g.sterren;
    voortgang.prestaties = g.prestaties;
    voortgang.thema = g.thema;
    if (!voortgang.stats) voortgang.stats = {};
    voortgang.stats.muntenVerdiend = voortgang.stats.muntenVerdiend || 0;
    bewaarVoortgang();
    if (vrij) { vrij.munten = g.munten; bewaarVrijNu(); }
    if (window.SmakenlandSudokuView && window.SmakenlandSudokuView.zetStatistiek) {
      window.SmakenlandSudokuView.zetStatistiek({
        beste: g.sudokuBeste, gewonnen: g.sudokuGewonnen,
        gewonnenPerMaat: {}, gewonnenFoutloos: 0
      });
    }
    zetThema(g.thema);
    renderAlles();
    vulCode();
    meldCode('Gelukt: ' + Object.keys(g.sterren).length + ' levels met sterren en ' + g.munten +
      ' munten overgenomen.', true);
  }

  function bindCode() {
    if (!$('code-kopieer')) return;
    $('code-laden').addEventListener('click', function () { vulCode(); meldCode('Nieuwe code gemaakt.', true); });
    $('code-kopieer').addEventListener('click', function () {
      const vak = $('code-uit');
      vak.select();
      let gelukt = false;
      try { gelukt = document.execCommand('copy'); } catch (e) { gelukt = false; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(vak.value).then(function () { meldCode('Code gekopieerd.', true); },
          function () { meldCode('Kopieer de code hierboven met de hand.', false); });
        return;
      }
      meldCode(gelukt ? 'Code gekopieerd.' : 'Kopieer de code hierboven met de hand.', gelukt);
    });
    $('code-terug').addEventListener('click', laadCode);
  }

  // ------------------------------------------------------------- thema

  function zetThema(thema) {
    const donker = thema === 'donker';
    document.documentElement.setAttribute('data-thema', donker ? 'donker' : 'licht');
    voortgang.thema = donker ? 'donker' : 'licht';
    if ($('knop-thema')) {
      $('knop-thema').textContent = donker ? '☀️' : '🌙';
      $('knop-thema').setAttribute('aria-pressed', donker ? 'true' : 'false');
      $('knop-thema').setAttribute('title', donker ? 'Terug naar de lichte weergave' : 'Donkere weergave');
    }
    try { localStorage.setItem(SLEUTEL_THEMA, voortgang.thema); } catch (e) { /* stil */ }
    if (window.SmakenlandSudokuView && window.SmakenlandSudokuView.pasMaat) {
      window.SmakenlandSudokuView.pasMaat();
    }
  }

  /** Bij de eerste keer kijken we naar de voorkeur van het toestel. */
  function eersteThema() {
    if (voortgang.thema) return voortgang.thema;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'donker';
    } catch (e) { /* stil */ }
    return 'licht';
  }

  /** Houdt bij hoeveel dagen op rij er gespeeld is (voor de prestatie daarvan). */
  function telDagen() {
    const vandaag = new Date().toISOString().slice(0, 10);
    if (!voortgang.stats) voortgang.stats = {};
    if (voortgang.stats.laatsteDag === vandaag) return;
    const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    voortgang.stats.dagenOpRij = voortgang.stats.laatsteDag === gisteren
      ? (voortgang.stats.dagenOpRij || 0) + 1
      : 1;
    voortgang.stats.laatsteDag = vandaag;
    voortgang.stats.dagenGespeeld = (voortgang.stats.dagenGespeeld || 0) + 1;
    bewaarVoortgang();
  }

  function renderAlles() {
    toonScherm();
    renderKop();
    if (scherm === 'kaart') { renderKaart(); renderHint(); return; }
    if (scherm === 'sudoku') return;
    if (scherm === 'prestaties') { renderPrestaties(); return; }
    if (scherm === 'level') { tekenLevelPanelen(); tekenDoelen(); }
    else { tekenReisPaneel(); tekenKlantenPaneel(); }
    renderBord();
    renderHint();
    renderStats();
  }

  // --------------------------------------------------------------- modal

  function toonVerhaal(ev) {
    $('verhaal-e').textContent = ev.e;
    $('verhaal-klein').textContent = 'Nieuw gebied · ' + C.AREAS[ev.gebied].naam;
    $('verhaal-titel').textContent = ev.naam;
    $('verhaal-tekst').textContent = ev.verhaal;
    $('verhaal-cadeau').textContent = 'Nieuwe kist: ' + C.GENERATORS[ev.generator].naam;
    $('modal-verhaal').hidden = false;
    vrij.gezien['gebied-' + ev.gebied] = true;
  }

  function bindModals() {
    $('verhaal-verder').addEventListener('click', function () {
      $('modal-verhaal').hidden = true;
      bewaarVrijNu();
    });
    $('knop-uitleg').addEventListener('click', function () {
      vulCode();
      meldCode('');
      const gehaald = Object.keys(voortgang.levelSterren).length;
      const sterren = Object.keys(voortgang.levelSterren)
        .reduce(function (n, k) { return n + voortgang.levelSterren[k]; }, 0);
      $('bewaard').textContent = 'Bewaard: ' + gehaald + ' levels gehaald (' + sterren + ' ⭐), ' +
        vrij.ordersKlaar + ' klanten geholpen, ' + vrij.munten + ' munten.';
      $('modal-uitleg').hidden = false;
    });
    $('uitleg-sluiten').addEventListener('click', function () { $('modal-uitleg').hidden = true; });
    $('opnieuw').addEventListener('click', function () {
      try {
        localStorage.removeItem(SLEUTEL_VRIJ);
        localStorage.removeItem(SLEUTEL_VOORTGANG);
      } catch (e) { /* stil */ }
      voortgang = legeVoortgang();
      vrij = E.createState();
      level = null;
      if (window.SmakenlandSudokuView) window.SmakenlandSudokuView.opnieuw();
      $('modal-uitleg').hidden = true;
      zetTab('levels');
    });
    $('knop-geluid').addEventListener('click', function () {
      const nuAan = !geluid.isAan();
      geluid.zet(nuAan);
      this.textContent = nuAan ? '🔊' : '🔇';
      this.setAttribute('aria-pressed', nuAan ? 'true' : 'false');
      if (nuAan) geluid.tik();
    });
    $('knop-geluid').textContent = geluid.isAan() ? '🔊' : '🔇';
    $('knop-geluid').setAttribute('aria-pressed', geluid.isAan() ? 'true' : 'false');

    $('knop-thema').addEventListener('click', function () {
      zetThema(voortgang.thema === 'donker' ? 'licht' : 'donker');
      bewaarVoortgang();
    });
    bindCode();

    $('tabs').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('.tab') : null;
      if (knop) zetTab(knop.dataset.tab);
    });
    $('hoofdstukken').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('.level-knop') : null;
      if (!knop || knop.classList.contains('op-slot')) return;
      startLevel(Number(knop.dataset.level));
    });
    document.addEventListener('click', function (e) {
      const lever = e.target.closest ? e.target.closest('[data-lever]') : null;
      if (lever && !lever.disabled) doeLever(lever.dataset.lever);
      const koop = e.target.closest ? e.target.closest('[data-koop]') : null;
      if (koop && !koop.disabled) doeKoop(koop.dataset.koop);
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        gekozen = -1;
        renderBord();
        $('modal-uitleg').hidden = true;
      }
    });
  }

  // ------------------------------------------------------------------ op

  /**
   * In de Android-app laat de uitleg de versie zien en kun je zelf op updates
   * controleren. In de browser bestaat de brug niet en blijft dit weg, zodat er
   * niets staat dat daar niets doet.
   */
  function toonAppVersie() {
    const brug = window.SmakenlandApp;
    if (!brug || typeof brug.controleerOpUpdates !== 'function') return;
    const bewaard = $('bewaard');
    if (!bewaard || !bewaard.parentNode) return;
    const rij = document.createElement('p');
    rij.className = 'update-rij';
    rij.appendChild(document.createTextNode('App-versie ' + brug.versie() + ' · '));
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.id = 'controleer-updates';
    knop.textContent = 'Controleren op updates';
    knop.addEventListener('click', function () { brug.controleerOpUpdates(); });
    rij.appendChild(knop);
    bewaard.parentNode.insertBefore(rij, bewaard);
  }

  function start() {
    bouwBord();
    bindBord();
    bindModals();
    bindLevelModal();
    toonAppVersie();
    voortgang = laadVoortgang();
    // Het thema staat in de voortgang, maar bij een eerste bezoek kijken we naar wat
    // het toestel zelf wil (donker of licht).
    try {
      const bewaardThema = localStorage.getItem(SLEUTEL_THEMA);
      if (bewaardThema) voortgang.thema = bewaardThema === 'donker' ? 'donker' : 'licht';
    } catch (e) { /* stil */ }
    zetThema(eersteThema());
    telDagen();
    const hadOpslag = laadVrij();
    E.tickEnergie(vrij);
    // Een diepe link (#sudoku, #level12) gaat meteen naar dat scherm; dan is de
    // uitleg er niet meer overheen.
    const viaHash = pasHashToe();
    if (!viaHash) zetTab('levels');
    window.addEventListener('hashchange', function () { pasHashToe(); });

    setInterval(function () {
      if (scherm === 'level' || scherm === 'sudoku') return;
      const hersteld = E.tickEnergie(vrij);
      if (scherm === 'vrij') { renderStats(); if (hersteld > 0) { renderHint(); bewaarVrij(); } }
    }, 1000);

    window.addEventListener('pagehide', function () { if (vrij) bewaarVrijNu(); });
    window.addEventListener('resize', pasMaat);
    // De maat van de tegels volgt de echte breedte van het bord. Een resize--event
    // alleen is niet genoeg: het bord kan ook van breedte veranderen doordat een
    // paneel verschijnt, en dan stonden de tegels niet meer vierkant.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(pasMaat).observe(bord);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { if (vrij) bewaarVrijNu(); }
      else { E.tickEnergie(vrij); renderAlles(); }
    });

    if (!hadOpslag && !viaHash) {
      // Eerste bezoek begint met de uitleg; Smakendorp staat al op de kaart.
      vrij.gezien['gebied-0'] = true;
      $('modal-uitleg').hidden = false;
    }

    if (DEBUG) {
      window.SmakenlandUI = {
        get vrij() { return vrij; },
        get level() { return level; },
        get voortgang() { return voortgang; },
        get tab() { return tab; },
        get scherm() { return scherm; },
        zetTab: zetTab,
        pasHashToe: pasHashToe,
        startLevel: startLevel,
        tik: tik,
        oogst: doeOogst,
        verplaats: doeVerplaats,
        incasseer: doeIncasseer,
        lever: doeLever,
        koop: doeKoop,
        render: renderAlles,
        bewaar: function () { bewaarVrijNu(); bewaarVoortgang(); },
        borden: borden,
        sterrenBeeld: sterrenBeeld,
        geluid: geluid,
        sudokuPaneel: function () { return window.SmakenlandSudokuView; },
        checkPrestaties: checkPrestaties,
        prestaties: function () { return PRE.bereken(spelerStand()); },
        voortgangscode: function () { return VC.maak(codeGegevens()); },
        thema: function (nieuw) { if (nieuw) { zetThema(nieuw); bewaarVoortgang(); } return voortgang.thema; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
