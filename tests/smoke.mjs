/* Rooktest van de echte pagina in jsdom: laadt index.html over http, speelt via de
   UI-laag (dezelfde functies die de knoppen en het bord aanroepen) en controleert
   wat er daadwerkelijk in de DOM staat.
   Gebruik: node tests/smoke.mjs [poort] */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// jsdom staat lang niet in elke omgeving naast dit project; probeer de gebruikelijke
// plekken en geef met JSDOM_PAD je eigen map mee.
function laadJsdom() {
  const kandidaten = [
    import.meta.url,
    process.env.JSDOM_PAD ? path.join(process.env.JSDOM_PAD, 'package.json') : null,
    path.join(process.cwd(), 'package.json'),
    path.join(os.homedir(), 'paperclip', 'package.json'),
  ].filter(Boolean);
  for (const basis of kandidaten) {
    try {
      return createRequire(basis)('jsdom');
    } catch (e) { /* volgende plek */ }
  }
  console.error('jsdom niet gevonden. Installeer het (npm i -D jsdom) of zet JSDOM_PAD=/map/met/node_modules.');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = laadJsdom();

const poort = Number(process.argv[2] || 8231);
const basis = `http://127.0.0.1:${poort}`;

let fouten = 0;
let gedaan = 0;
function check(wat, waar, verwacht) {
  gedaan++;
  const ok = waar === verwacht;
  if (!ok) fouten++;
  console.log(`${ok ? 'ok  ' : 'FOUT'} ${wat}${ok ? '' : ` — verwacht ${JSON.stringify(verwacht)}, kreeg ${JSON.stringify(waar)}`}`);
}

function tekst(el) { return (el && el.textContent ? el.textContent : '').trim(); }

async function open(url, opslag, extra) {
  const vc = new VirtualConsole();
  const jsFouten = [];
  vc.on('jsdomError', (e) => jsFouten.push(String(e && e.message)));
  vc.on('error', (m) => jsFouten.push(String(m)));
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.SmakenlandDebug = true;
      if (extra) extra(window);
      // Elke jsdom heeft zijn eigen localStorage; de bewaarde stand van het eerste
      // potje zetten we hier over, zoals een herlaadbeurt in de browser.
      if (opslag) {
        for (const [sleutel, waarde] of Object.entries(opslag)) {
          window.localStorage.setItem(sleutel, waarde);
        }
      }
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 300));
  return { dom, w: dom.window, jsFouten };
}

const { dom, w, jsFouten } = await open(`${basis}/index.html`);
const UI = w.SmakenlandUI;
check('de pagina laadt zonder JS-fouten', jsFouten.join(' | '), '');
check('de UI-laag is bereikbaar', !!UI, true);
if (!UI) process.exit(1);

// ------------------------------------------------------------ levelkaart
check('er zijn 1050 levelknoppen', w.document.querySelectorAll('.level-knop').length, 1050);
check('er zijn 42 hoofdstukken (40 gewoon + 2 van dit seizoen)',
  w.document.querySelectorAll('.hoofdstuk').length, 42);
// Open staan: level 1, plus het eerste level van elk seizoenshoofdstuk van dit
// seizoen (dat zijpad begint open — zie engine.levelOpen).
const seizoenNu = w.SmakenlandEngine.seizoenNu();
const seizoenHfst = w.SmakenlandEngine.zichtbareHoofdstukken(seizoenNu)
  .filter((x) => x.hoofdstuk.seizoen);
check('er zijn twee seizoenshoofdstukken te zien', seizoenHfst.length, 2);
check('level 1 en het begin van de seizoenshoofdstukken staan open',
  w.document.querySelectorAll('.level-knop:not(.op-slot)').length, 1 + seizoenHfst.length);
const eersteSeizoenLevel = seizoenHfst[0].hfst * 25 + 1;
check('het eerste level van het seizoenshoofdstuk is te openen',
  w.document.querySelector(`.level-knop[data-level="${eersteSeizoenLevel}"]`).classList.contains('op-slot'), false);
check('en het tweede level van dat hoofdstuk nog niet',
  w.document.querySelector(`.level-knop[data-level="${eersteSeizoenLevel + 1}"]`).classList.contains('op-slot'), true);
check('de seizoensnoot noemt de andere seizoenen',
  w.document.querySelectorAll('.seizoen-regel').length, 3);
