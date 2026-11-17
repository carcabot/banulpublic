#!/usr/bin/env python3
"""ANAF v9: identificarea câștigătorilor (data înregistrării, stare, inactiv, CAEN, adresă) → tabelul `firme`.
   anaf.py [--min-valoare 500000]   – doar câștigătorii cu contracte sau achiziții directe cumulate peste prag, încă neinterogați.
   anaf.py --autoritati             – autoritățile contractante (județul și localitatea lor vin tot de la ANAF)."""
import argparse, json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--min-valoare", type=float, default=500000); ap.add_argument("--autoritati", action="store_true"); a = ap.parse_args()
    c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS firme(cui TEXT PRIMARY KEY, denumire TEXT, adresa TEXT, data_inregistrare TEXT,
        caen TEXT, stare TEXT, inactiv INTEGER, data_inactivare TEXT, radiat TEXT, tva INTEGER, judet TEXT, localitate TEXT, actualizat TEXT)""")
    cuis = [r[0] for r in c.execute("""SELECT cui_castigator FROM contracte WHERE cui_castigator GLOB '[0-9]*' AND cui_castigator NOT GLOB '*[^0-9]*'
        AND cui_castigator NOT IN (SELECT cui FROM firme) GROUP BY 1 HAVING sum(valoare) >= ? ORDER BY sum(valoare) DESC""", (a.min_valoare,))]
    if a.autoritati:  # și autoritățile contractante au CUI: județul/localitatea lor vin tot de la ANAF
        cuis = [r[0] for r in c.execute("""SELECT cui_autoritate FROM contracte WHERE data_contract>='2023-01-01' AND cui_autoritate GLOB '[0-9]*' AND cui_autoritate NOT GLOB '*[^0-9]*'
            AND cui_autoritate NOT IN (SELECT cui FROM firme) GROUP BY 1 ORDER BY count(*) DESC""")]
    if c.execute("SELECT 1 FROM sqlite_master WHERE name='da'").fetchone():  # achizițiile directe: aceleași reguli, pe tabelul `da`
        NUMERIC = "{col} GLOB '[0-9]*' AND {col} NOT GLOB '*[^0-9]*' AND {col} NOT IN (SELECT cui FROM firme)"
        if a.autoritati:
            extra = c.execute(f"SELECT cui_autoritate FROM da WHERE publicat>='2023-01-01' AND {NUMERIC.format(col='cui_autoritate')} GROUP BY 1 ORDER BY count(*) DESC")
        else:
            extra = c.execute(f"SELECT cui_furnizor FROM da WHERE publicat>='2023-01-01' AND valoare BETWEEN 1 AND 5e6 AND {NUMERIC.format(col='cui_furnizor')} GROUP BY 1 HAVING sum(valoare) >= ? ORDER BY sum(valoare) DESC", (a.min_valoare,))
        vazut = set(cuis); cuis += [r[0] for r in extra if r[0] not in vazut]
    log(len(cuis), "CUI de interogat")
    cuis = [x for x in cuis if 2 <= len(x) <= 10]
    def cere(lot):
        body = json.dumps([{"cui": int(x), "data": time.strftime("%Y-%m-%d")} for x in lot]).encode()
        err = None
        for t in range(3):
            try:
                raw = subprocess.run(["curl", "-s", "-m", "90", "-X", "POST", "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva",
                                      "-H", "Content-Type: application/json", "-d", body.decode()], capture_output=True, text=True).stdout  # urllib primește reset TLS
                time.sleep(1.1)
                return json.loads(raw)
            except Exception as e:
                err = e; time.sleep(4 * (t + 1))
        if len(lot) > 1:  # un CUI invalid strică tot lotul – împărțim
            h = len(lot) // 2; a1, a2 = cere(lot[:h]), cere(lot[h:])
            return {"found": (a1 or {}).get("found", []) + (a2 or {}).get("found", []), "notFound": (a1 or {}).get("notFound", []) + (a2 or {}).get("notFound", [])}
        log("CUI eșuat", lot, repr(err)[:120]); return {"found": [], "notFound": lot}
    for i in range(0, len(cuis), 100):
        d = cere(cuis[i:i + 100])
        for f in d.get("found", []):
            g = f.get("date_generale", {}); ina = f.get("stare_inactiv", {}); ad = f.get("adresa_sediu_social", {})
            c.execute("INSERT OR REPLACE INTO firme VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (str(g.get("cui")), g.get("denumire"), g.get("adresa"),
                g.get("data_inregistrare"), g.get("cod_CAEN"), g.get("stare_inregistrare"), 1 if ina.get("statusInactivi") else 0,
                ina.get("dataInactivare") or None, ina.get("dataRadiere") or None, 1 if f.get("inregistrare_scop_Tva", {}).get("scpTVA") else 0,
                ad.get("sdenumire_Judet"), ad.get("sdenumire_Localitate"), time.strftime("%Y-%m-%d")))
        for n in d.get("notFound", []):
            c.execute("INSERT OR IGNORE INTO firme(cui, stare, actualizat) VALUES(?,?,?)", (str(n), "NEGĂSIT", time.strftime("%Y-%m-%d")))
        c.commit()
        if i % 1000 == 0: log(i, "/", len(cuis))
    log("firme:", c.execute("SELECT count(*) FROM firme").fetchone()[0])

if __name__ == "__main__":
    main()
