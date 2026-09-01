/**
 * Alles wat je normaal wilt aanpassen staat in dit bestand.
 * De rest van de code hoef je niet aan te raken.
 */
export const CONFIG = {
  /* ── Jouw proefschrift ───────────────────────────────────────────────── */

  // Pad naar de PDF zoals de site 'm serveert. Laat dit een lokaal, relatief
  // pad zijn (dus geen https-URL) als je pdfSourceUrl hieronder gebruikt —
  // de build haalt het bestand dan naar dit pad toe.
  pdfUrl: 'pdf/proefschrift-web.pdf',

  // Optioneel: haal de PDF bij elke publicatie op van een externe bron
  // (bijv. een universitair repository) in plaats van 'm in git te zetten.
  // De GitHub Actions-workflow downloadt 'm dan naar pdfUrl vóór het
  // publiceren — zo blijft de PDF buiten je git-geschiedenis, en werkt de
  // flipbook alsnog same-origin (geen CORS nodig, want de bron-server hoeft
  // dan zelf geen CORS-header te sturen). Zet op '' om uit te schakelen en
  // pdfUrl direct te gebruiken (lokaal bestand, of externe URL mét CORS).
  pdfSourceUrl: 'https://repository.tudelft.nl/file/File_e52e86ad-3e3c-4916-bad5-c9dbdcd22f0a',

  // Bestandsnaam die de bezoeker krijgt bij 'PDF' (download).
  downloadName: 'proefschrift-web.pdf',

  title: 'Shaken or stirred?',
  subtitle: 'Elucidating salt intrusion dynamics in the Rhine-Meuse Delta using data-intensive unstructured modelling',
  author: 'M.E.G. Geraeds',
  institution: 'Delft University of Technology',

  /* ── Uiterlijk en gedrag ─────────────────────────────────────────────── */

  // Toon de eerste en laatste pagina als losse, stijve kaft.
  // Zet op false als je PDF al met een dubbele titelpagina begint.
  hardCover: true,

  // PDF-paginanummer (1-based) dat NIET in de flipbook komt, maar in plaats
  // daarvan bij het openen als wegklikbare waarschuwing getoond wordt —
  // handig voor een repository-voorblad dat niet bij het boek zelf hoort.
  // Zet op null om uit te schakelen; dan komt ook pagina 1 gewoon in het boek.
  warningPage: 1,

  // Extra PDF's die je ergens tussen de proefschrift-pagina's wilt schuiven
  // (bijv. een schutblad, erratum of los voorwoord dat geen deel is van
  // pdfUrl zelf). Elk bestand wordt volledig ingevoegd, in eigen
  // paginavolgorde, vanaf positie 'at':
  //   - positief telt vanaf het begin (1 = wordt de nieuwe eerste pagina);
  //   - negatief telt vanaf het eind (-1 = na de huidige laatste pagina,
  //     -2 = vóór de huidige laatste pagina, enz.).
  // Bestanden zijn lokale paden of https-URL's — zelfde CORS-regel als
  // pdfUrl. Laat leeg ([]) als je dit niet gebruikt.
  inserts: [
    // { at: 2, url: 'pdf/cover-binnenkant-voor.pdf' },
    // { at: -2, url: 'pdf/cover-binnenkant-achter.pdf' },
  ],

  // Duur van de omslaganimatie in milliseconden.
  flipDuration: 750,

  // Onder deze vensterbreedte (px) toont de flipbook één pagina tegelijk.
  portraitBreakpoint: 820,

  // Nominale renderbreedte van één pagina in CSS-pixels. Hoger = scherper
  // op grote schermen, maar zwaarder. 620 is een goede middenweg.
  nominalPageWidth: 620,

  // Hoeveel pagina's vooruit/achteruit alvast gerenderd worden.
  prefetch: 3,

  // Hoeveel gerenderde pagina's in het geheugen blijven staan.
  // Verlaag naar 12 als een lang proefschrift op mobiel hapert.
  cacheSize: 24,

  /* ── Bibliotheken ────────────────────────────────────────────────────── */
  // Standaard via jsDelivr met vastgezette versies. Draai scripts/vendor.sh
  // om alles lokaal te zetten; dat script drukt het blok af dat je hier
  // overneemt. Relatieve paden mogen, ze worden tegen de pagina opgelost.
  pdfjs: {
    lib:    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/pdf.min.mjs',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/pdf.worker.min.mjs',
    // Zonder deze drie tonen niet-ingesloten lettertypen en niet-westerse
    // tekens (Grieks, CJK, wiskundeglyfen) als lege blokjes.
    cmaps:  'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/cmaps/',
    fonts:  'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/standard_fonts/',
    wasm:   'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/wasm/',
  },
  pageFlip: 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js',
};
