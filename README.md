# Proefschrift-flipbook

Een statische site die je proefschrift-PDF laat doorbladeren als een echt boek.
Geen build-stap, geen framework, geen server: HTML, CSS en één JavaScript-module.

- **pdf.js** rendert elke pagina naar een `<canvas>`
- **StPageFlip** verzorgt het omslaan (muis, touch, toetsenbord)
- Pagina's worden **lui gerenderd** in een venster rond je positie, dus een
  proefschrift van 300 bladzijden loopt niet vast op een telefoon
- Inhoudsopgave uit de PDF-bladwijzers, zoeken in de volledige tekst,
  deelbare links per pagina (`#p=142`), vergrote leesweergave

---

## 1. Snel starten

1. Klik op **Use this template** → **Create a new repository**
   (of maak een lege repo en kopieer deze bestanden erin).
2. Zet je PDF in `pdf/` als `proefschrift.pdf`.
3. Pas `assets/js/config.js` aan: titel, auteur, instelling, bestandsnaam.
4. Pas in `index.html` de vier regels boven `<!-- Pas deze vier regels aan -->`
   aan — dat zijn de titel en de deelvoorvertoning voor LinkedIn en Bluesky.
5. Commit en push naar `main`. Ga daarna naar **Settings → Pages** en zet
   **Source** op **GitHub Actions**.

Binnen een minuut of twee staat je boek op
`https://<gebruikersnaam>.github.io/<repo>/`.

## 2. Lokaal bekijken

Openen met dubbelklik werkt **niet**: browsers blokkeren ES-modules en
web workers op `file://`. Start een miniserver:

```bash
python3 -m http.server 8000
# of: npx serve .
```

Dan naar <http://localhost:8000>.

---

## 3. GitHub Pages: twee routes

Er zijn twee manieren om te publiceren, en de keuze heeft gevolgen.

| | **Deploy from a branch** | **GitHub Actions** (in deze repo) |
|---|---|---|
| Instellen | Settings → Pages → Source: `main` | Settings → Pages → Source: GitHub Actions |
| Werkt met Git LFS | **Nee** — bezoekers krijgen het pointerbestand | Ja, de workflow haalt LFS op |
| Controle vooraf | Geen | Ja: faalt als de PDF ontbreekt of nog een pointer is |
| Jekyll draait | Ja (vandaar `.nojekyll`) | Nee |

De meegeleverde `.github/workflows/deploy.yml` doet het volgende:

- draait bij elke push naar `main`, en handmatig via **Actions → Run workflow**;
- checkt de repo uit **met `lfs: true`** en draait `git lfs pull`;
- leest `pdfUrl` uit `config.js` en controleert of dat bestand er echt is,
  geen LFS-pointer is, en waarschuwt boven 100 MB;
- pakt de hele repo in met `upload-pages-artifact` en publiceert met
  `deploy-pages`.

De `permissions:`-blokken zijn geen ceremonie. `pages: write` en
`id-token: write` zijn allebei verplicht: de deploy-actie bewijst met een
kortlevend OIDC-token dat hij namens deze repo publiceert. Zonder
`id-token: write` faalt de deploy met een weinig zeggende foutmelding.

**Eerste keer:** de eerste run vraagt om goedkeuring van de omgeving
`github-pages`. Dat gebeurt automatisch bij publieke repo's; bij een privé-repo
onder een gratis account is Pages uitgeschakeld — maak de repo publiek of
gebruik een betaald plan.

---

## 4. Git LFS: alleen als het moet

**Onder ~50 MB: niet doen.** Gewone Git is simpeler en de repo blijft klonebaar
zonder extra gereedschap.

**Boven ~50 MB:** GitHub waarschuwt bij 50 MB en **weigert bestanden boven
100 MB** in een gewone commit. Dan is LFS de weg:

```bash
git lfs install
# haal de laatste regel in .gitattributes uit commentaar, dus:
#   *.pdf filter=lfs diff=lfs merge=lfs -text
git add .gitattributes
git add pdf/proefschrift.pdf
git commit -m "Proefschrift toevoegen via LFS"
git push
```

Doe dit **voordat** je de PDF voor het eerst commit. Achteraf overzetten
vereist `git lfs migrate import --include="*.pdf"` plus een force-push, en dat
herschrijft de geschiedenis.

Quota bij een gratis account: **1 GB opslag en 1 GB verkeer per maand**.
Dat verkeer telt alleen voor `git clone`/`pull`, niet voor bezoekers van je
Pages-site — die krijgen het bestand van de Pages-server. Extra ruimte koop je
in blokken van 50 GB via Settings → Billing.

## 5. De PDF kleiner maken

Een proefschrift van 120 MB is meestal een proefschrift met ongecomprimeerde
figuren. Ghostscript lost dat op:

```bash
# 300 dpi — veilig voor een proefschrift met figuren en formules
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.7 -dPDFSETTINGS=/printer \
   -dNOPAUSE -dQUIET -dBATCH -sOutputFile=proefschrift-web.pdf proefschrift.pdf
```

Gebruik `/ebook` (150 dpi) alleen als je figuren dat verdragen — controleer
altijd een grafiek en een foto voordat je het resultaat publiceert.

Daarna één stap die veel scheelt bij het openen:

```bash
qpdf --linearize proefschrift-web.pdf proefschrift.pdf
```

Een gelineariseerde PDF ("fast web view") zet de eerste pagina vooraan in het
bestand. GitHub Pages ondersteunt HTTP range-requests, dus pdf.js kan dan de
eerste bladzijde tonen terwijl de rest nog binnenkomt — precies wat je wilt bij
een bestand van tientallen megabytes.

