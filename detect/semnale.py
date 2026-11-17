#!/usr/bin/env python3
"""Detectoare deterministe (SQL + puțin Python) → tabelul `semnale`. Fiecare semnal = indicator de verificat, cu faptele în `detalii`.
   semnale.py [--doar S1,S5]"""
import argparse, json, os, re, statistics as st, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log
from transform.clustere import BY_ID

DIN = "2023-01-01"
TIPURI = {
 "S1": ("Preț unitar mult peste mediana produsului", "Supraevaluare posibilă (E6/N3)"),
 "S2": ("Preț identic la leu la autorități diferite", "Preț de listă, nu rezultat al concurenței; posibilă împărțire a pieței"),
 "S3": ("Piață națională dominată de un furnizor", "Concentrare pe un cod CPV"),
 "S4": ("Furnizor dependent de o singură autoritate („firmă de casă”)", "Dependență reciprocă autoritate–furnizor (E14/N1/N2)"),
 "S5": ("Firmă nou-înființată cu contracte mari", "Fără istoric; posibil vehicul (P1.8/N6)"),
 "S6": ("Contract cu firmă inactivă fiscal sau radiată", "Stare fiscală incompatibilă la data contractului"),
 "S7": ("Contract majorat substanțial prin acte adiționale", "Modificări peste 50% din valoarea inițială (X2)"),
 "S8": ("Atribuiri repetate fără anunț de participare", "Negociere fără publicare către același furnizor"),
 "S9": ("Procedură anulată în mod repetat", "Anulări succesive pentru același obiect (E15/N11)"),
 "S10": ("Asociere permanentă cu un partener care nu câștigă niciodată singur", "Posibil partener-paravan (N5)"),
 "S11": ("Câștigători diferiți cu același sediu la aceeași autoritate", "Ofertanți posibil legați (P1.13)"),
 "S12": ("Același furnizor, același produs, prețuri foarte diferite", "Dispersie de preț neexplicată de cantitate"),
 "S13": ("Contract la valoarea estimată", "Ofertă lipită de estimare: concurență slabă sau estimare cunoscută"),
}

from detect.semnale_da import TIPURI_DA, FNS_DA
TIPURI.update(TIPURI_DA)

def add(c, tip, scor, entitate, cui, titlu, valoare, det):
    c.execute("INSERT INTO semnale(tip,scor,entitate,cui,titlu,valoare,detalii) VALUES(?,?,?,?,?,?,?)", (tip, scor, entitate, cui, titlu, valoare, json.dumps(det, ensure_ascii=False)))

def has(c, t):
    return c.execute("SELECT 1 FROM sqlite_master WHERE name=?", (t,)).fetchone() is not None

def url(no_or_id):
    return f"https://e-licitatie.ro/pub/notices/ca-notices/view/{no_or_id}"

