/* Smakenland - spelinhoud (ketens, gebieden, winkel).
   Werkt in de browser (window.SmakenlandContent) en in Node (module.exports). */
(function (root) {
  'use strict';

  // Elke keten is een rij items die je omhoog versmelt (tier 1 -> maxTier).
  const CHAINS = {
    tuin: {
      naam: 'Tuin',
      kleur: '#3f8f4f',
      gen: { e: '🧺', n: 'Zadenkist' },
      tiers: [
        { e: '🌰', n: 'Zaadje' },
        { e: '🌱', n: 'Kiemplant' },
        { e: '🍅', n: 'Tomaat' },
        { e: '🥗', n: 'Salade' },
        { e: '🍲', n: 'Soep' },
        { e: '🍛', n: 'Feestmaal' }
      ]
    },
    bakkerij: {
      naam: 'Bakkerij',
      kleur: '#b5761f',
      gen: { e: '🥣', n: 'Deegkom' },
      tiers: [
        { e: '🌾', n: 'Koren' },
        { e: '🥖', n: 'Stokbrood' },
        { e: '🍞', n: 'Boerenbrood' },
        { e: '🥐', n: 'Croissants' },
        { e: '🎂', n: 'Taart' },
        { e: '👑', n: 'Bruidstaart' }
      ]
    },
    bloemen: {
      naam: 'Bloemen',
      kleur: '#c2447a',
      gen: { e: '🪴', n: 'Bloempot' },
      tiers: [
        { e: '🍀', n: 'Klavertje' },
        { e: '🌷', n: 'Tulp' },
        { e: '🌻', n: 'Zonnebloem' },
        { e: '💐', n: 'Boeket' },
        { e: '🪷', n: 'Lotus' },
        { e: '🌸', n: 'Blossem' }
      ]
    },
    smidse: {
      naam: 'Smidse',
      kleur: '#5a6577',
      gen: { e: '🔥', n: 'Smidsvuur' },
      tiers: [
        { e: '⛏️', n: 'Erts' },
        { e: '🔩', n: 'Spijker' },
        { e: '🔨', n: 'Hamer' },
        { e: '⚔️', n: 'Zwaard' },
        { e: '🛡️', n: 'Schild' },
        { e: '🏆', n: 'Trofee' }
      ]
    },
    haven: {
      naam: 'Haven',
      kleur: '#2a7ea8',
      gen: { e: '🎣', n: 'Visnet' },
      tiers: [
        { e: '🐚', n: 'Schelp' },
        { e: '🐟', n: 'Vis' },
        { e: '🦑', n: 'Inktvis' },
        { e: '🦞', n: 'Kreeft' },
        { e: '🐳', n: 'Walvis' },
        { e: '🐉', n: 'Zeedraak' }
      ]
    },
    magie: {
      naam: 'Magie',
      kleur: '#7a4fc0',
      gen: { e: '📖', n: 'Toverboek' },
      tiers: [
        { e: '✨', n: 'Sterrenstof' },
        { e: '🔮', n: 'Kristal' },
        { e: '🧪', n: 'Toverdrank' },
        { e: '🪄', n: 'Toverstaf' },
        { e: '🧙', n: 'Tovenaar' },
        { e: '🌟', n: 'Sterrenkroon' }
      ]
    },
    munt: {
      naam: 'Munten',
      kleur: '#c99a11',
      gen: { e: '💰', n: 'Geldkist' },
      tiers: [
        { e: '🪙', n: 'Munt' },
        { e: '👛', n: 'Buidel' },
        { e: '💎', n: 'Schat' }
      ]
    }
  };

  // Opbrengst als je een munt-item aantikt.
  const MUNT_WAARDE = { munt: [2, 12, 60] };

  const GENERATORS = {
    zadenkist: { keten: 'tuin', naam: 'Zadenkist', e: '🧺' },
    deegkom: { keten: 'bakkerij', naam: 'Deegkom', e: '🥣' },
    bloempot: { keten: 'bloemen', naam: 'Bloempot', e: '🪴' },
    smidsvuur: { keten: 'smidse', naam: 'Smidsvuur', e: '🔥' },
    visnet: { keten: 'haven', naam: 'Visnet', e: '🎣' },
    toverboek: { keten: 'magie', naam: 'Toverboek', e: '📖' },
    geldkist: { keten: 'munt', naam: 'Geldkist', e: '💰' }
  };

  // De reis: elk gebied heeft een verhaal en geeft een nieuwe generator.
  const AREAS = [
    {
      id: 'dorp',
      naam: 'Smakendorp',
      e: '🏘️',
      sterren: 0,
      kleuren: ['#4b7a4f', '#2f4f36'],
      verhaal:
        'Je erft een verwaarloosd keukentje aan de rand van Smakendorp. In de kist op zolder vind je ' +
        'oude zaadjes en een rammelend geldkistje. De dorpelingen ruiken je eerste soep al van verre.',
      generator: 'zadenkist'
    },
    {
      id: 'bakkerij',
      naam: 'Bakkerslaan',
      e: '🥖',
      sterren: 10,
      kleuren: ['#a8792c', '#6d4a14'],
      verhaal:
        'De bakkers van Bakkerslaan ruiken je kruiden en bieden je hun oude deegkom aan. "Maak iets ' +
        'warms," zeggen ze, "dan praten we verder." Het hele dorp komt op de geur af.',
      generator: 'deegkom'
    },
    {
      id: 'bloemen',
      naam: 'Bloemenmarkt',
      e: '🌷',
      sterren: 26,
      kleuren: ['#b8447a', '#6e2548'],
      verhaal:
        'Op de Bloemenmarkt verkopen ze kleuren die je nergens anders ziet. De marktmeesteres geeft je ' +
        'een Bloempot: "Alles wat je hier plant, groeit twee keer zo snel."',
      generator: 'bloempot'
    },
    {
      id: 'smidse',
      naam: 'Smidsebrand',
      e: '⚒️',
      sterren: 48,
      kleuren: ['#5a6577', '#2b3240'],
      verhaal:
        'Voorbij de heuvels brandt het Smidsvuur dag en nacht. De smid smeedt er gereedschap dat nooit ' +
        'bot wordt — precies wat je nodig hebt om nog grotere feesten te koken.',
      generator: 'smidsvuur'
    },
    {
      id: 'haven',
      naam: 'Zoute Haven',
      e: '⛵',
      sterren: 76,
      kleuren: ['#2a7ea8', '#14405a'],
      verhaal:
        'In Zoute Haven gooien de vissers hun netten uit. De havenmeester geeft je een net: "Wat je ' +
        'binnenhaalt, kook ik voor je." De zeedraak op je bord laat nog even op zich wachten.',
      generator: 'visnet'
    },
    {
      id: 'sterrenkeuken',
      naam: 'Sterrenkeuken',
      e: '✨',
      sterren: 110,
      kleuren: ['#7a4fc0', '#3a2160'],
      verhaal:
        'Boven de wolken ligt de Sterrenkeuken, waar het Toverboek recepten opschrijft voordat iemand ' +
        'ze bedenkt. Wie hier een feestmaal kookt, wordt de verteller van Smakenland.',
      generator: 'toverboek'
    }
  ];

  const SHOP = [
    { id: 'energie', naam: 'Energiedrank', e: '⚡', prijs: 60, tekst: '+25 energie, meteen bruikbaar.' },
    { id: 'zadenkist', naam: 'Extra Zadenkist', e: '🧺', prijs: 140, tekst: 'Een tweede kist voor je tuin.' },
    { id: 'geldkist', naam: 'Extra Geldkist', e: '💰', prijs: 220, tekst: 'Meer munten per oogst.' },
    { id: 'bakkerskist', naam: 'Extra Deegkom', e: '🥣', prijs: 320, tekst: 'Een tweede bakkerskist.' },
    // Boosters: die koop je, en dan draag je ze mee tot je ze nodig hebt.
    { id: 'hamer', soort: 'booster', naam: 'Hamer', e: '🔨', prijs: 90, tekst: 'Tik een voorwerp weg dat je niet meer wilt.' },
    { id: 'schaar', soort: 'booster', naam: 'Schaar', e: '✂️', prijs: 70, tekst: 'Knipt één stuk van een stapel los.' },
    { id: 'dubbel', soort: 'booster', naam: 'Dubbelmunten', e: '✖️', prijs: 200, tekst: 'De volgende drie leveringen geven dubbel munten.' }
  ];

  // Versieringen voor de tuin: die koop je met munten en zie je terug in het
  // tuinbeeld. `vak` is de plek in het rooster (kolom, rij) van 0 tot 5 bij 0 tot 2.
  const TUIN = [
    { id: 'bankje', naam: 'Tuinbank', e: '🪑', prijs: 80, vak: [0, 1], tekst: 'Om even uit te rusten na het oogsten.' },
    { id: 'lantaarn', naam: 'Lantaarn', e: '🏮', prijs: 110, vak: [5, 1], tekst: 'Licht in de tuin als het donker wordt.' },
    { id: 'heg', naam: 'Beukenheg', e: '🌿', prijs: 140, vak: [1, 2], tekst: 'Een heg die je tuin afbakent.' },
    { id: 'vijver', naam: 'Vijver', e: '🦆', prijs: 220, vak: [2, 1], tekst: 'Met een eend die er zelf naartoe kwam.' },
    { id: 'kruiwagen', naam: 'Kruiwagen', e: '🛒', prijs: 160, vak: [5, 2], tekst: 'Voor het zware werk.' },
    { id: 'kas', naam: 'Kas', e: '🏡', prijs: 300, vak: [0, 0], tekst: 'Plantjes die het hele jaar doorgaan.' },
    { id: 'fontein', naam: 'Fontein', e: '⛲', prijs: 420, vak: [3, 1], tekst: 'Het pronkstuk van je tuin.' },
    { id: 'bijenkorf', naam: 'Bijenkorf', e: '🐝', prijs: 260, vak: [1, 0], tekst: 'Bijen doen het werk, jij krijgt de honing.' },
    { id: 'prieel', naam: 'Prieel', e: '🌺', prijs: 520, vak: [2, 0], tekst: 'Waar de klanten hun feestmaal opeten.' }
  ];

  const content = { CHAINS, MUNT_WAARDE, GENERATORS, AREAS, SHOP, TUIN };
  root.SmakenlandContent = content;
  if (typeof module !== 'undefined' && module.exports) module.exports = content;
})(typeof globalThis !== 'undefined' ? globalThis : this);
