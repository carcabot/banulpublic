#!/usr/bin/env python3
"""data.gov.ro „Achiziții publice <an>”: contracte (câștigător + CUI), modificări, negocieri fără anunț → SQLite.
   datagov.py --ani 2023 2024 2025 2026 [--descarca]
Fișierele stau în data/datagov/ (se descarcă doar cele lipsă)."""
import argparse, csv, datetime as dt, glob, json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log, num, cui, ROOT

DIR = os.path.join(ROOT, "data", "datagov")
API = "https://data.gov.ro/api/3/action/package_show?id=achizitii-publice-{an}"
KINDS = {"contracte": re.compile(r"^\s*contracte", re.I), "modificare": re.compile(r"modificare", re.I),
         "fara_anunt": re.compile(r"f[aă]r[aă] anun", re.I)}
ALT = {
 "autoritate": ["DENUMIRE_AC", "Autoritate contractanta", "Autoritatea contractanta"],
 "cui_autoritate": ["CUI_AC", "CUI autoritate contractanta"],
 "tip_procedura": ["TIP_PROCEDURA", "Tip procedura"], "tip_contract": ["TIP_CONTRACT", "Tip contract"],
 "criteriu": ["TIP_CRITERII_ATRIBUIRE", "Tip criterii de atribuire"],
 "cpv": ["CPV_CODE", "Cod CPV"], "cpv_nume": ["DENUMIRE_CPV", "Denumire CPV"], "lot": ["NUMAR_LOT", "Numar lot"],
 "anunt_initiere": ["NUMAR_ANUNT_AI", "Numar anunt initiere", "Numar anunt de participare"],
 "anunt_atribuire": ["NUMAR_ANUNT_ATRIBUIRE", "Numar anunt atribuire", "Numar anunt"],
 "data_contract": ["DATA_CONTRACT", "Data contract"], "nr_contract": ["NUMAR_CONTRACT", "Numar contract"],
 "valoare": ["VALOARE_CONTRACT_RON", "Valoare contract (RON)", "Valoare contract", "Valoare atribuita (RON)"],
 "castigator": ["OFERTANT", "Ofertant castigator"], "cui_castigator": ["CUI_OF", "CUI ofertant castigator"],
 "oras_castigator": ["ORAS_CASTIGATOR", "Oras castigator"],
 "tip_modificare": ["TIP_MODIFICARE", "Tip modificare"],
 "valoare_modificare": ["VALOARE_MODIFICARE", "Valoare modificare", "Valoare noua contract"],
 "data_modificare": ["DATA_MODIFICARE", "Data modificare"],
 "descriere": ["DESCRIERE", "Descriere modificare", "Motiv modificare", "Descrierea modificarilor", "Denumire contract"],
 "valoare_inainte": ["Valoarea totala actualizata a contractului inainte de modificari", "VALOARE_INAINTE"],
 "valoare_dupa": ["Valoarea totala a contractului dupa modificari", "VALOARE_DUPA"],
 "data_publicare": ["Data publicare", "DATA_PUBLICARE"],
}
COLS = list(ALT)

def rows_from(path):
    low = path.lower()
    if low.endswith(".csv"):
        with open(path, encoding="utf-8", errors="replace", newline="") as f:
            sample = f.read(8192); f.seek(0)
            try: dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|^")
            except csv.Error: dialect = csv.excel
            rd = csv.reader(f, dialect); h = next(rd, [])
            for r in rd: yield h, r
    elif low.endswith(".xlsx"):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True); h = [str(c).strip() if c is not None else "" for c in next(it, [])]
            if any(h):
                for r in it: yield h, list(r)
        wb.close()
    elif low.endswith(".xls"):
        import xlrd
        wb = xlrd.open_workbook(path)
        for sh in wb.sheets():
            if sh.nrows < 2: continue
            h = [str(c).strip() for c in sh.row_values(0)]
            for i in range(1, sh.nrows):
                r = []
                for c in sh.row(i):
                    r.append(xlrd.xldate_as_datetime(c.value, wb.datemode) if c.ctype == 3 else c.value)
                yield h, r
    elif low.endswith(".ods"):
        import pandas as pd
        for name, df in pd.read_excel(path, engine="odf", sheet_name=None, dtype=object).items():
            h = [str(c).strip() for c in df.columns]
            for r in df.itertuples(index=False, name=None):
                yield h, [None if (isinstance(v, float) and v != v) else v for v in r]

def iso(v):
    if v in (None, ""): return None
    if hasattr(v, "isoformat"): return v.isoformat()[:10]
    s = str(v).strip()
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)", s)
    if m: return m.group(0)
    m = re.match(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})", s)
    if m:
        a, b, y = int(m[1]), int(m[2]), m[3]
        mo, d = (a, b) if b > 12 else ((b, a) if a > 12 else (a, b))  # fișierele CSV sunt MM/DD/YYYY
        return f"{y}-{mo:02d}-{d:02d}"
    return None