## 6. De PDF elders hosten

Wil je de PDF buiten de repo houden, zet dan een volledige URL in `pdfUrl`.
De voorwaarde is dat die server **CORS toestaat** (`Access-Control-Allow-Origin`)
én bij voorkeur range-requests. Zonder CORS-header weigert de browser het
bestand en zie je de terugvalmelding met de downloadlink.

Werkt in de praktijk goed: Zenodo, een universitair repository met CORS,
S3/R2 met een CORS-regel. Werkt vaak níét: SURFdrive- en Google Drive-links,
die serveren een HTML-pagina in plaats van het bestand.

---

## 7. Andere GitHub-integraties die hier zinnig zijn

### Zenodo — een DOI voor je proefschrift

Log in op [zenodo.org](https://zenodo.org) met je GitHub-account, ga naar
**Account → GitHub**, en zet de schakelaar om bij deze repo. Maak daarna een
**Release** op GitHub (Releases → Draft a new release, tag bijvoorbeeld `v1.0`).
Zenodo archiveert die release automatisch en kent er een DOI aan toe. Je krijgt
zowel een DOI per versie als een "concept-DOI" die altijd naar de nieuwste wijst.

Let op: Zenodo archiveert de **repo-zip**. Staat je PDF via LFS in de repo, dan
zit in die zip alleen de pointer. Upload de PDF in dat geval apart als extra
bestand bij de Zenodo-record.

### CITATION.cff — de knop "Cite this repository"

Zet dit in de repo-root en GitHub toont rechtsboven een citeerknop:

```yaml
cff-version: 1.2.0
title: "Titel van het proefschrift"
message: "Gebruik onderstaande gegevens bij verwijzing."
type: thesis
authors:
  - family-names: Achternaam
    given-names: Voornaam
    orcid: "https://orcid.org/0000-0000-0000-0000"
year: 2026
institution:
  name: Erasmus Universiteit Rotterdam
url: "https://<gebruikersnaam>.github.io/<repo>/"
```

### Eigen domein

Een `CNAME`-bestand in de root met bijvoorbeeld `proefschrift.jouwnaam.nl`,
plus bij je DNS-provider een CNAME-record naar `<gebruikersnaam>.github.io`.
Zet daarna in Settings → Pages **Enforce HTTPS** aan; het certificaat regelt
GitHub zelf, wat een half uur kan duren.

Gebruik je een apex-domein (`jouwnaam.nl` zonder subdomein), dan heb je
A-records naar GitHub's vier Pages-adressen nodig — die staan in de
[Pages-documentatie](https://docs.github.com/pages).

### Dependabot

Niet van toepassing: er is geen `package.json`. De twee bibliotheken zitten met
een vastgezette versie in `config.js`. Actief bijwerken is een kwestie van dat
versienummer aanpassen en testen — en bij een proefschrift is *niet* bijwerken
vaak de betere keuze, want een pagina die vandaag goed rendert, rendert dan
over vijf jaar nog steeds hetzelfde. Om dezelfde reden is `scripts/vendor.sh`
meegeleverd: die haalt beide bibliotheken de repo in.

### Een voorvertoning voor sociale media

```bash
pdftoppm -png -r 100 -f 1 -l 1 -singlefile pdf/proefschrift.pdf assets/cover
```

Dat maakt `assets/cover.png` uit de eerste pagina — precies het bestand waar de
`og:image` in `index.html` naar wijst.

---

## 8. Bediening

| Toets | Doet |
|---|---|
| `→` / spatie | volgende pagina |
| `←` | vorige pagina |
| `Home` / `End` | eerste / laatste pagina |
| `/` | zoeken |
| `L` | vergrote leesweergave |
| `F` | volledig scherm |
| `Esc` | paneel of leesweergave sluiten |

De balk onderin is de voorsnede van het boekblok: sleep eroverheen om te
bladeren. De streepjes erin zijn de hoofdstukken uit je PDF-bladwijzers.

## 9. Aanpassen

**Kleuren en lettertypen** staan bovenaan `assets/css/flipbook.css` in
`:root`. De vormgeving gebruikt precies één accentkleur (`--foil`, messing) en
alleen voor de plek waar de lezer is.

**Gedrag** staat in `assets/js/config.js`. Hapert het op een oude telefoon,
verlaag dan `cacheSize` naar 12 en `nominalPageWidth` naar 480.

**Geen harde kaft?** Zet `hardCover: false` als je PDF niet met een
omslagpagina begint.

## 10. Toegankelijkheid

Een canvas-flipbook heeft geen selecteerbare tekstlaag. Dat is een reële
beperking, en daarom is de knop **PDF** rechtsboven geen bijzaak: dat is de
route voor schermlezers, voor citeren en voor printen. Laat die knop staan.

Wel geregeld: zichtbare focus, bediening met het toetsenbord, de voorsnede als
ARIA-slider, `prefers-reduced-motion`, en een `aria-live`-melding van de
paginanummers.

## 11. Licenties

De code in deze repo: MIT — doe ermee wat je wilt.
[pdf.js](https://github.com/mozilla/pdf.js) is Apache-2.0,
[StPageFlip](https://github.com/Nodlik/StPageFlip) is MIT. Host je ze lokaal
via `scripts/vendor.sh`, dan komen hun licentiebestanden mee.

Het proefschrift zelf blijft natuurlijk van jou. Controleer wel even of je
uitgever of de universiteitsbibliotheek afspraken heeft over online publicatie
voordat je de link rondstuurt.