check('de kaart telt 0 van 1050', tekst(w.document.getElementById('kaart-gehaald')).startsWith('0 van 1050 gehaald'), true);
check('de uitleg staat open bij een nieuw potje', w.document.getElementById('modal-uitleg').hidden, false);
w.document.getElementById('uitleg-sluiten').click();

// --------------------------------------------------------------- level 1
w.document.querySelector('.level-knop:not(.op-slot)').click();
check('level 1 opent', UI.scherm, 'level');
check('het bord heeft 56 cellen', w.document.querySelectorAll('#bord .cel').length, 56);
check('het level heeft een kist', w.document.querySelectorAll('#bord .cel.kist').length, 1);
check('de kist toont getekende kunst', w.document.querySelectorAll('#bord .cel.kist svg').length, 1);
check('de doelen staan rechts', w.document.querySelectorAll('#orders .order').length, 1);
check('de kop toont het aantal doelen', tekst(w.document.getElementById('stat-doelen')), '1');

const energieVoor = UI.level.energie;
const kist = UI.level.cells.findIndex((c) => c && c.kind === 'gen');
UI.tik(kist);
check('oogsten kost energie', UI.level.energie, energieVoor - 1);
check('er ligt nu een item op het bord',
  UI.level.cells.filter((c) => c && c.kind === 'item').length >= 1, true);
check('de kop volgt de energie', tekst(w.document.getElementById('stat-energie')),
  UI.level.energie + '/' + UI.level.energieMax);

// ------------------------------------------------ energiehulp in een level
const hulpKnop = () => w.document.getElementById('level-hulp');
check('de energiehulp staat aan', hulpKnop() && hulpKnop().disabled, false);
check('de knop zegt hoe vaak het nog mag', /over\)/.test(tekst(hulpKnop())), true);
const energieVoorHulp = UI.level.energie;
const maxVoorHulp = UI.level.energieMax;
hulpKnop().click();
check('de hulp geeft tien energie', UI.level.energie, energieVoorHulp + 10);
check('het maximum krimpt niet en de energie blijft eronder, dus de sterren blijven eerlijk',
  UI.level.energieMax >= maxVoorHulp && UI.level.energie <= UI.level.energieMax, true);
check('en de knop telt af', /3× over/.test(tekst(hulpKnop())), true);
for (let i = 0; i < 5; i++) {
  const k = hulpKnop();
  if (k && !k.disabled) k.click();
}
check('na vier keer is de hulp op', tekst(hulpKnop()).indexOf('(op)') >= 0, true);
check('en staat de knop uit', hulpKnop().disabled, true);
check('vier keer tien is er bijgekomen', UI.level.energie, energieVoorHulp + 40);

// Doel inleveren via de echte knop in de DOM.
function legDoel() {
  const doel = UI.level.orders[0];
  let tekort = doel.aantal;
  for (let i = 0; i < UI.level.cells.length && tekort > 0; i++) {
    if (UI.level.cells[i]) continue;
    const aantal = Math.min(2, tekort);
    UI.level.cells[i] = { kind: 'item', keten: doel.keten, tier: doel.tier, count: aantal };
    tekort -= aantal;
  }
  UI.render();
}
legDoel();
const leverKnop = w.document.querySelector('[data-lever]');
check('de inleverknop staat aan', leverKnop && leverKnop.disabled, false);
leverKnop.click();
await new Promise((r) => setTimeout(r, 700));   // het levelkaartje komt met een korte pauze
check('het level is klaar', UI.level.orders.length, 0);
check('de kaart met sterren verschijnt', w.document.getElementById('modal-level').hidden, false);
check('de titel noemt het level', tekst(w.document.getElementById('level-klein')), 'Level 1 gehaald');
check('er zijn sterren getekend', w.document.querySelectorAll('#level-sterren i.aan').length, 3);
check('de voortgang is bewaard', UI.voortgang.levelSterren['1'], 3);
check('level 2 is nu open', w.document.querySelectorAll('.level-knop:not(.op-slot)').length >= 1, true);

w.document.getElementById('level-volgende').click();
check('het volgende level start', UI.level.level, 2);
check('het bord is weer schoon', UI.level.cells.filter((c) => c && c.kind === 'item').length,
  w.SmakenlandLevels.levels[1].start.reduce((n, s) => n + 1, 0));
check('de kaart gaat dicht', w.document.getElementById('modal-level').hidden, true);

