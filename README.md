# Banul public

Site și server MCP despre achizițiile publice din România: cine cumpără, de la cine și la ce preț pe bucată, cu semnale de
risc calculate din surse publice (SEAP, data.gov.ro, ANAF). Rulează la https://banulpublic.com.

Fiecare semnal este un indicator de verificat, nu o acuzație. Fiecare cifră are sursa lângă ea.

Un pipeline Python strânge datele în `data/integritate.db`, `site/pregateste.py` construiește din ele `data/site.db`, iar
`web/server.ts` (Bun, fără dependențe) servește paginile și serverul MCP. Cum contribui: `CONTRIBUTING.md`. Securitate: `SECURITY.md`. Licență: AGPL-3.0, vezi `LICENSE`.

## Flux
| Pas | Script | Ce face | AI |
|---|---|---|---|
| 1 | `ingest/seap_list.py` | lista națională a anunțurilor de atribuire, pe ferestre de 3 zile → `anunturi` | nu |
| 2 | `ingest/seap_detail.py` | loturi + contracte + câștigători pentru anunțurile din clusterele de produs → `detalii` | nu |
| 3 | `ingest/datagov.py` | contracte, modificări, negocieri fără anunț (2023+) → `contracte`, `dg_*` | nu |
| 3b | `ingest/directe.py` | toate achizițiile directe din SEAP (data.gov.ro, 2023+), cu furnizor și CUI → `da` | nu |
| 4 | `ingest/anaf.py` | data înființării / stare / sediu pentru câștigători → `firme` | nu |
| 5 | `transform/linii_pret.py` | încadrare în cluster + cantitate (regex) → `linii_pret` | nu |
| 6 | `transform/ai_cantitati.py` | doar liniile ambigue, o singură dată, Haiku prin `claude -p`; cache în `ai_cantitati` | model mic |
| 7 | `detect/semnale.py` | S1–S13 → `semnale` | nu |
| 8 | `site/pregateste.py` | baza de servire `data/site.db`, doar pentru citire | nu |

`./ruleaza.sh` le rulează pe toate, incremental. Baza: `data/integritate.db` (SQLite).

## Semnale
S1 preț unitar peste mediană · S2 preț/valoare identică la autorități diferite · S3 piață dominată de un furnizor · S4 firmă dependentă de o autoritate ·
S5 firmă nou-înființată cu contracte mari · S6 firmă inactivă/radiată · S7 majorări prin acte adiționale · S8 atribuiri repetate fără anunț ·
S9 anulări repetate · S10 asociere cu partener care nu câștigă singur · S11 câștigători cu același sediu · S12 dispersie de preț la același furnizor · S13 contract la valoarea estimată.
Din achizițiile directe (`detect/semnale_da.py`, coduri din ghidul Corpului de Control al Prim-Ministrului): S14 achiziții directe repetate care trec împreună de prag (fragmentare, A2) · S15 achiziții directe peste pragul legal (A3) · S16 un furnizor domină achizițiile directe ale autorității (E14).

## Lecții
- SEAP blochează (HTTP 403) după ~25 min la 2–3 cereri/s pe două fluxuri. Un singur flux, ≥1,5 s pauză, plafon zilnic; jobul se oprește la 403.
- ANAF resetează conexiunile `urllib`; se folosește `curl`.
- data.gov nu are titlu/cantitate → prețul unitar cere detaliul anunțului din SEAP.
- Clusterele de produs sunt în `transform/clustere.py` (cuvinte-cheie + interval de preț plauzibil care respinge extragerile greșite).

## De făcut
Completare detalii (≈1.150 anunțuri pe cuvinte-cheie + cele doar pe CPV) · anunțurile 28.08–azi · achiziții directe (data.gov „directe”: fragmentare, praguri) ·
rotația câștigătorilor · legătura cu decidenții (e-MOL, ANI) · API + căutare server-side când datele depășesc un fișier static.

## Validare
`validare/RAPORT_2026-11-17.md` – precizia măsurată pe eșantioane și corecțiile aplicate. `python3 validare/esantion.py S3 S7` reface eșantionul.

## Site (MVP)
`python3 site/pregateste.py` construiește `data/site.db` (≈140 MB, doar citire, cu index de căutare FTS5) în ~5 s.
`bun web/server.ts` pornește serverul pe http://localhost:3210 (fără dependențe; pagini randate pe server în <10 ms).
Pagini: `/` (căutare, hartă schematică pe județe, semnale de top) · `/cauta` · `/autoritate/<CUI>` · `/firma/<CUI>` · `/produs/<id>` · `/preturi` ·
`/semnale?tip=&judet=&nivel=&q=` · `/judet/<nume>` · `/harta` · `/metoda` · `/api/cauta?q=` (autocompletare).

SEO: fiecare pagină are titlu, descriere, adresă canonică și JSON-LD; `/robots.txt` și `/sitemap.xml` (index plus fișiere pe felul paginii) se generează din `site.db`.
Adresa publică vine din `SITE_URL` (vezi `.env.example`). Căutarea și filtrele sunt `noindex`.

Variante de produs: `transform/clustere.py` deduce din textul anunțului varianta (autobuz de 18 m sau de 8 m, microbuz 16+1 locuri) și ce mai cuprinde contractul (stații de încărcare, ITS, service). Prețul se compară doar în interiorul aceleiași variante; unde textul nu spune varianta, contractul apare „fără reper”.
Sumele se pot afișa și în euro (butonul din antet sau `?moneda=eur`), la cursul BNR din ziua construirii `site.db`. Limitele pentru roboți și paginarea sunt descrise în `docs/runbook.md`.

MCP: `/mcp/server` expune aceleași date asistenților AI, doar pentru citire, prin 9 unelte (`web/mcp.ts`); pagina `/mcp` explică conectarea. Contractul este în `docs/mcp.md`.

Verificare: `bun web/smoke.ts [adresă]` probează paginile, SEO-ul, sitemap-ul și fiecare unealtă MCP. Publicarea pe un server propriu se face cu `scripts/publica.sh --apply` (container podman). Operare și publicare: `docs/runbook.md`. Reguli pentru agenți: `AGENTS.md`. Decizii: `docs/decisions.md`.

## Marca vehiculului (test pe microbuze)
`transform/ai_modele.py` caută pe web, cu Haiku, marca livrată în fiecare contract și verifică determinist că marca apare în pagina-sursă.
Rezultat la 17.11.2026 pe 105 contracte: 1 din titlul contractului SEAP, 17 din presă/comunicate (marca regăsită în sursă), 1 nevalidat, 86 negăsite.
