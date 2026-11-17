#!/usr/bin/env python3
"""Detaliile anunțurilor de atribuire candidate la comparatorul de preț: loturi (descriere) + contracte (titlu, valoare,
câștigători). Reluabil; o singură descărcare per anunț. seap_detail.py [--max 5000] [--din 2023-01-01] [--tot]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, seap, log
from transform.clustere import candidat, CLUSTERE

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--max", type=int, default=100000); ap.add_argument("--din", default="2023-01-01"); ap.add_argument("--tot", action="store_true"); ap.add_argument("--doar-cuvinte", action="store_true"); ap.add_argument("--fire", type=int, default=1)
    a = ap.parse_args(); c = db()
    c.execute("CREATE TABLE IF NOT EXISTS detalii(ca_notice_id INTEGER PRIMARY KEY, notice TEXT, contracte TEXT, preluat TEXT)")
    rows = c.execute("""SELECT ca_notice_id, titlu, cpv FROM anunturi WHERE tip IN (3,18) AND data >= ? AND stare LIKE 'Atribuit%'
        AND ca_notice_id NOT IN (SELECT ca_notice_id FROM detalii) ORDER BY data DESC""", (a.din,)).fetchall()
    kw = lambda r: any(cl["must"][0].search(r["titlu"] or "") for cl in CLUSTERE)
    todo = [r for r in rows if kw(r)] + ([] if a.doar_cuvinte else [r for r in rows if not kw(r) and (a.tot or candidat(r["titlu"], r["cpv"]))])
    todo = todo[:a.max]
    log(len(todo), "anunțuri de detaliat din", len(rows))
    from concurrent.futures import ThreadPoolExecutor
    def ia(r):
        nid = r["ca_notice_id"]
        try:
            nv = seap("GET", f"/api-pub/C_PUBLIC_CANotice/get/{nid}")
            ct = seap("POST", "/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts", {"caNoticeId": nid, "contractNo": None, "winnerTitle": None,
                "winnerFiscalNumber": None, "contractDate": {"from": None, "to": None}, "contractValue": {"from": None, "to": None},
                "contractMinOffer": {"from": None, "to": None}, "contractMaxOffer": {"from": None, "to": None}, "contractTitle": None,
                "lots": None, "sortOrder": [], "sysContractFrameworkType": {}, "skip": 0, "take": 200})
            return nid, nv, ct
        except BaseException as e:
            log("eroare", nid, repr(e)[:120]); return nid, None, None
    from concurrent.futures import as_completed
    ex = ThreadPoolExecutor(a.fire)
    for i, fut in enumerate(as_completed([ex.submit(ia, r) for r in todo])):  # în ordinea terminării: o cerere lentă nu le blochează pe celelalte
        nid, nv, ct = fut.result()
        if nv is None: continue
        # păstrăm doar ce folosim (anunțul complet are 30–60 KB)
        e = (nv or {}).get("caNoticeEdit_New") or {}
        s2 = e.get("section2_New") or {}
        slim = {"titlu": (s2.get("section2_1_New") or {}).get("contractTitle"), "descriere": (s2.get("section2_1_New") or {}).get("shortDescription"),
                "valoare_totala": (s2.get("section2_1_New") or {}).get("totalAcquisitionValue"),
                "loturi": [{"nr": L.get("lotNumber"), "titlu": L.get("contractTitle"), "descriere": L.get("shortDescription"), "estimat": L.get("estimatedValue"),
                            "criterii": [(k.get("noticeAwardCriteriaName"), k.get("noticeAwardCriteriaWeight")) for k in (L.get("noticeAwardCriteriaList") or [])]}
                           for L in ((s2.get("section2_2_New") or {}).get("descriptionList") or [])],
                "anulate": [{"nr": (x.get("noticeLot") or {}).get("no"), "motiv": x.get("cancellationReasonComment")} for x in ((e.get("section5") or {}).get("cancelledLotList") or [])]}
        cs = [{"nr": x.get("contractNo"), "data": (x.get("contractDate") or "")[:10], "titlu": x.get("contractTitle"), "valoare": x.get("defaultCurrencyContractValue") or x.get("contractValue"),
               "oferta_min": x.get("defaultCurrencyContractValueMinOffer"), "oferta_max": x.get("defaultCurrencyContractValueMaxOffer"),
               "loturi": x.get("lotsNoCaption"), "loturi_text": x.get("lotsCaption"), "modificari": x.get("modifiedCount"), "tip": x.get("contractType"), "castigatori": [{"nume": w.get("name"), "cui": w.get("fiscalNumber"), "tara": (w.get("address") or {}).get("country"),
                                                       "email": (w.get("address") or {}).get("email"), "imm": (w.get("address") or {}).get("isSME")} for w in (x.get("winners") or [])],
               } for x in ((ct or {}).get("items") or [])]
        c.execute("INSERT OR REPLACE INTO detalii VALUES(?,?,?,date('now'))", (nid, json.dumps(slim, ensure_ascii=False), json.dumps(cs, ensure_ascii=False)))
        c.commit()
        if i % 50 == 0: log(i, "/", len(todo))
    c.commit()

if __name__ == "__main__":
    main()