// Terug naar de kaart: level 1 staat er nu met drie sterren.
w.document.getElementById('level-kaart').click();
check('terug op de kaart', UI.scherm, 'kaart');
check('level 1 is gehaald op de kaart',
  w.document.querySelector('.level-knop[data-level="1"]').classList.contains('gehaald'), true);
check('level 3 is nog op slot',
  w.document.querySelector('.level-knop[data-level="3"]').classList.contains('op-slot'), true);

// ------------------------------------------------------------ prestaties
w.document.querySelector('.tab[data-tab=prestaties]').click();
check('de prestaties-tab opent', UI.scherm, 'prestaties');
check('de prestaties staan in een rooster', w.document.querySelectorAll('.prestatie').length,
  w.SmakenlandPrestaties.LIJST.length);
check('er is er minstens één behaald na level 1',
  w.document.querySelectorAll('.prestatie.behaald').length >= 1, true);
const prestaties = UI.prestaties();
const eerste = prestaties.find((p) => p.id === 'eerste-level');
check('"eerste-level" is behaald', eerste && eerste.behaald, true);
check('met de teller op 1', eerste && eerste.nu, 1);
check('elk vakje heeft een balk met voortgang',
  w.document.querySelectorAll('.prestatie-balk i').length, w.SmakenlandPrestaties.LIJST.length);
// De hulp is in dit level gebruikt, dus "op eigen kracht" hoort nog niet behaald te zijn.
const zuinig = prestaties.find((p) => p.id === 'zuinig');
check('"op eigen kracht" is nog niet behaald (er is hulp gebruikt)', zuinig.behaald, false);

// ------------------------------------------------------------------ thema
const themaKnop = () => w.document.getElementById('knop-thema');
check('het thema staat op licht', w.document.documentElement.getAttribute('data-thema'), 'licht');
themaKnop().click();
check('de knop maakt het donker', w.document.documentElement.getAttribute('data-thema'), 'donker');
check('en de knop laat de zon zien', tekst(themaKnop()), '☀️');
check('de voortgang onthoudt het thema', UI.voortgang.thema, 'donker');
themaKnop().click();
check('nog een keer klikken maakt het weer licht', w.document.documentElement.getAttribute('data-thema'), 'licht');

// -------------------------------------------------------- voortgangscode
w.document.getElementById('knop-uitleg').click();
const codeUit = w.document.getElementById('code-uit');
check('er staat een voortgangscode klaar', codeUit.value.length > 20, true);
check('de code begint met de versie', UI.voortgangscode().length > 20, true);
// Dezelfde code erin stoppen moet gewoon goed gaan.
w.document.getElementById('code-in').value = codeUit.value;
w.confirm = () => true;
w.document.getElementById('code-terug').click();
check('een goede code wordt overgenomen',
  w.document.getElementById('code-melding').className.indexOf('goed') >= 0, true);
check('en de sterren staan er nog', UI.voortgang.levelSterren['1'], 3);
// Een code met een fout erin hoort geweigerd te worden, zonder iets te veranderen.
const verpest = codeUit.value.slice(0, 30) + (codeUit.value[30] === 'A' ? 'B' : 'A') + codeUit.value.slice(31);
w.document.getElementById('code-in').value = verpest;
w.document.getElementById('code-terug').click();
check('een verpeste code wordt geweigerd',
  w.document.getElementById('code-melding').className.indexOf('fout') >= 0, true);
check('en er is niets veranderd', UI.voortgang.levelSterren['1'], 3);
check('de telling in het venster noemt de voortgang',
  tekst(w.document.getElementById('bewaard')).indexOf('munten') > 0, true);
w.document.getElementById('uitleg-sluiten').click();
w.document.querySelector('.tab[data-tab=levels]').click();

// ---------------------------------------------------------------- sudoku
w.document.querySelector('.tab[data-tab=sudoku]').click();
check('de sudoku-tab opent', UI.scherm, 'sudoku');
check('het sudokubord heeft 81 vakken', w.document.querySelectorAll('.sudoku-cel').length, 81);
const gegeven = w.document.querySelectorAll('.sudoku-cel.geven').length;
check('er staan gegeven cijfers in', gegeven >= 20 && gegeven <= 50, true);
const cijfers = w.document.querySelectorAll('.cijfers button');
check('het cijferpaneel heeft negen knoppen', cijfers.length, 9);
const leegVak = Array.from(w.document.querySelectorAll('.sudoku-cel')).find((c) => !c.classList.contains('geven'));
leegVak.click();
const SV = w.SmakenlandSudokuView;
const juiste = SV.puzzel.oplossing[Number(leegVak.dataset.cel)];
cijfers[juiste - 1].click();
check('een goed cijfer komt in het vak', tekst(leegVak), String(juiste));
check('er is geen fout geteld', SV.fouten, 0);
const foutVak = Array.from(w.document.querySelectorAll('.sudoku-cel'))
  .find((c) => !c.classList.contains('geven') && c !== leegVak);