def S1_S12_S13(c):
    if not has(c, "linii_pret"): return
    rows = [dict(r) for r in c.execute("SELECT * FROM linii_pret WHERE incredere>=0.6 AND acord_cadru=0 AND cantitate>0")]
    # Prețul se compară doar între produse cu adevărat comparabile: clustere omogene, pe grupe de capacitate,
    # fără pachete (leasing, service, dotări). Validarea manuală a arătat ~5–10% precizie pe clusterele eterogene.
    OMOGENE = {"microbuz_electric", "microbuz_hibrid", "buldoexcavator", "tabla_interactiva", "laptop", "tableta", "pubela"}
    PACHET = re.compile(r"leasing|casco|mentenan|service|echipat|multifunc|ata[sș]ament|lucr[aă]ri|montaj|execu[tț]i", re.I)
    by = defaultdict(list)
    for r in rows:
        if r["cluster"] not in OMOGENE or PACHET.search(r["text_sursa"] or ""): continue
        loc = (json.loads(r["atribute"] or "{}").get("locuri") or "")
        r["grupa"] = r["cluster"] + ("|" + loc if loc else "")
        by[r["grupa"]].append(r)
    for grupa, rs in by.items():
        cl = grupa.split("|")[0]; eticheta = BY_ID[cl]["nume"] + (f" {grupa.split('|')[1]}+1 locuri" if "|" in grupa else "")
        if len(rs) < 8: continue
        med = st.median(x["pret_unitar"] for x in rs); q = st.quantiles([x["pret_unitar"] for x in rs], n=10)
        for r in rs:
            rap = r["pret_unitar"] / med
            if rap >= 1.4 and r["pret_unitar"] >= q[8] and (r["pret_unitar"] - med) * r["cantitate"] >= 100000:
                add(c, "S1", min(3, 1 + int(rap >= 1.7) + int(rap >= 2.2)), r["autoritate"], r["cui_autoritate"],
                    f"{eticheta}: {r['pret_unitar']:,.0f} lei/buc față de mediana {med:,.0f} ({rap:.1f}×)", (r["pret_unitar"] - med) * r["cantitate"],
                    dict(cluster=cl, furnizor=r["castigatori"], cantitate=r["cantitate"], data=r["data"], valoare=r["valoare"], mediana=med, anunt=r["notice_no"], link=url(r["ca_notice_id"]), text=r["text_sursa"][:240]))
        # S2 – preț identic
        g = defaultdict(list)
        for r in rs: g[(r["cui_castigatori"], round(r["pret_unitar"], 2))].append(r)
        for (w, p), xs in g.items():
            auts = {x["cui_autoritate"] for x in xs}
            if len(auts) >= 3 and p * 100 % 100000 != 0 or len(auts) >= 4:
                add(c, "S2", 2 + int(len(auts) >= 6), xs[0]["castigatori"], w, f"{eticheta}: {p:,.0f} lei/buc la {len(auts)} autorități", sum(x["valoare"] for x in xs),
                    dict(cluster=cl, pret=p, contracte=[dict(autoritate=x["autoritate"], data=x["data"], cantitate=x["cantitate"], anunt=x["notice_no"], link=url(x["ca_notice_id"])) for x in sorted(xs, key=lambda x: x["data"])]))
        # S12 – dispersie la același furnizor
        g = defaultdict(list)
        for r in rs: g[r["cui_castigatori"]].append(r)
        for w, xs in g.items():
            if len(xs) >= 4:
                lo = min(xs, key=lambda x: x["pret_unitar"]); hi = max(xs, key=lambda x: x["pret_unitar"])
                if hi["pret_unitar"] / lo["pret_unitar"] >= 1.6:
                    add(c, "S12", 2, xs[0]["castigatori"], w, f"{eticheta}: între {lo['pret_unitar']:,.0f} și {hi['pret_unitar']:,.0f} lei/buc ({len(xs)} contracte)", sum(x["valoare"] for x in xs),
                        dict(cluster=cl, minim=dict(autoritate=lo["autoritate"], data=lo["data"], pret=lo["pret_unitar"], link=url(lo["ca_notice_id"])),
                             maxim=dict(autoritate=hi["autoritate"], data=hi["data"], pret=hi["pret_unitar"], link=url(hi["ca_notice_id"]))))
    for r in c.execute("SELECT * FROM linii_pret WHERE estimat_lot>0 AND valoare>=500000 AND valoare/estimat_lot BETWEEN 0.998 AND 1.0001"):
        add(c, "S13", 1, r["autoritate"], r["cui_autoritate"], f"{r['valoare']:,.0f} lei = {100*r['valoare']/r['estimat_lot']:.2f}% din estimare ({BY_ID[r['cluster']]['nume']})", r["valoare"],
            dict(furnizor=r["castigatori"], data=r["data"], estimat=r["estimat_lot"], anunt=r["notice_no"], link=url(r["ca_notice_id"])))

def S2b(c):
    """Valoare de contract identică la leu (fără cantitate) – același furnizor, același CPV, ≥3 autorități, valoare nerotundă."""
    for r in c.execute(f"""SELECT cui_castigator, max(castigator) nume, cpv, max(cpv_nume) cpv_nume, valoare, count(DISTINCT cui_autoritate) n, group_concat(DISTINCT autoritate) auts,
              min(data_contract) d1, max(data_contract) d2 FROM contracte
              WHERE data_contract>='{DIN}' AND n_asociati=1 AND valoare>=200000 AND CAST(valoare AS INTEGER) % 1000 != 0 AND tip_procedura NOT LIKE '%Anexa%'
              GROUP BY cui_castigator, cpv, valoare HAVING n>=3 ORDER BY n DESC, valoare DESC LIMIT 400"""):
        add(c, "S2", 2 + int(r["n"] >= 5), r["nume"], r["cui_castigator"], f"{r['valoare']:,.2f} lei la {r['n']} autorități – {r['cpv_nume']}", r["valoare"] * r["n"],
            dict(cpv=r["cpv"], perioada=[r["d1"], r["d2"]], autoritati=(r["auts"] or "").split(",")[:12]))

