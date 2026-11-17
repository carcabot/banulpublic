#!/usr/bin/env python3
"""Marca/modelul vehiculului pentru contractele din clusterele de microbuze, din surse publice (comunicate, presă), cu link.
Pas AI ieftin (Haiku prin `claude -p` cu căutare web), o singură dată per contract; rezultatul se păstrează în `modele`.
Apoi o verificare deterministă: pagina-sursă e descărcată și marca trebuie să apară în textul ei, altfel rămâne „neverificat”.
   ai_modele.py [--max 200] [--fire 4] [--model haiku] [--doar-verificare]"""
import argparse, html, json, os, re, shutil, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import db, log

CL = ("microbuz_electric", "microbuz_hibrid")
MARCI = r"aveuro|transit|ford|mercedes|sprinter|iveco|daily|karsan|e-?jest|bmc|isuzu|otokar|\bman\b|e-?tge|fiat|e-?ducato|ducato|renault|master|peugeot|boxer|citro[eë]n|jumper|qev|volkswagen|crafter|opel|movano|maxus|yutong|byd|temsa|toyota|higer|king ?long|zhongtong|novo ?citi|iveco|otokar|mellor|tribus|altas|indcar|automet|e-?deliver"
PROMPT = """Caută pe web ce marcă și ce model de microbuz a fost livrat efectiv în această achiziție publică din România. Folosește comunicate ale autorității, presă locală, anunțuri de livrare.

Achiziția: {aut} a cumpărat {q} microbuze {tip}{loc} de la {furn}, contract din {data}, valoare {val} lei fără TVA.

Reguli:
- Răspunde doar dacă o sursă publică numește marca/modelul pentru achiziția ACESTEI autorități (nu a altui județ, nu presupuneri după furnizor).
- „citat” este fraza exactă din sursă care numește marca/modelul.
- Dacă nu găsești, pune null la marca și model. Nu ghici.

Răspunde DOAR cu un obiect JSON: {{"marca": "...", "model": "...", "baza": "vehiculul de bază dacă e o conversie, altfel null", "sursa": "URL", "citat": "...", "observatii": "scurt"}}"""

def intreaba(exe, model, r):
    at = json.loads(r["atribute"] or "{}")
    p = PROMPT.format(aut=r["autoritate"], q=int(r["cantitate"]), tip="electrice" if r["cluster"] == "microbuz_electric" else "hibride",
                      loc=f" de {at['locuri']}+1 locuri" if at.get("locuri") else "", furn=r["castigatori"], data=r["data"], val=f"{r['valoare']:,.0f}")
    try:
        out = subprocess.run([exe, "-p", "--model", model, "--output-format", "text", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch", "--strict-mcp-config"], input=p, capture_output=True, text=True, timeout=420).stdout
        m = re.search(r"\{.*\}", out, re.S)
        return json.loads(m.group(0)) if m else {"observatii": "fără JSON: " + out[-200:]}
    except Exception as e:
        return {"observatii": "eroare: " + repr(e)[:150]}

def verifica(url, marca, model):
    """Descarcă sursa și caută marca (și modelul) în textul paginii."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "Accept-Language": "ro"})
        t = urllib.request.urlopen(req, timeout=30).read(3_000_000).decode("utf-8", "replace")
    except Exception as e:
        return "sursă inaccesibilă"
    t = html.unescape(re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", t)).lower()
    ok_m = marca and marca.lower().split()[0] in t
    ok_mod = model and any(w in t for w in re.findall(r"[a-z0-9-]{3,}", model.lower()))
    return "verificat în sursă" if ok_m and (ok_mod or not model) else ("marca apare în sursă" if ok_m else "nu apare în sursă")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--max", type=int, default=200); ap.add_argument("--fire", type=int, default=4); ap.add_argument("--model", default="haiku"); ap.add_argument("--doar-verificare", action="store_true")
    a = ap.parse_args(); c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS modele(ca_notice_id INTEGER, nr_contract TEXT, cluster TEXT, marca TEXT, model TEXT, baza TEXT, sursa TEXT, citat TEXT,
                 observatii TEXT, stare TEXT, ai_model TEXT, PRIMARY KEY(ca_notice_id, nr_contract, cluster))""")
    rows = [dict(r) for r in c.execute(f"""SELECT l.*, d.contracte ct FROM linii_pret l JOIN detalii d USING(ca_notice_id) WHERE l.cluster IN {CL} AND l.incredere>=0.6""")]
    # 1) ce spune deja SEAP (titlul contractului)
    for r in rows:
        ct = next((k.get("titlu") or "" for k in json.loads(r["ct"]) if k.get("nr") == r["nr_contract"]), "")
        m = re.search(r"marca\s+([A-ZĂÂÎȘȚa-z0-9][\w .-]{2,40}?)(?=[,)(;]|\s+în\b|\s+in\b|$)", ct)
        if m and re.search(MARCI, m.group(1), re.I):
            c.execute("INSERT OR REPLACE INTO modele VALUES(?,?,?,?,?,?,?,?,?,?,?)", (r["ca_notice_id"], r["nr_contract"], r["cluster"], m.group(1).split()[0], m.group(1).strip(), None,
                      f"https://e-licitatie.ro/pub/notices/ca-notices/view/{r['ca_notice_id']}", ct[:300], "din titlul contractului", "confirmat din SEAP", None))
    c.commit()
    if not a.doar_verificare:
        facut = {(x[0], x[1], x[2]) for x in c.execute("SELECT ca_notice_id, nr_contract, cluster FROM modele")}
        todo = [r for r in rows if (r["ca_notice_id"], r["nr_contract"], r["cluster"]) not in facut][:a.max]
        exe = shutil.which("claude"); log(len(todo), "contracte de căutat;", len(facut), "deja în tabel")
        if exe and todo:
            ex = ThreadPoolExecutor(a.fire); fs = {ex.submit(intreaba, exe, a.model, r): r for r in todo}
            for i, f in enumerate(as_completed(fs)):
                r = fs[f]; o = f.result() or {}
                marca = (o.get("marca") or "").strip() or None
                c.execute("INSERT OR REPLACE INTO modele VALUES(?,?,?,?,?,?,?,?,?,?,?)", (r["ca_notice_id"], r["nr_contract"], r["cluster"], marca, (o.get("model") or None), o.get("baza"),
                          o.get("sursa") if marca else None, (o.get("citat") or "")[:400] if marca else None, (o.get("observatii") or "")[:300], "de verificat" if marca else "negăsit", a.model))
                c.commit(); log(i + 1, "/", len(todo), r["autoritate"][:28], "→", marca, o.get("model"))
    # 2) verificare deterministă a sursei
    for r in c.execute("SELECT rowid, * FROM modele WHERE stare IN ('de verificat','sursă inaccesibilă') AND sursa IS NOT NULL").fetchall():
        c.execute("UPDATE modele SET stare=? WHERE rowid=?", (verifica(r["sursa"], r["marca"], r["model"]), r["rowid"]))
    c.commit()
    for r in c.execute("SELECT stare, count(*) FROM modele GROUP BY 1 ORDER BY 2 DESC"): log(r[0], r[1])

if __name__ == "__main__":
    main()
