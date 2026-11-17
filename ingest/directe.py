#!/usr/bin/env python3
"""data.gov.ro „Achiziții publice <an>”, resursele „Achiziții directe” (toate cumpărările directe din SEAP, cu furnizor și CUI) → tabelul `da`.
   directe.py [--ani 2023 2024 2025 2026] [--fara-descarcare] [--reincarca]
Fișierele stau în data/datagov/<an>_directe_<id>.<ext>. Un fișier deja încărcat (tabelul `da_fisiere`) este sărit, deci rularea se poate relua oricând."""
import argparse, datetime as dt, glob, json, os, re, sys, time, unicodedata, urllib.request, zipfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log, num, cui, ROOT
from ingest.datagov import rows_from

DIR = os.path.join(ROOT, "data", "datagov")
API = "https://data.gov.ro/api/3/action/package_show?id=achizitii-publice-{an}"
NUME = re.compile(r"^\s*achizi\S{1,2}ii\s+directe", re.I)  # nu și „Notificări de atribuire la cumpărarea directă” (cele offline)
NECESARE = ("cod", "cui_autoritate", "publicat", "valoare", "cui_furnizor")
COLS = ["cod", "cui_autoritate", "autoritate", "publicat", "finalizat", "obiect", "cpv", "cpv_nume", "tip_contract", "fonduri_ue", "valoare", "furnizor", "cui_furnizor"]

def fold(s): return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", str(s or "").lower()).encode("ascii", "ignore").decode()).strip()

def coloane(h):
    """Antetele diferă între ani; potrivirea se face pe cuvinte, nu pe text exact. Întoarce {coloană: index}."""
    hf = [fold(x) for x in h]; out = {}
    def gasit(k, test):
        for i, x in enumerate(hf):
            if i not in out.values() and test(x): out[k] = i; return
    gasit("cui_autoritate", lambda x: "cui" in x.split() and ("autoritate" in x or x.endswith(" ac")))
    gasit("cui_furnizor", lambda x: "cui" in x.split() and ("ofertant" in x or "castigator" in x or x.endswith(" of")))
    # Unele fișiere au două coloane numite doar „CUI”: prima, după autoritate, e a autorității; a doua, după ofertant, e a furnizorului.
    for i, x in enumerate(hf):
        if x == "cui" and i > 0 and i not in out.values():
            inainte = hf[i - 1]
            if "cui_autoritate" not in out and "autoritate" in inainte: out["cui_autoritate"] = i
            elif "cui_furnizor" not in out and ("ofertant" in inainte or "castigator" in inainte): out["cui_furnizor"] = i
    gasit("autoritate", lambda x: "autoritate" in x or x == "denumire ac")
    gasit("cod", lambda x: x.startswith("numar achiz") or "numar da" in x or x == "numar")  # un fișier scrie „Numar achizite”
    gasit("publicat", lambda x: "data publicare" in x)
    gasit("finalizat", lambda x: "data finalizare" in x or "data atribuire" in x)
    gasit("obiect", lambda x: "denumire achizitie" in x)
    gasit("cpv", lambda x: x in ("cod cpv", "cpv code", "cpv"))
    gasit("cpv_nume", lambda x: "denumire cpv" in x)
    gasit("tip_contract", lambda x: "tip contract" in x)
    gasit("fonduri_ue", lambda x: "fonduri" in x)
    gasit("valoare", lambda x: x.startswith("valoare"))
    gasit("furnizor", lambda x: "ofertant" in x or "castigator" in x)
    return out

def moment(v):
    """Data și ora ca text ISO (minutul contează: unele achiziții se încheie la câteva minute de la publicare)."""
    if v in (None, ""): return None
    if hasattr(v, "isoformat"): return v.isoformat(sep=" ")[:19]
    s = str(v).strip()
    if re.fullmatch(r"[3-6]\d{4}(\.\d+)?", s):  # dată ca număr de serie Excel (zile de la 1899-12-30)
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(s))).isoformat(sep=" ")[:19]
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?", s)
    if m: return f"{m[1]}-{m[2]}-{m[3]}" + (f" {m[4]}:{m[5]}:{m[6] or '00'}" if m[4] else "")
    m = re.match(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2}):(\d\d)(?::(\d\d))?)?", s)
    if m:
        a, b = int(m[1]), int(m[2]); mo, d = (a, b) if b > 12 else ((b, a) if a > 12 else (a, b))  # fișierele CSV sunt MM/DD/YYYY
        return f"{m[3]}-{mo:02d}-{d:02d}" + (f" {int(m[4]):02d}:{m[5]}:{m[6] or '00'}" if m[4] else "")
    return None

def cu_extensia_reala(p):
    """Unele resurse au extensia greșită. Formatul se citește din primii octeți."""
    with open(p, "rb") as f: mag = f.read(4)
    ext = ".xlsx" if mag[:2] == b"PK" else ".xls" if mag == b"\xd0\xcf\x11\xe0" else ".csv"
    if ext == ".xlsx" and "mimetype" in zipfile.ZipFile(p).namelist(): ext = ".ods"  # și ODS este o arhivă zip
    q = os.path.splitext(p)[0] + ext
    if q != p: os.replace(p, q)
    return q

