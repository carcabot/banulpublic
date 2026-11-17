"""Clustere de produse comparabile. Fiecare: id, nume, cpv (prefixe), must (regex obligatoriu în text), nu (regex de excludere),
kw (regex al cuvântului-produs lângă care căutăm cantitatea), interval de preț unitar plauzibil (lei fără TVA), atribute."""
import re

def C(id, nume, cpv, must, kw, lo, hi, nu=None, attrs=None):
    return dict(id=id, nume=nume, cpv=tuple(cpv), must=[re.compile(m, re.I) for m in must], kw=kw,
                nu=re.compile(nu, re.I) if nu else None, lo=lo, hi=hi, attrs=attrs or {})

LOCURI = {"locuri": r"(\d{1,2})\s*\+\s*1|(\d{1,2})\s*(?:de\s+)?locuri"}
CLUSTERE = [
 C("microbuz_electric", "Microbuz electric (școlar)", ["341449", "341144", "34121"], [r"microbuz", r"electric"], r"microbuz\w*", 250e3, 1.7e6, nu=r"hibrid|plug", attrs=LOCURI),
 C("microbuz_hibrid", "Microbuz hibrid (școlar)", ["341449", "341144", "34121"], [r"microbuz", r"hibrid|plug"], r"microbuz\w*", 200e3, 1.5e6, attrs=LOCURI),
 C("autobuz_electric", "Autobuz electric", ["341449", "34121"], [r"autobuz", r"electric"], r"autobuz\w*", 1.0e6, 5e6, nu=r"microbuz|troleibuz|tramvai", attrs={"lungime_m": r"(\d{1,2})(?:[.,]\d)?\s*m(?:etri)?\b"}),
 C("troleibuz", "Troleibuz", ["34622", "341449"], [r"troleibuz"], r"troleibuz\w*", 1.5e6, 6e6),
 C("tramvai", "Tramvai", ["34622"], [r"tramvai"], r"tramvai\w*", 5e6, 25e6),
 C("ambulanta", "Ambulanță", ["341141", "34114"], [r"ambulan[tț]"], r"ambulan[tț]\w*", 250e3, 2.5e6),
 C("laptop", "Laptop", ["302131", "30213"], [r"laptop"], r"laptop\w*", 1500, 15000, nu=r"tabl[ăae]|imprimant|server"),
 C("tableta", "Tabletă", ["302132", "30213"], [r"\btablet[eaă]"], r"tablet\w*", 400, 6000, nu=r"laptop|tabl[ăae] interactiv"),
 C("tabla_interactiva", "Tablă / display interactiv", ["30195", "32322", "3219", "30231"], [r"tabl[ăae]\s+interactiv|display\w*\s+interactiv|ecran\w*\s+interactiv"], r"(?:tabl[ăae]|display\w*|ecran\w*)\s+interactiv\w*", 4000, 45000, nu=r"laptop"),
 C("statie_incarcare", "Stație de reîncărcare vehicule electrice", ["31158", "3168", "09310", "45310"], [r"sta[tț]i\w*\s+(?:de\s+)?(?:re)?[iî]nc[aă]rcare"], r"sta[tț]i\w*", 15e3, 1.2e6, nu=r"microbuz|autobuz", attrs={"kw": r"(\d{2,3})\s*kw"}),
 C("computer_tomograf", "Computer tomograf", ["33115"], [r"computer\s*tomograf|\btomograf"], r"tomograf\w*", 1.2e6, 14e6),
 C("rmn", "RMN", ["33113", "33111"], [r"\bRMN\b|rezonan[tț][aă]\s+magnetic"], r"RMN|aparat\w*", 2.5e6, 15e6),
 C("ecograf", "Ecograf", ["331122", "33112", "33124"], [r"ecograf"], r"ecograf\w*", 40e3, 1.2e6),
 C("defibrilator", "Defibrilator", ["33182", "33100"], [r"defibrilator"], r"defibrilator\w*", 4e3, 200e3),
 C("buldoexcavator", "Buldoexcavator", ["4326", "4321", "4320"], [r"buldoexcavator"], r"buldoexcavator\w*", 250e3, 1.1e6),
 C("tractor", "Tractor", ["167", "34138"], [r"\btractor"], r"tractor\w*", 120e3, 1.2e6, nu=r"remorc[ăa] f"),
 C("autogunoiera", "Autogunoieră", ["341445", "34144"], [r"autogunoier|autocompactoare"], r"autogunoier\w*|autocompactoare", 400e3, 2.2e6),
 C("automaturatoare", "Automăturătoare", ["341444", "34144", "3492"], [r"autom[aă]tur[aă]toare|m[aă]tur[aă]toare\s+strad"], r"\w*m[aă]tur[aă]toare\w*", 250e3, 2.2e6),
 C("autoturism", "Autoturism", ["3411"], [r"autoturism"], r"autoturism\w*", 45e3, 450e3, nu=r"servicii|repara|piese|asigur|leasing operațional", attrs={"electric": r"(electric|hibrid|plug)"}),
 C("autoutilitara", "Autoutilitară", ["3413", "3414"], [r"autoutilitar"], r"autoutilitar\w*", 70e3, 800e3, nu=r"servicii|repara|piese"),
 C("autospeciala_pompieri", "Autospecială de stingere", ["341442"], [r"autospecial\w+.*(stingere|incendi)|autopomp"], r"autospecial\w*|autopomp\w*", 1e6, 6e6),
 C("incubator", "Incubator nou-născuți", ["33152"], [r"incubator"], r"incubator\w*", 30e3, 500e3),
 C("ventilator_medical", "Ventilator medical", ["33157", "33195"], [r"ventilator\w*\s+(?:mecanic|pulmonar|medical|de terapie)|aparat\w*\s+de\s+ventila"], r"ventilator\w*|aparat\w*", 40e3, 500e3),
 C("pubela", "Pubelă / europubelă", ["34928", "44613", "3922"], [r"pubel[eaă]|europubel"], r"\w*pubel\w*", 80, 1500),
 C("panou_fotovoltaic", "Sistem / centrală fotovoltaică (kWp)", ["09331", "09332", "45261215"], [r"fotovoltaic"], r"kwp?", 2500, 9000, attrs={"kwp": r"(\d{1,5}(?:[.,]\d+)?)\s*kwp"}),
]
BY_ID = {c["id"]: c for c in CLUSTERE}

