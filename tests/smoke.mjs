/* Rooktest van de echte pagina in jsdom: laadt index.html over http,
   speelt via de UI-laag (dezelfde functies die de knoppen en het bord aanroepen)
   en controleert wat er daadwerkelijk in de DOM staat.
   Gebruik: node tests/smoke.mjs [poort] */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// jsdom staat lang niet in elke omgeving naast dit project; probeer de
// gebruikelijke plekken en geef met JSDOM_PAD je eigen map mee.
function laadJsdom() {
  const kandidaten = [
    import.meta.url,
    process.env.JSDOM_PAD,
    path.join(process.cwd(), 'package.json'),
    path.join(os.homedir(), 'paperclip', 'package.json'),
    '/home/hermes/paperclip/package.json',
  ].filter(Boolean);
  for (const basis of kandidaten) {
    try {
      const vereis = createRequire(basis);
      return vereis('jsdom');
    } catch (e) { /* volgende plek */ }
  }
  console.error('jsdom niet gevonden. Installeer het (npm i -D jsdom) of zet JSDOM_PAD=/map/met/node_modules.');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = laadJsdom();

const hier = path.dirname(fileURLToPath(import.meta.url));
const wortel = path.dirname(hier);
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

// Alle items van een keten/tier op het bord, inclusief stapels.
function items(UI, keten, tier) {
  return UI.state.cells
    .filter((c) => c && c.kind === 'item' && c.keten === keten && c.tier === tier)
    .reduce((n, c) => n + c.count, 0);
}

async function open(url, opslag) {
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
      // Elke jsdom heeft zijn eigen localStorage; de bewaarde stand van het
      // eerste potje zetten we hier over, zoals een herlaadbeurt in de browser.
      if (opslag) window.localStorage.setItem('smakenland.save.v1', opslag);
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r, { once: true }));
  await new Promise((r) => setTimeout(r, 250));
  return { dom, w: dom.window, jsFouten };
}

const { dom, w, jsFouten } = await open(`${basis}/index.html`);
const UI = w.SmakenlandUI;
check('de pagina laadt zonder JS-fouten', jsFouten.join(' | '), '');
check('de UI-laag is bereikbaar', !!UI, true);
if (!UI) process.exit(1);

// ---- begintoestand
check('bord heeft 56 cellen', w.document.querySelectorAll('.cel').length, 56);
check('twee kisten op het bord', w.document.querySelectorAll('.cel.kist').length, 2);
check('munten in de kop', tekst(w.document.getElementById('stat-munten')), '25');
check('energie in de kop', tekst(w.document.getElementById('stat-energie')), '40/60');
check('drie klantenorders', w.document.querySelectorAll('.order').length, 3);
check('winkel met vier artikelen', w.document.querySelectorAll('.artikel').length, 4);
check('gebied heet Smakendorp', tekst(w.document.getElementById('gebied-naam')), 'Smakendorp');
check('de uitleg staat open bij een nieuw potje', w.document.getElementById('modal-uitleg').hidden, false);
w.document.getElementById('uitleg-sluiten').click();
check('uitleg te sluiten', w.document.getElementById('modal-uitleg').hidden, true);

// ---- oogsten uit de Zadenkist (cel 3 = rij 0, kolom 3)
let energieVoor = UI.state.energie;
UI.tik(3);
check('oogsten kost energie', UI.state.energie, energieVoor - 1);
check('de oogst stapelt op een bestaand zaadje', w.document.querySelectorAll('.cel.item .stapel').length >= 1, true);
UI.tik(3);
check('twee keer oogsten versmelt tot een kiemplant', items(UI, 'tuin', 2), 3);
check('de kiemplant staat ook echt op het bord',
  w.document.querySelectorAll('.cel.item .e').length >= 5, true);
check('de kop toont de nieuwe energie', tekst(w.document.getElementById('stat-energie')), UI.state.energie + '/60');

// ---- munten innen
const muntenVoor = UI.state.munten;
const muntCel = UI.state.cells.findIndex((c) => c && c.keten === 'munt');
UI.tik(muntCel);
check('munten innen levert munten op', UI.state.munten > muntenVoor, true);
check('de cel is daarna leeg', UI.state.cells[muntCel], null);
check('de kop volgt de munten', tekst(w.document.getElementById('stat-munten')), String(UI.state.munten));

// ---- een kist van niveau 2 maken (3 Zadenkisten op elkaar)
const S = UI.state;
S.cells[S.cells.findIndex((c, i) => c && c.gen === 'zadenkist')] = { kind: 'gen', gen: 'zadenkist', level: 1, count: 1 };
S.cells[40] = { kind: 'gen', gen: 'zadenkist', level: 1, count: 1 };
S.cells[41] = { kind: 'gen', gen: 'zadenkist', level: 1, count: 1 };
S.cells[42] = { kind: 'gen', gen: 'zadenkist', level: 1, count: 1 };
UI.render();
UI.verplaats(40, 41);
UI.verplaats(42, 41);
const kist = UI.state.cells[41];
check('drie kisten worden een kist van niveau 2', kist && kist.level, 2);
const energieVoorKist2 = UI.state.energie;
UI.tik(41);
check('een kist van niveau 2 kost 2 energie', UI.state.energie, energieVoorKist2 - 2);
check('en levert een kiemplant (tree 2)', items(UI, 'tuin', 2), 4);

