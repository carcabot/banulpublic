# Lucrul în acest repo

Fișierul este indexul pentru agenți: ce e proiectul, comenzile, regulile. Mecanica și istoricul
stau în `README.md` și în `docs/`. `CLAUDE.md` conține doar `@AGENTS.md`.

## Proiect

Banul public: comparator de prețuri pe bucată și semnale de risc din achizițiile publice
românești (SEAP, data.gov.ro, ANAF). Un pipeline Python scrie `data/integritate.db`, apoi
`site/pregateste.py` construiește `data/site.db`, pe care îl servește `web/server.ts` (Bun, SSR,
fără dependențe). Același server expune datele și prin MCP la `/mcp/server`.

Limba: română pentru interfață, comentarii, documentație și denumirile din cod. Asistentul
răspunde în română.

## Comenzi

```sh
./ruleaza.sh                              # rulare zilnică incrementală, apoi repornește serverul
python3 site/pregateste.py                # reface data/site.db din data/integritate.db (circa 5 s)
bun web/server.ts                         # server pe PORT (implicit 3210); verifică întâi că portul e liber
bun web/smoke.ts http://localhost:3210    # test de fum, doar citire, pe un server pornit sau publicat
python3 validare/esantion.py S3 S7        # eșantion pentru validarea manuală a semnalelor
scripts/publica.sh [--apply]              # publică web/ și site.db pe serverul din .env; fără --apply e doar probă
```

Nu opri serverul altcuiva. Pentru verificări pornește o instanță proprie pe alt port
(`PORT=3299 bun web/server.ts`) și oprește-o la final.

## Porți

După orice schimbare de cod și înainte de a spune că e gata:

- sintaxă Python: `python3 -m compileall -q common.py ingest transform detect site validare`
- sintaxă și importuri TypeScript: `bun build web/server.ts --target=bun --outdir "$TMPDIR/radar-build"`
- test de fum: `bun web/smoke.ts <adresa instanței tale>`, cu zero verificări picate

Testul de fum are nevoie de `data/site.db`, deci rulează local, nu în CI. O verificare nerulată
se raportează ca sărită.

## Reguli

- Un semnal este un indicator de verificat, nu o acuzație. Orice text nou despre un semnal, pe
  site sau în MCP, păstrează formularea asta. Vezi `/metoda` și `docs/decisions.md`.
- SEAP blochează la trafic mare: un singur flux, pauza din `common.PAUSE`, oprire la 403. Nu
  paraleliza cererile către SEAP.
- Serverul web doar citește `data/site.db`. Tot ce e lent se calculează în `site/pregateste.py`.
- `web/` rămâne fără dependențe: fără `package.json`, fără framework. Vezi `docs/decisions.md`.
- O pagină nouă își declară titlul, descrierea, adresa canonică și dacă e indexabilă (`Seo` în
  `web/server.ts`), intră în sitemap dacă e indexabilă și primește o verificare în `web/smoke.ts`.
- O unealtă MCP nouă sau schimbată se actualizează în același pas în `web/mcp.ts`
  (`MCP_TOOLS_DOC` inclus), `docs/mcp.md` și `web/smoke.ts`.
- O variabilă de mediu nouă intră și în `.env.example` și în `docs/runbook.md`.
- O listă nouă are pagini de mărime fixă și adâncime maximă, ca `/semnale`. Nicio pagină și nicio
  unealtă MCP nu întoarce un tabel întreg.
- O comandă, un flag sau un pas de recuperare nou sau schimbat actualizează `docs/runbook.md`
  în aceeași schimbare.

## Publicare

Publicarea pe server se face doar la cererea proprietarului, cu `scripts/publica.sh --apply`, după
ce schimbarea a fost verificată local. Ținta stă în `.env`; nu scrie gazda, portul sau contul în
vreun fișier versionat. Pe server nu atinge alte servicii, alte vhost-uri sau alte containere.
Pașii sunt în `docs/runbook.md`, regulile de securitate în `SECURITY.md`.

## Commit-uri și versiuni

Commit, push și merge doar la cererea proprietarului, în conversația curentă.
Conventional Commits: `feat|fix|chore|docs(scope): rezumat`. Din ele `release-please`
construiește versiunea și `CHANGELOG.md`, deci tipul se alege după ce înseamnă schimbarea
pentru un utilizator. Nu edita de mână `CHANGELOG.md`, `version.txt` sau
`.release-please-manifest.json`.

## Secrete

Secretele stau în `.env`, care nu se versionează. `.env.example` ține doar numele. Nu afișa,
nu loga și nu comite un secret. Adresa proxy-ului SEAP conține o parolă.

## Curățenie

La finalul unei rulări oprește serverele pornite de tine și spune în rezumat ce ai oprit.