def S3(c):
    q = f"""WITH b AS (SELECT substr(cpv,1,8) cpv, max(cpv_nume) nume, cui_castigator w, max(castigator) wn, sum(valoare_parte) v, max(valoare_parte) vmax, count(*) n, count(DISTINCT cui_autoritate) na
              FROM contracte WHERE data_contract>='{DIN}' AND valoare_parte BETWEEN 1 AND 5e8 GROUP BY 1,3),
            t AS (SELECT cpv, sum(v) tv, sum(n) tn, count(*) nw FROM b GROUP BY 1)
            SELECT b.*, t.tv, t.tn, t.nw FROM b JOIN t USING(cpv) WHERE t.tv>=3e7 AND t.tn>=15 AND t.nw>=4 AND b.na>=8 AND b.v/t.tv>=0.6 AND b.vmax<=0.5*b.v AND b.cpv NOT LIKE '09%' AND b.cpv NOT LIKE '64%' ORDER BY b.v DESC"""
    for r in c.execute(q):
        add(c, "S3", 2 + int(r["v"] / r["tv"] >= 0.8), r["wn"], r["w"], f"{100*r['v']/r['tv']:.0f}% din piața „{r['nume']}” ({r['v']/1e6:,.1f} mil. lei, {r['na']} autorități)", r["v"],
            dict(cpv=r["cpv"], contracte=r["n"], total_piata=r["tv"], furnizori_in_piata=r["nw"]))

def S4(c):
    q = f"""WITH p AS (SELECT cui_autoritate a, max(autoritate) an, cui_castigator w, max(castigator) wn, sum(valoare_parte) v, count(DISTINCT anunt_atribuire) n, min(data_contract) d1, max(data_contract) d2, max(cpv LIKE '85%') soc
              FROM contracte WHERE data_contract>='{DIN}' AND valoare_parte BETWEEN 1 AND 5e8 GROUP BY 1,3),
            ta AS (SELECT a, sum(v) tv, sum(n) tn FROM p GROUP BY 1), tw AS (SELECT w, sum(v) tv, count(*) na FROM p GROUP BY 1)
            SELECT p.*, ta.tv atv, ta.tn atn, tw.tv wtv, tw.na wna FROM p JOIN ta USING(a) JOIN tw USING(w)
            WHERE p.n>=3 AND julianday(p.d2)-julianday(p.d1)>=180 AND p.soc=0 AND p.v>=2e6 AND ta.tn>=10 AND p.v/ta.tv>=0.4 AND p.v/tw.tv>=0.8 ORDER BY p.v DESC LIMIT 600"""
    for r in c.execute(q):
        add(c, "S4", 2 + int(r["v"] / r["atv"] >= 0.6), r["an"], r["a"], f"{r['wn']}: {100*r['v']/r['atv']:.0f}% din contractele autorității și {100*r['v']/r['wtv']:.0f}% din veniturile publice ale firmei", r["v"],
            dict(furnizor=r["wn"], cui_furnizor=r["w"], proceduri=r["n"], contracte=r["n"], perioada=[r["d1"], r["d2"]], total_autoritate=r["atv"], alte_autoritati_ale_firmei=r["wna"] - 1))

