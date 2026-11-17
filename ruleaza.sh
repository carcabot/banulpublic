#!/bin/bash
# Rulare zilnică, incrementală. SEAP: un singur flux, lent (vezi common.PAUSE); la 403 jobul se oprește singur și se reia data viitoare.
cd "$(dirname "$0")" && mkdir -p logs
python3 ingest/seap_list.py --zile 3            >> logs/seap_list.log 2>&1     # anunțuri noi (reia de la ultima fereastră)
python3 ingest/seap_detail.py --max 400         >> logs/seap_detail.log 2>&1   # detalii pentru comparator, max 400/zi
.venv/bin/python ingest/datagov.py --descarca   >> logs/datagov.log 2>&1       # trimestrial e suficient; inofensiv zilnic (fișierele sunt în cache)
.venv/bin/python ingest/directe.py              >> logs/directe.log 2>&1       # achiziții directe (data.gov, trimestrial); fișierele deja încărcate sunt sărite
python3 ingest/anaf.py                          >> logs/anaf.log 2>&1          # doar câștigătorii noi
python3 ingest/anaf.py --autoritati             >> logs/anaf.log 2>&1          # județul și localitatea autorităților noi, inclusiv cele doar cu achiziții directe
python3 transform/linii_pret.py                 >> logs/transform.log 2>&1
python3 transform/ai_cantitati.py --model haiku >> logs/transform.log 2>&1     # doar liniile noi ambigue; răspunsurile se păstrează
python3 transform/linii_pret.py                 >> logs/transform.log 2>&1
python3 detect/semnale.py                       >> logs/semnale.log 2>&1
python3 site/pregateste.py                      >> logs/semnale.log 2>&1       # baza de servire (site.db); serverul o citește la repornire
pkill -f 'bun web/server.ts'; nohup bun web/server.ts >> logs/web.log 2>&1 &
sleep 3; bun web/smoke.ts "http://localhost:${PORT:-3210}" >> logs/smoke.log 2>&1                    # test de fum pe serverul repornit; ultima linie spune câte verificări au trecut
