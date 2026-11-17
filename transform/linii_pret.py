#!/usr/bin/env python3
"""Din detaliile anunțurilor → `linii_pret`: un rând per contract încadrat într-un cluster de produs, cu cantitate, preț unitar,
încredere și textul-sursă. Determinist (regex); ce rămâne ambiguu e marcat `incredere < 0.6` pentru pasul AI (transform/ai_cantitati.py)."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log, cui
from transform.clustere import CLUSTERE, potrivire

NUMERE = {"un": 1, "o": 1, "unui": 1, "unei": 1, "una": 1, "doua": 2, "două": 2, "doi": 2, "trei": 3, "patru": 4, "cinci": 5, "sase": 6, "șase": 6,
          "sapte": 7, "șapte": 7, "opt": 8, "noua": 9, "nouă": 9, "zece": 10}
BUC = r"(?:buc(?:\.|[aă][tț]i|ati)?|unit[aă][tț]i|exemplare|seturi)"

def cantitati(text, kw):
    """Întoarce lista (cantitate, regulă) găsite în text, în ordinea încrederii."""
    t = re.sub(r"\s+", " ", text or "")
    out = []
    for m in re.finditer(rf"(\d{{1,5}})\s*(?:\([a-zăâîșț ]+\)\s*)?(?:de\s+)?{BUC}\b", t, re.I): out.append((int(m[1]), "N buc"))
    for m in re.finditer(rf"(\d{{1,5}})\s*(?:\([a-zăâîșț ]+\)\s*)?(?:de\s+)?(?:{kw})", t, re.I): out.append((int(m[1]), "N produs"))
    for m in re.finditer(rf"(?:{kw})[^.;|]{{0,80}}?[-–:(,]\s*(\d{{1,5}})\s*{BUC}", t, re.I): out.append((int(m[1]), "produs - N buc"))
    for m in re.finditer(r"(?:num[aă]r(?:ul)?\s+de|unui\s+num[aă]r\s+de|a\s+unui\s+num[aă]r\s+de)\s+(\d{1,5})\b", t, re.I): out.append((int(m[1]), "număr de N"))
    for m in re.finditer(rf"\b({'|'.join(NUMERE)})\s+(?:\w+\s+)?(?:{kw})", t, re.I): out.append((NUMERE[m[1].lower()], "numeral"))
    return [(q, r) for q, r in out if 0 < q < 20000]

def alege(texte, c, valoare):
    """texte = [(sursă, text)] în ordinea preferinței. Întoarce (cantitate, încredere, regulă, sursă)."""
    lo, hi = c["lo"], c["hi"]
    for sursa, text in texte:
        qs = cantitati(text, c["kw"])
        ok = [(q, r) for q, r in qs if lo <= valoare / q <= hi]
        dist = sorted({q for q, _ in ok})
        if len(dist) == 1:
            reg = next(r for q, r in ok if q == dist[0])
            inc = {"contract": 0.95, "lot": 0.9, "anunt": 0.75}[sursa] - (0.0 if reg in ("N buc", "N produs", "produs - N buc") else 0.1)
            return dist[0], round(inc, 2), reg, sursa
        if len(dist) > 1:
            return None, 0.3, "mai multe cantități: " + ",".join(map(str, dist[:5])), sursa
    if lo <= valoare <= hi:  # un singur produs, fără cantitate scrisă
        return 1, 0.5, "valoare în intervalul unui singur produs", "valoare"
    return None, 0.0, "fără cantitate", None

def atribute(text, c):
    out = {}
    for k, rx in c["attrs"].items():
        m = re.search(rx, text or "", re.I)
        if m: out[k] = next((g for g in m.groups() if g), m.group(0))
    return out

def main():
    c = db()
    c.executescript("""DROP TABLE IF EXISTS linii_pret;
    CREATE TABLE linii_pret(id INTEGER PRIMARY KEY, ca_notice_id INTEGER, notice_no TEXT, cluster TEXT, autoritate TEXT, cui_autoritate TEXT,
      data TEXT, nr_contract TEXT, valoare REAL, castigatori TEXT, cui_castigatori TEXT, cantitate REAL, pret_unitar REAL, incredere REAL, regula TEXT,
      sursa TEXT, atribute TEXT, acord_cadru INTEGER, tip_procedura TEXT, text_sursa TEXT, estimat_lot REAL, oferta_min REAL, oferta_max REAL);
    CREATE INDEX ix_lp_cl ON linii_pret(cluster);""")
    n = 0
    for r in c.execute("""SELECT a.*, d.notice, d.contracte FROM detalii d JOIN anunturi a USING(ca_notice_id)"""):
        nv = json.loads(r["notice"] or "{}"); cs = json.loads(r["contracte"] or "[]")
        loturi = {str(L.get("nr")): L for L in nv.get("loturi") or []}
        ac = 1 if "cadru" in (json.loads(r["raw"]).get("sysContractAssigmentType") or {}).get("text", "").lower() else 0
        for k in cs:
            val = k.get("valoare") or 0
            if not val or val <= 0: continue
            lot_ids = [x.strip() for x in str(k.get("loturi") or "").split(",") if x.strip()]
            lot_txt = " | ".join(f"{loturi[i].get('titlu') or ''} :: {loturi[i].get('descriere') or ''}" for i in lot_ids if i in loturi) if len(lot_ids) == 1 else (k.get("loturi_text") or "")
            ct = k.get("titlu") or ""
            anunt = (nv.get("titlu") or r["titlu"] or "") + " :: " + (nv.get("descriere") or "")
            # încadrarea se face pe textul cel mai specific disponibil
            baza = (ct + " | " + lot_txt) if (len(nv.get("loturi") or []) > 1 or len(cs) > 1) else (ct + " | " + lot_txt + " | " + (nv.get("titlu") or r["titlu"] or ""))
            for cl in potrivire(baza, r["cpv"]):
                q, inc, reg, sursa = alege([("contract", ct), ("lot", lot_txt)] + ([("anunt", anunt)] if len(cs) == 1 else []), cl, val)
                est = next((loturi[i].get("estimat") for i in lot_ids if i in loturi), None) if len(lot_ids) == 1 else None
                c.execute("INSERT INTO linii_pret(ca_notice_id,notice_no,cluster,autoritate,cui_autoritate,data,nr_contract,valoare,castigatori,cui_castigatori,cantitate,pret_unitar,incredere,regula,sursa,atribute,acord_cadru,tip_procedura,text_sursa,estimat_lot,oferta_min,oferta_max) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (r["ca_notice_id"], r["notice_no"], cl["id"], r["autoritate"], cui(r["cui_autoritate"]), k.get("data") or r["data"], k.get("nr"), val,
                     " + ".join(w.get("nume") or "" for w in k.get("castigatori") or []), ",".join(cui(w.get("cui")) for w in k.get("castigatori") or []),
                     q, (val / q) if q else None, inc, reg, sursa, json.dumps(atribute(baza, cl), ensure_ascii=False), ac, r["tip_procedura"],
                     baza[:600], est, k.get("oferta_min"), k.get("oferta_max")))
                n += 1
    c.commit()
    if c.execute("SELECT 1 FROM sqlite_master WHERE name='ai_cantitati'").fetchone():
        from transform.ai_cantitati import aplica
        log("răspunsuri AI reaplicate:", aplica(c))
    log(n, "linii;", c.execute("SELECT count(*) FROM linii_pret WHERE incredere>=0.6").fetchone()[0], "cu cantitate sigură")
    for row in c.execute("SELECT cluster, count(*), sum(incredere>=0.6), sum(incredere<0.6) FROM linii_pret GROUP BY 1 ORDER BY 2 DESC"): log(*row)

if __name__ == "__main__":
    main()