def S5_S6_S11(c):
    if not has(c, "firme"): return
    q = f"""SELECT f.cui, f.denumire, f.data_inregistrare di, min(k.data_contract) d1, count(*) n, count(DISTINCT k.cui_autoritate) na,
               sum(CASE WHEN julianday(k.data_contract)-julianday(f.data_inregistrare) <= 548 THEN k.valoare_parte ELSE 0 END) v18, group_concat(DISTINCT k.autoritate) auts
            FROM firme f JOIN contracte k ON k.cui_castigator=f.cui
            WHERE f.data_inregistrare>='2021-06-01' AND k.data_contract>=f.data_inregistrare AND k.valoare_parte BETWEEN 1 AND 5e8
            GROUP BY f.cui HAVING julianday(d1)-julianday(di) <= 365 AND v18 >= 2e6 ORDER BY v18 DESC"""
    for r in c.execute(q):
        luni = int((__import__("datetime").date.fromisoformat(r["d1"]) - __import__("datetime").date.fromisoformat(r["di"])).days / 30.4)
        add(c, "S5", 2 + int(luni <= 6 or r["v18"] >= 2e7), r["denumire"], r["cui"], f"înființată {r['di']}, primul contract după {luni} luni; {r['v18']/1e6:,.1f} mil. lei în primele 18 luni la {r['na']} autorități", r["v18"],
            dict(inregistrare=r["di"], primul_contract=r["d1"], contracte=r["n"], autoritati=(r["auts"] or "").split(",")[:10]))
    q = f"""SELECT f.cui, f.denumire, f.data_inactivare di, f.radiat, k.autoritate, k.cui_autoritate, k.data_contract, k.valoare_parte v, k.anunt_atribuire, k.cpv_nume
            FROM firme f JOIN contracte k ON k.cui_castigator=f.cui
            WHERE k.data_contract>='{DIN}' AND k.valoare_parte>=100000 AND ((f.data_inactivare IS NOT NULL AND f.data_inactivare!='' AND f.inactiv=1 AND k.data_contract>f.data_inactivare)
               OR (f.radiat IS NOT NULL AND f.radiat!='' AND k.data_contract>f.radiat)) ORDER BY v DESC LIMIT 300"""
    for r in c.execute(q):
        add(c, "S6", 3, r["autoritate"], r["cui_autoritate"], f"{r['denumire']} – contract din {r['data_contract']}, firma inactivă/radiată din {r['di'] or r['radiat']}", r["v"],
            dict(furnizor=r["denumire"], cui_furnizor=r["cui"], anunt=r["anunt_atribuire"], obiect=r["cpv_nume"]))
    # S11 – același sediu (stradă + număr), firme diferite, aceeași autoritate
    def norm(a):
        a = re.sub(r"(?i)\b(et|etaj|ap|camera|cam|birou|biroul|sc|scara|bl|bloc|parter|mansard[ăa]|demisol)\b\.?\s*[\w./-]*", " ", (a or "").upper())
        a = re.sub(r"[^A-Z0-9ĂÂÎȘȚ]+", " ", a); return re.sub(r"\s+", " ", a).strip()
    adr = defaultdict(set)
    for r in c.execute("SELECT cui, adresa FROM firme WHERE adresa IS NOT NULL AND length(adresa)>20"):
        n = norm(r["adresa"])
        if re.search(r"\bNR\s*\d", n) or re.search(r"\d", n): adr[n].add(r["cui"])
    grupuri = {a: s for a, s in adr.items() if 2 <= len(s) <= 6}  # >6 = sediu de tip „hub”/birou virtual
    cui2adr = {x: a for a, s in grupuri.items() for x in s}
    per = defaultdict(lambda: defaultdict(lambda: [0, 0, ""]))
    for r in c.execute(f"SELECT cui_autoritate a, max(autoritate) an, cui_castigator w, max(castigator) wn, sum(valoare_parte) v, count(*) n FROM contracte WHERE data_contract>='{DIN}' AND valoare_parte BETWEEN 1 AND 5e8 GROUP BY 1,3"):
        if r["w"] in cui2adr:
            x = per[(r["a"], r["an"], cui2adr[r["w"]])][r["w"]]; x[0] += r["v"]; x[1] += r["n"]; x[2] = r["wn"]
    impreuna = {(r[0], r[1]) for r in c.execute("SELECT DISTINCT a.cui_castigator, b.cui_castigator FROM contracte a JOIN contracte b ON a.cui_autoritate IS b.cui_autoritate AND a.anunt_atribuire IS b.anunt_atribuire AND a.nr_contract IS b.nr_contract AND a.cui_castigator != b.cui_castigator WHERE a.n_asociati>1")}
    for (a, an, ad), ws in per.items():
        ks = list(ws)
        if len(ws) == 2 and (ks[0], ks[1]) in impreuna: continue  # asociați declarați, nu ofertanți separați
        if len(ws) >= 2:
            v = sum(x[0] for x in ws.values())
            if v >= 1e6:
                add(c, "S11", 2 + int(len(ws) >= 3), an, a, f"{len(ws)} câștigători cu același sediu: " + ", ".join(x[2] for x in ws.values())[:140], v,
                    dict(adresa=ad.title(), firme=[dict(cui=k, nume=x[2], valoare=x[0], contracte=x[1]) for k, x in ws.items()]))

