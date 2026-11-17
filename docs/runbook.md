# Runbook

## Rulare zilnică

```sh
./ruleaza.sh
```

Rulează pașii din `README.md` în ordine, incremental, scrie în `logs/`, reface `data/site.db`,
repornește serverul web și rulează testul de fum pe el. Rezultatul testului este ultima linie
din `logs/smoke.log`.

SEAP răspunde 403 la trafic mare. Jobul se oprește singur și reia la rularea următoare. Nu
porni două rulări în paralel.

## Server web

```sh
bun web/server.ts
```

| Variabilă | Implicit | Rol |
|---|---|---|
| `PORT` | `3210` | portul de ascultare |
| `SITE_URL` | `http://localhost:PORT` | adresa publică din canonical, sitemap, robots.txt, JSON-LD și MCP |
| `TRUST_PROXY` | gol | `1` când serverul stă în spatele unui proxy de încredere |
| `MCP_RATE_PER_MIN` | `90` | cereri MCP pe minut de la aceeași adresă IP |
| `MCP_RATE_PER_HOUR` | `1200` | cereri MCP pe oră de la aceeași adresă IP |
| `PAGE_RATE_PER_MIN` | `120` | pagini pe minut de la aceeași adresă IP; o căutare contează cât trei |
| `PAGE_RATE_PER_HOUR` | `1500` | pagini pe oră de la aceeași adresă IP |

Bun încarcă `.env` din directorul de lucru, deci serverul se pornește din rădăcina repo-ului.
Serverul citește `data/site.db` la pornire. După `python3 site/pregateste.py` trebuie repornit.

Adrese de serviciu: `/healthz` (stare și data datelor), `/robots.txt`, `/sitemap.xml`,
`/sitemap/<fișier>.xml`, `/mcp` (pagina), `/mcp/server` (punctul MCP, doar POST).

## Limite și paginare

Site-ul este făcut pentru cititori, nu pentru descărcare în masă.

- Fiecare adresă IP are un număr de cereri pe minut și pe oră (tabelul de mai sus). La depășire
  răspunsul este 429 cu `Retry-After`. Sitemap-ul, `robots.txt`, iconița și `/healthz` nu se numără.
- Listele au pagini de mărime fixă, numerotate de la 1 (`?pagina=`), și o adâncime maximă de 40
  de pagini. Dincolo de ea cititorul restrânge filtrele. O pagină în afara intervalului este 404.
- Căutarea întoarce cel mult 60 de rezultate, fără paginare.
- MCP are aceleași plafoane: cel mult 40 de pagini pe listă și un contor propriu de cereri.
- Fișele de autoritate și firmă arată primele rânduri din fiecare listă, nu tot istoricul.
- Limitele se țin în memoria procesului. O protecție suplimentară la nivel de rețea (de exemplu
  regulile de limitare din Cloudflare) se configurează separat, în contul proxy-ului.

## Verificare

```sh
bun web/smoke.ts                       # http://localhost:3210
bun web/smoke.ts https://<domeniu>     # instanța publicată
```

Doar citire. Verifică paginile, etichetele SEO, sitemap-ul și fiecare unealtă MCP. Iese cu 1
dacă pică ceva și numește verificarea. Face circa 50 de cereri MCP, deci cu
`MCP_RATE_PER_MIN` sub 60 pică pe limită.

## Publicare

Site-ul public rulează pe un server propriu, într-un container. Pipeline-ul rămâne pe mașina
operatorului. Pe server ajung doar `web/` și `data/site.db`.

Ținta de publicare nu este în repo. Se pune în `.env`, care nu se versionează:

```sh
PUBLICA_HOST=utilizator@gazda     # contul SSH de pe server
PUBLICA_PORT=22                   # portul SSH
PUBLICA_URL=https://exemplu.ro    # adresa publică, pentru testul de fum de la final
```

```sh
scripts/publica.sh            # probă: arată ce ar trimite
scripts/publica.sh --apply    # trimite, reconstruiește imaginea, repornește, rulează testul de fum
```

Scriptul trimite fișierele cu `rsync` în `/opt/integritate` (sau `PUBLICA_DEST`), rulează
`podman build`, repornește serviciul `integritate`, așteaptă `/healthz`, rulează testul de fum în
container și apoi din afară. Folosește cheia SSH a celui care îl rulează. Fără acea cheie nu
poate face nimic, deci un contributor nu poate ajunge la server prin el.

Pregătirea serverului, o singură dată:

| Ce | Unde pe server | Modelul din repo |
|---|---|---|
| cod și date | `/opt/integritate` (`web/`, `data/site.db`, `Dockerfile`) | `scripts/publica.sh` |
| imagine | `localhost/integritate:latest` | `Dockerfile` |
| serviciu | `/etc/systemd/system/integritate.service` | `deploy/integritate.service` |
| variabile | `/etc/integritate.env` (root, 0600) | `deploy/integritate.env.example` |
| proxy | un vhost Apache, Caddy sau nginx cu TLS | `deploy/vhost.conf.example` |

Containerul ascultă doar pe `127.0.0.1:3210`, rulează ca utilizator fără drepturi, are sistemul de
fișiere doar pentru citire, nicio capabilitate și vede `data/` doar pentru citire. Proxy-ul îl
scoate la lume. Vezi `SECURITY.md`.

Comenzi pe server:

```sh
systemctl status integritate
sudo journalctl -u integritate -n 50
sudo systemctl restart integritate
sudo podman exec integritate bun web/smoke.ts http://localhost:3210
```

O schimbare în `deploy/` nu se aplică singură. Fișierul se copiază de mână la locul lui, apoi
`sudo systemctl daemon-reload && sudo systemctl restart integritate` pentru serviciu, respectiv
verificarea configurației și reîncărcarea proxy-ului.

TLS: fie certificat pe server (de exemplu `certbot`), fie un proxy ca Cloudflare în față. Modelul de
vhost trimite pe https cererile venite pe http, după antetul `X-Forwarded-Proto`. Cu
`TRUST_PROXY=1`, aplicația ia adresa clientului din ultima valoare din `X-Forwarded-For`.

Pentru indexare: trimite `https://<domeniu>/sitemap.xml` în Google Search Console și în Bing
Webmaster Tools.

## Versiuni

La fiecare push pe `main`, `release-please` deschide sau actualizează un PR de versiune cu
`CHANGELOG.md`, `version.txt` și versiunea din `web/mcp.ts`. Merge-ul acelui PR creează
tag-ul și release-ul pe GitHub. Are nevoie de repo pe GitHub și de Conventional Commits.

## Recuperare

- Serverul nu pornește după o rulare: `tail logs/web.log`. Dacă `data/site.db` lipsește sau e
  stricat, rulează `python3 site/pregateste.py` și repornește.
- Testul de fum pică pe „sitemap acoperă autoritățile și firmele”: `site.db` a fost înlocuit
  fără repornirea serverului.
- 429 la MCP pentru toți clienții: serverul e în spatele unui proxy fără `TRUST_PROXY=1`.
- Publicarea a stricat site-ul: imaginea veche nu se păstrează. Întoarce `web/` la versiunea bună
  și rulează din nou `scripts/publica.sh --apply`.
