#!/usr/bin/env python3
"""Lista națională a anunțurilor SEAP (toate tipurile), pe ferestre de dată – incremental și reluabil.
   seap_list.py --din 2023-01-01 [--pana 2026-11-17] [--zile 3]
Stochează rândul brut în `anunturi` (cheie caNoticeId). Rulat zilnic, ia doar zilele noi."""
import argparse, datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, seap, log, num

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--din"); ap.add_argument("--pana"); ap.add_argument("--zile", type=int, default=3)
    a = ap.parse_args(); c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS anunturi(ca_notice_id INTEGER PRIMARY KEY, notice_no TEXT, tip INTEGER, data TEXT,
      autoritate TEXT, cui_autoritate TEXT, titlu TEXT, cpv TEXT, cpv_nume TEXT, tip_procedura TEXT, tip_contract TEXT,
      stare TEXT, valoare REAL, valoare_estimata REAL, oferta_min REAL, oferta_max REAL, moneda TEXT, raw TEXT);
    CREATE INDEX IF NOT EXISTS ix_an_no ON anunturi(notice_no); CREATE INDEX IF NOT EXISTS ix_an_cpv ON anunturi(cpv);
    CREATE INDEX IF NOT EXISTS ix_an_data ON anunturi(data);
    CREATE TABLE IF NOT EXISTS ferestre(start TEXT PRIMARY KEY, stop TEXT, n INTEGER);""")
    stop = dt.date.fromisoformat(a.pana) if a.pana else dt.date.today()
    last = c.execute("SELECT max(stop) FROM ferestre").fetchone()[0]
    d = dt.date.fromisoformat(a.din) if a.din else (dt.date.fromisoformat(last) - dt.timedelta(days=2) if last else dt.date(2023, 1, 1))
    while d < stop:
        e = min(d + dt.timedelta(days=a.zile), stop)
        if e < dt.date.today() - dt.timedelta(days=3) and c.execute("SELECT 1 FROM ferestre WHERE start=? AND stop=?", (d.isoformat(), e.isoformat())).fetchone():
            d = e; continue
        page, got, total, buf = 0, 0, None, []
        while True:
            r = seap("POST", "/api-pub/NoticeCommon/GetCANoticeList/", {
                "sysNoticeTypeIds": [], "sortProperties": [], "pageSize": 200, "pageIndex": page,
                "startPublicationDate": f"{d}T00:00:00.000Z", "endPublicationDate": f"{e}T00:00:00.000Z"})
            items = r.get("items") or []; total = r.get("total")
            for it in items:
                ca = it.get("contractingAuthorityNameAndFN") or ""
                cpv = it.get("cpvCodeAndName") or ""
                t = lambda k: (it.get(k) or {}).get("text") if isinstance(it.get(k), dict) else None
                buf.append((
                    it.get("caNoticeId"), it.get("noticeNo"), it.get("sysNoticeTypeId"), (it.get("noticeStateDate") or "")[:10],
                    ca.split(" - ", 1)[-1].strip() if " - " in ca else ca, ca.split(" - ", 1)[0].strip() if " - " in ca else None,
                    it.get("contractTitle"), cpv.split(" ")[0][:10], cpv.split(" - ", 1)[-1] if " - " in cpv else cpv,
                    t("sysProcedureType"), t("sysAcquisitionContractType"), t("sysProcedureState"),
                    num(it.get("ronContractValue")), num(str(it.get("estimatedValueExport") or "").split(" ")[0].replace(".", "").replace(",", ".")),
                    num(it.get("lowestOfferValue")), num(it.get("highestOfferValue")), it.get("currencyCode"),
                    json.dumps(it, ensure_ascii=False)))  # scriem la final, ca să nu ținem baza blocată în timpul cererilor
            got += len(items); page += 1
            if not items or got >= (total or 0): break
        if total and total >= 3000: log("ATENȚIE fereastră trunchiată", d, e, total)
        c.executemany("INSERT OR REPLACE INTO anunturi VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", buf)
        c.execute("INSERT OR REPLACE INTO ferestre VALUES(?,?,?)", (d.isoformat(), e.isoformat(), got)); c.commit()
        log(d, e, got)
        d = e

if __name__ == "__main__":
    main()
