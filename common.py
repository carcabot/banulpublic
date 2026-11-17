"""Utilitare comune: baza SQLite, apeluri SEAP politicoase, normalizări."""
import json, os, re, sqlite3, ssl, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "data", "integritate.db")
BASE = "https://e-licitatie.ro"
HEADERS = {"Content-Type": "application/json;charset=UTF-8", "User-Agent": "Mozilla/5.0",
           "Referer": BASE + "/pub/notices/contract-notices/list/3/1"}
CTX = ssl.create_default_context()

def _env():
    f = os.path.join(ROOT, ".env")
    if os.path.exists(f):
        for line in open(f):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1); os.environ.setdefault(k, v)
_env()
PROXY = os.environ.get("SEAP_PROXY")  # opțional: http://user:parola@host:port (în .env, neversionat)
ROTATIV = bool(PROXY and "-rotate" in PROXY)  # proxy rotativ: fiecare cerere iese pe alt IP, deci 403/erorile se reîncearcă
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY} if PROXY else {}),
                                     urllib.request.HTTPSHandler(context=CTX))
PAUSE = 0.3  # SEAP a răspuns 403 (blocare ~40 min+) după ~25 min la 2–3 cereri/s pe două fluxuri: un singur flux, lent


def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=120)
    c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL")
    c.row_factory = sqlite3.Row
    return c


def seap(method, path, body=None, retries=5):
    data = json.dumps(body).encode() if body is not None else None
    for a in range(retries):
        try:
            req = urllib.request.Request(BASE + path, method=method, data=data, headers=HEADERS)
            with OPENER.open(req, timeout=25 if ROTATIV else 90) as r:
                out = json.loads(r.read()); time.sleep(PAUSE); return out
        except urllib.error.HTTPError as e:
            if e.code == 403 and not ROTATIV:  # IP fix blocat de WAF: nu insistăm, oprim jobul (e incremental)
                raise SystemExit(f"SEAP 403 la {path} – oprit; reia peste câteva ore")
            if a == retries - 1:
                raise
            time.sleep(0.5 if ROTATIV else 3 * (a + 1))
        except Exception as e:  # noqa
            if a == retries - 1:
                raise
            time.sleep(0.5 if ROTATIV else 3 * (a + 1))


def cui(s):
    """CUI normalizat (doar cifre) sau textul ca atare pentru firme străine."""
    s = str(s or "").strip().upper()
    d = re.sub(r"^RO\s*", "", s); d2 = re.sub(r"\D", "", d)
    return d2 if d2 and len(d2) >= len(re.sub(r"\s", "", d)) - 1 else s


def num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return float(v)
    try: return float(str(v).replace(",", "").replace(" ", ""))
    except ValueError: return None


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)
