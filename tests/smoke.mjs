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
check('er zijn 800 levelknoppen', w.document.querySelectorAll('.level-knop').length, 800);
check('er zijn 32 hoofdstukken', w.document.querySelectorAll('.hoofdstuk').length, 32);
check('alleen level 1 is open', w.document.querySelectorAll('.level-knop:not(.op-slot)').length, 1);
check('de kaart telt 0 van 800', tekst(w.document.getElementById('kaart-gehaald')), '0 van 800 gehaald');
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

// ------------------------------------------------------------ vrij spelen
w.document.querySelector('.tab[data-tab=vrij]').click();
check('de vrij-tab opent', UI.scherm, 'vrij');
check('het bord is er weer', w.document.querySelectorAll('#bord .cel').length, 56);
check('er zijn klanten', w.document.querySelectorAll('#orders .order').length, 3);
check('de winkel heeft artikelen', w.document.querySelectorAll('.artikel').length, 4);
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
check('na herladen telt de kaart 1 van 800', tekst(tweede.w.document.getElementById('kaart-gehaald')),
  '1 van 800 gehaald');
check('de uitleg blijft dicht bij een bestaand potje', tweede.w.document.getElementById('modal-uitleg').hidden, true);
check('het vrije spel heeft de munten bewaard', UI2.vrij.munten, 40);
check('tweede lading zonder JS-fouten', tweede.jsFouten.join(' | '), '');

// -------------------------------------------------------- diepe link (hash)
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

console.log(`\n${gedaan - fouten}/${gedaan} controles goed${fouten ? ` — ${fouten} FOUT` : ''}`);
dom.window.close();
tweede.dom.window.close();
diep.dom.window.close();
metBrug.dom.window.close();
process.exit(fouten ? 1 : 0);
