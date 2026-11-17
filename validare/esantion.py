#!/usr/bin/env python3
"""Eșantion de verificare: 5 semnale de top + 5 aleatorii per tip (sămânță fixă), cu fapte suplimentare din bază pentru judecată.
   esantion.py S3 S4 …  → tipărește compact și salvează validare/esantion_<tip>.json"""
import json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db
c = db(); DIN = "2023-01-01"
def q1(sql, *a):
    r = c.execute(sql, a).fetchone(); return tuple(r) if r else ()
for tip in sys.argv[1:]:
    rows = [dict(r) for r in c.execute("SELECT * FROM semnale WHERE tip=? ORDER BY scor DESC, valoare DESC", (tip,))]
    top = rows[:5]; rest = rows[5:]; random.seed(7); smp = top + random.sample(rest, min(5, len(rest)))
    print(f"\n===== {tip} ({len(rows)} semnale)")
    for i, s in enumerate(smp, 1):
        d = json.loads(s["detalii"]); extra = ""
        if tip == "S3":
            extra = "top3 contracte: " + str([(round(r[0] / 1e6, 1), r[1][:22], r[2]) for r in c.execute(f"SELECT valoare_parte, autoritate, tip_procedura FROM contracte WHERE cui_castigator=? AND substr(cpv,1,8)=? AND data_contract>='{DIN}' AND valoare_parte BETWEEN 1 AND 5e8 ORDER BY 1 DESC LIMIT 3", (s["cui"], d["cpv"]))]) + f" | n={d['contracte']} furnizori={d['furnizori_in_piata']}"
        elif tip == "S4":
            extra = f"n={d['contracte']} {d['perioada']} alte_aut={d['alte_autoritati_ale_firmei']} | obiecte: " + str([r[0][:30] for r in c.execute(f"SELECT cpv_nume FROM contracte WHERE cui_castigator=? AND cui_autoritate=? GROUP BY 1 ORDER BY sum(valoare_parte) DESC LIMIT 2", (d["cui_furnizor"], s["cui"]))]) + " | proceduri: " + str([tuple(r) for r in c.execute("SELECT tip_procedura, count(*) FROM contracte WHERE cui_castigator=? AND cui_autoritate=? GROUP BY 1", (d["cui_furnizor"], s["cui"]))])
        elif tip == "S5":
            f = q1("SELECT caen, adresa, stare FROM firme WHERE cui=?", s["cui"])
            extra = f"CAEN {f[0]} | {(f[1] or '')[:50]} | {(f[2] or '')[:30]} | obiecte: " + str([r[0][:28] for r in c.execute("SELECT cpv_nume FROM contracte WHERE cui_castigator=? GROUP BY 1 ORDER BY sum(valoare_parte) DESC LIMIT 2", (s["cui"],))]) + " | asociat în: " + str(q1("SELECT sum(n_asociati>1), count(*) FROM contracte WHERE cui_castigator=?", s["cui"])) + " | aut: " + "; ".join(x[:24] for x in d["autoritati"][:3])
        elif tip == "S7":
            extra = (d.get("motive") or "")[:260].replace("\n", " ")
        elif tip == "S8":
            extra = f"{d['perioada']} | " + (d.get("obiecte") or "")[:150]
        elif tip == "S9":
            extra = f"anulări: {[x['data'] for x in d['anulari'][:6]]} atribuiri: {[(x['data'], round((x['valoare'] or 0)/1e6,2)) for x in d['atribuiri'][:3]]}"
        elif tip == "S10":
            extra = " | ".join(f"{k}: solo={q1('SELECT count(*) FROM contracte WHERE cui_castigator=? AND n_asociati=1', k)[0]} asociat={q1('SELECT count(*) FROM contracte WHERE cui_castigator=? AND n_asociati>1', k)[0]} parteneri_distincti={q1('SELECT count(DISTINCT b.cui_castigator) FROM contracte a JOIN contracte b ON a.anunt_atribuire=b.anunt_atribuire AND a.nr_contract IS b.nr_contract AND a.cui_autoritate=b.cui_autoritate AND b.cui_castigator!=a.cui_castigator WHERE a.cui_castigator=?', k)[0]}" for k in d["cui"])
        elif tip == "S11":
            extra = d["adresa"][:60] + " | " + "; ".join(f"{x['nume'][:26]} {x['valoare']/1e6:.1f}m/{x['contracte']}c" for x in d["firme"])
        elif tip == "S2":
            extra = json.dumps({k: v for k, v in d.items() if k != "contracte"}, ensure_ascii=False)[:230] + (" | " + "; ".join(f"{x['autoritate'][:18]} {x['data']} ×{x['cantitate']:.0f}" for x in d.get("contracte", [])[:6]) if "contracte" in d else "")
        elif tip in ("S1", "S13"):
            extra = json.dumps({k: (v[:170] if isinstance(v, str) else v) for k, v in d.items() if k not in ("link", "mediana", "cluster")}, ensure_ascii=False)[:330]
        elif tip == "S12":
            extra = f"min: {d['minim']['autoritate'][:26]} {d['minim']['data']} | max: {d['maxim']['autoritate'][:26]} {d['maxim']['data']}"
        s["_extra"] = extra
        print(f"{i:2}. [{s['scor']}] {s['entitate'][:44]} | {s['titlu'][:150]}\n     {extra[:400]}")
    json.dump(smp, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f"esantion_{tip}.json"), "w"), ensure_ascii=False, indent=1)
