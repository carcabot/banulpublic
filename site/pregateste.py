#!/usr/bin/env python3
"""Construiește baza de servire `data/site.db` (mică, doar citire, indexată pentru paginile site-ului) din `data/integritate.db`.
Tot ce e lent se calculează aici; serverul face doar căutări pe index."""
import json, os, re, sqlite3, sys, time, unicodedata
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import ROOT, log
from transform.clustere import CLUSTERE, varianta, include
from detect.semnale import TIPURI

DIN = "2023-01-01"
JUDETE = ["Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj",
          "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți",
          "Mureș", "Neamț", "Olt", "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", "Vaslui", "Vâlcea", "Vrancea"]
def fold(s): return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode())
JMAP = {fold(j): j for j in JUDETE}; JMAP["municipiulbucuresti"] = "București"
def judet(s): return JMAP.get(fold(s))
def slug(s): return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode())).strip("-")

def curs_bnr(site_db):
    """Cursul de referință BNR pentru euro, pentru afișarea orientativă a sumelor în euro. Dacă BNR nu răspunde,
    rămâne cursul din site.db-ul anterior; dacă nu există niciunul, site-ul arată sumele doar în lei."""
    import urllib.request
    try:
        x = urllib.request.urlopen(urllib.request.Request("https://curs.bnr.ro/nbrfxrates.xml", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode()
        return dict(curs_eur=float(re.search(r'currency="EUR">([\d.]+)<', x)[1]), curs_data=re.search(r'Cube date="([\d-]+)"', x)[1])
    except Exception as e:
        log("curs BNR indisponibil:", repr(e)[:120])
        try:
            m = json.loads(sqlite3.connect(site_db).execute("SELECT v FROM meta WHERE k='meta'").fetchone()[0])
            return dict(curs_eur=m["curs_eur"], curs_data=m["curs_data"]) if m.get("curs_eur") else {}
        except Exception: return {}

def main():
    out = os.path.join(ROOT, "data", "site.db")
    if os.path.exists(out + ".tmp"): os.remove(out + ".tmp")
    s = sqlite3.connect(out + ".tmp"); s.row_factory = sqlite3.Row
    s.execute("ATTACH DATABASE ? AS src", (os.path.join(ROOT, "data", "integritate.db"),))
    s.executescript(f"""
    PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE contracte AS SELECT id, cui_autoritate ca, cui_castigator cf, data_contract data, valoare, valoare_parte vp, n_asociati na, cpv, cpv_nume,
        tip_procedura tp, tip_contract tc, anunt_atribuire anunt, nr_contract nr, n_loturi nl,
        CASE WHEN valoare_parte BETWEEN 1 AND 5e8 THEN valoare_parte ELSE 0 END v  -- valorile de peste 500 mil. lei/parte sunt de regulă plafoane de acord-cadru sau erori
        FROM src.contracte WHERE data_contract >= '{DIN}' AND data_contract <= date('now');
    CREATE INDEX c_ca ON contracte(ca, data DESC); CREATE INDEX c_cf ON contracte(cf, data DESC); CREATE INDEX c_anunt ON contracte(anunt);
    CREATE TABLE autoritati AS SELECT c.ca cui, (SELECT autoritate FROM src.contracte k WHERE k.cui_autoritate=c.ca AND k.data_contract>='{DIN}' GROUP BY autoritate ORDER BY count(*) DESC LIMIT 1) nume,
        count(*) n, sum(v) valoare, count(DISTINCT cf) furnizori, min(data) d1, max(data) d2, f.judet judet_raw, f.localitate, f.adresa
        FROM contracte c LEFT JOIN src.firme f ON f.cui=c.ca GROUP BY c.ca;
    CREATE UNIQUE INDEX a_cui ON autoritati(cui);
    CREATE TABLE firme AS SELECT c.cf cui, coalesce(f.denumire, (SELECT castigator FROM src.contracte k WHERE k.cui_castigator=c.cf GROUP BY castigator ORDER BY count(*) DESC LIMIT 1)) nume,
        count(*) n, sum(v) valoare, count(DISTINCT ca) autoritati, min(data) d1, max(data) d2, sum(na>1) n_asoc,
        f.judet judet_raw, f.localitate, f.adresa, f.data_inregistrare, f.caen, f.stare, f.inactiv, f.tva
        FROM contracte c LEFT JOIN src.firme f ON f.cui=c.cf GROUP BY c.cf;
    CREATE UNIQUE INDEX f_cui ON firme(cui);
    ALTER TABLE autoritati ADD COLUMN judet TEXT; ALTER TABLE firme ADD COLUMN judet TEXT;
    ALTER TABLE autoritati ADD COLUMN semnale INTEGER DEFAULT 0; ALTER TABLE firme ADD COLUMN semnale INTEGER DEFAULT 0;
    CREATE TABLE semnale AS SELECT id, tip, scor, entitate, cui, titlu, valoare, detalii FROM src.semnale;
    CREATE UNIQUE INDEX s_id ON semnale(id); CREATE INDEX s_tip ON semnale(tip, scor DESC, valoare DESC);
    CREATE TABLE sem_ent(sid INTEGER, fel TEXT, cui TEXT); 
    CREATE TABLE linii_pret AS SELECT id, ca_notice_id nid, notice_no anunt, cluster, autoritate, cui_autoritate ca, data, valoare, castigatori, cui_castigatori cf, cantitate q,
        pret_unitar p, incredere inc, regula, atribute, acord_cadru ac, substr(text_sursa,1,300) text,
        (SELECT trim(coalesce(m.marca,'') || ' ' || coalesce(m.model,'')) FROM src.modele m WHERE m.ca_notice_id=l.ca_notice_id AND m.nr_contract IS l.nr_contract AND m.cluster=l.cluster AND m.marca IS NOT NULL AND m.stare IN ('confirmat din SEAP','verificat în sursă','marca apare în sursă')) marca,
        (SELECT m.sursa FROM src.modele m WHERE m.ca_notice_id=l.ca_notice_id AND m.nr_contract IS l.nr_contract AND m.cluster=l.cluster AND m.marca IS NOT NULL) marca_sursa,
        (SELECT m.stare FROM src.modele m WHERE m.ca_notice_id=l.ca_notice_id AND m.nr_contract IS l.nr_contract AND m.cluster=l.cluster) marca_stare
        FROM src.linii_pret l WHERE incredere>=0.6 AND cantitate>0;
    CREATE INDEX lp_cl ON linii_pret(cluster, p); CREATE INDEX lp_ca ON linii_pret(ca);
    CREATE TABLE anunt_id AS SELECT notice_no anunt, max(ca_notice_id) nid FROM src.anunturi GROUP BY 1;
    CREATE UNIQUE INDEX ai ON anunt_id(anunt);
    CREATE TABLE anulari AS SELECT cui_autoritate ca, count(*) n FROM src.anunturi WHERE stare LIKE 'Anulat%' AND data>='{DIN}' GROUP BY 1;
    """)
    # Achizițiile directe (tabelul `da`, din ingest/directe.py). În site.db intră doar agregatele, nu cele câteva milioane de rânduri.
    # Autoritățile care cumpără doar direct (comune, școli) și furnizorii mari doar din achiziții directe primesc și ei fișă.
    s.executescript("""ALTER TABLE autoritati ADD COLUMN da_n INTEGER DEFAULT 0; ALTER TABLE autoritati ADD COLUMN da_valoare REAL DEFAULT 0;
        ALTER TABLE firme ADD COLUMN da_n INTEGER DEFAULT 0; ALTER TABLE firme ADD COLUMN da_valoare REAL DEFAULT 0; ALTER TABLE firme ADD COLUMN da_autoritati INTEGER DEFAULT 0;
        CREATE TABLE da_top(ca TEXT, cf TEXT, nume TEXT, n INTEGER, v REAL); CREATE TABLE da_topf(cf TEXT, ca TEXT, n INTEGER, v REAL); CREATE TABLE da_ani(ca TEXT, y TEXT, n INTEGER, v REAL);""")
    are_da = s.execute("SELECT 1 FROM src.sqlite_master WHERE name='da'").fetchone() is not None
    if are_da:
        F = f"publicat>='{DIN}' AND publicat<=datetime('now') AND valoare BETWEEN 1 AND 5e6"  # peste 5 mil. lei sunt erori de introducere
        s.executescript(f"""
        CREATE TEMP TABLE da_af AS SELECT cui_autoritate ca, cui_furnizor cf, max(autoritate) an, max(furnizor) fn, count(*) n, sum(valoare) v, min(substr(publicat,1,10)) d1, max(substr(publicat,1,10)) d2
            FROM src.da WHERE {F} AND cui_autoritate IS NOT NULL AND cui_autoritate!='' GROUP BY 1,2;
        CREATE TEMP TABLE da_aut AS SELECT ca cui, max(an) nume, sum(n) n, sum(v) v, min(d1) d1, max(d2) d2 FROM da_af GROUP BY 1;
        CREATE TEMP TABLE da_fir AS SELECT cf cui, max(fn) nume, sum(n) n, sum(v) v, count(*) na, min(d1) d1, max(d2) d2 FROM da_af WHERE cf IS NOT NULL AND cf!='' GROUP BY 1;
        CREATE INDEX temp.dx1 ON da_aut(cui); CREATE INDEX temp.dx2 ON da_fir(cui);
        INSERT INTO autoritati(cui, nume, n, valoare, furnizori, d1, d2, judet_raw, localitate, adresa)
            SELECT d.cui, d.nume, 0, 0, 0, d.d1, d.d2, f.judet, f.localitate, f.adresa FROM da_aut d LEFT JOIN src.firme f ON f.cui=d.cui WHERE d.cui NOT IN (SELECT cui FROM autoritati);
        UPDATE autoritati SET da_n=(SELECT n FROM da_aut d WHERE d.cui=autoritati.cui), da_valoare=(SELECT v FROM da_aut d WHERE d.cui=autoritati.cui) WHERE cui IN (SELECT cui FROM da_aut);
        INSERT INTO firme(cui, nume, n, valoare, autoritati, d1, d2, n_asoc, judet_raw, localitate, adresa, data_inregistrare, caen, stare, inactiv, tva)
            SELECT d.cui, coalesce(f.denumire, d.nume), 0, 0, 0, d.d1, d.d2, 0, f.judet, f.localitate, f.adresa, f.data_inregistrare, f.caen, f.stare, f.inactiv, f.tva
            FROM da_fir d LEFT JOIN src.firme f ON f.cui=d.cui WHERE d.v>=500000 AND d.cui NOT IN (SELECT cui FROM firme);
        UPDATE firme SET da_n=(SELECT n FROM da_fir d WHERE d.cui=firme.cui), da_valoare=(SELECT v FROM da_fir d WHERE d.cui=firme.cui), da_autoritati=(SELECT na FROM da_fir d WHERE d.cui=firme.cui) WHERE cui IN (SELECT cui FROM da_fir);
        INSERT INTO da_top SELECT ca, cf, fn, n, v FROM (SELECT *, row_number() OVER (PARTITION BY ca ORDER BY v DESC) rn FROM da_af WHERE cf IS NOT NULL AND cf!='') WHERE rn<=12;
        INSERT INTO da_topf SELECT cf, ca, n, v FROM (SELECT *, row_number() OVER (PARTITION BY cf ORDER BY v DESC) rn FROM da_af WHERE cf IN (SELECT cui FROM firme)) WHERE rn<=12;
        INSERT INTO da_ani SELECT cui_autoritate, substr(publicat,1,4), count(*), sum(valoare) FROM src.da WHERE {F} GROUP BY 1,2;
        CREATE INDEX dt_ca ON da_top(ca); CREATE INDEX dt_cf ON da_topf(cf); CREATE INDEX dn_ca ON da_ani(ca);
        """)
    # Varianta produsului și ce mai cuprinde contractul, din textul anunțului (vezi transform/clustere.py).
    s.executescript("ALTER TABLE linii_pret ADD COLUMN varianta TEXT DEFAULT ''; ALTER TABLE linii_pret ADD COLUMN include TEXT DEFAULT '';")
    for r in s.execute("SELECT id, cluster, atribute, text_sursa FROM src.linii_pret WHERE incredere>=0.6 AND cantitate>0").fetchall():
        s.execute("UPDATE linii_pret SET varianta=?, include=? WHERE id=?", (varianta(r["cluster"], json.loads(r["atribute"] or "{}"), r["text_sursa"]), ", ".join(include(r["text_sursa"], r["cluster"])), r["id"]))
    for t in ("autoritati", "firme"):
        for r in s.execute(f"SELECT cui, judet_raw FROM {t} WHERE judet_raw IS NOT NULL").fetchall():
            j = judet(r["judet_raw"])
            if j: s.execute(f"UPDATE {t} SET judet=? WHERE cui=?", (j, r["cui"]))
    # legătura semnal ↔ entități (autoritate / firmă)
    lp = {r["anunt"]: r["cf"] for r in s.execute("SELECT anunt, cf FROM linii_pret")}
    aut = {r[0] for r in s.execute("SELECT cui FROM autoritati")}; frm = {r[0] for r in s.execute("SELECT cui FROM firme")}
    rows = []
    for r in s.execute("SELECT id, tip, cui, detalii FROM semnale").fetchall():
        d = json.loads(r["detalii"]); a, f = set(), set()
        if r["tip"] in ("S1", "S13", "S4", "S7", "S8", "S9", "S11", "S14", "S15", "S16"): a.add(r["cui"])
        if r["tip"] in ("S2", "S3", "S5", "S12", "S10"): f.update(str(r["cui"] or "").split(","))
        if d.get("cui_furnizor"): f.add(d["cui_furnizor"])
        if r["tip"] == "S10": f.update(d.get("cui") or [])
        if r["tip"] == "S11": f.update(x["cui"] for x in d.get("firme") or [])
        if r["tip"] in ("S1", "S13") and d.get("anunt") in lp: f.update((lp[d["anunt"]] or "").split(","))
        rows += [(r["id"], "a", x) for x in a if x in aut] + [(r["id"], "f", x) for x in f if x in frm]
    s.executemany("INSERT INTO sem_ent VALUES(?,?,?)", rows)
    s.executescript("""CREATE INDEX se_cui ON sem_ent(cui, fel); CREATE INDEX se_sid ON sem_ent(sid);
    UPDATE autoritati SET semnale=(SELECT count(*) FROM sem_ent e WHERE e.cui=autoritati.cui AND e.fel='a');
    UPDATE firme SET semnale=(SELECT count(*) FROM sem_ent e WHERE e.cui=firme.cui AND e.fel='f');
    CREATE TABLE judete AS SELECT judet, count(*) autoritati, sum(n) contracte, sum(valoare) valoare, sum(semnale) semnale, sum(da_n) da_n, sum(da_valoare) da_valoare FROM autoritati WHERE judet IS NOT NULL GROUP BY 1;
    CREATE TABLE clustere(id TEXT PRIMARY KEY, nume TEXT, n INTEGER, mediana REAL, pmin REAL, pmax REAL, omogen INTEGER);
    CREATE VIRTUAL TABLE cauta USING fts5(nume, fel UNINDEXED, cheie UNINDEXED, info UNINDEXED, pondere UNINDEXED, tokenize="unicode61 remove_diacritics 2", prefix="2 3 4");
    INSERT INTO cauta SELECT nume || ' ' || cui, 'autoritate', cui, coalesce(judet,''), valoare + da_valoare FROM autoritati WHERE nume IS NOT NULL;
    INSERT INTO cauta SELECT nume || ' ' || cui, 'firma', cui, coalesce(judet,''), valoare + da_valoare FROM firme WHERE nume IS NOT NULL;
    """)
    import statistics as st
    OMOGENE = {"microbuz_electric", "microbuz_hibrid", "buldoexcavator", "tabla_interactiva", "laptop", "tableta", "pubela"}
    for cl in CLUSTERE:
        ps = [r[0] for r in s.execute("SELECT p FROM linii_pret WHERE cluster=? AND ac=0", (cl["id"],))]
        if len(ps) >= 5:
            s.execute("INSERT INTO clustere VALUES(?,?,?,?,?,?,?)", (cl["id"], cl["nume"], len(ps), st.median(ps), min(ps), max(ps), int(cl["id"] in OMOGENE)))
            s.execute("INSERT INTO cauta VALUES(?,?,?,?,?)", (cl["nume"], "produs", cl["id"], f"{len(ps)} contracte", 1e12))
    # Statistici pe variantă: prețul unui contract se compară cu mediana variantei lui, nu cu a întregii categorii.
    s.execute("CREATE TABLE variante(cluster TEXT, varianta TEXT, n INTEGER, mediana REAL, pmin REAL, pmax REAL, PRIMARY KEY(cluster, varianta))")
    grupe = {}
    for r in s.execute("SELECT cluster, varianta, p FROM linii_pret WHERE ac=0 AND varianta!=''"): grupe.setdefault((r["cluster"], r["varianta"]), []).append(r["p"])
    for (cl, v), ps in grupe.items(): s.execute("INSERT INTO variante VALUES(?,?,?,?,?,?)", (cl, v, len(ps), st.median(ps), min(ps), max(ps)))
    src = lambda q: s.execute(q).fetchone()[0]
    meta = dict(generat=time.strftime("%Y-%m-%d %H:%M"), din=DIN, contracte=src("SELECT count(*) FROM contracte"), valoare=src("SELECT sum(v) FROM contracte"),
                autoritati=src("SELECT count(*) FROM autoritati"), firme=src("SELECT count(*) FROM firme"), semnale=src("SELECT count(*) FROM semnale"),
                anunturi=src("SELECT count(*) FROM src.anunturi"), anunturi_pana=src("SELECT max(data) FROM src.anunturi"), contracte_pana=src("SELECT max(data) FROM contracte"),
                detalii=src("SELECT count(*) FROM src.detalii"), tipuri={k: dict(nume=v[0], sens=v[1], n=src(f"SELECT count(*) FROM semnale WHERE tip='{k}'")) for k, v in TIPURI.items()},
                judete=JUDETE, da=src("SELECT coalesce(sum(da_n),0) FROM autoritati"), da_valoare=src("SELECT coalesce(sum(da_valoare),0) FROM autoritati"),
                da_pana=src("SELECT max(substr(publicat,1,10)) FROM src.da WHERE publicat<=datetime('now')") if are_da else None)
    meta.update(curs_bnr(out))
    s.execute("CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT)"); s.execute("INSERT INTO meta VALUES('meta', ?)", (json.dumps(meta, ensure_ascii=False),))
    s.commit(); s.execute("DETACH DATABASE src"); s.execute("VACUUM"); s.close()
    os.replace(out + ".tmp", out)
    log(f"site.db: {os.path.getsize(out)/1e6:.0f} MB;", {k: v for k, v in meta.items() if isinstance(v, (int, str))})

if __name__ == "__main__":
    main()