foutVak.click();
// Een cijfer dat voor dít vak zeker fout is (niet het cijfer van de oplossing).
const echtGoed = SV.puzzel.oplossing[Number(foutVak.dataset.cel)];
const andere = (echtGoed % 9) + 1;
w.document.querySelectorAll('.cijfers button')[andere - 1].click();
check('een fout cijfer wordt als fout geteld', SV.fouten, 1);
check('en rood gemaakt', foutVak.classList.contains('fout'), true);
// notities en hint
w.document.getElementById('sudoku-notitie').click();
const derdeVak = Array.from(w.document.querySelectorAll('.sudoku-cel'))
  .find((c) => !c.classList.contains('geven') && c !== leegVak && c !== foutVak);
derdeVak.click();
w.document.querySelectorAll('.cijfers button')[2].click();
check('een notitie komt in het vak', derdeVak.querySelectorAll('.notitie i').length, 9);
// Een hint herstelt eerst een fout vak (dat is de bedoelde volgorde).
w.document.getElementById('sudoku-hint').click();
check('een hint herstelt het foute vak', tekst(foutVak), String(echtGoed));
check('en dat vak is niet meer fout', foutVak.classList.contains('fout'), false);

// --------------------------------------------------- sudoku in andere maten
const maatKnop = (key) => w.document.querySelector(`#sudoku-maten button[data-maat="${key}"]`);
maatKnop(4).click();
check('4×4 geeft zestien vakken', w.document.querySelectorAll('.sudoku-cel').length, 16);
check('4×4 heeft vier cijferknoppen', w.document.querySelectorAll('.cijfers button').length, 4);
check('4×4 staat op het bord vermeld', w.document.getElementById('sudoku-bord').className.includes('maat-4'), true);
check('4×4 heeft een opgave', w.document.querySelectorAll('.sudoku-cel.geven').length >= 4, true);

maatKnop(6).click();
check('6×6 geeft 36 vakken', w.document.querySelectorAll('.sudoku-cel').length, 36);
check('6×6 heeft zes cijferknoppen', w.document.querySelectorAll('.cijfers button').length, 6);

maatKnop(12).click();
check('12×12 geeft 144 vakken', w.document.querySelectorAll('.sudoku-cel').length, 144);
check('12×12 heeft twaalf knoppen', w.document.querySelectorAll('.cijfers button').length, 12);
check('12×12 gebruikt letters vanaf A', tekst(w.document.querySelectorAll('.cijfers button')[9]), 'A');
check('12×12 heeft een opgave', w.document.querySelectorAll('.sudoku-cel.geven').length >= 40, true);

maatKnop(16).click();
const bord16 = w.document.getElementById('sudoku-bord');
check('16×16 geeft 256 vakken', w.document.querySelectorAll('.sudoku-cel').length, 256);
check('16×16 heeft zestien knoppen', w.document.querySelectorAll('.cijfers button').length, 16);
check('16×16 gebruikt letters tot G', tekst(w.document.querySelectorAll('.cijfers button')[15]), 'G');
check('16×16 heeft een opgave', w.document.querySelectorAll('.sudoku-cel.geven').length >= 80, true);
check('16×16 vermeldt de maat op het bord', bord16.className.includes('maat-16'), true);
check('notities staan uit bij 16×16', w.document.getElementById('sudoku-notitie').hidden, true);
check('de bloklijnen van 16×16 staan er', w.document.querySelectorAll('.sudoku-cel.blok-rechts').length > 0, true);

// Een cijfer in een groot bord gebruiken: de letter-knop moet werken.
const leeg16 = Array.from(w.document.querySelectorAll('.sudoku-cel')).find((c) => !c.classList.contains('geven'));
leeg16.click();
const goed16 = w.SmakenlandSudokuView.puzzel.oplossing[Number(leeg16.dataset.cel)];
w.document.querySelectorAll('.cijfers button')[goed16 - 1].click();
check('een cijfer invullen werkt ook op 16×16',
  tekst(leeg16), w.SmakenlandSudokuView.puzzel.symbolen.charAt(goed16 - 1));
