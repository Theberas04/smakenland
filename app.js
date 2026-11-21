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

  const $ = function (id) { return document.getElementById(id); };
  const bord = $('bord');
  const zwevend = $('zwevend');

  let vrij = null;         // stand van het vrije spel
  let level = null;        // stand van het level dat nu gespeeld wordt
  let voortgang = { levelSterren: {}, sudoku: {} };
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
    return '<span class="mini-kunst" style="width:' + (grootte || 26) + 'px">' +
      (rij ? rij[tier - 1] : '') + '</span>';
  }

  // ------------------------------------------------------------- opslag

  function bewaarVoortgang() {
    try { localStorage.setItem(SLEUTEL_VOORTGANG, JSON.stringify(voortgang)); } catch (e) { /* stil */ }
  }

  function laadVoortgang() {
    let ruw = null;
    try { ruw = localStorage.getItem(SLEUTEL_VOORTGANG); } catch (e) { ruw = null; }
    if (!ruw) return { levelSterren: {}, sudoku: {} };
    try {
      const p = JSON.parse(ruw);
      return { levelSterren: p.levelSterren || {}, sudoku: p.sudoku || {} };
    } catch (e) {
      return { levelSterren: {}, sudoku: {} };
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
        const doel = s && s.cells[ev.cel];
        if (doel && p) { zwevendeTekst(p.x, p.y, (ev.aantal > 1 ? ev.aantal + '× ' : '') + naamVan(doel)); pufjes(p.x, p.y); }
        geluid.versmelt();
        if (borden[ev.cel]) {
          borden[ev.cel].classList.add('net-versmelt');
          setTimeout(function () { if (borden[ev.cel]) borden[ev.cel].classList.remove('net-versmelt'); }, 500);
        }
      } else if (ev.type === 'oogst') {
        geluid.tik();
        if (borden[ev.cel]) {
          borden[ev.cel].classList.add('net-geoogst');
          setTimeout(function () { if (borden[ev.cel]) borden[ev.cel].classList.remove('net-geoogst'); }, 350);
        }
      } else if (ev.type === 'munten') {
        if (ev.bedrag > 0) {
          geluid.munt();
          if (p) zwevendeTekst(p.x, p.y, '+' + ev.bedrag + ' 🪙', 'munten');
        }
      } else if (ev.type === 'levering') {
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
    if (naam !== 'levels' && naam !== 'sudoku' && naam !== 'vrij') naam = 'levels';
    tab = naam;
    Array.from(document.querySelectorAll('.tab')).forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.tab === naam ? 'true' : 'false');
    });
    if (naam === 'sudoku') scherm = 'sudoku';
    else if (naam === 'levels') scherm = opties.level ? 'level' : 'kaart';
    else scherm = 'vrij';
    if (scherm === 'level' && !level) scherm = 'kaart';
    renderAlles();
    if (naam === 'sudoku' && window.SmakenlandSudokuView) window.SmakenlandSudokuView.toon();
    zetHash(scherm === 'level' ? ('level' + level.level) : (scherm === 'kaart' ? 'levels' : scherm));
    meldScherm();
  }

  /** Wat de adresbalk vraagt, bijvoorbeeld #sudoku of #level12. */
  function pasHashToe() {
    const ruw = (window.location.hash || '').replace(/^#/, '');
    if (!ruw) return false;
    if (ruw === 'sudoku') { zetTab('sudoku'); return true; }
    if (ruw === 'vrij') { zetTab('vrij'); return true; }
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
    const breed = scherm === 'kaart' || scherm === 'sudoku';
    document.querySelector('main').dataset.scherm = breed ? 'breed' : 'kolommen';
    $('scherm-kaart').hidden = scherm !== 'kaart';
    $('scherm-sudoku').hidden = scherm !== 'sudoku';
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
    if (tab === 'sudoku') {
      const view = window.SmakenlandSudokuView;
      houder.innerHTML = view ? view.kop() : '';
      $('merk-klein').textContent = 'sudoku';
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

  function pasMaat() {
    const breedte = bord.clientWidth;
    if (!breedte) return;
    const stijl = window.getComputedStyle(bord);
    const gap = parseFloat(stijl.columnGap) || 4;
    const pad = parseFloat(stijl.paddingLeft) || 8;
    const tegel = (breedte - 2 * pad - (E.COLS - 1) * gap) / E.COLS;
    document.documentElement.style.setProperty('--tegel', tegel.toFixed(1) + 'px');
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
    $('kaart-sterren').textContent = sterren + ' / ' + (LV.levels.length * 3) + ' ⭐';
    $('kaart-gehaald').textContent = gehaald + ' van ' + LV.levels.length + ' gehaald';

    LV.hoofdstukken.forEach(function (hfst, h) {
      const blok = document.createElement('section');
      blok.className = 'hoofdstuk';
      const van = h * LV.niveauPerHoofdstuk + 1;
      const tot = van + LV.niveauPerHoofdstuk - 1;
      let hfstSterren = 0;
      let hfstGehaald = 0;
      for (let nr = van; nr <= tot; nr++) {
        if (voortgang.levelSterren[nr]) hfstGehaald++;
        hfstSterren += voortgang.levelSterren[nr] || 0;
      }
      blok.innerHTML =
        '<div class="hoofdstuk-kop">' +
          '<span class="hoofdstuk-e">' + hfst.e + '</span>' +
          '<div class="hoofdstuk-tekst"><b>' + hfst.naam + '</b><small>level ' + van + '–' + tot + ' · ' +
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
        '<button type="button" id="level-hulp">⚡ +10 energie</button>' +
        '<button type="button" id="level-opnieuw-2">🔄 Opnieuw</button>' +
        '<button type="button" id="level-kaart">🗺️ Kaart</button>' +
      '</div>';

    $('level-hulp').addEventListener('click', function () {
      const r = E.hulp(level);
      if (r.ok) {
        geluid.munt();
        zwevendeTekst(window.innerWidth / 2, 110, '⚡ +10 energie');
        renderAlles();
      } else {
        geluid.weg();
        zwevendeTekst(window.innerWidth / 2, 110, 'Dat kan maar één keer per level');
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
    const volgende = ev.level + 1;
    const bestaat = !!E.levelVan(volgende);
    $('level-e').textContent = ev.sterren === 3 ? '🏆' : '⭐';
    $('level-klein').textContent = 'Level ' + ev.level + ' gehaald';
    $('level-titel').textContent = ev.sterren === 3 ? 'Perfect gespeeld!' : 'Goed gedaan!';
    $('level-sterren').innerHTML = sterrenBeeld(ev.sterren);
    $('level-tekst').textContent = 'Je hield ' + ev.energie + ' energie over.' +
      (ev.sterren < 3 ? ' Met meer energie over verdien je drie sterren.' : ' Mooi zuinig gespeeld.');
    $('level-volgende').hidden = !bestaat;
    $('modal-level').hidden = false;
  }

  function bindLevelModal() {
    $('level-volgende').addEventListener('click', function () {
      $('modal-level').hidden = true;
      if (!startLevel(level.level + 1)) zetTab('levels');
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

  function renderAlles() {
    toonScherm();
    renderKop();
    if (scherm === 'kaart') { renderKaart(); renderHint(); return; }
    if (scherm === 'sudoku') return;
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
      voortgang = { levelSterren: {}, sudoku: {} };
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

  function start() {
    bouwBord();
    bindBord();
    bindModals();
    bindLevelModal();
    voortgang = laadVoortgang();
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
        sudokuPaneel: function () { return window.SmakenlandSudokuView; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
