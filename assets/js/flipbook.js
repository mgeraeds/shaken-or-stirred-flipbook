/**
 * Proefschrift-flipbook
 * ---------------------
 * pdf.js rendert elke pagina naar een <canvas>; StPageFlip verzorgt het
 * omslaan. Pagina's worden lui gerenderd in een venster rond de huidige
 * positie, zodat een proefschrift van 300 bladzijden niet het geheugen
 * opeet.
 *
 * MIT-licentie. pdf.js (Apache-2.0) en StPageFlip (MIT) zijn losse
 * bibliotheken; zie README.
 */

import { CONFIG } from './config.js';

/* ─── Kleine helpers ──────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Maakt een pad uit config.js absoluut, zodat zowel './assets/…' als
 *  'https://…' werkt — pdf.js en dynamic import() eisen dat allebei. */
const absolute = (path) => new URL(path, document.baseURI).href;

/** Laadt een klassiek script (StPageFlip is geen ES-module). */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Kon ${src} niet laden`));
    document.head.appendChild(el);
  });

/* ─── De flipbook ─────────────────────────────────────────────────────── */

class Flipbook {
  constructor(pdfjsLib) {
    this.pdfjsLib = pdfjsLib;
    this.pdf = null;
    this.total = 0;
    this.aspect = 1 / Math.SQRT2;   // valt terug op A4-staand
    this.pageEls = [];
    this.canvases = new Map();      // paginanummer → canvas met inhoud
    this.tasks = new Map();         // paginanummer → lopende rendertaak
    this.order = [];                // volgorde voor het opruimen van de cache
    this.flip = null;
    this.portrait = null;
    this.current = 1;
    this.outline = [];
    this.textIndex = null;
    this.indexing = false;
    // Aantal PDF-pagina's vooraan dat NIET in de flipbook zit (zie
    // CONFIG.warningPage).
    this.pageOffset = 0;
    // Eén item per flipbook-pagina: { doc, page }. doc is een geladen
    // pdf.js-document (het proefschrift zelf, of een ingevoegd bestand uit
    // CONFIG.inserts), page is het paginanummer (1-based) daarbinnen. Zo
    // hoeft de rest van de code nooit te weten uit welk bestand een
    // flipbook-pagina komt.
    this.pageMap = [];

    this.el = {
      stage: $('stage'), book: $('book'), flipbook: $('flipbook'),
      boot: $('boot'), bootText: $('boot-text'), bootFill: $('boot-fill'),
      foredge: $('foredge'), ribbon: $('foredge-ribbon'),
      marks: $('foredge-marks'), hint: $('foredge-hint'),
      folioNow: $('folio-now'), folioTotal: $('folio-total'),
      toc: $('toc'), tocBtn: $('btn-contents'),
      findInput: $('find-input'), findStatus: $('find-status'), hits: $('hits'),
      reader: $('reader'), readerCanvas: $('reader-canvas'),
      readerFolio: $('reader-folio'), readerScroll: $('reader-scroll'),
      fallback: $('fallback'),
      warning: $('warning'), warningPanel: $('warning-panel'),
      warningCanvas: $('warning-canvas'), warningClose: $('warning-close'),
    };
  }

  /* ── Opstarten ──────────────────────────────────────────────────────── */

  async boot() {
    this.applyMetadata();

    const task = this.pdfjsLib.getDocument({
      url: absolute(CONFIG.pdfUrl),
      cMapUrl: absolute(CONFIG.pdfjs.cmaps),
      cMapPacked: true,
      standardFontDataUrl: absolute(CONFIG.pdfjs.fonts),
      wasmUrl: absolute(CONFIG.pdfjs.wasm),
    });

    task.onProgress = ({ loaded, total }) => {
      if (!total) return;
      const pct = clamp(Math.round((loaded / total) * 100), 0, 100);
      this.el.bootFill.style.width = pct + '%';
      this.el.bootText.textContent = `Proefschrift laden… ${pct}%`;
    };

    this.pdf = await task.promise;

    this.pageOffset = (CONFIG.warningPage && CONFIG.warningPage >= 1)
      ? CONFIG.warningPage
      : 0;

    // Bevat de opgehaalde PDF zelf al genoeg pagina's, dan zitten de
    // schutbladen er vermoedelijk al in — inserts dan niet nog eens toevoegen.
    const skipInserts = CONFIG.insertsSkipIfPdfPagesAtLeast != null
      && this.pdf.numPages >= CONFIG.insertsSkipIfPdfPagesAtLeast;
    const inserts = skipInserts ? [] : await this.loadInserts();
    this.pageMap = this.buildPageMap(inserts);
    this.total = this.pageMap.length;

    const first = await this.getPageFor(1);
    const view = first.getViewport({ scale: 1 });
    this.aspect = view.width / view.height;

    this.buildPages();
    this.mount();

    this.el.folioTotal.textContent = this.total;
    this.el.foredge.setAttribute('aria-valuemax', this.total);

    const start = this.pageFromHash() ?? 1;
    if (start > 1) this.flip.turnToPage(start - 1);
    this.onFlip(start);            // paginateller en leeslint gelijkzetten

    await this.renderAround(start);
    this.el.boot.hidden = true;
    document.body.classList.add('is-ready');

    this.loadOutline();       // op de achtergrond
    if (this.pageOffset > 0) this.showWarning();   // ook op de achtergrond
  }

  applyMetadata() {
    const map = {
      title: CONFIG.title,
      author: CONFIG.author,
      institution: CONFIG.institution,
    };
    for (const [key, value] of Object.entries(map)) {
      document.querySelectorAll(`[data-bind="${key}"]`).forEach((n) => {
        n.textContent = value;
      });
    }
    document.title = `${CONFIG.title} — ${CONFIG.author}`;
    const dl = $('btn-download');
    dl.href = CONFIG.pdfUrl;
    dl.setAttribute('download', CONFIG.downloadName);
  }

  /* ── Ingevoegde PDF's (CONFIG.inserts) ────────────────────────────────── */

  /** Laadt elk bestand uit CONFIG.inserts als los pdf.js-document. */
  async loadInserts() {
    const inserts = [];
    for (const insert of CONFIG.inserts || []) {
      const task = this.pdfjsLib.getDocument({
        url: absolute(insert.url),
        cMapUrl: absolute(CONFIG.pdfjs.cmaps),
        cMapPacked: true,
        standardFontDataUrl: absolute(CONFIG.pdfjs.fonts),
        wasmUrl: absolute(CONFIG.pdfjs.wasm),
      });
      const doc = await task.promise;
      inserts.push({ at: insert.at, doc });
    }
    return inserts;
  }

  /** Bouwt de flipbook-paginavolgorde: eerst het proefschrift (met de
   *  waarschuwingspagina eraf), daarna elk insert op zijn 'at'-positie. */
  buildPageMap(inserts) {
    const map = [];
    for (let p = 1 + this.pageOffset; p <= this.pdf.numPages; p++) {
      map.push({ doc: this.pdf, page: p });
    }

    for (const { at, doc } of inserts) {
      const entries = [];
      for (let p = 1; p <= doc.numPages; p++) entries.push({ doc, page: p });

      const index = at >= 0
        ? clamp(at - 1, 0, map.length)
        : clamp(map.length + at + 1, 0, map.length);
      map.splice(index, 0, ...entries);
    }

    return map;
  }

  /** Haalt de pdf.js-pagina op die bij flipbook-paginanummer n hoort. */
  getPageFor(n) {
    const entry = this.pageMap[n - 1];
    return entry.doc.getPage(entry.page);
  }

  /* ── Pagina-elementen ───────────────────────────────────────────────── */

  buildPages() {
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= this.total; n++) {
      const page = document.createElement('div');
      page.className = 'page';
      page.dataset.page = String(n);
      // Kaftpagina's zijn 'hard': ze buigen niet mee.
      if (CONFIG.hardCover && (n === 1 || n === this.total)) {
        page.dataset.density = 'hard';
        page.classList.add('page--cover');
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'page__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      page.appendChild(canvas);
      this.pageEls.push(page);
      frag.appendChild(page);
    }
    // Even buiten beeld parkeren; StPageFlip verplaatst ze bij mount().
    this.el.flipbook.appendChild(frag);
  }

  /* ── Montage en formaat ─────────────────────────────────────────────── */

  wantPortrait() {
    return window.innerWidth < CONFIG.portraitBreakpoint;
  }

  /** Berekent hoe breed het boek mag zijn binnen de beschikbare ruimte. */
  fit() {
    const box = this.el.stage.getBoundingClientRect();
    const across = this.portrait ? 1 : 2;
    const bookRatio = (this.aspect * across);
    const availW = Math.max(160, box.width - 32);
    const availH = Math.max(160, box.height - 24);
    // Past de hoogte niet, dan is de hoogte de beperkende factor.
    const width = Math.min(availW, availH * bookRatio);
    this.el.book.style.width = Math.floor(Math.max(160, width)) + 'px';
    this.flip?.update();
  }

  mount() {
    this.portrait = this.wantPortrait();

    const pageW = CONFIG.nominalPageWidth;
    const pageH = Math.round(pageW / this.aspect);

    this.flip = new St.PageFlip(this.el.flipbook, {
      width: pageW,
      height: pageH,
      size: 'stretch',
      minWidth: 120,
      maxWidth: 1600,
      minHeight: 240,
      maxHeight: 2400,
      maxShadowOpacity: 0.4,
      showCover: CONFIG.hardCover,
      usePortrait: this.portrait,
      mobileScrollSupport: false,
      flippingTime: CONFIG.flipDuration,
      autoSize: true,
      startPage: this.current - 1,
    });

    this.flip.loadFromHTML(this.pageEls);
    this.flip.on('flip', (e) => this.onFlip(e.data + 1));
    this.fit();
  }

  /** Bij het passeren van de breekpunt-breedte wordt de flipbook herbouwd.
   *  usePortrait staat namelijk vast na initialisatie. */
  remountIfNeeded() {
    if (this.wantPortrait() === this.portrait) return this.fit();

    const at = this.current;
    // Let op: destroy() haalt óók het #flipbook-element zelf weg,
    // dus dat moet er opnieuw in voordat we opnieuw monteren.
    this.flip.destroy();
    const fresh = document.createElement('div');
    fresh.id = 'flipbook';
    fresh.className = 'flipbook';
    this.el.book.appendChild(fresh);
    this.el.flipbook = fresh;

    this.current = at;
    this.mount();
    this.flip.turnToPage(at - 1);
    this.onFlip(at);
  }

  /* ── Navigatie ──────────────────────────────────────────────────────── */

  onFlip(page) {
    this.current = clamp(page, 1, this.total);
    this.el.folioNow.textContent = this.spreadLabel();
    this.updateRibbon();
    this.el.foredge.setAttribute('aria-valuenow', this.current);
    this.el.foredge.setAttribute('aria-valuetext', `pagina ${this.spreadLabel()}`);
    history.replaceState(null, '', `#p=${this.current}`);
    this.renderAround(this.current);
    if (!this.el.reader.hidden) this.renderReader();
  }

  /** Toont "12–13" wanneer twee pagina's naast elkaar staan. */
  spreadLabel() {
    if (this.portrait) return String(this.current);
    const right = this.current + 1;
    return right <= this.total && this.current > 1
      ? `${this.current}–${right}`
      : String(this.current);
  }

  go(page) {
    const target = clamp(Math.round(page), 1, this.total);
    this.flip.turnToPage(target - 1);
    this.onFlip(target);
  }

  next() { this.flip.flipNext(); }
  prev() { this.flip.flipPrev(); }

  pageFromHash() {
    const m = location.hash.match(/p=(\d+)/);
    if (!m) return null;
    return clamp(parseInt(m[1], 10), 1, this.total || 1);
  }

  /* ── Renderen ───────────────────────────────────────────────────────── */

  async renderAround(centre) {
    const from = clamp(centre - CONFIG.prefetch, 1, this.total);
    const to = clamp(centre + CONFIG.prefetch + 1, 1, this.total);
    const jobs = [];
    for (let n = from; n <= to; n++) jobs.push(this.renderPage(n));
    this.sweep();
    await Promise.allSettled(jobs);
  }

  async renderPage(n) {
    if (this.canvases.has(n)) { this.touch(n); return; }
    if (this.tasks.has(n)) return this.tasks.get(n);

    const job = (async () => {
      const el = this.pageEls[n - 1];
      const canvas = el.querySelector('canvas');
      const page = await this.getPageFor(n);

      // Renderen op de werkelijke schermdichtheid, maar niet onbeperkt:
      // 2× is scherp genoeg en scheelt veel geheugen op telefoons.
      const cssWidth = el.clientWidth || CONFIG.nominalPageWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth * dpr) / unit.width });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();

      el.classList.add('page--drawn');
      this.canvases.set(n, canvas);
      this.touch(n);
    })().catch((err) => {
      console.warn(`Pagina ${n} kon niet gerenderd worden:`, err);
    }).finally(() => {
      this.tasks.delete(n);
    });

    this.tasks.set(n, job);
    return job;
  }

  touch(n) {
    const i = this.order.indexOf(n);
    if (i !== -1) this.order.splice(i, 1);
    this.order.push(n);
  }

  /** Gooit de oudste canvassen leeg zodra de cache vol is. */
  sweep() {
    // De teller voorkomt een oneindige lus wanneer cacheSize kleiner is
    // ingesteld dan het aantal pagina's dat sowieso bewaard moet blijven.
    let guard = this.order.length;
    while (this.order.length > CONFIG.cacheSize && guard-- > 0) {
      const n = this.order.shift();
      if (Math.abs(n - this.current) <= CONFIG.prefetch + 1) {
        this.order.push(n);           // te dichtbij, laat staan
        continue;
      }
      const canvas = this.canvases.get(n);
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        this.pageEls[n - 1].classList.remove('page--drawn');
      }
      this.canvases.delete(n);
    }
  }

  /* ── Voorsnede ──────────────────────────────────────────────────────── */

  positionOf(page) {
    return this.total > 1 ? ((page - 1) / (this.total - 1)) * 100 : 0;
  }

  updateRibbon() {
    this.el.ribbon.style.left = this.positionOf(this.current) + '%';
  }

  /* ── Inhoudsopgave uit de PDF-bladwijzers ───────────────────────────── */

  async loadOutline() {
    let raw;
    try { raw = await this.pdf.getOutline(); } catch { return; }
    if (!raw?.length) return;

    const flat = [];
    const walk = (items, depth) => {
      for (const item of items) {
        flat.push({ title: item.title, dest: item.dest, depth });
        if (item.items?.length && depth < 1) walk(item.items, depth + 1);
      }
    };
    walk(raw, 0);

    for (const item of flat) {
      try {
        const dest = typeof item.dest === 'string'
          ? await this.pdf.getDestination(item.dest)
          : item.dest;
        // PDF-paginanummer terugzoeken naar de bijbehorende flipbook-positie.
        const pdfPage = (await this.pdf.getPageIndex(dest[0])) + 1;
        const flip = this.pageMap.findIndex((e) => e.doc === this.pdf && e.page === pdfPage);
        item.page = flip === -1 ? null : flip + 1;
      } catch { item.page = null; }
    }

    // Bladwijzers die naar de waarschuwingspagina zelf wijzen, vallen buiten
    // het boek en horen dus niet in de inhoudsopgave.
    this.outline = flat.filter((i) => i.page);
    if (!this.outline.length) return;

    this.el.tocBtn.hidden = false;
    this.el.toc.innerHTML = '';
    this.el.marks.innerHTML = '';

    for (const item of this.outline) {
      const li = document.createElement('li');
      li.className = `toc__item toc__item--d${item.depth}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toc__link';
      btn.innerHTML =
        `<span class="toc__label"></span><span class="toc__page">${item.page}</span>`;
      btn.querySelector('.toc__label').textContent = item.title;
      btn.addEventListener('click', () => {
        this.go(item.page);
        closePanel('panel-contents');
      });
      li.appendChild(btn);
      this.el.toc.appendChild(li);

      if (item.depth === 0) {
        const mark = document.createElement('span');
        mark.className = 'foredge__mark';
        mark.style.left = this.positionOf(item.page) + '%';
        mark.title = `${item.title} — p. ${item.page}`;
        this.el.marks.appendChild(mark);
      }
    }
  }

  /* ── Zoeken in de volledige tekst ───────────────────────────────────── */

  async buildTextIndex() {
    if (this.textIndex || this.indexing) return;
    this.indexing = true;
    const index = [];
    for (let n = 1; n <= this.total; n++) {
      try {
        const page = await this.getPageFor(n);
        const text = await page.getTextContent();
        index.push(text.items.map((i) => i.str).join(' ').replace(/\s+/g, ' '));
        page.cleanup();
      } catch { index.push(''); }
      if (n % 10 === 0 || n === this.total) {
        this.el.findStatus.textContent = `Tekst inlezen… ${n} van ${this.total}`;
        await new Promise((r) => setTimeout(r, 0));   // hoofdthread vrijgeven
      }
    }
    this.textIndex = index;
    this.indexing = false;
  }

  async search(query) {
    const term = query.trim();
    this.el.hits.innerHTML = '';
    if (term.length < 2) {
      this.el.findStatus.textContent = 'Typ minstens twee tekens.';
      return;
    }
    await this.buildTextIndex();

    const needle = term.toLowerCase();
    const results = [];
    this.textIndex.forEach((text, i) => {
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) return;
      const from = Math.max(0, at - 60);
      results.push({
        page: i + 1,
        before: (from > 0 ? '… ' : '') + text.slice(from, at),
        match: text.slice(at, at + term.length),
        after: text.slice(at + term.length, at + term.length + 80) + ' …',
      });
    });

    this.el.findStatus.textContent = results.length
      ? `${results.length} ${results.length === 1 ? 'pagina' : "pagina's"} met “${term}”.`
      : `Geen resultaten voor “${term}”.`;

    for (const hit of results.slice(0, 100)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hit';
      btn.innerHTML =
        `<span class="hit__page"></span><span class="hit__text">` +
        `<span class="hit__before"></span><mark class="hit__match"></mark>` +
        `<span class="hit__after"></span></span>`;
      btn.querySelector('.hit__page').textContent = hit.page;
      btn.querySelector('.hit__before').textContent = hit.before;
      btn.querySelector('.hit__match').textContent = hit.match;
      btn.querySelector('.hit__after').textContent = hit.after;
      btn.addEventListener('click', () => this.go(hit.page));
      li.appendChild(btn);
      this.el.hits.appendChild(li);
    }
  }

  /* ── Leesweergave ───────────────────────────────────────────────────── */

  openReader() {
    this.el.reader.hidden = false;
    this.renderReader();
    $('reader-close').focus();
  }

  closeReader() {
    this.el.reader.hidden = true;
    $('btn-read').focus();
  }

  async renderReader() {
    // In dubbele weergave is de rechterpagina de meest gelezen pagina.
    const n = this.portrait || this.current === 1
      ? this.current
      : Math.min(this.current + 1, this.total);
    this.el.readerFolio.textContent = `Pagina ${n}`;
    this.readerPage = n;

    const page = await this.getPageFor(n);
    const width = this.el.readerScroll.clientWidth - 32;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const unit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width * 1.6 * dpr) / unit.width });

    const canvas = this.el.readerCanvas;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
  }

  /* ── Waarschuwingspagina (buiten de flipbook) ─────────────────────────── */

  async showWarning() {
    try {
      const page = await this.pdf.getPage(CONFIG.warningPage);
      const canvas = this.el.warningCanvas;
      const width = Math.min(this.el.warningPanel.clientWidth || 480, 640);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * dpr) / unit.width });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
      const ctx = canvas.getContext('2d', { alpha: false });
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
    } catch (err) {
      console.warn('Waarschuwingspagina kon niet gerenderd worden:', err);
    }
    this.el.warning.hidden = false;
    this.el.warningClose.focus();
  }

  closeWarning() {
    this.el.warning.hidden = true;
  }
}

/* ─── Panelen ─────────────────────────────────────────────────────────── */

function openPanel(id) {
  document.querySelectorAll('.panel').forEach((p) => {
    const open = p.id === id;
    p.hidden = !open;
    const trigger = document.querySelector(`[aria-controls="${p.id}"]`);
    trigger?.setAttribute('aria-expanded', String(open));
  });
}

function closePanel(id) {
  const panel = $(id);
  if (!panel) return;
  panel.hidden = true;
  document.querySelector(`[aria-controls="${id}"]`)?.setAttribute('aria-expanded', 'false');
}

function togglePanel(id) {
  $(id).hidden ? openPanel(id) : closePanel(id);
}

/* ─── Opstarten ───────────────────────────────────────────────────────── */

async function start() {
  const fallback = $('fallback');
  try {
    const [pdfjsLib] = await Promise.all([
      import(/* @vite-ignore */ absolute(CONFIG.pdfjs.lib)),
      loadScript(absolute(CONFIG.pageFlip)),
    ]);
    pdfjsLib.GlobalWorkerOptions.workerSrc = absolute(CONFIG.pdfjs.worker);

    const book = new Flipbook(pdfjsLib);
    window.flipbook = book;              // handig bij het debuggen
    await book.boot();
    wire(book);
  } catch (err) {
    console.error(err);
    $('boot').hidden = true;
    fallback.hidden = false;
    fallback.innerHTML =
      `Het boek kon niet geladen worden. ` +
      `<a href="${CONFIG.pdfUrl}" download="${CONFIG.downloadName}">Download de PDF rechtstreeks</a>.`;
  }
}

/* ─── Bediening ───────────────────────────────────────────────────────── */

function wire(book) {
  $('btn-next').addEventListener('click', () => book.next());
  $('btn-prev').addEventListener('click', () => book.prev());
  $('btn-contents').addEventListener('click', () => togglePanel('panel-contents'));
  $('btn-search').addEventListener('click', () => {
    togglePanel('panel-search');
    if (!$('panel-search').hidden) book.el.findInput.focus();
  });
  $('btn-read').addEventListener('click', () => book.openReader());
  $('reader-close').addEventListener('click', () => book.closeReader());
  $('reader-next').addEventListener('click', () => book.next());
  $('reader-prev').addEventListener('click', () => book.prev());

  $('warning-close').addEventListener('click', () => book.closeWarning());
  book.el.warning.addEventListener('click', (e) => {
    if (e.target === book.el.warning) book.closeWarning();
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closePanel(btn.dataset.close));
  });

  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('app').requestFullscreen?.();
  });

  /* Zoeken met een korte pauze, zodat niet elke toetsaanslag zoekt. */
  let timer;
  book.el.findInput.addEventListener('input', (e) => {
    clearTimeout(timer);
    const value = e.target.value;
    timer = setTimeout(() => book.search(value), 250);
  });

  /* Voorsnede: slepen toont een voorbeeld, loslaten springt. */
  const edge = book.el.foredge;
  const pageAt = (clientX) => {
    const rect = edge.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(1 + ratio * (book.total - 1));
  };
  const preview = (page, clientX) => {
    const rect = edge.getBoundingClientRect();
    book.el.hint.textContent = page;
    book.el.hint.style.left = clamp(clientX - rect.left, 20, rect.width - 20) + 'px';
    book.el.ribbon.style.left = book.positionOf(page) + '%';
  };

  let dragging = false;
  edge.addEventListener('pointerdown', (e) => {
    dragging = true;
    edge.setPointerCapture(e.pointerId);
    edge.classList.add('is-dragging');
    preview(pageAt(e.clientX), e.clientX);
  });
  edge.addEventListener('pointermove', (e) => {
    if (dragging) preview(pageAt(e.clientX), e.clientX);
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    edge.classList.remove('is-dragging');
    book.go(pageAt(e.clientX));
  };
  edge.addEventListener('pointerup', release);
  edge.addEventListener('pointercancel', () => {
    dragging = false;
    edge.classList.remove('is-dragging');
    book.updateRibbon();
  });

  edge.addEventListener('keydown', (e) => {
    const jump = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (jump) { e.preventDefault(); book.go(book.current + jump); }
    if (e.key === 'Home') { e.preventDefault(); book.go(1); }
    if (e.key === 'End') { e.preventDefault(); book.go(book.total); }
  });

  /* Sneltoetsen */
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (!book.el.warning.hidden && e.key !== 'Escape') return;
    switch (e.key) {
      case 'ArrowRight': case ' ': e.preventDefault(); book.next(); break;
      case 'ArrowLeft': e.preventDefault(); book.prev(); break;
      case 'Home': e.preventDefault(); book.go(1); break;
      case 'End': e.preventDefault(); book.go(book.total); break;
      case 'f': case 'F': $('btn-full').click(); break;
      case 'l': case 'L':
        book.el.reader.hidden ? book.openReader() : book.closeReader(); break;
      case '/':
        e.preventDefault(); openPanel('panel-search'); book.el.findInput.focus(); break;
      case 'Escape':
        if (!book.el.warning.hidden) book.closeWarning();
        else if (!book.el.reader.hidden) book.closeReader();
        else document.querySelectorAll('.panel').forEach((p) => (p.hidden = true));
        break;
    }
  });

  /* Formaat bijwerken, maar niet bij elke pixel */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => book.remountIfNeeded(), 150);
  });

  window.addEventListener('hashchange', () => {
    const page = book.pageFromHash();
    if (page && page !== book.current) book.go(page);
  });
}

start();
