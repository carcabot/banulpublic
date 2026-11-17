# Securitate

## Cum raportezi o problemă

Nu deschide un issue public pentru o vulnerabilitate. Folosește „Report a vulnerability” din
fila Security a repo-ului de pe GitHub (raportare privată). Spune ce ai găsit, cum se reproduce și ce
ar putea obține un atacator. Primești un răspuns în cel mult șapte zile.

O eroare de date (o sumă greșită, un semnal nepotrivit) nu este o problemă de securitate. Pentru ea
folosește un issue obișnuit.

## Ce protejăm

- Serverul pe care rulează site-ul public și celelalte aplicații de pe el.
- Integritatea datelor afișate: cifrele trebuie să fie cele din sursele oficiale.
- Disponibilitatea pentru cititori, în fața descărcării în masă.

Datele în sine sunt publice. Nu există conturi, parole sau date personale ale vizitatorilor.

## Cum este izolat sistemul

Serverul web:

- Doar citește. Nu are nicio rută care scrie, nu rulează comenzi, nu deschide fișiere după un nume
  venit de la client. Baza `site.db` este deschisă doar pentru citire.
- Toate interogările SQL au parametri. Fragmentele puse direct în SQL vin din liste fixe din cod.
- Tot textul venit din date sau de la client este scăpat înainte de a ajunge în HTML.
- Paginile trimit o politică de securitate a conținutului care interzice orice resursă din afară
  și încadrarea paginii în alt site.
- Fiecare adresă IP are o limită de cereri pe minut și pe oră, iar listele au adâncime maximă.

Containerul:

- Rulează ca utilizator fără drepturi, cu sistemul de fișiere doar pentru citire, fără nicio
  capabilitate Linux și fără posibilitatea de a obține drepturi noi.
- Vede doar directorul de date, montat pentru citire. Nu vede restul serverului.
- Ascultă doar pe bucla locală. În afară ajunge doar prin proxy.

Publicarea:

- Se face de mână, de pe mașina întreținătorului, cu cheia lui SSH. Gazda, portul și contul stau
  într-un fișier `.env` care nu se versionează.
- Nu există publicare din CI. În GitHub nu este stocat niciun secret al serverului. Fluxurile de
  CI rulează pe `pull_request`, nu pe `pull_request_target`, și au drept doar de citire.
- Un pull request nu poate rula cod pe server și nu poate ajunge la date care nu sunt în repo.

Pipeline-ul de date:

- Rulează pe mașina întreținătorului, nu pe serverul public.
- Citește texte de pe site-uri publice. Doi pași trimit astfel de texte unui model AI
  (`transform/ai_cantitati.py`, `transform/ai_modele.py`). Textul din anunțuri este tratat ca
  dată, nu ca instrucțiune. Modelul este chemat fără unelte (primul pas) sau doar cu căutare pe
  web (al doilea) și fără conectorii contului (`--tools`, `--strict-mcp-config`), deci un text
  ostil dintr-un anunț nu poate citi fișiere și nu poate acționa în numele operatorului.
  La al doilea pas, marca găsită este acceptată doar dacă apare în pagina-sursă.

## Dacă întreții o instalare proprie

- Nu pune `SITE_URL`, gazda sau cheile în repo. Folosește `.env` și fișierul de mediu al serviciului.
- Pune `TRUST_PROXY=1` doar în spatele unui proxy care rescrie `X-Forwarded-For`. Altfel oricine
  își poate alege adresa și ocolește limita de cereri.
- Ține un proxy cu TLS în față și nu expune portul aplicației.
