"""Semnale din achizițiile directe (tabelul `da`, încărcat de ingest/directe.py). Chemate din detect/semnale.py.
Codurile din paranteze sunt cele din ghidul Corpului de Control al Prim-Ministrului (2021), ca în skill-ul anticoruptie-uat."""
import json, re

DIN = "2023-01-01"
# Pragurile achiziției directe, fără TVA (Legea 98/2016 art. 7 alin. 5), valabile 2023–2026. Se verifică anual pe anap.gov.ro.
PRAG_PS, PRAG_L = 270120, 900400
# Lucrările se recunosc și după codul CPV (diviziunea 45), fiindcă unele fișiere nu au tipul contractului.
PRAG = f"CASE WHEN tip_contract LIKE 'Lucr%' OR cpv LIKE '45%' THEN {PRAG_L} ELSE {PRAG_PS} END"
# Scoase din calcul: utilități, carburanți, poștă și telecom (furnizor impus sau preț reglementat) și serviciile din anexa 2
# a legii (sociale, sănătate, învățământ, hoteluri și restaurante, juridice, pază, evenimente, culturale), care au alt regim și alt prag.
FARA = " AND ".join(f"cpv NOT LIKE '{p}%'" for p in ("09", "65", "64", "55", "85", "80", "75", "92", "98", "791", "797", "7995", "66"))
BAZA = f"publicat>='{DIN}' AND valoare BETWEEN 1 AND 5e6 AND cui_furnizor IS NOT NULL AND {FARA}"  # peste 5 mil. lei sunt erori de introducere

# În SEAP cumpără și entități care nu sunt autorități contractante în sensul Legii 98/2016: firme private, asociații, fundații
# (de regulă pe bani europeni) și societăți de utilități, care urmează Legea 99/2016 cu alte praguri. Pragurile de aici nu li se aplică.
ALT_REGIM = re.compile(r"(?i)(^|[\s.,(\-])(s\.?\s?r\.?\s?l|s\.?\s?a|s\.?c\.?s|p\.?f\.?a|i\.?i|asocia[tț]i[ae]|funda[tț]i[ae]|cooperativ[aă]?|parohi[ae]|hospital|cabinet)\.?($|[\s.,)\-])")
def alt_regim(nume): return bool(ALT_REGIM.search(nume or ""))

TIPURI_DA = {
 "S14": ("Achiziții directe repetate care depășesc împreună pragul legal", "Posibilă fragmentare a achiziției pentru a evita procedura (A2)"),
 "S15": ("Achiziții directe peste pragul legal", "Valoarea cerea o procedură, nu cumpărare directă (A3)"),
 "S16": ("Un furnizor domină achizițiile directe ale autorității", "Câștigare repetată fără concurență (E14)"),
}

def add(c, tip, scor, entitate, cui, titlu, valoare, det):
    c.execute("INSERT INTO semnale(tip,scor,entitate,cui,titlu,valoare,detalii) VALUES(?,?,?,?,?,?,?)", (tip, scor, entitate, cui, titlu, valoare, json.dumps(det, ensure_ascii=False)))

def exemple(c, where, par, n=6):
    return [dict(cod=r["cod"], data=r["publicat"][:10], valoare=r["valoare"], obiect=(r["obiect"] or "")[:140])
            for r in c.execute(f"SELECT cod, publicat, valoare, obiect FROM da WHERE {where} ORDER BY valoare DESC LIMIT {n}", par)]

