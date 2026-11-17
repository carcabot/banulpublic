# Decizii

Fiecare decizie de proiectare, datată, în schimbarea care o ia.

## 2026-11-17: tiparele din monitorul.ai și monitorul-ii, adaptate

Am preluat tipare, nu cod. `monitorul.ai` este Next.js pe Vercel peste Elasticsearch, iar
proiectul de față este un proces Bun peste un fișier SQLite.

- SEO: titlu, descriere și adresă canonică pe fiecare pagină, JSON-LD pe paginile de entitate,
  `robots.txt`, sitemap împărțit pe felul paginii. Ca acolo, paginile de căutare și filtrele sunt
  `noindex,follow` și nu sunt blocate în `robots.txt`, altfel roboții nu pot citi eticheta.
- Sitemap: aici există un index real la `/sitemap.xml`. Acolo Next.js nu îl generează, de aceea
  fiecare fișier este anunțat separat în `robots.txt`.
- `lastmod` pentru o fișă este data ultimului contract, singura dată la care conținutul fișei
  se schimbă cu adevărat.
- MCP: unelte subțiri peste aceleași interogări ca paginile, o unealtă `describe_data`, răspunsuri
  scurte cu adresă, descrieri în română.
- MCP fără OAuth. Acolo fiecare apel are un utilizator Google, prin Better Auth și Postgres. Aici
  nu există conturi, datele sunt publice și serverul doar citește, deci limita este pe IP.
  Se revine asupra deciziei dacă apare abuz sau nevoia de atribuire pe utilizator.
- MCP scris de mână, fără SDK. `web/` nu are `package.json`, iar un server fără stare are nevoie
  doar de cinci metode JSON-RPC. Dacă apar resurse, prompturi sau fluxuri SSE, se trece la SDK.
- Limita de cereri ține numărătoarea în memorie, nu în Redis. Serverul este un singur proces.
- Versiuni: `release-please` cu Conventional Commits, ca în ambele repo-uri, tip `simple`
  (`version.txt`), fiindcă proiectul nu are `package.json` sau `pyproject.toml`.

## 2026-11-17: neschimbat deocamdată

- Fără imagine Open Graph. Platformele cer PNG, iar generarea ei cere o dependență.
- Fără `uv`, `ruff` și `pytest`, ca în monitorul-ii. Formatarea automată ar rescrie tot codul
  Python existent, deci decizia este a proprietarului.

## 2026-11-17: găzduire pe server propriu, în container

- Doar site-ul merge pe server. Pipeline-ul rămâne pe mașina operatorului, fiindcă are nevoie de
  proxy-ul SEAP, de `claude -p` și de baza de 1,7 GB. Pe server ajunge doar `data/site.db`.
- Serverul web rulează în container podman, nu ca proces nativ. Containerul îl izolează de
  celelalte aplicații de pe mașină și se mută ușor pe alt server.
- Datele nu intră în imagine. `data/` se montează doar pentru citire, deci un `site.db` nou cere
  o repornire, nu o imagine nouă.
- Vercel, folosit de monitorul.ai, nu se potrivește: procesul ține deschisă o bază SQLite de
  140 MB, iar acolo datele stau într-un Elasticsearch separat.
- Ținta de publicare (gazdă, port, cont) stă doar în `.env`, nu în repo. Publicarea se face de
  mână, cu cheia SSH a operatorului. Nu există publicare din CI și nici secrete de server în GitHub.

## 2026-11-17: achiziții directe și semnalele S14–S16

- Sursa este data.gov.ro, resursele „Achiziții directe” din seturile anuale, 2023 încoace.
- În `site.db` intră doar agregate (totaluri, primii 12 parteneri, totaluri pe ani), nu rândurile.
- Pragurile sunt cele din Legea 98/2016 art. 7 alin. 5: 270.120 lei pentru produse și servicii,
  900.400 lei pentru lucrări. Lucrările se recunosc după tipul contractului sau după CPV 45.
- Scoase din calcul: utilitățile, carburanții, poșta și telecomunicațiile, serviciile din anexa 2
  a legii, valorile de peste 5 milioane de lei (erori de introducere) și cumpărătorii care nu sunt
  autorități în sensul Legii 98 (firme, asociații, societăți de utilități).
- Lăsate deoparte din skill-ul anticoruptie-uat: achizițiile încheiate în câteva minute (E1) și
  cele din weekend (X0). Dau prea multe alarme false fără documentele achiziției.
- Numărul unei achiziții directe nu este identificatorul paginii ei din SEAP, deci semnalele arată
  numărul, fără link.

## 2026-11-17: site pentru cititori, nu pentru roboți

- Limită de cereri pe IP pentru pagini și, separat, pentru MCP, pe minut și pe oră.
- Paginare cu adâncime maximă de 40 de pagini și căutare plafonată la 60 de rezultate.
- Prima pagină alege la întâmplare exemplele de căutare la fiecare afișare.
- Sumele se pot afișa în euro, la cursul BNR din ziua în care s-a construit `site.db`. Este o
  conversie orientativă: toate sumele folosesc același curs, indiferent de data contractului.

## 2026-11-17: variante de produs

- O categorie ca „autobuz electric” amestecă produse diferite. Varianta (lungime, locuri, motorizare,
  putere) și conținutul contractului (stații de încărcare, ITS, service) se deduc din textul anunțului,
  cu expresii regulate, în `transform/clustere.py`.
- Un preț se compară cu mediana variantei lui dacă varianta are cel puțin patru contracte. Altfel,
  cu mediana categoriei doar la produsele omogene. În rest apare „fără reper”.
- Unde textul anunțului nu spune varianta, contractul rămâne „nespecificat” și nu intră în nicio
  comparație. La autobuze asta înseamnă 14 din 26 de contracte. Completarea lor cere documentația
  de atribuire sau un pas AI pe textul întreg al anunțului, nefăcut încă.

## 2026-11-17: design

- Paletă verde-cerneală pe hârtie rece, chihlimbar doar pentru semnale, titluri în serif de sistem.
  Fără fonturi sau resurse din afară; politica de securitate a paginii le interzice.
- Machetele de lucru sunt în `docs/design/`: `schita.html` (toate paginile) și `cauta.html`
  (pagina de căutare). Pagina de căutare urmează macheta ei.