def canon(h, r):
    seen, hh = {}, []
    for x in h:
        x = str(x or "").replace("﻿", "").strip(); seen[x] = seen.get(x, 0) + 1
        hh.append(x)
    d = {}
    for k, v in zip(hh, r):
        d.setdefault(k, v)
    out = {}
    for c, alts in ALT.items():
        out[c] = next((d[a] for a in alts if a in d and d[a] not in (None, "")), None)
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--ani", nargs="+", type=int, default=[2023, 2024, 2025, 2026]); ap.add_argument("--descarca", action="store_true"); ap.add_argument("--doar-agregare", action="store_true")
    a = ap.parse_args(); os.makedirs(DIR, exist_ok=True); c = db()
    for t in ([] if a.doar_agregare else KINDS):
        c.execute(f"DROP TABLE IF EXISTS dg_{t}")
        c.execute(f"CREATE TABLE dg_{t}(" + ",".join(f"{x} {'REAL' if x.startswith('valoare') else 'TEXT'}" for x in COLS) + ", an INTEGER, sursa TEXT)")
    if a.descarca:
        for an in a.ani:
            try:
                res = json.load(urllib.request.urlopen(urllib.request.Request(API.format(an=an), headers={"User-Agent": "Mozilla/5.0"}), timeout=60))["result"]["resources"]
            except Exception as e: log("data.gov", an, e); continue
            for r in res:
                for kind, rx in KINDS.items():
                    if rx.search(r.get("name") or ""):
                        ext = os.path.splitext(r["url"].split("?")[0])[1].lower() or ".bin"
                        dest = os.path.join(DIR, f"{an}_{kind}_{r['id'][:8]}{ext}")
                        if not os.path.exists(dest):
                            log("descarc", os.path.basename(dest)); urllib.request.urlretrieve(r["url"], dest)
    for p in ([] if a.doar_agregare else sorted(glob.glob(os.path.join(DIR, "*")))):
        m = re.match(r"(\d{4})_(contracte|modificare|fara_anunt)_", os.path.basename(p))
        if not m or int(m[1]) not in a.ani: continue
        n = 0
        try:
            for h, r in rows_from(p):
                d = canon(h, r)
                if not d["cui_autoritate"] and not d["autoritate"]: continue
                d["cui_autoritate"] = cui(d["cui_autoritate"]); d["cui_castigator"] = cui(d["cui_castigator"]) if d["cui_castigator"] else None
                d["data_contract"] = iso(d["data_contract"]); d["data_modificare"] = iso(d["data_modificare"])
                d["valoare"] = num(d["valoare"]); d["valoare_modificare"] = num(d["valoare_modificare"]); d["valoare_inainte"] = num(d["valoare_inainte"]); d["valoare_dupa"] = num(d["valoare_dupa"]); d["data_publicare"] = iso(d["data_publicare"])
                d["cpv"] = str(d["cpv"] or "")[:10]
                for k in COLS:
                    if d[k] is not None and (not isinstance(d[k], (int, float, str)) or (isinstance(d[k], int) and abs(d[k]) > 2**62)): d[k] = str(d[k])
                c.execute(f"INSERT INTO dg_{m[2]} VALUES(" + ",".join("?" * (len(COLS) + 2)) + ")", [d[k] for k in COLS] + [int(m[1]), os.path.basename(p)]); n += 1
        except Exception as e:
            log("EROARE", os.path.basename(p), repr(e)[:200])
        c.commit(); log(os.path.basename(p), n)
    # contracte unice (fișierele trimestriale se suprapun între formate)
    c.executescript("""
    DROP TABLE IF EXISTS contracte;
    CREATE TABLE contracte AS SELECT min(id) id, max(autoritate) autoritate, cui_autoritate, max(tip_procedura) tip_procedura, max(tip_contract) tip_contract, max(criteriu) criteriu,
       min(cpv) cpv, min(cpv_nume) cpv_nume, count(*) n_loturi, max(anunt_initiere) anunt_initiere, anunt_atribuire, data_contract, nr_contract,
       -- valoarea totală a contractului e de regulă repetată pe fiecare lot; dacă loturile au valori diferite, le adunăm
       CASE WHEN count(DISTINCT valoare)=1 THEN max(valoare) ELSE sum(valoare) END valoare,
       max(castigator) castigator, cui_castigator, max(oras_castigator) oras_castigator, max(an) an
      FROM (SELECT min(rowid) id, max(autoritate) autoritate, cui_autoritate, max(tip_procedura) tip_procedura, max(tip_contract) tip_contract, max(criteriu) criteriu,
                   min(cpv) cpv, min(cpv_nume) cpv_nume, lot, max(anunt_initiere) anunt_initiere, anunt_atribuire, data_contract, nr_contract, max(valoare) valoare,
                   max(castigator) castigator, cui_castigator, max(oras_castigator) oras_castigator, max(an) an
            FROM dg_contracte WHERE cui_castigator IS NOT NULL GROUP BY cui_autoritate, anunt_atribuire, nr_contract, data_contract, cui_castigator, lot)
      GROUP BY cui_autoritate, anunt_atribuire, nr_contract, data_contract, cui_castigator;
    ALTER TABLE contracte ADD COLUMN n_asociati INTEGER; ALTER TABLE contracte ADD COLUMN valoare_parte REAL;
    CREATE INDEX ix_c_key ON contracte(cui_autoritate, anunt_atribuire, nr_contract, data_contract);
    CREATE TEMP TABLE na AS SELECT cui_autoritate a, anunt_atribuire b, nr_contract c, data_contract d, count(*) n FROM contracte GROUP BY 1,2,3,4;
    CREATE INDEX temp.ix_na ON na(a,b,c,d);
    UPDATE contracte SET n_asociati = (SELECT n FROM na WHERE a IS contracte.cui_autoritate AND b IS contracte.anunt_atribuire AND c IS contracte.nr_contract AND d IS contracte.data_contract);
    UPDATE contracte SET valoare_parte = valoare / max(n_asociati, 1);
    CREATE INDEX ix_c_cpv ON contracte(cpv); CREATE INDEX ix_c_aut ON contracte(cui_autoritate);
    CREATE INDEX ix_c_cast ON contracte(cui_castigator); CREATE INDEX ix_c_can ON contracte(anunt_atribuire);""")
    c.commit()
    for t in ("dg_contracte", "contracte", "dg_modificare", "dg_fara_anunt"):
        log(t, c.execute(f"SELECT count(*) FROM {t}").fetchone()[0])

if __name__ == "__main__":
    main()
