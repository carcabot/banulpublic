#!/usr/bin/env python3
"""Pasul AI (ieftin, o singură dată per contract): pentru liniile unde regex-ul nu a stabilit cantitatea, un model mic
(Haiku, prin `claude -p`) spune dacă produsul clusterului este obiectul principal și câte bucăți sunt.
Răspunsurile se păstrează în `ai_cantitati` și nu se mai cer niciodată. ai_cantitati.py [--model haiku] [--lot 40] [--max 2000]"""
import argparse, json, os, re, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log
from transform.clustere import BY_ID

PROMPT = """Ești un extractor de date din anunțuri de achiziții publice românești. Pentru fiecare rând primești: id, produsul căutat și textul contractului/lotului.
Răspunde DOAR cu un array JSON, câte un obiect per rând: {"id": <id>, "produs": true|false, "cantitate": <întreg sau null>}.
- "produs": true doar dacă obiectul principal al contractului este chiar produsul căutat (nu piese, service, lucrări, alt produs cu nume asemănător, pachet mixt de produse diferite).
- "cantitate": numărul de bucăți din acel produs, doar dacă reiese explicit din text; altfel null. Nu ghici.
Rânduri:
"""

def aplica(c):
    """Aplică răspunsurile memorate peste linii_pret (apelat și din linii_pret.py după reconstrucție)."""
    n = 0
    for r in c.execute("""SELECT l.id, l.valoare, l.cluster, a.produs, a.cantitate FROM linii_pret l JOIN ai_cantitati a
                          ON a.ca_notice_id=l.ca_notice_id AND a.nr_contract IS l.nr_contract AND a.cluster=l.cluster WHERE l.incredere<0.6""").fetchall():
        cl = BY_ID[r["cluster"]]
        if not r["produs"]:
            c.execute("UPDATE linii_pret SET incredere=0, regula='AI: alt obiect', cantitate=NULL, pret_unitar=NULL WHERE id=?", (r["id"],))
        elif r["cantitate"] and cl["lo"] <= r["valoare"] / r["cantitate"] <= cl["hi"]:
            c.execute("UPDATE linii_pret SET incredere=0.7, regula='AI (model mic)', sursa='ai', cantitate=?, pret_unitar=? WHERE id=?", (r["cantitate"], r["valoare"] / r["cantitate"], r["id"])); n += 1
    c.commit(); return n

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", default="haiku"); ap.add_argument("--lot", type=int, default=40); ap.add_argument("--max", type=int, default=3000)
    a = ap.parse_args(); c = db()
    c.execute("CREATE TABLE IF NOT EXISTS ai_cantitati(ca_notice_id INTEGER, nr_contract TEXT, cluster TEXT, produs INTEGER, cantitate REAL, model TEXT, PRIMARY KEY(ca_notice_id, nr_contract, cluster))")
    rows = c.execute("""SELECT l.id, l.ca_notice_id, l.nr_contract, l.cluster, l.text_sursa FROM linii_pret l LEFT JOIN ai_cantitati a
        ON a.ca_notice_id=l.ca_notice_id AND a.nr_contract IS l.nr_contract AND a.cluster=l.cluster
        WHERE l.incredere<0.6 AND a.ca_notice_id IS NULL AND l.text_sursa GLOB '*[0-9]*' ORDER BY l.valoare DESC LIMIT ?""", (a.max,)).fetchall()
    exe = shutil.which("claude")
    log(len(rows), "linii pentru AI;", "claude" if exe else "claude lipsește din PATH")
    if not exe: return
    for i in range(0, len(rows), a.lot):
        lot = rows[i:i + a.lot]
        txt = PROMPT + "\n".join(json.dumps({"id": r["id"], "produs_cautat": BY_ID[r["cluster"]]["nume"], "text": re.sub(r"\s+", " ", r["text_sursa"])[:450]}, ensure_ascii=False) for r in lot)
        try:
            out = subprocess.run([exe, "-p", "--model", a.model, "--output-format", "text", "--tools", "", "--strict-mcp-config"], input=txt, capture_output=True, text=True, timeout=300).stdout
            arr = json.loads(re.search(r"\[.*\]", out, re.S).group(0))
        except Exception as e:
            log("lot eșuat", i, repr(e)[:160]); continue
        by = {r["id"]: r for r in lot}
        for o in arr:
            r = by.get(o.get("id"))
            if r: c.execute("INSERT OR REPLACE INTO ai_cantitati VALUES(?,?,?,?,?,?)", (r["ca_notice_id"], r["nr_contract"], r["cluster"], 1 if o.get("produs") else 0, o.get("cantitate"), a.model))
        c.commit(); log(i + len(lot), "/", len(rows))
    log("aplicate:", aplica(c))

if __name__ == "__main__":
    main()
