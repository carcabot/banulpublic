# Server MCP

Un server Model Context Protocol public, doar pentru citire, găzduit de același proces Bun care
servește site-ul. Un asistent (Claude, Cursor, alt client MCP) pune întrebări în mai mulți pași
peste `data/site.db` și primește adrese verificabile către site și către SEAP.

Tiparul este cel din `ciocan/monitorul.ai` (`docs/mcp.md` de acolo): unelte subțiri peste
interogările care alimentează și paginile, o unealtă de descriere a datelor, rezultate scurte cu
adresă, descrieri în română. Diferențele sunt notate în `docs/decisions.md`.

## Frontieră

```
client MCP ──POST /mcp/server──▶ web/server.ts ──▶ web/mcp.ts ──▶ data/site.db (doar citire)
                                 limită pe IP       9 unelte
```

- Cod: `web/mcp.ts`, montat în `web/server.ts`. Pagina pentru oameni: `/mcp`.
- Transport: Streamable HTTP fără stare. Fiecare POST primește un răspuns JSON. Fără sesiuni,
  fără SSE. `GET` întoarce 405.
- Fără dependențe: JSON-RPC 2.0 scris de mână, validarea parametrilor la fel.
- Fără autentificare. Limita este pe adresa IP (`MCP_RATE_PER_MIN`, implicit 90 pe minut, și
  `MCP_RATE_PER_HOUR`, implicit 1.200 pe oră), în memorie. La depășire: HTTP 429 cu `Retry-After`.
- CORS deschis (`*`): datele sunt publice și serverul nu folosește cookie-uri.
- `robots.txt` exclude `/mcp/server`. Pagina `/mcp` este indexabilă.

## Unelte

| Unealtă | Parametri | Ce întoarce |
|---|---|---|
| `describe_data` | | surse, perioadă, totaluri, tipuri de semnale, județe, șabloane de URL, limite |
| `search` | `q`, `kind?`, `limit?` | autorități, firme și produse, cu cheia de folosit mai departe |
| `get_authority` | `cui` | totaluri, pe ani, pe proceduri, primii 15 furnizori |
| `get_company` | `cui` | date ANAF, totaluri, pe ani, primele 15 autorități, parteneri de asociere |
| `list_contracts` | `authority_cui?`, `company_cui?`, `year?`, `page?` | contracte, 50 pe pagină, cu `url_seap` |
| `list_signals` | `type?`, `county?`, `min_level?`, `cui?`, `q?`, `page?` | semnale, 30 pe pagină, cu entitățile implicate |
| `list_products` | | produsele cu preț pe bucată comparat |
| `get_product_prices` | `id`, `include_framework?`, `page?` | fiecare contract al produsului, cu varianta, ce mai include și abaterea față de mediană; plus statisticile pe variantă |
| `get_county` | `county` | totalurile județului, primele 15 autorități, primele 10 firme |

Numele uneltelor și ale parametrilor sunt în engleză, titlurile, descrierile și câmpurile din
răspuns în română, ca pe site.

## Contractul răspunsurilor

- Rezultatul unei unelte este un singur bloc `text` cu JSON.
- Orice entitate are `url` absolut către pagina ei. Contractele și prețurile au `url_seap` când
  anunțul este cunoscut.
- Sumele sunt în lei, fără TVA, rotunjite la leu, în câmpuri cu sufixul `_lei`.
- Listele întorc `total`, `pagina`, `pe_pagina`, `pagini`. Adâncimea maximă este de 40 de pagini; dincolo de ea apare
  câmpul `trunchiat` și clientul restrânge filtrele.
- Textele lungi din detaliile semnalelor sunt tăiate la 300 de caractere, listele la 25 de
  elemente, ca un răspuns să nu umple contextul modelului.
- Răspunsurile care conțin semnale poartă câmpul `nota`: un semnal este un indicator de
  verificat, nu o dovadă și nu o acuzație. Aceeași frază este în `instructions` la `initialize`.
- O eroare de parametri vine ca rezultat cu `isError: true` și un mesaj care spune ce valori
  sunt acceptate. Parametrii necunoscuți sunt refuzați. O unealtă inexistentă este eroare
  JSON-RPC `-32602`, o metodă inexistentă `-32601`.

## Conectare

```sh
claude mcp add --transport http banul-public https://<domeniu>/mcp/server
```

În claude.ai: Setări, Conectori, Adaugă conector personalizat. Alți clienți:
`{"mcpServers": {"banul-public": {"url": "https://<domeniu>/mcp/server"}}}`.

## Verificare

`bun web/smoke.ts <adresă>` acoperă protocolul (initialize, notificări, ping, tools/list, erori)
și fiecare unealtă, inclusiv totaluri care trebuie să bată între unelte.

## Amânat

- Autentificare OAuth și limită pe utilizator, ca în monitorul.ai. Cere o bază de conturi.
- Căutare în textul contractelor. Acum `search` găsește doar entități și produse.
- Export în masă.