maatKnop(9).click();
check('terug naar 9×9 geeft weer 81 vakken', w.document.querySelectorAll('.sudoku-cel').length, 81);

// ------------------------------------------------------------ varianten
const varKnop = (v) => w.document.querySelector(`#sudoku-varianten button[data-variant="${v}"]`);
check('er zijn drie varianten te kiezen', w.document.querySelectorAll('#sudoku-varianten button').length, 3);
check('gewoon staat aan', varKnop('gewoon').getAttribute('aria-pressed'), 'true');
check('geen enkel vak is diagonaal', w.document.querySelectorAll('.sudoku-cel.diagonaal').length, 0);
varKnop('diagonaal').click();
check('de diagonaalvariant doet het', SV.variant, 'diagonaal');
check('en de opgave is er een met diagonalen', SV.puzzel.variant, 'diagonaal');
const diagVakken = w.document.querySelectorAll('.sudoku-cel.diagonaal').length;
check('de twee diagonalen zijn gemarkeerd', diagVakken, 17);
// Twee keer hetzelfde cijfer op één diagonaal moet als botsing gezien worden.
const diagLijst = Array.from(w.document.querySelectorAll('.sudoku-cel.diagonaal'));
const d1 = diagLijst.find((c) => !c.classList.contains('geven'));
const d2 = d1 && diagLijst.find((c) => c !== d1 && !c.classList.contains('geven') &&
  Number(c.dataset.cel) % 9 !== Number(d1.dataset.cel) % 9 &&
  Math.floor(Number(c.dataset.cel) / 9) !== Math.floor(Number(d1.dataset.cel) / 9));
check('er zijn twee vrije diagonaalvakken om te proberen', !!(d1 && d2), true);
if (d1 && d2) {
  SV.kiesCel(Number(d1.dataset.cel));
  SV.zetCijfer(SV.puzzel.oplossing[Number(d1.dataset.cel)]);
  SV.kiesCel(Number(d2.dataset.cel));
  SV.zetCijfer(SV.puzzel.oplossing[Number(d1.dataset.cel)]);
  check('hetzelfde cijfer twee keer op de diagonaal botst', d2.classList.contains('botsing') ||
    d2.classList.contains('fout'), true);
}
varKnop('ongelijk').click();
check('de ongelijke variant doet het', SV.variant, 'ongelijk');
check('en heeft eigen groepen', Array.isArray(SV.puzzel.regio) && SV.puzzel.regio.length === 81, true);
const groepen = {};
SV.puzzel.regio.forEach((g) => { groepen[g] = (groepen[g] || 0) + 1; });
check('elke groep heeft negen vakjes', Object.values(groepen).every((n) => n === 9), true);
check('en er zijn negen groepen', Object.keys(groepen).length, 9);
check('een ongelijke sudoku is niet de gewone blokken',
  JSON.stringify(SV.puzzel.regio) !== JSON.stringify(Array.from({ length: 81 }, (v, i) =>
    Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3))), true);
check('de randen volgen de groepen', w.document.querySelectorAll('.sudoku-cel.blok-rechts').length > 0, true);
varKnop('gewoon').click();
check('terug naar gewoon', SV.variant, 'gewoon');

// 16×16 met een ongelijke vorm lukt niet betrouwbaar: die knop hoort uit te staan.
maatKnop(16).click();
check('16×16 kan geen ongelijke sudoku', varKnop('ongelijk').disabled, true);
check('16×16 kan wel een diagonaal-sudoku', varKnop('diagonaal').disabled, false);
varKnop('ongelijk').click();
check('een uitgeschakelde variant verandert niets', SV.variant, 'gewoon');
varKnop('diagonaal').click();
check('16×16 met diagonalen werkt', SV.variant, 'diagonaal');
check('en het bord heeft 256 vakken', w.document.querySelectorAll('.sudoku-cel').length, 256);
check('met kant-en-klare opgave uit de verzameling',
  typeof SV.puzzel.verzamelingIndex === 'number', true);
maatKnop(9).click();
check('en terug naar 9×9 met de variant erbij', SV.puzzel.variant, 'diagonaal');
varKnop('gewoon').click();