# Variante și conținutul contractului. Un „autobuz electric” de 18 m articulat și unul de 8 m sunt produse diferite, iar un
# contract care cuprinde și stații de încărcare nu se compară cu unul doar pentru vehicule. Varianta se deduce din textul
# anunțului; când textul nu spune, rămâne „nespecificată” și contractul nu intră în nicio comparație de preț.
INCLUDE = [("stații de încărcare", r"sta[tț]i\w*\s+(?:de\s+)?(?:re)?[iî]nc[aă]rcare|[iî]nc[aă]rc[aă]toa"), ("sistem ITS sau ticketing", r"\bITS\b|e-?ticketing|taxare|sistem\w*\s+inteligent"),
           ("service sau mentenanță", r"mentenan[tț]|service|[iî]ntre[tț]inere"), ("leasing", r"leasing"), ("dotări suplimentare", r"echipat|dot[aă]ri|accesorii")]
def include(text, cid=""):
    """Ce mai cuprinde contractul pe lângă produs, după textul anunțului."""
    return [n for n, rx in INCLUDE if re.search(rx, text or "", re.I) and not (cid == "statie_incarcare" and n == "stații de încărcare")]

def _lungime(text):
    """Lungimea unui autobuz în metri. La un interval („gama de 6-8 m”) se ia capătul de sus."""
    for m in re.finditer(r"(\d{1,2})(?:[.,](\d))?\s*(?:[-–]\s*(\d{1,2})(?:[.,](\d))?\s*)?(?:m|metri|ml)\b", text or "", re.I):
        v = float(f"{m[3]}.{m[4] or 0}") if m[3] else float(f"{m[1]}.{m[2] or 0}")
        if 5 <= v <= 19: return v
    return None

def varianta(cid, atr, text):
    """Eticheta variantei în care se compară prețul. Șir gol dacă produsul nu are variante."""
    atr = atr or {}
    if cid == "autobuz_electric":
        L = _lungime(text)
        if L is None:
            try: L = float(str(atr.get("lungime_m") or "").replace(",", "."))
            except ValueError: L = None
        if L is None or not 5 <= L <= 19: return "lungime nespecificată"
        return "până la 8 m (midibuz)" if L <= 8.5 else "9–11 m" if L < 11.5 else "12 m" if L <= 13.5 else "18 m (articulat)" if L >= 16 else f"{L:g} m"
    if cid in ("microbuz_electric", "microbuz_hibrid"):
        return f"{atr['locuri']}+1 locuri" if atr.get("locuri") else "locuri nespecificate"
    if cid == "autoturism":
        e = str(atr.get("electric") or "").lower()
        return "electric" if e.startswith("electric") else "hibrid plug-in" if e.startswith("plug") else "hibrid" if e.startswith("hibrid") else "motorizare nespecificată"
    if cid == "statie_incarcare":
        try: k = float(atr.get("kw"))
        except (TypeError, ValueError): return "putere nespecificată"
        return "până la 22 kW (lentă)" if k <= 22 else "peste 22 kW (rapidă)"
    return ""

def potrivire(text, cpv=""):
    """Întoarce clusterele în care se încadrează un text (titlu contract/lot)."""
    out = []
    for c in CLUSTERE:
        if all(m.search(text) for m in c["must"]) and not (c["nu"] and c["nu"].search(text)):
            out.append(c)
    return out

def candidat(titlu, cpv):
    """Filtru larg pentru anunțurile ale căror detalii merită descărcate."""
    t = titlu or ""
    return any(c["must"][0].search(t) for c in CLUSTERE) or any((cpv or "").startswith(p) for c in CLUSTERE for p in c["cpv"] if len(p) >= 5)