def descarca(ani):
    for an in ani:
        try:
            res = json.load(urllib.request.urlopen(urllib.request.Request(API.format(an=an), headers={"User-Agent": "Mozilla/5.0"}), timeout=60))["result"]["resources"]
        except Exception as e: log("data.gov", an, repr(e)[:160]); continue
        for r in res:
            if not NUME.search(r.get("name") or ""): continue
            if glob.glob(os.path.join(DIR, f"{an}_directe_{r['id'][:8]}.*")): continue
            dest = os.path.join(DIR, f"{an}_directe_{r['id'][:8]}.part")
            log("descarc", r["name"].strip(), f"({(r.get('size') or 0)/1e6:.0f} MB)")
            try:
                urllib.request.urlretrieve(r["url"], dest); log("  salvat", os.path.basename(cu_extensia_reala(dest)))
            except Exception as e:
                log("  EROARE la descărcare", repr(e)[:160])
                if os.path.exists(dest): os.remove(dest)

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ani", nargs="+", type=int, default=[2023, 2024, 2025, 2026]); ap.add_argument("--fara-descarcare", action="store_true")
    ap.add_argument("--reincarca", action="store_true", help="încarcă din nou și fișierele deja încărcate")
    a = ap.parse_args(); os.makedirs(DIR, exist_ok=True); c = db()
    c.executescript("""CREATE TABLE IF NOT EXISTS da(cod TEXT PRIMARY KEY, cui_autoritate TEXT, autoritate TEXT, publicat TEXT, finalizat TEXT, obiect TEXT, cpv TEXT, cpv_nume TEXT,
          tip_contract TEXT, fonduri_ue INTEGER, valoare REAL, furnizor TEXT, cui_furnizor TEXT, sursa TEXT);
        CREATE TABLE IF NOT EXISTS da_fisiere(sursa TEXT PRIMARY KEY, randuri INTEGER, incarcat TEXT);""")
    if not a.fara_descarcare: descarca(a.ani)
    gata = set() if a.reincarca else {r[0] for r in c.execute("SELECT sursa FROM da_fisiere")}
    fis = [p for p in sorted(glob.glob(os.path.join(DIR, "*_directe_*"))) if not p.endswith(".part") and int(os.path.basename(p)[:4]) in a.ani]
    de_facut = [p for p in fis if os.path.basename(p) not in gata]
    log(f"achiziții directe: {len(fis)} fișiere pe disc, {len(de_facut)} de încărcat, {len(fis) - len(de_facut)} deja încărcate")
    for k, p in enumerate(de_facut, 1):
        b = os.path.basename(p); n = sarite = incercari = 0; idx = None; t0 = time.time(); lot = []
        try:
            if p.lower().endswith(".csv") and open(p, "rb").read(1) == b"|":
                # Formatul vechi cu ghilimele „|” și fără oră sau tip de contract dublează un fișier XLS din același trimestru, mai complet.
                c.execute("INSERT OR REPLACE INTO da_fisiere VALUES(?,?,?)", (b, 0, time.strftime("%Y-%m-%d %H:%M"))); c.commit()
                log(f"[{k}/{len(de_facut)}] {b}: sărit, format vechi dublat de fișierul XLS al trimestrului"); continue
            for h, r in rows_from(p):
                if idx is None:
                    # Unele fișiere au un rând de titlu deasupra antetului: antetul se caută în primele rânduri.
                    incercari += 1
                    cand = coloane(h) if incercari == 1 else {}
                    if all(x in cand for x in NECESARE): idx = cand  # antetul e primul rând; r este deja un rând de date
                    else:
                        cand = coloane(r)
                        if all(x in cand for x in NECESARE): idx = cand
                        elif incercari > 10: raise ValueError(f"coloane negăsite {[x for x in NECESARE if x not in cand]} în primele rânduri; antet {h}")
                        continue  # rândul curent era titlu sau chiar antetul
                d = {x: (r[i] if i < len(r) else None) for x, i in idx.items()}
                cod = str(d.get("cod") or "").strip(); v = num(d.get("valoare"))
                if not cod or v is None: sarite += 1; continue
                lot.append((cod, cui(d.get("cui_autoritate")), str(d.get("autoritate") or "").strip(), moment(d.get("publicat")), moment(d.get("finalizat")), str(d.get("obiect") or "").strip()[:500],
                            str(d.get("cpv") or "")[:10], str(d.get("cpv_nume") or "").strip(), str(d.get("tip_contract") or "").strip(), int(fold(d.get("fonduri_ue")) == "da"), v,
                            str(d.get("furnizor") or "").strip(), cui(d.get("cui_furnizor")) if d.get("cui_furnizor") not in (None, "") else None, b))
                n += 1
                if len(lot) >= 20000:
                    c.executemany("INSERT OR REPLACE INTO da VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", lot); lot = []
                    if n % 100000 == 0: log(f"  [{k}/{len(de_facut)}] {b}: {n:,} rânduri, {n / (time.time() - t0):,.0f}/s")
            c.executemany("INSERT OR REPLACE INTO da VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", lot)
            c.execute("INSERT OR REPLACE INTO da_fisiere VALUES(?,?,?)", (b, n, time.strftime("%Y-%m-%d %H:%M"))); c.commit()
            log(f"[{k}/{len(de_facut)}] {b}: {n:,} rânduri încărcate, {sarite} sărite, {time.time() - t0:.0f} s")
        except KeyboardInterrupt:
            c.rollback(); log(f"oprit la {b}. Rulează din nou aceeași comandă: fișierele încărcate sunt sărite."); sys.exit(130)
        except Exception as e:
            c.rollback(); log("EROARE", b, repr(e)[:400])
    c.executescript("""CREATE INDEX IF NOT EXISTS ix_da_af ON da(cui_autoritate, cui_furnizor, publicat);
        CREATE INDEX IF NOT EXISTS ix_da_f ON da(cui_furnizor); CREATE INDEX IF NOT EXISTS ix_da_p ON da(publicat);""")
    r = c.execute("SELECT count(*), min(publicat), max(publicat), sum(valoare) FROM da").fetchone()
    log(f"da: {r[0]:,} achiziții directe, {r[1]} – {r[2]}, {(r[3] or 0) / 1e9:,.1f} mld. lei")

if __name__ == "__main__":
    main()