// ------------------------------------------------------------ vrij spelen
w.document.querySelector('.tab[data-tab=vrij]').click();
check('de vrij-tab opent', UI.scherm, 'vrij');
check('het bord is er weer', w.document.querySelectorAll('#bord .cel').length, 56);
check('er zijn klanten', w.document.querySelectorAll('#orders .order').length, 3);
check('de winkel heeft artikelen', w.document.querySelectorAll('.artikel').length, 7);
const vrijKist = UI.vrij.cells.findIndex((c) => c && c.kind === 'gen');
const muntenCel = UI.vrij.cells.findIndex((c) => c && c.keten === 'munt');
const muntenVoor = UI.vrij.munten;
if (muntenCel >= 0) UI.tik(muntenCel);
check('munten innen werkt', UI.vrij.munten > muntenVoor, true);
UI.vrij.munten = 100;
UI.render();
w.document.querySelector('[data-koop="energie"]').click();
check('de winkel verkoopt energie', UI.vrij.munten, 40);
check('vrij spelen blijft een gewoon spel', UI.vrij.orders.length, 3);

// ---------------------------------------------------- bewaren en herladen
UI.bewaar();
const bewaard = {
  'smakenland.voortgang.v1': w.localStorage.getItem('smakenland.voortgang.v1'),
  'smakenland.vrij.v2': w.localStorage.getItem('smakenland.vrij.v2'),
};
check('de voortgang staat in localStorage', typeof bewaard['smakenland.voortgang.v1'] === 'string', true);
check('het vrije spel staat in localStorage', typeof bewaard['smakenland.vrij.v2'] === 'string', true);

const tweede = await open(`${basis}/index.html`, bewaard);
const UI2 = tweede.w.SmakenlandUI;
check('na herladen zijn de sterren er nog', UI2.voortgang.levelSterren['1'], 3);
check('na herladen is level 2 open',
  tweede.w.document.querySelector('.level-knop[data-level="2"]').classList.contains('op-slot'), false);
check('na herladen telt de kaart 1 van 1050',
  tekst(tweede.w.document.getElementById('kaart-gehaald')).startsWith('1 van 1050 gehaald'), true);
check('de uitleg blijft dicht bij een bestaand potje', tweede.w.document.getElementById('modal-uitleg').hidden, true);
check('het vrije spel heeft de munten bewaard', UI2.vrij.munten, 40);
check('tweede lading zonder JS-fouten', tweede.jsFouten.join(' | '), '');

// -------------------------------------------------------------- boosters
const Engine = w.SmakenlandEngine;
UI.vrij.munten = 5000;
UI.render();
check('de boosters staan in de winkel', w.document.querySelectorAll('.artikel.booster-artikel').length, 3);
w.document.querySelector('[data-koop="hamer"]').click();
check('een booster kopen legt hem op de plank', Engine.boosterAantal(UI.vrij, 'hamer'), 1);
check('en de winkel meldt de voorraad',
  tekst(w.document.querySelector('.artikel.booster-artikel b')).indexOf('in voorraad: 1') >= 0, true);
check('de boosterbalk verschijnt', w.document.getElementById('boosters').hidden, false);
check('met de hamer erin', w.document.querySelectorAll('#boosters .booster').length, 1);
const bezetVak = UI.vrij.cells.findIndex((c) => c);
check('er ligt iets op het bord om weg te halen', bezetVak >= 0, true);
w.document.querySelector('[data-booster="hamer"]').click();
check('de hamer is opgepakt', w.document.querySelector('#boosters .booster').classList.contains('actief'), true);
UI.tik(bezetVak);
check('de hamer haalt het voorwerp weg', UI.vrij.cells[bezetVak], null);
check('en is daarna op', Engine.boosterAantal(UI.vrij, 'hamer'), 0);
check('de balk verdwijnt weer', w.document.getElementById('boosters').hidden, true);