def S7(c):
    """Lanțul de modificări în ordine cronologică: valoarea de pornire a primei → valoarea finală a ultimei.
    Datele oficiale au greșeli de tastare (×10 și înapoi); un pas de ~×10 marchează contractul ca „posibilă eroare de introducere” și îl scoate."""
    g = defaultdict(list)
    for r in c.execute("""SELECT cui_autoritate a, autoritate an, nr_contract, anunt_atribuire can, data_contract dc, data_publicare dp, valoare_inainte v0, valoare_dupa v1, descriere, rowid
                          FROM dg_modificare WHERE valoare_inainte>0 AND valoare_dupa>0 ORDER BY data_publicare, rowid"""):
        g[(r["a"], r["nr_contract"], r["can"])].append(r)
    out = []
    for k, xs in g.items():
        v0, v1 = xs[0]["v0"], xs[-1]["v1"]
        salt = any(8.5 <= max(x["v1"] / x["v0"], x["v0"] / x["v1"]) <= 11.5 for x in xs) or 8.5 <= v1 / v0 <= 11.5
        if v0 >= 500000 and 1.5 <= v1 / v0 < 8 and not salt:
            out.append((v1 - v0, xs, v0, v1))
    for dv, xs, v0, v1 in sorted(out, key=lambda t: -t[0])[:500]:
        n = len({(x["dp"], x["v1"]) for x in xs})
        add(c, "S7", 2 + int(v1 / v0 >= 2), xs[0]["an"], xs[0]["a"], f"contract {xs[0]['nr_contract']}: de la {v0/1e6:,.2f} la {v1/1e6:,.2f} mil. lei (+{100*(v1/v0-1):.0f}%) în {n} modificări", dv,
            dict(anunt=xs[0]["can"], data_contract=xs[0]["dc"], pasi=[[x["dp"], round(x["v0"]), round(x["v1"])] for x in xs][:12], motive=" ‖ ".join((x["descriere"] or "")[:120] for x in xs)[:400]))

def S8(c):
    q = f"""SELECT cui_autoritate a, max(autoritate) an, cui_castigator w, max(castigator) wn, count(*) n, sum(valoare) v, min(data_contract) d1, max(data_contract) d2, group_concat(DISTINCT cpv_nume) ob
            FROM dg_fara_anunt WHERE tip_procedura LIKE 'Negociere%' AND data_contract>='{DIN}' AND valoare>0 AND valoare<5e8 AND cpv NOT LIKE '09%' AND cpv NOT LIKE '65%' AND cpv NOT LIKE '64%'
            GROUP BY 1,3 HAVING n>=4 AND v>=1e6 ORDER BY v DESC LIMIT 400"""
    for r in c.execute(q):
        add(c, "S8", 2 + int(r["n"] >= 8), r["an"], r["a"], f"{r['n']} atribuiri fără anunț către {r['wn']} ({r['v']/1e6:,.1f} mil. lei)", r["v"],
            dict(furnizor=r["wn"], cui_furnizor=r["w"], perioada=[r["d1"], r["d2"]], obiecte=(r["ob"] or "")[:300]))

def S9(c):
    if not has(c, "anunturi"): return
    g = defaultdict(list)
    for r in c.execute(f"SELECT cui_autoritate, autoritate, titlu, stare, data, valoare, notice_no, ca_notice_id FROM anunturi WHERE data>='{DIN}' AND tip IN (3,18,16)"):
        k = re.sub(r"[^a-z0-9]+", " ", (r["titlu"] or "").lower()).strip()
        if len(k) > 20: g[(r["cui_autoritate"], k)].append(r)
    for (a, k), xs in g.items():
        an = [x for x in xs if (x["stare"] or "").lower().startswith("anulat")]
        zile = sorted({x["data"] for x in an})
        if any(zile[i + 2] <= (__import__("datetime").date.fromisoformat(zile[i]) + __import__("datetime").timedelta(days=540)).isoformat() for i in range(len(zile) - 2)):
            atr = [x for x in xs if (x["stare"] or "").lower().startswith("atribuit")]
            add(c, "S9", 2 + int(len(an) >= 5), xs[0]["autoritate"], a, f"{len(an)} anulări: {(xs[0]['titlu'] or '')[:110]}", sum(x["valoare"] or 0 for x in atr),
                dict(anulari=[dict(data=x["data"], anunt=x["notice_no"], link=url(x["ca_notice_id"])) for x in sorted(an, key=lambda x: x["data"])][:8],
                     atribuiri=[dict(data=x["data"], anunt=x["notice_no"], valoare=x["valoare"], link=url(x["ca_notice_id"])) for x in atr][:4]))

