/* Smakenland - de pagina zelf: bord, slepen, klanten, winkel, verhaal. */
(function () {
  'use strict';

  const E = window.SmakenlandEngine;
  const C = window.SmakenlandContent;
  const DEBUG = /[?&](debug|test)=1/.test(window.location.search) ||
    window.SmakenlandDebug === true;
  const SLEUTEL = 'smakenland.save.v1';

  const $ = function (id) { return document.getElementById(id); };
  const bord = $('bord');
  const zwevend = $('zwevend');

  let state = null;
  let borden = [];       // de 56 cel-elementen
  let gekozen = -1;      // cel die via tikken is gekozen (slepen-alternatief)
  let sleept = null;     // { van, geest, verplaatst, startX, startY }
  let laatsteBewaard = 0;

  // ------------------------------------------------------------- geluid

  const geluid = (function () {
    let ctx = null;
    let aan = true;
    try { aan = localStorage.getItem(SLEUTEL + '.geluid') !== 'uit'; } catch (e) { aan = true; }

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
      isAan: function () { return aan; },
      zet: function (v) {
        aan = v;
        try { localStorage.setItem(SLEUTEL + '.geluid', v ? 'aan' : 'uit'); } catch (e) { /* stil */ }
        if (v) context();
      }
    };
  })();

  // --------------------------------------------------------- hulpjes DOM

  function emojiVan(cel) {
    if (cel.kind === 'gen') return C.GENERATORS[cel.gen].e;
    return C.CHAINS[cel.keten].tiers[cel.tier - 1].e;
  }

  function naamVan(cel) {
    if (cel.kind === 'gen') return C.GENERATORS[cel.gen].naam;
    return C.CHAINS[cel.keten].tiers[cel.tier - 1].n;
  }

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

  // -------------------------------------------------------------- staat

  function bewaar(nu) {
    const t = nu || Date.now();
    if (t - laatsteBewaard < 400) return;
    laatsteBewaard = t;
    try { localStorage.setItem(SLEUTEL, E.serialiseer(state)); } catch (e) { /* vol of privé */ }
  }

  function bewaarNu() {
    laatsteBewaard = 0;
    try { localStorage.setItem(SLEUTEL, E.serialiseer(state)); } catch (e) { /* stil */ }
  }

  function laadSpel() {
    let tekst = null;
    try { tekst = localStorage.getItem(SLEUTEL); } catch (e) { tekst = null; }
    const uitOpslag = tekst ? E.laad(tekst) : null;
    state = uitOpslag || E.createState();
    if (!uitOpslag) state.gezien = {};
    return !!uitOpslag;
  }

  // -------------------------------------------------------------- render

  function renderStats() {
    $('stat-munten').textContent = state.munten;
    $('stat-sterren').textContent = state.sterren;
    $('stat-energie').textContent = state.energie + '/' + state.energieMax;
    const deel = Math.round((state.energie / state.energieMax) * 100);
    const vulling = $('energie-vulling');
    vulling.style.width = deel + '%';
    vulling.classList.toggle('vol', state.energie >= state.energieMax);
    const sec = E.secondenTotEnergie(state);
    $('energie-timer').textContent = state.energie >= state.energieMax
      ? 'vol'
      : '+' + (sec >= 60 ? Math.floor(sec / 60) + 'm' : sec + 's');
    $('orders-klaar').textContent = state.ordersKlaar + ' geholpen';
  }

  function renderBord() {
    for (let i = 0; i < state.cells.length; i++) {
      const cel = state.cells[i];
      const el = borden[i];
      el.className = 'cel';
      el.style.background = '';
      el.style.borderColor = '';
      el.innerHTML = '';
      if (!cel) continue;

      if (cel.kind === 'gen') {
        el.classList.add('bezet', 'kist');
        const g = C.GENERATORS[cel.gen];
        const niveau = document.createElement('span');
        niveau.className = 'niveau';
        for (let n = 1; n <= E.MAX_GEN_LEVEL; n++) {
          const stip = document.createElement('i');
          if (n <= cel.level) stip.className = 'aan';
          niveau.appendChild(stip);
        }
        el.appendChild(niveau);
        el.insertAdjacentHTML('beforeend',
          '<span class="e">' + g.e + '</span>' +
          (cel.count > 1 ? '<span class="stapel">×' + cel.count + '</span>' : ''));
      } else {
        const keten = C.CHAINS[cel.keten];
        el.classList.add('bezet', 'item');
        if (cel.keten === 'munt') el.classList.add('munt');
        el.style.background = keten.kleur + '22';
        el.style.borderColor = keten.kleur + '55';
        el.insertAdjacentHTML('beforeend',
          '<span class="tree">' + cel.tier + '</span>' +
          '<span class="e">' + keten.tiers[cel.tier - 1].e + '</span>' +
          (cel.count > 1 ? '<span class="stapel">×' + cel.count + '</span>' : ''));
      }
      if (i === gekozen) el.classList.add('gekozen');
    }
    $('knop-kiezen').hidden = gekozen < 0;
  }

  function renderOrders() {
    const houder = $('orders');
    houder.innerHTML = '';
    state.orders.forEach(function (order) {
      const keten = C.CHAINS[order.keten];
      const tier = keten.tiers[order.tier - 1];
      const heb = E.kanLeveren(state, order.id);
      const kaart = document.createElement('div');
      kaart.className = 'order' + (heb >= order.aantal ? ' klaar' : '');
      kaart.dataset.order = order.id;
      kaart.innerHTML =
        '<div class="order-kop"><b>' + E.klantVoor(state, order) + '</b><small>' + keten.naam + '</small></div>' +
        '<div class="order-wens"><span class="e">' + tier.e + '</span>' +
          '<span class="tekst"><b>' + tier.n + '</b><small>tree ' + order.tier + ' · ' + order.aantal + '× nodig</small></span>' +
          '<span class="order-heb ' + (heb >= order.aantal ? 'ok' : 'mis') + '">' + heb + '/' + order.aantal + '</span></div>' +
        '<div class="order-voet"><span class="order-beloning">🪙 ' + order.munten + ' · ⭐ ' + order.sterren + '</span>' +
        '<button class="lever" type="button" data-lever="' + order.id + '"' +
        (heb >= order.aantal ? '' : ' disabled') + '>Leveren</button></div>';
      houder.appendChild(kaart);
    });
  }

  function renderWinkel() {
    const houder = $('winkel');
    houder.innerHTML = '';
    C.SHOP.forEach(function (artikel) {
      const div = document.createElement('div');
      div.className = 'artikel';
      const kan = state.munten >= artikel.prijs;
      div.innerHTML =
        '<span class="e">' + artikel.e + '</span>' +
        '<span class="tekst"><b>' + artikel.naam + '</b><small>' + artikel.tekst + '</small></span>' +
        '<button type="button" data-koop="' + artikel.id + '"' + (kan ? '' : ' disabled') + '>🪙 ' + artikel.prijs + '</button>';
      houder.appendChild(div);
    });
  }

  function renderReis() {
    const area = C.AREAS[state.gebied];
    $('gebied-e').textContent = area.e;
    $('gebied-naam').textContent = area.naam;
    $('gebied-nummer').textContent = state.gebied + 1;
    $('gebied-verhaal').textContent = area.verhaal;
    const kaart = $('gebied-kaart');
    kaart.style.background = 'linear-gradient(160deg, ' + area.kleuren[0] + ', ' + area.kleuren[1] + ')';

    const volgend = E.volgendGebied(state);
    if (volgend) {
      $('voortgang-tekst').textContent = 'nog ' + Math.max(0, volgend.sterren - state.sterren) + ' ⭐ tot ' + volgend.naam;
      $('voortgang-aantal').textContent = Math.min(state.sterren, volgend.sterren) + '/' + volgend.sterren;
      const van = area.sterren;
      const deel = Math.round(((state.sterren - van) / Math.max(1, volgend.sterren - van)) * 100);
      $('voortgang-vulling').style.width = Math.max(0, Math.min(100, deel)) + '%';
    } else {
      $('voortgang-tekst').textContent = 'Alle gebieden verkend — de Sterrenkeuken is van jou';
      $('voortgang-aantal').textContent = state.sterren + ' ⭐';
      $('voortgang-vulling').style.width = '100%';
    }

    const ketens = $('ketens');
    ketens.innerHTML = '';
    Object.keys(C.CHAINS).forEach(function (id) {
      const keten = C.CHAINS[id];
      const open = E.ontgrendeldeKetenen(state).indexOf(id) >= 0 || id === 'munt';
      const chip = document.createElement('span');
      chip.className = 'keten-chip' + (open ? '' : ' op-slot');
      chip.innerHTML = '<span>' + keten.tiers[1].e + '</span>' + (open ? keten.naam : '🔒 ' + keten.naam);
      ketens.appendChild(chip);
    });
  }

  function renderHint() {
    const klaar = state.orders.filter(function (o) { return E.kanLeveren(state, o.id) >= o.aantal; }).length;
    let tekst;
    if (state.energie <= 0) tekst = 'Energie is op — wacht even of koop een drankje';
    else if (klaar > 0) tekst = klaar === 1 ? 'Een klant staat klaar om te leveren' : klaar + ' klanten staan klaar';
    else if (state.merges === 0) tekst = 'Sleep twee gelijke items op elkaar, de derde versmelt';
    else tekst = 'Tik op een kist om te oogsten — sleep gelijke items op elkaar';
    $('bord-hint').textContent = tekst;
  }

  function renderAlles() {
    renderStats();
    renderBord();
    renderOrders();
    renderWinkel();
    renderReis();
    renderHint();
  }

  // ------------------------------------------------------------- effecten

  function verwerk(events, anker) {
    (events || []).forEach(function (ev) {
      const p = ev.cel !== undefined ? rectVan(ev.cel) : (anker || { x: 40, y: 90 });
      if (ev.type === 'merge') {
        const doel = state.cells[ev.cel];
        const naam = naamVan(doel);
        if (p) { zwevendeTekst(p.x, p.y, (ev.aantal > 1 ? ev.aantal + '× ' : '') + naam, ''); pufjes(p.x, p.y); }
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
        const doel = { x: window.innerWidth / 2, y: 120 };
        zwevendeTekst(doel.x, doel.y, '+' + ev.munten + ' 🪙  +' + ev.sterren + ' ⭐', 'munten');
        renderOrders();
      } else if (ev.type === 'gebied') {
        toonVerhaal(ev);
      } else if (ev.type === 'stapel') {
        geluid.tik();
      }
    });
  }

  // --------------------------------------------------------------- acties

  function doeOogst(celIdx) {
    const r = E.oogst(state, celIdx);
    if (!r.ok) {
      if (r.reden === 'energie') {
        geluid.weg();
        zwevendeTekst(window.innerWidth / 2, 110, 'Geen energie — wacht of koop een drankje');
      } else if (r.reden === 'vol') {
        geluid.weg();
        zwevendeTekst(window.innerWidth / 2, 110, 'Het bord is vol — versmelt eerst wat weg');
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
    const r = E.verplaats(state, van, naar);
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
    const r = E.incasseer(state, celIdx);
    if (r.ok) {
      verwerk(r.events, rectVan(celIdx));
      renderAlles();
      bewaar();
    }
    return r;
  }

  function doeLever(orderId) {
    const r = E.lever(state, orderId);
    if (r.ok) {
      verwerk(r.events, null);
      renderAlles();
      bewaarNu();
    }
    return r;
  }

  function doeKoop(id) {
    const r = E.koop(state, id);
    if (r.ok) {
      verwerk(r.events, null);
      if (id === 'energie') zwevendeTekst(window.innerWidth / 2, 110, '⚡ +25 energie');
      renderAlles();
      bewaarNu();
    } else {
      geluid.weg();
    }
    return r;
  }

  // --------------------------------------------------------------- tikken

  function tik(celIdx) {
    const cel = state.cells[celIdx];
    if (!cel) {
      if (gekozen >= 0) {
        const van = gekozen;
        gekozen = -1;
        doeVerplaats(van, celIdx);
      }
      return;
    }
    if (cel.kind === 'gen') {
      gekozen = -1;
      doeOogst(celIdx);
      return;
    }
    if (cel.keten === 'munt') {
      gekozen = -1;
      doeIncasseer(celIdx);
      return;
    }
    // Gewoon item: eerste tik kiest, tweede tik verplaatst of versmelt.
    if (gekozen === celIdx) {
      gekozen = -1;
      renderBord();
      return;
    }
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
    const bron = state.cells[van];
    for (let i = 0; i < state.cells.length; i++) {
      const doel = state.cells[i];
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

  function startSleep(van, x, y) {
    const bron = state.cells[van];
    const geest = document.createElement('div');
    geest.className = 'sleep-geest';
    geest.textContent = emojiVan(bron);
    geest.style.left = x + 'px';
    geest.style.top = y + 'px';
    document.body.appendChild(geest);
    sleept = { van: van, geest: geest, verplaatst: 0, startX: x, startY: y };
    borden[van].classList.add('sleep-bron');
    doelKlassen(van);
  }

  function celOnder(x, y) {
    const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    const cel = el && el.closest ? el.closest('.cel') : null;
    if (!cel) return -1;
    const i = borden.indexOf(cel);
    return i;
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
    if (naar >= 0 && naar !== van) {
      doeVerplaats(van, naar);
    } else {
      renderBord();
    }
  }

  function bindBord() {
    bord.addEventListener('pointerdown', function (e) {
      const cel = e.target.closest ? e.target.closest('.cel') : null;
      if (!cel) return;
      const i = borden.indexOf(cel);
      if (i < 0 || !state.cells[i]) return;
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
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        gekozen = -1;
        renderBord();
        if (!$('modal-uitleg').hidden) $('modal-uitleg').hidden = true;
      }
    });
  }

  // --------------------------------------------------------------- modal

  function toonVerhaal(ev) {
    $('verhaal-e').textContent = ev.e;
    $('verhaal-klein').textContent = 'Nieuw gebied · ' + C.AREAS[ev.gebied].naam;
    $('verhaal-titel').textContent = ev.naam;
    $('verhaal-tekst').textContent = ev.verhaal;
    $('verhaal-cadeau').textContent = 'Nieuwe kist: ' + C.GENERATORS[ev.generator].naam + ' ' + C.GENERATORS[ev.generator].e;
    $('modal-verhaal').hidden = false;
    state.gezien['gebied-' + ev.gebied] = true;
  }

  function bindModals() {
    $('verhaal-verder').addEventListener('click', function () {
      $('modal-verhaal').hidden = true;
      bewaarNu();
    });
    $('knop-uitleg').addEventListener('click', function () {
      const opgeslagen = (function () {
        try {
          const t = localStorage.getItem(SLEUTEL);
          const s = t ? E.laad(t) : null;
          if (!s) return 'nog niets bewaard';
          return 'Bewaard: ' + s.merges + ' versmeltingen, ' + s.ordersKlaar + ' klanten geholpen, ' + s.munten + ' munten.';
        } catch (e) { return 'nog niets bewaard'; }
      })();
      $('bewaard').textContent = opgeslagen;
      $('modal-uitleg').hidden = false;
    });
    $('uitleg-sluiten').addEventListener('click', function () { $('modal-uitleg').hidden = true; });
    $('opnieuw').addEventListener('click', function () {
      try { localStorage.removeItem(SLEUTEL); } catch (e) { /* stil */ }
      state = E.createState();
      gekozen = -1;
      $('modal-uitleg').hidden = true;
      renderAlles();
      bewaarNu();
    });
    $('knop-kiezen').addEventListener('click', function () { gekozen = -1; renderBord(); });
    $('knop-geluid').addEventListener('click', function () {
      const nuAan = !geluid.isAan();
      geluid.zet(nuAan);
      this.textContent = nuAan ? '🔊' : '🔇';
      this.setAttribute('aria-pressed', nuAan ? 'true' : 'false');
      if (nuAan) geluid.tik();
    });
    $('knop-geluid').textContent = geluid.isAan() ? '🔊' : '🔇';
    $('knop-geluid').setAttribute('aria-pressed', geluid.isAan() ? 'true' : 'false');

    $('orders').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('[data-lever]') : null;
      if (knop && !knop.disabled) doeLever(knop.dataset.lever);
    });
    $('winkel').addEventListener('click', function (e) {
      const knop = e.target.closest ? e.target.closest('[data-koop]') : null;
      if (knop && !knop.disabled) doeKoop(knop.dataset.koop);
    });
  }

  // ----------------------------------------------------------------- op

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

  // De emoji's schalen mee met de echte tegelgrootte, ook op een telefoon.
  function pasMaat() {
    const breedte = bord.clientWidth;
    if (!breedte) return;
    const stijl = window.getComputedStyle(bord);
    const gap = parseFloat(stijl.columnGap) || 4;
    const pad = parseFloat(stijl.paddingLeft) || 8;
    const tegel = (breedte - 2 * pad - (E.COLS - 1) * gap) / E.COLS;
    document.documentElement.style.setProperty('--tegel', tegel.toFixed(1) + 'px');
  }

  function start() {
    bouwBord();
    bindBord();
    bindModals();
    const hadOpslag = laadSpel();
    E.tickEnergie(state);
    renderAlles();

    setInterval(function () {
      const hersteld = E.tickEnergie(state);
      renderStats();
      if (hersteld > 0) {
        renderHint();
        bewaar();
      }
    }, 1000);

    window.addEventListener('pagehide', bewaarNu);
    window.addEventListener('resize', pasMaat);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') bewaarNu();
      else { E.tickEnergie(state); renderAlles(); }
    });

    // Eerste bezoek: uitleg. Anders: een verhaalkaart die nog niet gezien is.
    const nogTeZien = C.AREAS.findIndex(function (a, i) { return i <= state.gebied && !state.gezien['gebied-' + i]; });
    if (!hadOpslag) {
      // Het eerste bezoek begint met de uitleg; Smakendorp leest de speler links al.
      state.gezien['gebied-0'] = true;
      $('modal-uitleg').hidden = false;
    } else if (nogTeZien >= 0) {
      const i = nogTeZien;
      const area = C.AREAS[i];
      toonVerhaal({
        gebied: i, naam: area.naam, verhaal: area.verhaal, e: area.e,
        generator: area.generator
      });
    }

    if (DEBUG) {
      window.SmakenlandUI = {
        get state() { return state; },
        zet: function (s) { state = s; renderAlles(); },
        tik: tik,
        oogst: doeOogst,
        verplaats: doeVerplaats,
        incasseer: doeIncasseer,
        lever: doeLever,
        koop: doeKoop,
        render: renderAlles,
        bewaar: bewaarNu,
        wisSleep: wisDoelKlassen,
        borden: borden
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