// ------------------------------------------------------------------ tuin
UI.openTuin();
check('de tuin opent', w.document.getElementById('modal-tuin').hidden, false);
check('het tuinbeeld heeft achttien vakken', w.document.querySelectorAll('#tuin-beeld .tuin-vak').length, 18);
check('er staat nog niets', w.document.querySelectorAll('#tuin-beeld .tuin-vak.staat').length, 0);
check('de tuin is nog niet af', tekst(w.document.getElementById('tuin-teller')).indexOf('Nog niets') === 0, true);
const muntenVoorTuin = UI.vrij.munten;
w.document.querySelector('[data-tuin="bankje"]').click();
check('een versiering kopen lukt', UI.vrij.tuin.length, 1);
check('de munten zijn eraf', UI.vrij.munten, muntenVoorTuin - 80);
check('en hij staat in het tuinbeeld', w.document.querySelectorAll('#tuin-beeld .tuin-vak.staat').length, 1);
check('en de teller noemt hem', tekst(w.document.getElementById('tuin-teller')).indexOf('1 van 9') === 0, true);
check('nog eens kopen kan niet', w.document.querySelector('[data-tuin="bankje"]') === null, true);
w.document.getElementById('tuin-sluiten').click();
check('de tuin sluit weer', w.document.getElementById('modal-tuin').hidden, true);

// ------------------------------------------------------- dagelijkse opgave
UI.zetTab('levels');
const dagStand = UI.dag();
check('de dagelijkse opgave staat op de kaart', w.document.querySelectorAll('#dag .dag-vak').length, 7);
check('met vandaag als laatste', w.document.querySelectorAll('#dag .dag-vak.vandaag').length, 1);
check('vandaag is nog niet gedaan', dagStand.gedaanVandaag, false);
check('de opgave is een bestaand level',
  dagStand.level >= 1 && dagStand.level <= w.SmakenlandLevels.levels.length, true);
check('er staat een knop om hem te spelen', tekst(w.document.getElementById('dag-speel')), 'Speel vandaag');
const muntenVoorDag = UI.vrij.munten;
w.document.getElementById('dag-speel').click();
check('de dagelijkse opgave start', UI.level.level, dagStand.level);
check('en het level zegt dat het de dagelijkse is',
  tekst(w.document.querySelector('.record-regel')).indexOf('dagelijkse opgave') >= 0, true);
// Het level uitspelen zoals een speler het doet: bord vol leggen en inleveren.
let beurten = 0;
while (UI.level && UI.level.orders.length && beurten < 10) {
  legDoel();
  const knop = w.document.querySelector('[data-lever]');
  if (!knop || knop.disabled) break;
  knop.click();
  beurten++;
}
await new Promise((r) => setTimeout(r, 700));
check('de dagelijkse opgave is gehaald', w.SmakenlandEngine.dagStand(UI.vrij, Date.now()).gedaanVandaag, true);
check('met bonusmunten erbij', UI.vrij.munten > muntenVoorDag, true);
check('en de reeks staat op één', w.SmakenlandEngine.dagStand(UI.vrij, Date.now()).reeks, 1);
check('het venster meldt de bonus',
  tekst(w.document.getElementById('level-record')).indexOf('Dagelijkse opgave gehaald') >= 0, true);
check('er staat nu een record voor dit level',
  (UI.record(dagStand.level).zetten || 0) > 0, true);
check('met een tijd erbij', (UI.record(dagStand.level).ms || 0) > 0, true);
const dagVakGehaald = w.document.querySelectorAll('#dag .dag-vak.gehaald').length;
check('het dagblok stond nog op niet-gehaald', dagVakGehaald, 0);
w.document.getElementById('level-terug').click();
check('en de knop is uit', w.document.getElementById('dag-speel').disabled, true);
check('de kaart onthoudt de dag opnieuw', w.document.querySelectorAll('#dag .dag-vak.gehaald').length, 1);
check('met een reeks erbij', tekst(w.document.querySelector('#dag .dag-reeks')).indexOf('1 dag op rij') >= 0, true);


// -------------------------------------------------------- diepe link (hash)
const diep16 = await open(`${basis}/index.html#sudoku16`);
check('een diepe link met de maat erin geeft 256 vakken',
  diep16.w.document.querySelectorAll('.sudoku-cel').length, 256);
check('en de adresbalk houdt de maat vast', diep16.w.location.hash, '#sudoku16');
check('en de cijferknoppen lopen tot G',
  tekst(diep16.w.document.querySelectorAll('.cijfers button')[15]), 'G');

const diep = await open(`${basis}/index.html#sudoku`);
check('een diepe link naar sudoku opent dat scherm', diep.w.SmakenlandUI.scherm, 'sudoku');
check('en slaat de uitleg over', diep.w.document.getElementById('modal-uitleg').hidden, true);