def S10(c):
    """Partener care nu câștigă niciodată singur ȘI apare aproape numai alături de aceeași firmă (≤3 parteneri distincți).
    Proiectanții/subcontractanții cu zeci de parteneri și firmele din același grup (același prim cuvânt în nume) sunt excluse."""
    solo = {r[0] for r in c.execute("SELECT DISTINCT cui_castigator FROM contracte WHERE n_asociati=1")}
    q = f"""SELECT a.cui_castigator x, max(a.castigator) xn, b.cui_castigator y, max(b.castigator) yn, count(*) n, count(DISTINCT a.cui_autoritate) na, sum(a.valoare) v
            FROM contracte a JOIN contracte b ON a.cui_autoritate IS b.cui_autoritate AND a.anunt_atribuire IS b.anunt_atribuire AND a.nr_contract IS b.nr_contract
                 AND a.data_contract IS b.data_contract AND a.cui_castigator != b.cui_castigator
            WHERE a.n_asociati BETWEEN 2 AND 4 AND a.data_contract>='{DIN}' AND a.valoare BETWEEN 1 AND 5e8 GROUP BY 1,3"""
    perechi = [dict(r) for r in c.execute(q)]
    parteneri = defaultdict(set); tot = defaultdict(int)
    for r in perechi: parteneri[r["x"]].add(r["y"]); tot[r["x"]] += r["n"]
    cuv = lambda s: (re.sub(r"(?i)^(s\.?c\.?|sc)\s+", "", (s or "").strip()).split() or [""])[0].upper().strip(".,")
    for r in sorted(perechi, key=lambda r: -r["v"]):
        # x = partenerul fără contracte proprii; y = firma pe lângă care apare
        if r["x"] in solo or len(parteneri[r["x"]]) > 3 or r["n"] < 4 or r["v"] < 3e6 or r["n"] < 0.6 * tot[r["x"]]: continue
        if cuv(r["xn"]) == cuv(r["yn"]): continue
        add(c, "S10", 2 + int(r["n"] >= 8), f"{r['xn']} (alături de {r['yn']})", r["x"], f"{r['n']} contracte la {r['na']} autorități ({r['v']/1e6:,.1f} mil. lei), toate în asociere; {len(parteneri[r['x']])} parteneri în total, niciun contract propriu", r["v"],
            dict(cui=[r["x"], r["y"]], partener_principal=r["yn"]))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--doar"); a = ap.parse_args()
    c = db()
    c.executescript("""CREATE TABLE IF NOT EXISTS semnale(id INTEGER PRIMARY KEY, tip TEXT, scor INTEGER, entitate TEXT, cui TEXT, titlu TEXT, valoare REAL, detalii TEXT);
        CREATE INDEX IF NOT EXISTS ix_s_tip ON semnale(tip);""")
    fns = [("S1,S2,S12,S13", S1_S12_S13), ("S2", S2b), ("S3", S3), ("S4", S4), ("S5,S6,S11", S5_S6_S11), ("S7", S7), ("S8", S8), ("S9", S9), ("S10", S10)]
    if has(c, "da"): fns += FNS_DA  # achizițiile directe, dacă ingest/directe.py a rulat
    doar = set(a.doar.split(",")) if a.doar else None
    if not doar: c.execute("DELETE FROM semnale")
    for ids, fn in fns:
        if doar and not (doar & set(ids.split(","))): continue
        if doar:
            for i in ids.split(","): c.execute("DELETE FROM semnale WHERE tip=?", (i,))
        try: fn(c); c.commit()
        except Exception as e: log("EROARE", ids, repr(e)[:300])
    for r in c.execute("SELECT tip, count(*), round(sum(valoare)/1e6) FROM semnale GROUP BY 1 ORDER BY 1"): log(r[0], TIPURI[r[0]][0], "|", r[1], "semnale |", r[2], "mil. lei")

if __name__ == "__main__":
    main()