def S14(c):
    """Aceeași autoritate, același furnizor, același cod CPV, în același an: cel puțin 3 achiziții directe, fiecare sub prag, care împreună trec de prag.
    Legea cere ca valoarea să se estimeze cumulat pe produse sau servicii similare (art. 11), deci împărțirea în bucăți sub prag ocolește procedura."""
    q = f"""SELECT cui_autoritate a, max(autoritate) an, cui_furnizor w, max(furnizor) wn, substr(publicat,1,4) y, cpv, max(cpv_nume) cn, max({PRAG}) prag,
                   count(*) n, sum(valoare) v, max(valoare) vmax, min(publicat) d1, max(publicat) d2
            FROM da WHERE {BAZA} GROUP BY 1,3,5,6 HAVING n>=3 AND vmax<prag AND v>=1.5*prag ORDER BY v/prag DESC LIMIT 3000"""
    for r in c.execute(q).fetchall():
        if alt_regim(r["an"]): continue
        add(c, "S14", 2 + int(r["v"] >= 3 * r["prag"]), r["an"], r["a"],
            f"{r['n']} achiziții directe în {r['y']} de la {r['wn']}, {r['v']:,.0f} lei în total, de {r['v']/r['prag']:.1f} ori pragul de {r['prag']:,} lei", r["v"],
            dict(furnizor=r["wn"], cui_furnizor=r["w"], an=int(r["y"]), obiect=(r["cn"] or "").replace(" (Rev.2)", ""), cpv=r["cpv"], achizitii=r["n"], prag=r["prag"], perioada=[r["d1"][:10], r["d2"][:10]],
                 cele_mai_mari=exemple(c, "cui_autoritate=? AND cui_furnizor=? AND cpv=? AND substr(publicat,1,4)=?", (r["a"], r["w"], r["cpv"], r["y"]), 5)))

def S15(c):
    """Achiziții directe a căror valoare trece singură de pragul legal. Marja de 10% lasă deoparte diferențele de rotunjire și de curs."""
    q = f"""SELECT cui_autoritate a, max(autoritate) an, count(*) n, sum(valoare) v, count(DISTINCT cui_furnizor) nf, min(publicat) d1, max(publicat) d2
            FROM da WHERE {BAZA} AND valoare>=1.1*{PRAG} GROUP BY 1 HAVING n>=2 ORDER BY v DESC LIMIT 1500"""
    for r in c.execute(q).fetchall():
        if alt_regim(r["an"]): continue
        add(c, "S15", 2 + int(r["n"] >= 5), r["an"], r["a"], f"{r['n']} achiziții directe peste prag, {r['v']:,.0f} lei în total, la {r['nf']} furnizori", r["v"],
            dict(achizitii=r["n"], furnizori=r["nf"], praguri=dict(produse_servicii=PRAG_PS, lucrari=PRAG_L), perioada=[r["d1"][:10], r["d2"][:10]],
                 cele_mai_mari=exemple(c, f"cui_autoritate=? AND {BAZA} AND valoare>=1.1*{PRAG}", (r["a"],), 6)))

def S16(c):
    """Un singur furnizor ia cel puțin 40% din valoarea achizițiilor directe ale unei autorități care cumpără direct mult și des."""
    q = f"""WITH p AS (SELECT cui_autoritate a, max(autoritate) an, cui_furnizor w, max(furnizor) wn, count(*) n, sum(valoare) v, min(publicat) d1, max(publicat) d2, count(DISTINCT substr(publicat,1,4)) ani
                       FROM da WHERE {BAZA} GROUP BY 1,3),
                 t AS (SELECT a, sum(v) tv, sum(n) tn, count(*) nf FROM p GROUP BY 1)
            SELECT p.*, t.tv, t.tn, t.nf FROM p JOIN t USING(a) WHERE t.tn>=40 AND t.tv>=1e6 AND p.n>=10 AND p.ani>=2 AND p.v>=0.4*t.tv ORDER BY p.v DESC LIMIT 1500"""
    for r in c.execute(q).fetchall():
        if alt_regim(r["an"]): continue
        add(c, "S16", 2 + int(r["v"] >= 0.6 * r["tv"]), r["an"], r["a"], f"{r['wn']}: {100*r['v']/r['tv']:.0f}% din achizițiile directe ale autorității ({r['n']} din {r['tn']}, {r['v']:,.0f} lei)", r["v"],
            dict(furnizor=r["wn"], cui_furnizor=r["w"], achizitii=r["n"], total_achizitii_directe=r["tn"], total_valoare=r["tv"], furnizori_in_total=r["nf"], perioada=[r["d1"][:10], r["d2"][:10]],
                 cele_mai_mari=exemple(c, "cui_autoritate=? AND cui_furnizor=?", (r["a"], r["w"]), 5)))

FNS_DA = [("S14", S14), ("S15", S15), ("S16", S16)]
