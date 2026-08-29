/**
 * Alles wat je normaal wilt aanpassen staat in dit bestand.
 * De rest van de code hoef je niet aan te raken.
 */
export const CONFIG = {
  /* ── Jouw proefschrift ───────────────────────────────────────────────── */

  // Pad naar de PDF. Relatief (in deze repo) of een volledige https-URL.
  // Let op bij een externe URL: die server moet CORS toestaan. Zie README.
  pdfUrl: 'pdf/proefschrift.pdf',

  // Bestandsnaam die de bezoeker krijgt bij 'PDF' (download).
  downloadName: 'proefschrift.pdf',

  title: 'Titel van het proefschrift',
  subtitle: '',
  author: 'Voornaam Achternaam',
  institution: 'Erasmus Universiteit Rotterdam',

  /* ── Uiterlijk en gedrag ─────────────────────────────────────────────── */

  // Toon de eerste en laatste pagina als losse, stijve kaft.
  // Zet op false als je PDF al met een dubbele titelpagina begint.
  hardCover: true,

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