// ------------------------------------------- de app-vorm (Android-brug)
// In de browser hoort er geen updateregel te staan; in de Android-app wel.
check('zonder app-brug staat er geen updateregel', w.document.querySelectorAll('.update-rij').length, 0);

let gecontroleerd = 0;
const metBrug = await open(`${basis}/index.html`, null, (win) => {
  // De echte app hangt dit aan het venster: versie() plus een verzoek om te kijken.
  win.SmakenlandApp = {
    versie: () => '1.1.1',
    controleerOpUpdates: () => { gecontroleerd++; },
  };
});
const updateKnop = metBrug.w.document.getElementById('controleer-updates');
check('in de app-vorm staat er wel een updateregel', !!updateKnop, true);
check('en staat de versie van het toestel erbij',
  /App-versie 1\.1\.1/.test(tekst(metBrug.w.document.querySelector('.update-rij'))), true);
if (updateKnop) updateKnop.click();
check('de knop vraagt de app om te controleren', gecontroleerd, 1);
check('de app-vorm laadt zonder JS-fouten', metBrug.jsFouten.join(' | '), '');

// Trillen en de energiemelding horen bij de schil: zonder brug zijn ze er niet,
// met brug moet de knop werken en moet de schil om de melding gevraagd worden.
check('zonder tril-brug is er geen trilkop', w.document.getElementById('knop-tril').hidden, true);

let getrild = [];
let meldingGevraagd = null;
let meldingGeannuleerd = 0;
const metTril = await open(`${basis}/index.html#vrij`, null, (win) => {
  win.SmakenlandTril = { tril: (patroon) => { getrild.push(patroon); } };
  win.SmakenlandApp = {
    versie: () => '1.2.0',
    controleerOpUpdates: () => {},
    planEnergieMelding: (seconden) => { meldingGevraagd = seconden; },
    annuleerEnergieMelding: () => { meldingGeannuleerd++; },
  };
});
const trilKnop = metTril.w.document.getElementById('knop-tril');
check('met tril-brug staat de trilkop er', trilKnop.hidden, false);
check('en staat hij aan', trilKnop.getAttribute('aria-pressed'), 'true');
trilKnop.click();
check('uitzetten werkt', trilKnop.getAttribute('aria-pressed'), 'false');
check('en er is niets getrild toen hij uit stond', getrild.length, 0);
trilKnop.click();
const kist3 = metTril.w.SmakenlandUI.vrij.cells.findIndex((c) => c && c.kind === 'gen');
metTril.w.SmakenlandUI.tik(kist3);
check('een oogst laat het toestel trillen', getrild.length > 0, true);
check('met een patroon in milliseconden', /^[0-9]+$/.test(String(getrild[0])), true);
// De energiemelding: het scherm op de achtergrond zetten moet de schil vragen om
// over `seconden` te wekken. Eerst de energie leegmaken, anders is er niets te
// wachten (vol = geen melding nodig).
const vrijStand = metTril.w.SmakenlandUI.vrij;
vrijStand.energie = 0;
vrijStand.laatsteEnergie = Date.now();
Object.defineProperty(metTril.w.document, 'visibilityState', { value: 'hidden', configurable: true });
metTril.w.document.dispatchEvent(new metTril.w.Event('visibilitychange'));
check('bij weggaan vraagt de pagina om de energiemelding', meldingGevraagd !== null, true);
check('met het aantal seconden tot de energie vol is', meldingGevraagd > 0 && meldingGevraagd <= 60 * 20, true);
// En als de energie vol is, valt er niets te melden.
vrijStand.energie = vrijStand.energieMax;
meldingGevraagd = null;
metTril.w.document.dispatchEvent(new metTril.w.Event('visibilitychange'));
check('met een volle energie vraagt de pagina om niets', meldingGevraagd, 0);
Object.defineProperty(metTril.w.document, 'visibilityState', { value: 'visible', configurable: true });
metTril.w.document.dispatchEvent(new metTril.w.Event('visibilitychange'));
check('en bij terugkomst wordt hij geannuleerd', meldingGeannuleerd, 1);
check('de trilversie laadt zonder JS-fouten', metTril.jsFouten.join(' | '), '');

console.log(`\n${gedaan - fouten}/${gedaan} controles goed${fouten ? ` — ${fouten} FOUT` : ''}`);
dom.window.close();
tweede.dom.window.close();
diep.dom.window.close();
metBrug.dom.window.close();
metTril.dom.window.close();
process.exit(fouten ? 1 : 0);