// ---- drie gelijke items versmelten via de UI-laag
UI.state.cells.fill(null);
UI.state.cells[10] = { kind: 'item', keten: 'haven', tier: 1, count: 1 };
UI.state.cells[11] = { kind: 'item', keten: 'haven', tier: 1, count: 1 };
UI.state.cells[12] = { kind: 'item', keten: 'haven', tier: 1, count: 1 };
UI.render();
UI.verplaats(10, 11);
check('twee op een stapel', UI.state.cells[11].count, 2);
UI.verplaats(12, 11);
check('de derde versmelt naar tree 2', UI.state.cells[11].tier, 2);
check('de broncel is leeg', UI.state.cells[12], null);
check('het bord toont de nieuwe schelp/vis', w.document.querySelector('.cel.item .e').textContent, '🐟');
check('de versmelting is geteld', UI.state.merges >= 1, true);

// ---- een klant helpen via de echte knop in de DOM
UI.state.orders = [{ id: 'test', keten: 'haven', tier: 2, aantal: 1, munten: 60, sterren: 3, klant: 'Bakker Bram' }];
UI.state.cells[11] = { kind: 'item', keten: 'haven', tier: 2, count: 1 };
UI.render();
const knop = w.document.querySelector('[data-lever="test"]');
check('de leverknop staat aan zodra je het item hebt', knop && knop.disabled, false);
const muntenVoorLever = UI.state.munten;
knop.click();
check('leveren geeft munten', UI.state.munten, muntenVoorLever + 60);
check('leveren geeft sterren', UI.state.sterren, 3);
check('de order is vervangen door een nieuwe', w.document.querySelectorAll('.order').length, 3);
check('het item is uit het bord verdwenen', UI.state.cells[11], null);
check('de teller geholpen klanten staat op 1', tekst(w.document.getElementById('orders-klaar')), '1 geholpen');

// ---- winkel via de echte knop
UI.state.munten = 100;
UI.render();
const winkelKnop = w.document.querySelector('[data-koop="energie"]');
UI.state.energie = 5;
winkelKnop.click();
check('een energiedrank kost 60 munten', UI.state.munten, 40);
check('en geeft 25 energie', UI.state.energie, 30);
check('de winkelknop gaat uit zonder munten', w.document.querySelector('[data-koop="energie"]').disabled, true);

// ---- een nieuw gebied via genoeg sterren
UI.state.sterren = 10;
UI.state.orders = [{ id: 'v', keten: 'haven', tier: 2, aantal: 1, munten: 5, sterren: 1, klant: 'Reiziger Tijs' }];
UI.state.cells[11] = { kind: 'item', keten: 'haven', tier: 2, count: 1 };
UI.render();
w.document.querySelector('[data-lever="v"]').click();
check('een nieuw gebied opent', UI.state.gebied, 1);
check('de verhaalkaart verschijnt', w.document.getElementById('modal-verhaal').hidden, false);
check('met de naam van het gebied', tekst(w.document.getElementById('verhaal-titel')), 'Bakkerslaan');
check('met een nieuw kistje als cadeau', tekst(w.document.getElementById('verhaal-cadeau')).includes('Deegkom'), true);
w.document.getElementById('verhaal-verder').click();
check('de verhaalkaart sluit weer', w.document.getElementById('modal-verhaal').hidden, true);
check('het reispaneel noemt het nieuwe gebied', tekst(w.document.getElementById('gebied-naam')), 'Bakkerslaan');
check('de deegkom staat op het bord',
  UI.state.cells.some((c) => c && c.gen === 'deegkom'), true);
check('de keten Bakkerij is niet meer op slot',
  Array.from(w.document.querySelectorAll('.keten-chip')).some((c) => tekst(c).includes('Bakkerij')), true);

// ---- bewaren en opnieuw laden
UI.state.munten = 1234;
UI.bewaar();
const bewaard = w.localStorage.getItem('smakenland.save.v1');
check('de stand staat in localStorage', typeof bewaard === 'string' && bewaard.length > 100, true);
const tweede = await open(`${basis}/index.html`, bewaard);
const staat2 = tweede.w.SmakenlandUI.state;
check('na herladen zijn de munten er nog', staat2.munten, 1234);
check('na herladen is het gebied er nog', staat2.gebied, 1);
check('en de uitleg blijft dan dicht', tweede.w.document.getElementById('modal-uitleg').hidden, true);
check('tweede lading zonder JS-fouten', tweede.jsFouten.join(' | '), '');

// ---- opnieuw beginnen
tweede.w.document.getElementById('knop-uitleg').click();
tweede.w.document.getElementById('opnieuw').click();
check('opnieuw beginnen zet de munten terug', tweede.w.SmakenlandUI.state.munten, 25);
check('en het bord heeft weer twee kisten', tweede.w.document.querySelectorAll('.cel.kist').length, 2);

console.log(`\n${gedaan - fouten}/${gedaan} controles goed${fouten ? ` — ${fouten} FOUT` : ''}`);
dom.window.close();
tweede.dom.window.close();
process.exit(fouten ? 1 : 0);