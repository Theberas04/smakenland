/* Smakenland - de prestaties (los van de pagina, zodat ze te toetsen zijn).
   Werkt in de browser (window.SmakenlandPrestaties) en in Node. */
(function (root) {
  'use strict';

  /**
   * Elke prestatie heeft een `stand`: welke teller uit de spelerstand erbij hoort,
   * en een `doel`. Zo is er één plek waar staat wat een prestatie betekent, en kan
   * de pagina niet iets anders beweren dan de test.
   */
  const LIJST = [
    { id: 'eerste-level', naam: 'Eerste stappen', e: '⭐', stand: 'levelsGehaald', doel: 1,
      tekst: 'Speel je eerste level uit.' },
    { id: 'tien-levels', naam: 'Op dreef', e: '🏃', stand: 'levelsGehaald', doel: 10,
      tekst: 'Tien levels uitgespeeld.' },
    { id: 'honderd-levels', naam: 'Smakenkenner', e: '🏅', stand: 'levelsGehaald', doel: 100,
      tekst: 'Honderd levels uitgespeeld.' },
    { id: 'eerste-versmelting', naam: 'Versmolten', e: '🧩', stand: 'versmeltingen', doel: 1,
      tekst: 'Laat twee items versmelten.' },
    { id: 'honderd-versmeltingen', naam: 'Doorgewinterd', e: '🔗', stand: 'versmeltingen', doel: 100,
      tekst: 'Honderd versmeltingen gemaakt.' },
    { id: 'duizend-versmeltingen', naam: 'Alchemist', e: '⛓️', stand: 'versmeltingen', doel: 1000,
      tekst: 'Duizend versmeltingen gemaakt.' },
    { id: 'eerste-hoofdstuk', naam: 'Buurtbewoner', e: '🏘️', stand: 'hoofdstukkenUit', doel: 1,
      tekst: 'Een heel hoofdstuk uitgespeeld.' },
    { id: 'vijf-hoofdstukken', naam: 'Reiziger', e: '🧭', stand: 'hoofdstukkenUit', doel: 5,
      tekst: 'Vijf hoofdstukken uitgespeeld.' },
    { id: 'perfect-hoofdstuk', naam: 'Perfecte buurt', e: '🏆', stand: 'perfecteHoofdstukken', doel: 1,
      tekst: 'Een hoofdstuk met alle levels op drie sterren.' },
    { id: 'honderd-sterren', naam: 'Sterrenplukker', e: '🌟', stand: 'sterren', doel: 100,
      tekst: 'Honderd sterren verdiend.' },
    { id: 'duizend-sterren', naam: 'Sterrenhemel', e: '✨', stand: 'sterren', doel: 1000,
      tekst: 'Duizend sterren verdiend.' },
    { id: 'zuinig', naam: 'Op eigen kracht', e: '⚡', stand: 'levelZonderHulp', doel: 1,
      tekst: 'Speel een level uit zonder energie bij te vragen.' },
    { id: 'seizoen-level', naam: 'Met de seizoenen mee', e: '🍂', stand: 'seizoensLevels', doel: 1,
      tekst: 'Speel een level uit een seizoenshoofdstuk.' },
    { id: 'sudoku-eerste', naam: 'Puzzelaar', e: '🔢', stand: 'sudokuGewonnen', doel: 1,
      tekst: 'Los je eerste sudoku op.' },
    { id: 'sudoku-foutloos', naam: 'Feilloos', e: '🎯', stand: 'sudokuFoutloos', doel: 1,
      tekst: 'Los een sudoku op zonder één fout.' },
    { id: 'sudoku-groot', naam: 'Groot werk', e: '🧱', stand: 'sudokuGroot', doel: 1,
      tekst: 'Los een sudoku van 16×16 op.' },
    { id: 'sudoku-alle-maten', naam: 'Alle maten', e: '🎲', stand: 'sudokuMaten', doel: 5,
      tekst: 'Los een sudoku op in alle vijf de maten.' },
    { id: 'klanten', naam: 'Vriendelijke winkelier', e: '🤝', stand: 'klanten', doel: 25,
      tekst: 'Help vijfentwintig klanten in Vrij spelen.' },
    { id: 'rijk', naam: 'Goed gevuld', e: '🪙', stand: 'muntenVerdiend', doel: 1000,
      tekst: 'Verdien duizend munten.' },
    { id: 'week-op-rij', naam: 'Vaste klant', e: '📅', stand: 'dagenOpRij', doel: 7,
      tekst: 'Zeven dagen op rij gespeeld.' }
  ];

  /** De stand van een speler, met alle tellers op nul als ze er niet zijn. */
  function vulAan(stand) {
    const uit = {};
    LIJST.forEach(function (p) { uit[p.stand] = 0; });
    Object.keys(stand || {}).forEach(function (k) {
      const v = stand[k];
      uit[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    });
    return uit;
  }

  /**
   * Alle prestaties met hun voortgang. `behaald` is waar zodra de teller het doel
   * haalt; `deel` is de voortgang tussen 0 en 1 (voor de balkjes).
   */
  function bereken(stand) {
    const s = vulAan(stand);
    return LIJST.map(function (p) {
      const nu = Math.min(s[p.stand], p.doel);
      return {
        id: p.id, naam: p.naam, e: p.e, tekst: p.tekst, stand: p.stand, doel: p.doel,
        nu: nu, ruw: s[p.stand], behaald: s[p.stand] >= p.doel,
        deel: p.doel > 0 ? Math.min(1, s[p.stand] / p.doel) : 1
      };
    });
  }

  /** Welke prestaties zijn er nu behaald die nog niet in `eerder` stonden? */
  function nieuwe(stand, eerder) {
    const gehad = {};
    (eerder || []).forEach(function (id) { gehad[id] = true; });
    return bereken(stand).filter(function (p) { return p.behaald && !gehad[p.id]; });
  }

  /** Hoeveel er behaald zijn, en hoeveel er zijn. */
  function tel(stand) {
    const alles = bereken(stand);
    return { behaald: alles.filter(function (p) { return p.behaald; }).length, totaal: alles.length };
  }

  const api = { LIJST: LIJST, bereken: bereken, nieuwe: nieuwe, tel: tel, vulAan: vulAan };

  root.SmakenlandPrestaties = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
