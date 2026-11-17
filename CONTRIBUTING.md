# Cum contribui

Banul public este un proiect deschis. Codul, regulile după care se calculează semnalele și
deciziile de proiectare sunt publice, ca oricine să poată verifica o cifră și să poată propune
o îndreptare.

## Ce fel de contribuții căutăm

- O eroare de date: o sumă, un furnizor sau un semnal care nu corespunde sursei oficiale.
- Un semnal nou sau o regulă mai bună pentru unul existent, cu sursa și cu felul în care se verifică.
- O sursă publică nouă (fără cont, fără date scurse).
- Cod: pipeline (Python), site și MCP (TypeScript pe Bun), documentație.

## Reguli care nu se negociază

1. Doar surse publice, accesibile oricui fără cont. Un indicator trebuie să poată fi refăcut de
   oricine cu aceleași date.
2. Un semnal este un indicator de verificat, nu o acuzație. Niciun text din site, din MCP sau din
   cod nu afirmă o faptă despre o persoană sau o firmă.
3. Fără date personale sensibile: CNP, domiciliu, dată de naștere, telefon personal. Rudenia nu
   se deduce din nume.
4. Fiecare cifră are sursa lângă ea.

## Pornire locală

Ai nevoie de Python 3.12 sau mai nou și de [Bun](https://bun.sh) 1.1 sau mai nou.

```sh
git clone <adresa repo-ului> && cd integritate-platform
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Site-ul citește `data/site.db`, care nu este în repo (are peste 100 MB). Ai două căi:

- Refaci datele din sursele publice cu `./ruleaza.sh`. Durează, fiindcă SEAP se citește încet,
  cu un singur flux. Pașii sunt în `README.md`.
- Ceri în issue un `site.db` gata făcut, dacă vrei să lucrezi doar la site sau la MCP.

Apoi:

```sh
bun web/server.ts                        # http://localhost:3210
bun web/smoke.ts http://localhost:3210   # testul de fum
```

## Înainte de un pull request

- Deschide întâi un issue care descrie problema, fără soluție, și cum se verifică rezolvarea.
- O schimbare, un pull request. Sub 400 de linii schimbate, dacă se poate.
- Rulează porțile din `AGENTS.md`: sintaxa Python, build-ul TypeScript, testul de fum cu zero
  verificări picate.
- Titlul este un Conventional Commit: `feat(web): ...`, `fix(detect): ...`, `docs: ...`.
- Un semnal nou vine cu: regula, pragurile și motivul lor, ce exclude, un eșantion verificat de
  mână la sursă (vezi `validare/`) și rata de alarme false găsită.
- O pagină sau o unealtă MCP nouă respectă limitele din `docs/runbook.md`: pagini de mărime
  fixă, adâncime maximă, nimic care întoarce un tabel întreg.
- Actualizează documentația în aceeași schimbare (`README.md`, `docs/`).

Dacă lucrezi cu un asistent AI, regulile pentru el sunt în `AGENTS.md`.

## Ce nu ajunge niciodată în repo

Secrete, adrese de servere, chei, fișierul `.env`, baza de date. Publicarea pe serverul public
o face doar întreținătorul, de mână. Contribuțiile nu pot declanșa o publicare.

## Probleme de securitate

Nu le pune într-un issue public. Vezi `SECURITY.md`.
