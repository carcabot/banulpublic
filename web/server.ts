// Banul public – server SSR (Bun + SQLite doar-citire). Pornește cu:  bun web/server.ts   (PORT=3210)
import { Database } from "bun:sqlite";
import { join } from "path";
import { makeMcp, MCP_TOOLS_DOC } from "./mcp";
import { makeLimiter } from "./limita";
const PORT = +(process.env.PORT || 3210);
// Adresa publică a site-ului: intră în canonical, sitemap, robots.txt, JSON-LD și în adresele întoarse de MCP.
const ORIGIN = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const db = new Database(join(import.meta.dir, "..", "data", "site.db"), { readonly: true });
const M = JSON.parse((db.query("SELECT v FROM meta WHERE k='meta'").get() as any).v);
const q = (sql: string) => db.query(sql);
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const n0 = (x: any) => (x == null ? "–" : Math.round(x).toLocaleString("ro-RO"));
const milT = (x: any) => (x == null ? "–" : x >= 1e9 ? (x / 1e9).toLocaleString("ro-RO", { maximumFractionDigits: 2 }) + " mld. lei" : x >= 1e6 ? (x / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 1 }) + " mil. lei" : n0(x) + " lei");
// Sumele se scriu în lei. Dacă site.db are cursul BNR (meta.curs_eur), fiecare sumă poartă valoarea în lei în data-lei,
// iar scriptul din pagină o poate rescrie în euro la cererea cititorului. În atribute și în descrieri se folosește milT (text simplu).
const CURS = +M.curs_eur || 0;
const bani = (v: any, f: string, txt: string) => (CURS && v != null && isFinite(+v) ? `<span class="bani" data-lei="${Math.round(+v)}" data-f="${f}">${txt}</span>` : txt);
const mil = (x: any) => bani(x, "m", milT(x));
const lei = (x: any) => bani(x, "n", n0(x));
const leiU = (x: any) => bani(x, "u", n0(x) + " lei");
const MON = (l: string, e: string) => (CURS ? `<span class="mon" data-l="${l}" data-e="${e}">${l}</span>` : l);
// titlurile semnalelor sunt generate cu separatori englezești (913,000.50) – le afișăm românește (913.000,50)
const roNum = (t: string) => String(t ?? "").replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+/g, (m) => m.replace(/[.,]/g, (c) => (c === "," ? "." : ",")).replace(/,00$/, ""));
const seap = (nid: any) => `https://e-licitatie.ro/pub/notices/ca-notices/view/${nid}`;
const slugJ = (j: string) => j.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, "-");
const JBY = Object.fromEntries(M.judete.map((j: string) => [slugJ(j), j]));
const AB: Record<string, [string, number, number]> = { "Satu Mare": ["SM", 1, 0], "Maramureș": ["MM", 2, 0], "Suceava": ["SV", 4, 0], "Botoșani": ["BT", 5, 0], "Bihor": ["BH", 0, 1], "Sălaj": ["SJ", 1, 1], "Bistrița-Năsăud": ["BN", 2, 1], "Neamț": ["NT", 4, 1], "Iași": ["IS", 5, 1], "Arad": ["AR", 0, 2], "Cluj": ["CJ", 1, 2], "Mureș": ["MS", 2, 2], "Harghita": ["HR", 3, 2], "Bacău": ["BC", 4, 2], "Vaslui": ["VS", 5, 2], "Timiș": ["TM", 0, 3], "Alba": ["AB", 1, 3], "Sibiu": ["SB", 2, 3], "Brașov": ["BV", 3, 3], "Covasna": ["CV", 4, 3], "Vrancea": ["VN", 5, 3], "Galați": ["GL", 6, 3], "Caraș-Severin": ["CS", 0, 4], "Hunedoara": ["HD", 1, 4], "Vâlcea": ["VL", 2, 4], "Argeș": ["AG", 3, 4], "Prahova": ["PH", 4, 4], "Buzău": ["BZ", 5, 4], "Brăila": ["BR", 6, 4], "Tulcea": ["TL", 7, 4], "Mehedinți": ["MH", 0, 5], "Gorj": ["GJ", 1, 5], "Olt": ["OT", 2, 5], "Dâmbovița": ["DB", 3, 5], "Ilfov": ["IF", 4, 5], "Ialomița": ["IL", 5, 5], "Constanța": ["CT", 6, 5], "Dolj": ["DJ", 1, 6], "Teleorman": ["TR", 2, 6], "Giurgiu": ["GR", 3, 6], "București": ["B", 4, 6], "Călărași": ["CL", 5, 6] };


// Paleta: verde-cerneală pe hârtie rece, chihlimbar doar pentru semnale. Titlurile și textul de poveste sunt în serif de sistem, cifrele rămân în sans cu lățime fixă.
const CSS = `:root{--serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;--bg:#f3f6f2;--panel:#fff;--raised:#e8eeea;--line:#d2dbd5;--ink:#13231f;--ink2:#3f514b;--mut:#5d6e67;--link:#0e6a5a;--series:#1f7a6b;--sig:#8a5200;--sig-bg:#f8ecd0;--ok:#19693b;--ok-bg:#ddf0e4;--bad:#a12529;--bad-bg:#f9e0e0;
--a0:#f5eed8;--a1:#ead28c;--a2:#d6a537;--a3:#a56c0c;--a4:#734507;--b0:#dbeee8;--b1:#a8d5c9;--b2:#5caf9b;--b3:#1f7a6b;--b4:#0b493f;--tlo:#13231f;--thi:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#0e1918;--panel:#142322;--raised:#1c302e;--line:#2b4340;--ink:#e9efe9;--ink2:#b5c4be;--mut:#8ea29b;--link:#8fd6c2;--series:#6cc0ab;--sig:#f0bd62;--sig-bg:#392d13;--ok:#70d39b;--ok-bg:#122f1f;--bad:#f09090;--bad-bg:#391a1a;
--a0:#28240f;--a1:#5a4816;--a2:#92711e;--a3:#cf9f35;--a4:#f3c766;--b0:#132e2a;--b1:#1c4d45;--b2:#2e7b6d;--b3:#55b19c;--b4:#a6e3d3;--tlo:#e9efe9;--thi:#0e1918}}
:root[data-theme=dark]{color-scheme:dark;--bg:#0e1918;--panel:#142322;--raised:#1c302e;--line:#2b4340;--ink:#e9efe9;--ink2:#b5c4be;--mut:#8ea29b;--link:#8fd6c2;--series:#6cc0ab;--sig:#f0bd62;--sig-bg:#392d13;--ok:#70d39b;--ok-bg:#122f1f;--bad:#f09090;--bad-bg:#391a1a;
--a0:#28240f;--a1:#5a4816;--a2:#92711e;--a3:#cf9f35;--a4:#f3c766;--b0:#132e2a;--b1:#1c4d45;--b2:#2e7b6d;--b3:#55b19c;--b4:#a6e3d3;--tlo:#e9efe9;--thi:#0e1918}
:root[data-theme=light]{color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:110px}body{margin:0;background:var(--bg);color:var(--ink);border-top:3px solid var(--series);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}:focus-visible{outline:2px solid var(--series);outline-offset:2px;border-radius:4px}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.wrap{max-width:1152px;margin:0 auto;padding:0 24px}@media(max-width:640px){.wrap{padding:0 16px}}
header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.topin{display:flex;align-items:center;gap:22px;min-height:56px}.brand{display:flex;align-items:center;gap:9px;font-family:var(--serif);font-weight:600;font-size:18px;color:var(--ink);letter-spacing:-.01em}.brand:hover{text-decoration:none}
.brand svg{flex:none}.tema{flex:none;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13.5px;color:var(--ink2);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}.tema:hover{color:var(--ink)}.moneda{flex:none;font:inherit;font-size:13.5px;color:var(--ink2);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;white-space:nowrap}.moneda:hover{color:var(--ink)}.tema svg{display:block}nav{display:flex;gap:18px;font-size:14px}nav a{color:var(--mut)}nav a:hover,nav a.on{color:var(--ink);text-decoration:none}
form.s{margin-left:auto;position:relative;flex:0 1 320px}input[type=search],select{width:100%;font:inherit;font-size:14px;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}input[type=search]:focus{border-color:var(--series)}select{width:auto}
input[type=search]::placeholder{color:var(--mut)}@media(max-width:760px){.tema span{display:none}.tema{padding:7px}.topin{flex-wrap:wrap;gap:8px 16px;padding:10px 0}nav{order:3;width:100%;min-width:0;overflow-x:auto;gap:16px;padding-bottom:2px}form.s{flex:1 1 160px;margin-left:0}.secnav{top:0;position:static}header.top{position:static}}
main.wrap{padding-bottom:72px}h1{overflow-wrap:anywhere;font-family:var(--serif);font-size:36px;line-height:1.15;font-weight:600;letter-spacing:-.015em;margin:0}@media(max-width:640px){h1{font-size:28px}}h2{font-size:16px;line-height:1.4;font-weight:600;letter-spacing:-.015em;margin:0 0 12px}
.crumb{font-size:14px;color:var(--mut);padding:20px 0 10px;display:flex;gap:8px;flex-wrap:wrap}.crumb a{color:var(--mut)}.crumb span{opacity:.5}
.idrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0 0}.chipid{font-size:13px;padding:3px 9px;border-radius:4px;background:var(--raised);border:1px solid var(--line);color:var(--ink);cursor:pointer}
.st{display:inline-block;white-space:nowrap;flex:none;font-size:12.5px;font-weight:550;padding:3px 9px;border-radius:4px}.st.ok{color:var(--ok);background:var(--ok-bg)}.st.sig{color:var(--sig);background:var(--sig-bg)}.st.bad{color:var(--bad);background:var(--bad-bg)}.st.neu{color:var(--ink2);background:var(--raised)}
.story{font-family:var(--serif);font-size:18px;line-height:1.6;color:var(--ink2);max-width:68ch;margin:18px 0 0}.story b{color:var(--ink);font-weight:600}
.secnav{position:sticky;top:56px;z-index:10;background:var(--bg);border-bottom:1px solid var(--line);margin:22px 0 22px;display:flex;gap:20px;overflow-x:auto;font-size:14px}.secnav a{color:var(--mut);padding:11px 0;white-space:nowrap;border-bottom:2px solid transparent}.secnav a:hover{color:var(--ink);text-decoration:none;border-color:var(--line)}.secnav a[aria-current]{color:var(--ink);border-bottom-color:var(--series);font-weight:600}
.box{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px 20px;overflow:hidden}.box+.box,.box+.cols,.cols+.box{margin-top:16px}.box>h2{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:-18px -20px 16px;padding:12px 20px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--raised) 50%,var(--panel))}.box>h2+.tw{margin-top:-16px;border-top:0}.box>h2 small{font-weight:400;font-size:13.5px;color:var(--mut);letter-spacing:0}
.cols{display:grid;grid-template-columns:352px 1fr;gap:16px;align-items:start}.cols .box+.box{margin-top:0}.cols.even{grid-template-columns:1fr 1fr}@media(max-width:900px){.cols,.cols.even{grid-template-columns:minmax(0,1fr)}}.cols>*{min-width:0}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:9px 18px;font-size:14px;margin:0}.kv dt{color:var(--mut)}.kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border:1px solid var(--line);border-radius:6px;background:var(--panel);margin:22px 0 0;overflow:hidden}
.fig{padding:14px 18px;border-right:1px solid var(--line)}.fig:last-child{border-right:0}.fig b{display:block;font-size:24px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.fig>span{font-size:13.5px;color:var(--ink2)}.fig.hot b{color:var(--sig)}
@media(max-width:700px){.figs{grid-template-columns:1fr 1fr}.fig{border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.fig:nth-child(2n){border-right:0}.fig:last-child:nth-child(odd){grid-column:1/-1;border-right:0;border-bottom:0}.fig b{font-size:19px}}
.tw{overflow-x:auto;margin:0 -20px -18px;border-top:1px solid var(--line)}.box .tw:has(+.note){margin-bottom:0;border-bottom:1px solid var(--line)}.tw.bare{margin:0;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}th:first-child,td:first-child{padding-left:20px}th:last-child,td:last-child{padding-right:20px}tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:color-mix(in srgb,var(--raised) 55%,transparent)}th{font-size:13px;color:var(--ink2);font-weight:550;white-space:nowrap;background:color-mix(in srgb,var(--raised) 50%,var(--panel))}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.nw{white-space:nowrap}td .sub{display:block;font-size:13.5px;color:var(--mut)}
.yb{display:grid;gap:14px;align-items:end;height:180px;border-bottom:1px solid var(--line);padding:0 4px 26px;position:relative}.yb div{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative}.yb span{font-size:13px;color:var(--ink2);margin-bottom:5px;white-space:nowrap}.yb i{display:block;width:100%;background:var(--series);border-radius:3px 3px 0 0}.yb b{position:absolute;bottom:-23px;font-weight:400;font-size:13px;color:var(--mut)}
.bar{display:inline-block;height:6px;border-radius:3px;background:var(--series);vertical-align:middle;margin-right:8px;min-width:2px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.chip{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 12px;font-size:13.5px;color:var(--ink2)}.chip:hover{text-decoration:none;color:var(--ink)}.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}.chip i{font-style:normal;opacity:.6;margin-left:6px;font-variant-numeric:tabular-nums}
.srow{display:grid;grid-template-columns:4px minmax(0,1fr);gap:0 14px;padding:14px 0;border-bottom:1px solid var(--line)}.srow:first-child{padding-top:2px}.srow:last-child{border-bottom:0;padding-bottom:2px}.srow .lv{border-radius:2px;background:var(--line)}.srow.l2 .lv{background:var(--a3)}.srow.l3 .lv{background:var(--sig)}
.srow .k{font-size:14px;color:var(--mut);display:flex;gap:10px;justify-content:space-between;align-items:baseline}.srow .niv{flex:none;font-size:12.5px;font-weight:550;color:var(--sig);background:var(--sig-bg);padding:2px 8px;border-radius:4px}.srow.l1 .niv{color:var(--ink2);background:var(--raised)}.srow .t{font-size:17px;font-weight:550;margin:3px 0 5px;letter-spacing:-.005em}.srow .e{font-size:14px;color:var(--ink2);overflow-wrap:anywhere}
.hero{display:grid;grid-template-columns:1fr 520px;gap:48px;align-items:center;padding:56px 0 48px}@media(max-width:980px){.hero{grid-template-columns:1fr;gap:28px;padding:32px 0}}
.hero h1{font-size:58px;line-height:1.02;font-weight:600;letter-spacing:-.025em;max-width:12ch}@media(max-width:640px){.hero h1{font-size:40px}}.hero p{color:var(--ink2);margin:18px 0 22px;max-width:52ch}
.hero form{display:flex;gap:8px;position:relative;max-width:520px}.hero input{font-size:16px;padding:13px 20px}.btn{font:inherit;font-size:15px;font-weight:600;padding:0 22px;border:0;background:var(--series);color:var(--panel);border-radius:8px;cursor:pointer;white-space:nowrap}.btn:hover{background:var(--link)}
.try{font-size:13.5px;color:var(--mut);margin-top:12px;display:flex;gap:6px 14px;flex-wrap:wrap}.mapcap{font-size:13.5px;color:var(--ink2);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px}
.band{border-top:1px solid var(--line);padding:44px 0}.band>h2{font-family:var(--serif);font-size:32px;line-height:1.18;font-weight:600;letter-spacing:-.015em;margin:0 0 10px;max-width:22ch}.band>p.d{color:var(--ink2);max-width:60ch;margin:0 0 22px}
.ac{position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;z-index:30;box-shadow:0 12px 32px rgb(0 0 0/.25);overflow:hidden}.ac a{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;color:var(--ink);font-size:14px;border-bottom:1px solid var(--line)}.ac a:last-child{border-bottom:0}.ac a:hover{background:var(--raised);text-decoration:none}.ac small{color:var(--mut);white-space:nowrap}
footer{border-top:1px solid var(--line);padding:22px 0 40px;font-size:13px;color:var(--mut);line-height:1.6}.note{font-size:14px;line-height:1.5;color:var(--ink2);margin:12px 0 0}.up{color:var(--sig);font-weight:600}svg text{font-family:inherit}
.pager{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:18px 0;font-size:14px}.pager a,.pager .cur{min-width:36px;text-align:center;padding:6px 11px;border:1px solid var(--line);border-radius:6px;background:var(--panel);font-variant-numeric:tabular-nums}.pager a:hover{text-decoration:none;border-color:var(--series)}.pager .cur{background:var(--ink);color:var(--bg);border-color:var(--ink);font-weight:600}.pager .gap{color:var(--mut);padding:0 2px}.r0{fill:var(--a0)}.r1{fill:var(--a1)}.r2{fill:var(--a2)}.r3{fill:var(--a3)}.r4{fill:var(--a4)}.q0{fill:var(--b0)}.q1{fill:var(--b1)}.q2{fill:var(--b2)}.q3{fill:var(--b3)}.q4{fill:var(--b4)}.tlo{fill:var(--tlo)}.thi{fill:var(--thi)}
.cell rect{transition:opacity .12s}.cell:hover rect{opacity:.8}.pagehead{padding:36px 0 22px}.pagehead p{color:var(--ink2);max-width:66ch;margin:10px 0 0}
.search-form{max-width:760px;margin:0 0 26px}.search-form label{display:block;font-size:14px;font-weight:550;margin-bottom:8px}.search-field{display:flex;gap:8px;position:relative}.search-field input[type=search]{font-size:18px;padding:13px 16px;min-width:0;border-radius:6px}.search-field .btn{border-radius:6px;min-height:50px}
.search-examples{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}.search-examples h3{font-size:14px;font-weight:550;margin:0 0 10px;color:var(--ink2)}.search-examples ul{list-style:none;padding:0;margin:0}.search-examples li+li{margin-top:7px}.search-examples a{display:inline-block;padding:3px 0;font-size:15px;overflow-wrap:anywhere}
.search-summary{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:0 0 14px}.search-summary p{margin:0;font-size:14px;color:var(--ink2)}.search-group{margin-top:18px}.search-list{list-style:none;padding:0;margin:-16px -20px -18px}.search-list li+li{border-top:1px solid var(--line)}
.search-result{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px 32px;padding:20px;color:var(--ink);font-variant-numeric:tabular-nums}.search-result:hover{background:color-mix(in srgb,var(--raised) 50%,var(--panel));text-decoration:none}.search-result:focus-visible{outline-offset:-3px}
.search-result h3{font-size:18px;line-height:1.4;font-weight:600;color:var(--link);margin:0 0 7px;overflow-wrap:anywhere}.search-result:hover h3{text-decoration:underline;text-underline-offset:4px}.search-result mark{background:var(--raised);color:inherit;box-shadow:inset 0 -2px var(--series);padding:0 1px}
.search-meta{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--mut);font-size:13px;margin:0 0 8px}.search-meta .mono{font-size:12px}.search-detail{font-size:13px;color:var(--ink2);margin:0}
.search-metrics{display:grid;grid-template-columns:1fr 1.25fr;gap:10px 16px;margin:0;text-align:right;align-content:start}.search-metrics dt{font-size:12px;color:var(--mut);margin:0 0 2px}.search-metrics dd{margin:0;font-size:17px;font-weight:550;white-space:nowrap}.search-metrics .search-direct dd{font-size:14px;font-weight:400;color:var(--ink2)}
.search-signal{margin-top:10px}.search-product{grid-template-columns:minmax(0,1fr) 440px}.search-prices{grid-template-columns:repeat(3,1fr)}.search-prices dd{font-size:16px}
.search-empty{max-width:760px;padding:26px}.search-empty h3{font-family:var(--serif);font-size:25px;font-weight:600;margin:0 0 10px}.search-empty p{color:var(--ink2);margin:0 0 12px;max-width:62ch}.search-empty p:last-child{margin-bottom:0}
@media(max-width:800px){.search-result,.search-product{grid-template-columns:minmax(0,1fr);gap:16px}.search-metrics{text-align:left;grid-template-columns:repeat(2,minmax(0,1fr))}.search-prices{grid-template-columns:repeat(3,minmax(0,1fr))}.search-examples{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.search-field input[type=search]{font-size:16px;padding:12px}.search-field .btn{padding:0 16px}.search-result{padding:18px 16px}.search-result h3{font-size:17px}.search-prices{grid-template-columns:1fr}.search-prices>div{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.search-empty{padding:20px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

const JS = `document.querySelectorAll('input[data-ac]').forEach(function(i){var b=document.createElement('div');b.className='ac';b.hidden=true;i.parentNode.appendChild(b);var t;
i.addEventListener('input',function(){clearTimeout(t);var v=i.value.trim();if(v.length<2){b.hidden=true;return}t=setTimeout(function(){fetch('/api/cauta?q='+encodeURIComponent(v)).then(function(r){return r.json()}).then(function(d){
b.innerHTML=d.map(function(x){return '<a href="'+x.url+'"><span>'+x.nume+'</span><small>'+x.fel+(x.info?' · '+x.info:'')+'</small></a>'}).join('');b.hidden=!d.length})},120)});
document.addEventListener('click',function(e){if(!i.parentNode.contains(e.target))b.hidden=true})});
(function(){var ls=[].slice.call(document.querySelectorAll('.secnav a'));if(!ls.length||!window.IntersectionObserver)return;var vis={};var io=new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting});var on=null;ls.forEach(function(a){var id=a.getAttribute('href').slice(1);if(!on&&vis[id])on=a});ls.forEach(function(a){if(a===on)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')})},{rootMargin:'-110px 0px -55% 0px'});ls.forEach(function(a){var t=document.getElementById(a.getAttribute('href').slice(1));if(t)io.observe(t)})})();
(function(){var b=document.querySelector('.tema');if(!b)return;var r=document.documentElement,mq=window.matchMedia('(prefers-color-scheme: dark)');function cur(){return r.dataset.theme||(mq.matches?'dark':'light')}function lab(){b.querySelector('span').textContent=cur()==='dark'?'Temă deschisă':'Temă închisă'}lab();b.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';r.dataset.theme=n;try{localStorage.setItem('tema',n)}catch(e){}lab()});mq.addEventListener&&mq.addEventListener('change',lab)})();
(function(){var b=document.querySelector('.moneda');if(!b)return;var C=__CURS__;function nf(x,d){return x.toLocaleString('ro-RO',{maximumFractionDigits:d||0})}
try{var um=new URLSearchParams(location.search).get('moneda');if(um==='eur'||um==='lei')localStorage.setItem('moneda',um)}catch(x){}
function cur(){try{return localStorage.getItem('moneda')==='eur'}catch(x){return false}}
function big(v,u){return v>=1e9?nf(v/1e9,2)+' mld. '+u:v>=1e6?nf(v/1e6,1)+' mil. '+u:nf(Math.round(v))+' '+u}
function ap(){var e=cur();document.querySelectorAll('.bani').forEach(function(x){if(x.dataset.o==null)x.dataset.o=x.textContent;if(!e){x.textContent=x.dataset.o;return}var v=+x.dataset.lei/C,f=x.dataset.f;
x.textContent=f==='m'?big(v,'euro'):f==='n'?nf(Math.round(v)):f==='u'?nf(Math.round(v))+' euro':f==='s'?(v>=1e9?nf(v/1e9,1)+' mld':nf(v/1e6,v<1e7?1:0)+' mil'):f==='k'?nf(Math.round(v/1000))+' mii':f==='b'?(v/1e9).toFixed(1)+' mld':f==='med'?'mediana '+nf(Math.round(v))+' euro':x.dataset.o});
document.querySelectorAll('.mon').forEach(function(x){x.textContent=e?x.dataset.e:x.dataset.l});document.querySelectorAll('.cursnota').forEach(function(x){x.hidden=!e});b.querySelector('span').textContent=e?'În lei':'În euro';b.setAttribute('aria-pressed',e?'true':'false')}
b.addEventListener('click',function(){try{localStorage.setItem('moneda',cur()?'lei':'eur')}catch(x){}ap()});ap()})();
document.querySelectorAll('.chipid').forEach(function(b){b.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.v);var t=b.textContent;b.textContent='copiat';setTimeout(function(){b.textContent=t},900)})});`;

// SEO: fiecare pagină își declară descrierea, adresa canonică și, unde are sens, date structurate (JSON-LD).
// Paginile de căutare și filtrele rămân „noindex,follow” și nu sunt blocate în robots.txt, ca roboții să poată citi eticheta.
interface Seo { hero?: boolean; q?: string; desc?: string; canon?: string; noindex?: boolean; ld?: any[]; status?: number; prev?: string; next?: string }
const plain = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot);/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"' }[m]!)).replace(/\s+/g, " ").trim();
const cut = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…");
const ldTag = (o: any) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const bcLd = (xs: [string, string][]) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: xs.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + path })) });
const adr = (x: any) => (x.judet || x.localitate ? { "@type": "PostalAddress", addressCountry: "RO", ...(x.judet ? { addressRegion: x.judet } : {}), ...(x.localitate ? { addressLocality: x.localitate } : {}) } : undefined);
const DESC = "Contractele de achiziție publică din România, pe autoritate, firmă și produs: cine cumpără, de la cine și la ce preț pe bucată, cu sursa lângă fiecare cifră.";
function page(title: string, body: string, nav = "", opts: Seo = {}) {
  const desc = cut(opts.desc || DESC), url = opts.canon ? ORIGIN + opts.canon : "", full = opts.hero ? `Banul public: ${title}` : `${title} | Banul public`;
  const head = `<meta name="description" content="${esc(desc)}"><meta name="robots" content="${opts.noindex ? "noindex,follow" : "index,follow"}">${url ? `<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}">` : ""}
<meta property="og:type" content="website"><meta property="og:locale" content="ro_RO"><meta property="og:site_name" content="Banul public"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta name="twitter:card" content="summary">
<link rel="icon" href="/icon.svg" type="image/svg+xml">${opts.prev ? `<link rel="prev" href="${esc(ORIGIN + opts.prev)}">` : ""}${opts.next ? `<link rel="next" href="${esc(ORIGIN + opts.next)}">` : ""}${(opts.ld || []).map(ldTag).join("")}`;
  const N = [["/cauta", "Caută"], ["/harta", "Harta"], ["/semnale", "Semnale"], ["/preturi", "Prețuri"], ["/metoda", "Metodă"]];
  const logo = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="1" y="1" width="9" height="9" rx="2" class="r1"/><rect x="12" y="1" width="9" height="9" rx="2" class="r4"/><rect x="1" y="12" width="9" height="9" rx="2" class="r3"/><rect x="12" y="12" width="9" height="9" rx="2" class="r0"/></svg>`;
  return new Response(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(full)}</title>${head}<script>try{var u=new URLSearchParams(location.search).get("tema");if(u==="dark"||u==="light")localStorage.setItem("tema",u);var t=localStorage.getItem("tema");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script><style>${CSS}</style></head><body>
<header class="top"><div class="wrap topin"><a class="brand" href="/">${logo}Banul public</a><nav>${N.map(([h, t]) => `<a href="${h}" class="${nav === h ? "on" : ""}">${t}</a>`).join("")}</nav>
${opts.hero ? `<span style="margin-left:auto"></span>` : `<form class="s" action="/cauta"><input type="search" name="q" data-ac placeholder="Autoritate, firmă, CUI, produs" value="${esc(opts.q ?? "")}" autocomplete="off" aria-label="Caută"></form>`}${CURS ? `<button class="moneda" type="button" aria-label="Schimbă moneda afișată"><span>În euro</span></button>` : ""}<button class="tema" type="button" aria-label="Schimbă tema"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 0 0 12.4z" fill="currentColor"/></svg><span></span></button></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">Date din SEAP (anunțuri până la ${M.anunturi_pana}), data.gov.ro (contracte până la ${M.contracte_pana}) și ANAF. Actualizat ${M.generat}.<br>
Un semnal arată unde merită cerute documente. Nu dovedește o faptă și nu este o acuzație. Valorile sunt fără TVA.${CURS ? `<span class="cursnota" hidden> Sumele în euro sunt orientative: toate sunt calculate la cursul BNR din ${M.curs_data}, 1 euro = ${CURS.toLocaleString("ro-RO", { minimumFractionDigits: 4 })} lei, indiferent de data contractului.</span>` : ""} <a href="/metoda">Cum citim datele</a> · <a href="/mcp">Acces pentru asistenți AI</a></div></footer><script>${JS.replace("__CURS__", String(CURS || 0))}</script></body></html>`, { status: opts.status || 200, headers: { "content-type": "text/html; charset=utf-8" } });
}
const tiles = (xs: [any, string, boolean?][]) => `<div class="figs">${xs.map(([a, b, hot]) => `<div class="fig${hot ? " hot" : ""}"><b>${a}</b><span>${b}</span></div>`).join("")}</div>`;
const crumb = (xs: [string, string?][]) => `<div class="crumb">${xs.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<b style="font-weight:400;color:var(--ink2)">${esc(t)}</b>`)).join("<span>/</span>")}</div>`;
const box = (title: string, inner: string, id = "", side = "") => `<section class="box"${id ? ` id="${id}"` : ""}><h2>${title}${side ? `<small>${side}</small>` : ""}</h2>${inner}</section>`;

function yearBars(rows: { y: string; v: number; n: number }[]) {
  if (!rows.length) return "";
  const mx = Math.max(...rows.map((r) => r.v), 1);
  const lab = (v: number) => (v >= 1e9 ? (v / 1e9).toLocaleString("ro-RO", { maximumFractionDigits: 1 }) + " mld" : (v / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: v < 1e7 ? 1 : 0 }) + " mil");
  return `<div class="yb" style="grid-template-columns:repeat(${rows.length},minmax(0,96px))" role="img" aria-label="Valoarea contractelor pe ani">${rows.map((r) => `<div title="${r.y}: ${milT(r.v)} în ${n0(r.n)} contracte"><span>${bani(r.v, "s", lab(r.v))}</span><i style="height:${Math.max(2, Math.round(124 * r.v / mx))}px"></i><b>${r.y}</b></div>`).join("")}</div>`;
}
function harta(metric: "semnale" | "valoare" | "contracte") {
  const rows = q("SELECT * FROM judete").all() as any[]; const by = Object.fromEntries(rows.map((r) => [r.judet, r]));
  const vals = rows.map((r) => r[metric]).sort((a, b) => a - b); const cut = [0.2, 0.4, 0.6, 0.8].map((p) => vals[Math.floor(p * (vals.length - 1))]);
  const S = 62, G = 4, pre = metric === "semnale" ? "r" : "q"; let g = "";
  for (const [j, [ab, cx, cy]] of Object.entries(AB)) {
    const r = by[j]; const v = r ? r[metric] : 0; const k = cut.filter((c) => v > c).length, tc = k >= 3 ? "thi" : "tlo";
    g += `<a class="cell" href="/judet/${slugJ(j)}"><rect x="${cx * (S + G)}" y="${cy * (S + G)}" width="${S}" height="${S}" rx="8" class="${pre}${k}"><title>${j}: ${metric === "valoare" ? milT(v) : n0(v) + " " + metric}</title></rect><text x="${cx * (S + G) + S / 2}" y="${cy * (S + G) + S / 2 - 1}" text-anchor="middle" font-size="15" font-weight="650" class="${tc}">${ab}</text><text x="${cx * (S + G) + S / 2}" y="${cy * (S + G) + S / 2 + 16}" text-anchor="middle" font-size="11" class="${tc}" opacity=".8"${metric === "valoare" && CURS ? ` class="${tc} bani" data-lei="${Math.round(v)}" data-f="b"` : ""}>${metric === "valoare" ? (v / 1e9).toFixed(1) + " mld" : n0(v)}</text></a>`;
  }
  const lab = metric === "valoare" ? cut.map((c) => bani(c, "b", (c / 1e9).toFixed(1) + " mld")) : cut.map((c) => n0(c));
  const T = { semnale: "Semnale de verificat pe județ", valoare: "Valoare contractată pe județ", contracte: "Contracte pe județ" }[metric];
  const rng = [`până la ${lab[0]}`, `${lab[0]}–${lab[1]}`, `${lab[1]}–${lab[2]}`, `${lab[2]}–${lab[3]}`, `peste ${lab[3]}`];
  return `<h2 style="margin-bottom:10px">${T}</h2><svg viewBox="0 0 ${8 * (S + G) - G} ${7 * (S + G) - G}" width="100%" role="img" aria-label="${T}, hartă schematică">${g}</svg>
<div class="mapcap">${[0, 1, 2, 3, 4].map((i) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:8px"><svg width="14" height="14"><rect width="14" height="14" rx="3" class="${pre}${i}"/></svg>${rng[i]}</span>`).join("")}</div>`;
}
function sigCards(rows: any[]) {
  if (!rows.length) return `<p class="note">Niciun semnal aici.</p>`;
  const ids = rows.map((r) => r.id).join(",");
  const ents = q(`SELECT e.sid, e.fel, e.cui, coalesce(a.nume, f.nume) nume FROM sem_ent e LEFT JOIN autoritati a ON e.fel='a' AND a.cui=e.cui LEFT JOIN firme f ON e.fel='f' AND f.cui=e.cui WHERE e.sid IN (${ids})`).all() as any[];
  return rows.map((s) => {
    const d = JSON.parse(s.detalii); const links: string[] = [];
    (function w(o: any) { if (o && typeof o === "object") { if (o.link) links.push(`<a class="mono" href="${esc(o.link)}" rel="noopener" target="_blank">${esc(o.anunt || o.data || "anunț")}</a>`); Object.values(o).forEach(w); } })(d);
    const es = ents.filter((e) => e.sid === s.id && e.nume).slice(0, 5).map((e) => `<a href="/${e.fel === "a" ? "autoritate" : "firma"}/${esc(e.cui)}">${esc(e.nume)}</a>`);
    return `<div class="srow l${s.scor}"><div class="lv" title="nivel ${s.scor} din 3"></div><div><div class="k"><span>${esc(M.tipuri[s.tip].nume)}${s.valoare ? `, ${mil(s.valoare)}` : ""}</span><span class="niv">nivel ${s.scor} din 3</span></div><div class="t">${esc(roNum(s.titlu))}</div>
<div class="e">${es.length ? es.join(", ") : esc(s.entitate)}${links.length ? `<span style="color:var(--mut)"> în SEAP: </span>${links.slice(0, 5).join(" ")}` : ""}</div></div></div>`;
  }).join("");
}
function fts(s: string) { const t = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1).slice(0, 6); return t.length ? t.map((x) => `"${x}"*`).join(" ") : null; }
const URLF: Record<string, string> = { autoritate: "/autoritate/", firma: "/firma/", produs: "/produs/" };
function cauta(s: string, lim = 8) { const m = fts(s); if (!m) return []; return (q("SELECT nume, fel, cheie, info, pondere FROM cauta WHERE cauta MATCH ? ORDER BY CAST(pondere AS REAL) DESC LIMIT ?").all(m, lim) as any[]).map((r) => ({ nume: r.fel === "produs" ? r.nume : r.nume.replace(/ \S+$/, ""), fel: r.fel === "firma" ? "firmă" : r.fel, info: r.info, url: URLF[r.fel] + encodeURIComponent(r.cheie), valoare: r.pondere, cheie: r.cheie })); }

const mono = (t: any) => `<span class="mono">${esc(t)}</span>`;
const an = (r: any) => (r.nid ? `<a class="mono" href="${seap(r.nid)}" target="_blank" rel="noopener">${esc(r.anunt)}</a>` : mono(r.anunt));
const cpvN = (t: string) => esc((t || "").replace(" (Rev.2)", ""));
const ctrTable = (rows: any[], who: "f" | "a") => `<div class="tw"><table><thead><tr><th>Data</th><th>${who === "f" ? "Furnizor" : "Autoritate"}</th><th>Obiect</th><th class="n">Valoare, ${MON("lei", "euro")}</th><th>Anunț</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="nw mono">${r.data}</td><td><a href="/${who === "f" ? "firma" : "autoritate"}/${esc(r.k)}">${esc(r.nume ?? r.k)}</a>${r.na > 1 ? `<span class="sub">în asociere de ${r.na} firme</span>` : ""}</td><td>${cpvN(r.cpv_nume)}<span class="sub">${esc(r.tp)}</span></td><td class="n">${lei(r.valoare)}</td><td class="nw">${an(r)}</td></tr>`).join("")}</tbody></table></div>`;
// Variante de produs: un preț se compară cu mediana variantei lui (autobuz de 18 m cu autobuze de 18 m), dacă varianta are
// cel puțin VAR_MIN contracte. Altfel, cu mediana categoriei doar la produsele omogene. Dacă nu, nu se compară deloc.
const HAS_VAR = !!q("SELECT 1 FROM sqlite_master WHERE name='variante'").get(), VAR_MIN = 4;
const LP = HAS_VAR ? "SELECT l.*, c.nume cn, c.mediana, c.omogen, v.mediana vm, v.n vn FROM linii_pret l JOIN clustere c ON c.id=l.cluster LEFT JOIN variante v ON v.cluster=l.cluster AND v.varianta=l.varianta" : "SELECT l.*, c.nume cn, c.mediana, c.omogen FROM linii_pret l JOIN clustere c ON c.id=l.cluster";
const nespec = (v: string) => /nespecificat/.test(v || "");
const reper = (l: any): number | null => (l.vn >= VAR_MIN && !nespec(l.varianta) ? l.vm : l.omogen && !l.varianta ? l.mediana : l.omogen && l.vn == null ? l.mediana : null);
const abatere = (p: number, ref: number | null) => { if (!ref) return `<td class="n"><span class="sub" title="Prea puține contracte de același fel pentru o comparație">fără reper</span></td>`; const d = Math.round((p / ref - 1) * 100); return `<td class="n ${d >= 40 ? "up" : ""}">${d > 0 ? "+" : ""}${d}%</td>`; };
const felProdus = (l: any) => [l.varianta, l.include ? "cu " + l.include : ""].filter(Boolean).map(esc).join("; ");
const priceRows = (pr: any[], who: "f" | "a") => `<div class="tw"><table><thead><tr><th>Data</th><th>Produs</th><th>${who === "f" ? "Furnizor" : "Autoritate"}</th><th class="n">Bucăți</th><th class="n">${MON("Lei", "Euro")} pe bucată</th><th class="n">Față de mediana variantei</th><th>Anunț</th></tr></thead><tbody>${pr.map((l) => { return `<tr><td class="nw mono">${l.data}</td><td><a href="/produs/${l.cluster}${l.varianta ? "?v=" + encodeURIComponent(l.varianta) : ""}">${esc(l.cn)}</a>${felProdus(l) ? `<span class="sub">${felProdus(l)}</span>` : ""}</td><td>${who === "f" ? esc(l.castigatori) : `<a href="/autoritate/${esc(l.ca)}">${esc(l.autoritate)}</a>`}</td><td class="n">${n0(l.q)}</td><td class="n">${lei(l.p)}</td>${abatere(l.p, reper(l))}<td class="nw">${an({ nid: l.nid, anunt: l.anunt })}</td></tr>`; }).join("")}</tbody></table></div>`;
const plural = (n: number, one: string, many: string) => `${n0(n)} ${n === 1 ? one : n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? "de " + many : many}`;

// Achizițiile directe (cumpărări fără procedură, sub prag). site.db ține doar agregatele: primii furnizori pe autoritate, primele autorități pe firmă, totaluri pe ani.
const HAS_DA = !!M.da;
const DA_NOTA = `Cumpărări directe, fără procedură, permise sub 270.120 lei pentru produse și servicii și sub 900.400 lei pentru lucrări, fără TVA. Sursa: data.gov.ro${M.da_pana ? `, până la ${M.da_pana}` : ""}.`;
function daBox(cui: string, who: "a" | "f", n: number, v: number) {
  const rows = (who === "a"
    ? q("SELECT t.cf k, coalesce(f.nume, t.nume) nume, f.cui are, f.judet sub, f.semnale, t.n, t.v FROM da_top t LEFT JOIN firme f ON f.cui=t.cf WHERE t.ca=? ORDER BY t.v DESC")
    : q("SELECT t.ca k, a.nume, a.cui are, a.judet sub, a.semnale, t.n, t.v FROM da_topf t LEFT JOIN autoritati a ON a.cui=t.ca WHERE t.cf=? ORDER BY t.v DESC")).all(cui) as any[];
  const ani = who === "a" ? (q("SELECT y, n, v FROM da_ani WHERE ca=? ORDER BY y").all(cui) as any[]) : [];
  const pag = who === "a" ? "firma" : "autoritate";
  return box("Achiziții directe", `${ani.length ? `<p class="note" style="margin-top:0">${ani.map((r) => `${r.y}: ${plural(r.n, "achiziție", "achiziții")}, ${mil(r.v)}`).join(" · ")}</p>` : ""}
<div class="tw"><table><thead><tr><th>${who === "a" ? "Furnizor" : "Autoritate"}</th><th class="n">Achiziții</th><th class="n">Valoare</th><th>Pondere</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${t.are ? `<a href="/${pag}/${encodeURIComponent(t.k)}">${esc(t.nume ?? t.k)}</a>` : esc(t.nume ?? t.k)}${t.semnale ? ` <span class="st sig">${t.semnale}</span>` : ""}<span class="sub">${esc(t.sub ?? "")}</span></td><td class="n">${n0(t.n)}</td><td class="n">${mil(t.v)}</td><td class="nw"><span class="bar" style="width:${Math.round(140 * t.v / Math.max(v, 1))}px"></span>${v ? Math.round(100 * t.v / v) : 0}%</td></tr>`).join("")}</tbody></table></div><p class="note">${DA_NOTA}</p>`, "directe", `${plural(n, "achiziție", "achiziții")}, ${mil(v)}`);
}
// Exemplele de pe prima pagină se aleg la întâmplare la fiecare afișare, din liste citite o singură dată la pornire:
// o localitate, o firmă, un produs și un județ. Așa cititorul vede de fiecare dată alt punct de pornire.
const titlu = (t: string) => t.toLowerCase().replace(/(^|[\s\-("„])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const POOL = {
  loc: (q("SELECT cui, nume FROM autoritati WHERE judet IS NOT NULL AND n>=10 AND length(nume)<=34 AND (nume LIKE 'ORAS%' OR nume LIKE 'MUNICIPIUL%' OR nume LIKE 'COMUNA%') ORDER BY valoare DESC LIMIT 500").all() as any[]),
  firme: (q("SELECT cui, nume FROM firme WHERE n>=5 AND length(nume)<=34 AND cui GLOB '[0-9]*' ORDER BY valoare DESC LIMIT 500").all() as any[]),
  produse: (q("SELECT id, nume FROM clustere").all() as any[]),
  fise: (q("SELECT cui FROM autoritati WHERE semnale>=3 AND judet IS NOT NULL AND n BETWEEN 40 AND 400 ORDER BY semnale DESC, valoare DESC LIMIT 80").all() as any[]),
};
const alege = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
function exemple() {
  const l = alege(POOL.loc), f = alege(POOL.firme), p = alege(POOL.produse), j = alege(M.judete as string[]);
  return [l ? `<a href="/autoritate/${encodeURIComponent(l.cui)}">${esc(titlu(l.nume))}</a>` : "", f ? `<a href="/firma/${encodeURIComponent(f.cui)}">${esc(titlu(f.nume))}</a>` : "",
    p ? `<a href="/produs/${p.id}">${esc(p.nume.toLowerCase())}</a>` : "", j ? `<a href="/judet/${slugJ(j)}">${esc(j)}</a>` : ""].join("");
}
function home() {
  const top = q("SELECT * FROM semnale WHERE tip IN ('S2','S5','S7','S10','S1','S3') AND scor>=3 ORDER BY CASE tip WHEN 'S2' THEN 0 WHEN 'S1' THEN 1 ELSE 2 END, valoare DESC LIMIT 7").all();
  const cl = q("SELECT * FROM clustere WHERE omogen=1 ORDER BY n DESC LIMIT 6").all() as any[];
  const exCui = alege(POOL.fise)?.cui, ex = exCui ? (q("SELECT * FROM autoritati WHERE cui=?").get(exCui) as any) : null;
  const exTop = ex ? (q("SELECT f.nume, sum(c.v) v FROM contracte c JOIN firme f ON f.cui=c.cf WHERE c.ca=? GROUP BY c.cf ORDER BY v DESC LIMIT 3").all(ex.cui) as any[]) : [];
  return page("Banii publici, contract cu contract", `<div class="hero"><div><h1>Banii publici, contract cu contract.</h1>
<p>${n0(M.contracte)} contracte semnate din ${M.din.slice(0, 4)} încoace de ${n0(M.autoritati)} autorități cu ${n0(M.firme)} firme. Cauți o primărie, o firmă sau un produs și vezi cine cumpără, de la cine și la ce preț.</p>
<form action="/cauta"><input type="search" name="q" data-ac placeholder="Primărie, firmă, CUI sau produs" autocomplete="off" aria-label="Caută" autofocus><button class="btn">Caută</button></form>
<div class="try"><span>De exemplu</span>${exemple()}</div></div>
<div>${harta("semnale")}<div class="mapcap" style="margin-top:6px">După județul autorității. Apasă un județ pentru fișa lui.</div></div></div>
${tiles([[n0(M.contracte), "contracte"], [mil(M.valoare), "valoare contractată"], [n0(M.autoritati), "autorități"], [n0(M.firme), "firme câștigătoare"], [n0(M.semnale), "semnale de verificat", true]])}
<div style="height:48px"></div>
<section class="band"><h2>O fișă pentru fiecare primărie și fiecare firmă.</h2><p class="d">Tot ce e public despre banii unei instituții, pe o singură pagină: cine câștigă, cu ce pondere, la ce preț pe bucată și ce tipare merită verificate. Fiecare cifră are sursa lângă ea.</p>
${ex ? `<div class="cols"><section class="box"><h2>${esc(ex.nume)}</h2><dl class="kv"><dt>CUI</dt><dd class="mono">${esc(ex.cui)}</dd><dt>Județ</dt><dd>${esc(ex.judet)}</dd><dt>Contracte</dt><dd>${n0(ex.n)}</dd><dt>Valoare</dt><dd>${mil(ex.valoare)}</dd><dt>Furnizori</dt><dd>${n0(ex.furnizori)}</dd><dt>Semnale</dt><dd><span class="st sig">${ex.semnale} de verificat</span></dd></dl><p class="note"><a href="/autoritate/${esc(ex.cui)}">Deschide fișa</a></p></section>
<section class="box"><h2>Cine câștigă aici<small>primii trei furnizori</small></h2><div class="tw"><table><tbody>${exTop.map((t) => `<tr><td>${esc(t.nume)}</td><td class="n">${mil(t.v)}</td><td class="nw"><span class="bar" style="width:${Math.round(160 * t.v / Math.max(ex.valoare, 1))}px"></span>${Math.round(100 * t.v / Math.max(ex.valoare, 1))}%</td></tr>`).join("")}</tbody></table></div></section></div>` : ""}</section>
<section class="band"><h2>Același produs, alt preț.</h2><p class="d">Împărțim valoarea contractului la numărul de bucăți din anunț și punem toate autoritățile pe aceeași axă. Diferențele mari între cumpărători ai aceluiași produs sunt primul lucru de întrebat.</p>
<div class="tw bare"><table><thead><tr><th>Produs</th><th class="n">Contracte</th><th class="n">Cel mai ieftin</th><th class="n">Mediana</th><th class="n">Cel mai scump</th><th class="n">Raport</th></tr></thead><tbody>${cl.map((c) => `<tr><td><a href="/produs/${c.id}">${esc(c.nume)}</a></td><td class="n">${c.n}</td><td class="n">${lei(c.pmin)}</td><td class="n">${lei(c.mediana)}</td><td class="n">${lei(c.pmax)}</td><td class="n up">${(c.pmax / c.pmin).toFixed(1)}×</td></tr>`).join("")}</tbody></table></div><p class="note"><a href="/preturi">Toate produsele comparate</a>. Prețuri în ${MON("lei", "euro")} pe bucată, fără TVA.</p></section>
<section class="band"><h2>Tipare care merită o întrebare.</h2><p class="d">Preț identic la leu în județe diferite, firme înființate cu câteva luni înainte de primul contract mare, contracte dublate prin acte adiționale. Fiecare semnal duce la anunțul din SEAP.</p>
<section class="box">${sigCards(top)}</section><p class="note"><a href="/semnale">Toate cele ${n0(M.semnale)} semnale, pe tipuri și județe</a></p></section>`, "", { hero: true, canon: "/",
    desc: `${n0(M.contracte)} contracte publice semnate din ${M.din.slice(0, 4)} încoace de ${n0(M.autoritati)} autorități cu ${n0(M.firme)} firme. Caută o primărie, o firmă sau un produs și vezi cine cumpără, de la cine și la ce preț.`,
    ld: [{ "@context": "https://schema.org", "@type": "WebSite", name: "Banul public", url: ORIGIN + "/", inLanguage: "ro", potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: ORIGIN + "/cauta?q={search_term_string}" }, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "Dataset", name: "Contracte de achiziție publică din România", description: DESC, url: ORIGIN + "/", inLanguage: "ro", isAccessibleForFree: true, temporalCoverage: `${M.din}/${M.contracte_pana}`, spatialCoverage: { "@type": "Country", name: "România" }, dateModified: M.generat.slice(0, 10), isBasedOn: ["https://e-licitatie.ro", "https://data.gov.ro", "https://www.anaf.ro"] }] });
}
// Pagina de căutare, după macheta din docs/design/cauta.html: trei stări (fără căutare, cu rezultate, nimic găsit).
// Cel mult 60 de rezultate, fără paginare: cine caută ceva anume restrânge termenul, nu parcurge lista.
function marcheaza(nume: string, s: string) {
  // Evidențiază în nume cuvintele căutate, fără să țină cont de majuscule și diacritice. Lucrează pe o copie „pliată” și ține minte de unde vine fiecare literă.
  const cuv = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1);
  if (!cuv.length) return esc(nume);
  let pliat = ""; const src: number[] = [];
  [...nume].reduce((poz, ch) => { const f = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase(); for (const c of f) { pliat += c; src.push(poz); } return poz + ch.length; }, 0);
  const on = new Array(nume.length).fill(false);
  for (const c of cuv) { let k = -1; while ((k = pliat.indexOf(c, k + 1)) >= 0) if (k === 0 || !/[\p{L}\p{N}]/u.test(pliat[k - 1])) for (let x = k; x < k + c.length; x++) on[src[x]] = true; }
  let out = "", a = 0;
  for (let x = 1; x <= nume.length; x++) if (x === nume.length || on[x] !== on[a]) { out += on[a] ? `<mark>${esc(nume.slice(a, x))}</mark>` : esc(nume.slice(a, x)); a = x; }
  return out;
}
function pCauta(u: URL) {
  const s = (u.searchParams.get("q") || "").trim().slice(0, 80), fel = ["produs", "autoritate", "firma"].includes(u.searchParams.get("fel") || "") ? u.searchParams.get("fel")! : "";
  const toate = s ? cauta(s, 60).map((y) => ({ ...y, fel: y.fel === "firmă" ? "firma" : y.fel })) : [];
  const nr = (f: string) => toate.filter((y) => y.fel === f).length, r = fel ? toate.filter((y) => y.fel === fel) : toate;
  const camp = `<form class="search-form" action="/cauta"><label for="cq">Autoritate, firmă, CUI sau produs</label><div class="search-field"><input id="cq" type="search" name="q" data-ac value="${esc(s)}" placeholder="${esc(`De exemplu, ${titlu(alege(POOL.loc)?.nume ?? "numele primăriei")}`)}" autocomplete="off"${s ? "" : " autofocus"}><button class="btn">Caută</button></div></form>`;
  const met = (xs: [string, string, boolean?][]) => `<dl class="search-metrics">${xs.map(([t, v, mic]) => `<div${mic ? ` class="search-direct"` : ""}><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const sem = (n: number) => `<div class="search-signal">${n ? `<span class="st sig">${plural(n, "semnal", "semnale")} de verificat</span>` : `<span class="search-detail">Fără semnale de verificat</span>`}</div>`;
  const loc = (x: any) => [x.localitate, x.judet].filter(Boolean).map(esc).join(", ");
  const rand = (y: any) => {
    if (y.fel === "produs") { const c = q("SELECT * FROM clustere WHERE id=?").get(y.cheie) as any; if (!c) return "";
      return `<li><a class="search-result search-product" href="/produs/${c.id}"><div><h3>${marcheaza(c.nume, s)}</h3><p class="search-meta"><span>${plural(c.n, "contract comparat", "contracte comparate")}</span></p><span class="st ${c.omogen ? "ok" : "neu"}">${c.omogen ? "produs comparabil" : "categorie eterogenă"}</span></div>
<dl class="search-metrics search-prices"><div><dt>Cel mai ieftin</dt><dd>${lei(c.pmin)}</dd></div><div><dt>Mediana</dt><dd>${lei(c.mediana)}</dd></div><div><dt>Cel mai scump</dt><dd>${lei(c.pmax)}</dd></div></dl></a></li>`; }
    if (y.fel === "autoritate") { const a = q("SELECT * FROM autoritati WHERE cui=?").get(y.cheie) as any; if (!a) return "";
      return `<li><a class="search-result" href="/autoritate/${encodeURIComponent(a.cui)}"><div><h3>${marcheaza(a.nume, s)}</h3><p class="search-meta">${loc(a) ? `<span>${loc(a)}</span>` : ""}<span class="mono">CUI ${esc(a.cui)}</span></p><p class="search-detail">${a.n ? plural(a.furnizori, "furnizor", "furnizori") : "doar achiziții directe"}</p>${sem(a.semnale)}</div>
${met([["Contracte publice", n0(a.n)], ["Valoare contractată", mil(a.valoare)], ...(HAS_DA ? [["Achiziții directe", n0(a.da_n), true], ["Valoare directă", mil(a.da_valoare), true]] as [string, string, boolean][] : [])])}</a></li>`; }
    const f = q("SELECT * FROM firme WHERE cui=?").get(y.cheie) as any; if (!f) return "";
    const stare = /RADIERE/i.test(f.stare || "") ? "radiată" : f.inactiv ? "inactivă fiscal" : f.stare ? "activă" : "";
    return `<li><a class="search-result" href="/firma/${encodeURIComponent(f.cui)}"><div><h3>${marcheaza(f.nume, s)}</h3><p class="search-meta">${loc(f) ? `<span>${loc(f)}</span>` : ""}<span class="mono">CUI ${esc(f.cui)}</span></p><p class="search-detail">${[f.data_inregistrare ? `înființată în ${f.data_inregistrare.slice(0, 4)}` : "", stare, f.autoritati ? plural(f.autoritati, "autoritate clientă", "autorități cliente") : ""].filter(Boolean).join(", ")}</p>${sem(f.semnale)}</div>
${met([["Contracte publice", n0(f.n)], ["Valoare contractată", mil(f.valoare)], ...(HAS_DA ? [["Achiziții directe", n0(f.da_n), true], ["Valoare directă", mil(f.da_valoare), true]] as [string, string, boolean][] : [])])}</a></li>`;
  };
  const grup = (f: string, t: string) => { const x = r.filter((y) => y.fel === f); return x.length ? `<section class="box search-group"><h2>${t}<small>${plural(x.length, "rezultat", "rezultate")}</small></h2><ul class="search-list">${x.map(rand).join("")}</ul></section>` : ""; };
  const lk = (f: string) => "/cauta?" + new URLSearchParams(f ? { q: s, fel: f } : { q: s }).toString();
  const parti = [[nr("produs"), "produs", "produse"], [nr("autoritate"), "autoritate", "autorități"], [nr("firma"), "firmă", "firme"]].filter(([n]) => n).map(([n, a, b]) => plural(n as number, a as string, b as string));
  let corp: string;
  if (!s) {
    const trei = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5).slice(0, 3);
    const col = (t: string, xs: string[]) => `<div><h3>${t}</h3><ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
    corp = `<section class="box"><h2>De unde poți începe<small>câteva exemple</small></h2><div class="search-examples">${col("Localități", trei(POOL.loc).map((l: any) => `<a href="/autoritate/${encodeURIComponent(l.cui)}">${esc(titlu(l.nume))}</a>`))}${col("Firme", trei(POOL.firme).map((f: any) => `<a href="/firma/${encodeURIComponent(f.cui)}">${esc(titlu(f.nume))}</a>`))}${col("Produse", trei(POOL.produse).map((p: any) => `<a href="/produs/${p.id}">${esc(p.nume)}</a>`))}${col("Județe", trei(M.judete as string[]).map((j) => `<a href="/judet/${slugJ(j)}">${esc(j)}</a>`))}</div></section>`;
  } else if (!toate.length) {
    corp = `<section class="box search-empty"><h3>Nimic găsit pentru „${esc(s)}”.</h3><p>Aici apar doar autoritățile și firmele cu contracte publice${HAS_DA ? " sau achiziții directe" : ""} din ${M.din.slice(0, 4)} încoace.</p><p>Încearcă fără diacritice, cu un nume mai scurt sau cu CUI-ul instituției ori al firmei.</p></section>`;
  } else {
    corp = `<div class="search-summary"><p><b>${plural(toate.length, "rezultat", "rezultate")}</b>: ${parti.join(", ")}</p><p>Contracte din ${M.din.slice(0, 4)} încoace, valori fără TVA</p></div>
<div class="chips" aria-label="Felul rezultatelor"><a class="chip ${fel ? "" : "on"}" href="${esc(lk(""))}">Toate<i>${toate.length}</i></a>${[["produs", "Produse"], ["autoritate", "Autorități"], ["firma", "Firme"]].map(([f, t]) => `<a class="chip ${fel === f ? "on" : ""}" href="${esc(lk(f))}">${t}<i>${nr(f)}</i></a>`).join("")}</div>
${grup("produs", "Produse")}${grup("autoritate", "Autorități")}${grup("firma", "Firme")}${toate.length >= 60 ? `<p class="note">Sunt afișate cel mult 60 de rezultate. Pentru o căutare mai precisă adaugă localitatea sau folosește CUI-ul.</p>` : ""}`;
  }
  return page(s ? `Căutare: ${s}` : "Caută", `<div class="pagehead"><h1>${s ? `Rezultate pentru „${esc(s)}”` : "Caută în banii publici"}</h1>${s ? "" : `<p>Găsește o instituție, o firmă sau un produs și urmărește contractele publice din ${M.din.slice(0, 4)} încoace.</p>`}</div>${camp}${corp}`, "/cauta", { noindex: true, canon: "/cauta", hero: true });
}
function pAutoritate(cui: string) {
  const a = q("SELECT * FROM autoritati WHERE cui=?").get(cui) as any; if (!a) return null;
  const ani = q("SELECT substr(data,1,4) y, sum(v) v, count(*) n FROM contracte WHERE ca=? GROUP BY 1 ORDER BY 1").all(cui) as any[];
  const top = q("SELECT c.cf k, f.nume, count(*) n, sum(c.v) v, f.semnale, f.data_inregistrare di, f.judet FROM contracte c LEFT JOIN firme f ON f.cui=c.cf WHERE c.ca=? GROUP BY c.cf ORDER BY v DESC LIMIT 15").all(cui) as any[];
  const sem = q("SELECT s.* FROM sem_ent e JOIN semnale s ON s.id=e.sid WHERE e.cui=? AND e.fel='a' ORDER BY s.scor DESC, s.valoare DESC LIMIT 30").all(cui);
  const pr = q(LP + " WHERE l.ca=? ORDER BY l.data DESC LIMIT 20").all(cui) as any[];
  const ctr = q("SELECT c.data, c.cf k, f.nume, c.na, c.cpv_nume, c.tp, c.valoare, c.anunt, i.nid FROM contracte c LEFT JOIN firme f ON f.cui=c.cf LEFT JOIN anunt_id i ON i.anunt=c.anunt WHERE c.ca=? ORDER BY c.data DESC LIMIT 60").all(cui) as any[];
  const proc = q("SELECT tp, count(*) n, sum(v) v FROM contracte WHERE ca=? GROUP BY 1 ORDER BY v DESC").all(cui) as any[];
  const anu = (q("SELECT n FROM anulari WHERE ca=?").get(cui) as any)?.n ?? 0;
  const t3 = top.slice(0, 3).reduce((s, t) => s + t.v, 0), p3 = a.valoare ? Math.round(100 * t3 / a.valoare) : 0;
  const story = `<b>${esc(a.nume)}</b>${a.judet ? ` este o autoritate contractantă din județul ${esc(a.judet)}` : " este o autoritate contractantă"}.${a.n ? ` Între ${a.d1.slice(0, 4)} și ${a.d2.slice(0, 4)} a semnat <b>${plural(a.n, "contract", "contracte")}</b> în valoare de <b>${mil(a.valoare)}</b> cu ${plural(a.furnizori, "furnizor", "furnizori")}.` : ` Din ${M.din.slice(0, 4)} încoace nu are contracte atribuite prin procedură.`}${a.da_n ? ` A cumpărat direct, fără procedură, de <b>${plural(a.da_n, "dată", "ori")}</b>, în valoare de <b>${mil(a.da_valoare)}</b>.` : ""}${top.length >= 3 ? ` Primii trei furnizori adună <b>${p3}%</b> din valoare${top[0]?.nume ? `, în frunte cu ${esc(top[0].nume)}` : ""}.` : ""}${anu ? ` A anulat ${plural(anu, "anunț", "anunțuri")} de atribuire.` : ""}${a.semnale ? ` Are <b>${plural(a.semnale, "semnal", "semnale")}</b> de verificat.` : " Nu are semnale de verificat."}`;
  const nav = [a.n ? ["#furnizori", "Cine câștigă"] : null, a.da_n ? ["#directe", "Achiziții directe"] : null, sem.length ? ["#semnale", `Semnale (${a.semnale})`] : null, pr.length ? ["#preturi", "Prețuri pe bucată"] : null, a.n ? ["#contracte", "Contracte"] : null].filter(Boolean) as string[][];
  const canon = "/autoritate/" + encodeURIComponent(a.cui);
  return page(`${a.nume}: contracte, furnizori și semnale`, `${crumb([["Acasă", "/"], a.judet ? [a.judet === "București" ? "București" : `Județul ${a.judet}`, `/judet/${slugJ(a.judet)}`] : ["Autorități"], ...(a.localitate ? [[a.localitate] as [string]] : [])])}
<h1>${esc(a.nume)}</h1><div class="idrow"><button class="chipid mono" data-v="${esc(a.cui)}" title="Copiază CUI">CUI ${esc(a.cui)}</button><span class="st neu">autoritate contractantă</span>${a.semnale ? `<span class="st sig">${plural(a.semnale, "semnal", "semnale")} de verificat</span>` : `<span class="st ok">fără semnale</span>`}</div>
<p class="story">${story}</p>
${tiles([[n0(a.n), "contracte"], [mil(a.valoare), "valoare contractată"], [n0(a.furnizori), "furnizori"], ...(HAS_DA ? [[n0(a.da_n), "achiziții directe"], [mil(a.da_valoare), "cumpărat direct"]] as [any, string][] : [[n0(anu), "anunțuri anulate"] as [any, string]]), [n0(a.semnale), "semnale de verificat", a.semnale > 0]])}
<div class="secnav">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div>
<div class="cols">${box("Informații", `<dl class="kv"><dt>CUI</dt><dd class="mono">${esc(a.cui)}</dd>${a.judet ? `<dt>Județ</dt><dd><a href="/judet/${slugJ(a.judet)}">${esc(a.judet)}</a></dd>` : ""}${a.localitate ? `<dt>Localitate</dt><dd>${esc(a.localitate)}</dd>` : ""}<dt>Contracte</dt><dd>${n0(a.n)}</dd><dt>Furnizori</dt><dd>${n0(a.furnizori)}</dd><dt>Anunțuri anulate</dt><dd>${n0(anu)}</dd><dt>Primul contract</dt><dd class="mono">${a.d1}</dd><dt>Ultimul contract</dt><dd class="mono">${a.d2}</dd></dl><p class="note">Sediu din ANAF, contracte din data.gov.ro.</p>`)}
${!a.n ? "" : box("Bani contractați pe ani", yearBars(ani) + `<div class="tw" style="margin-top:14px"><table><tbody>${proc.map((p) => `<tr><td>${esc(p.tp)}</td><td class="n">${plural(p.n, "contract", "contracte")}</td><td class="n">${mil(p.v)}</td></tr>`).join("")}</tbody></table></div>`, "", mil(a.valoare))}</div>
${!a.n ? "" : box("Cine câștigă", `<div class="tw"><table><thead><tr><th>Furnizor</th><th class="n">Contracte</th><th class="n">Valoare</th><th>Pondere</th></tr></thead><tbody>${top.map((t) => `<tr><td><a href="/firma/${esc(t.k)}">${esc(t.nume ?? t.k)}</a>${t.semnale ? ` <span class="st sig">${t.semnale}</span>` : ""}<span class="sub">${[t.judet, t.di ? "înființată " + t.di.slice(0, 4) : ""].filter(Boolean).map(esc).join(", ")}</span></td><td class="n">${n0(t.n)}</td><td class="n">${mil(t.v)}</td><td class="nw"><span class="bar" style="width:${Math.round(140 * t.v / Math.max(a.valoare, 1))}px"></span>${a.valoare ? Math.round(100 * t.v / a.valoare) : 0}%</td></tr>`).join("")}</tbody></table></div>`, "furnizori", top.length < a.furnizori ? `primii ${top.length} din ${n0(a.furnizori)}` : plural(a.furnizori, "furnizor", "furnizori"))}
${a.da_n ? daBox(a.cui, "a", a.da_n, a.da_valoare) : ""}
${sem.length ? box("Semnale de verificat", sigCards(sem), "semnale", plural(a.semnale, "semnal", "semnale")) : ""}
${pr.length ? box("Prețuri plătite pe bucată", priceRows(pr, "f"), "preturi") : ""}
${!a.n ? "" : box("Ultimele contracte", ctrTable(ctr, "f"), "contracte", `${Math.min(60, a.n)} din ${n0(a.n)}`)}`, "", { canon: canon, desc: plain(story),
    ld: [{ "@context": "https://schema.org", "@type": "GovernmentOrganization", name: a.nume, url: ORIGIN + canon, identifier: { "@type": "PropertyValue", propertyID: "CUI", value: a.cui }, address: adr(a) }, bcLd([["Acasă", "/"], ...(a.judet ? [[a.judet, `/judet/${slugJ(a.judet)}`] as [string, string]] : []), [a.nume, canon]])] });
}
function pFirma(cui: string) {
  const f = q("SELECT * FROM firme WHERE cui=?").get(cui) as any; if (!f) return null;
  const ani = q("SELECT substr(data,1,4) y, sum(v) v, count(*) n FROM contracte WHERE cf=? GROUP BY 1 ORDER BY 1").all(cui) as any[];
  const top = q("SELECT c.ca k, a.nume, a.judet, count(*) n, sum(c.v) v FROM contracte c LEFT JOIN autoritati a ON a.cui=c.ca WHERE c.cf=? GROUP BY c.ca ORDER BY v DESC LIMIT 15").all(cui) as any[];
  const part = q("SELECT b.cf k, f.nume, count(*) n FROM contracte a JOIN contracte b ON b.anunt=a.anunt AND b.ca=a.ca AND b.nr IS a.nr AND b.data=a.data AND b.cf!=a.cf LEFT JOIN firme f ON f.cui=b.cf WHERE a.cf=? AND a.na>1 GROUP BY b.cf ORDER BY n DESC LIMIT 12").all(cui) as any[];
  const sem = q("SELECT s.* FROM sem_ent e JOIN semnale s ON s.id=e.sid WHERE e.cui=? AND e.fel='f' ORDER BY s.scor DESC, s.valoare DESC LIMIT 30").all(cui);
  const pr = q(LP + " WHERE (',' || l.cf || ',') LIKE ? ORDER BY l.cluster, l.varianta, l.p DESC LIMIT 40").all(`%,${cui},%`) as any[];
  const ctr = q("SELECT c.data, c.ca k, a.nume, c.na, c.cpv_nume, c.tp, c.valoare, c.anunt, i.nid FROM contracte c LEFT JOIN autoritati a ON a.cui=c.ca LEFT JOIN anunt_id i ON i.anunt=c.anunt WHERE c.cf=? ORDER BY c.data DESC LIMIT 60").all(cui) as any[];
  const luni = f.data_inregistrare && f.d1 ? Math.floor((Date.parse(f.d1) - Date.parse(f.data_inregistrare)) / 864e5 / 30.4) : null;
  const noua = luni != null && luni >= 0 && luni <= 12 && f.data_inregistrare >= "2021-06-01";
  const ro = /^\d+$/.test(f.cui), radiata = /RADIERE/i.test(f.stare || ""), pAs = f.n ? Math.round(100 * f.n_asoc / f.n) : 0;
  const p1 = top[0] && f.valoare ? Math.round(100 * top[0].v / f.valoare) : 0;
  const story = `<b>${esc(f.nume)}</b>${f.data_inregistrare ? ` este o firmă înființată în ${f.data_inregistrare.slice(0, 4)}${f.judet ? `, cu sediul în ${f.judet === "București" ? "București" : "județul " + esc(f.judet)}` : ""}` : " este un furnizor al statului"}.${f.n ? ` Din ${M.din.slice(0, 4)} a câștigat <b>${plural(f.n, "contract public", "contracte publice")}</b> în valoare de <b>${mil(f.valoare)}</b> de la ${plural(f.autoritati, "autoritate", "autorități")}.` : ` Din ${M.din.slice(0, 4)} încoace nu a câștigat contracte prin procedură.`}${f.da_n ? ` A vândut statului direct, fără procedură, de <b>${plural(f.da_n, "dată", "ori")}</b>, în valoare de <b>${mil(f.da_valoare)}</b>, către ${plural(f.da_autoritati, "autoritate", "autorități")}.` : ""}${noua ? ` Primul contract a venit la <b>${luni} luni</b> de la înființare.` : ""}${top[0] && p1 >= 40 ? ` ${p1}% din valoare vine de la ${esc(top[0].nume ?? "o singură autoritate")}.` : ""}${pAs >= 30 ? ` ${pAs}% din contracte sunt în asociere cu alte firme.` : ""}${f.semnale ? ` Are <b>${plural(f.semnale, "semnal", "semnale")}</b> de verificat.` : ""}`;
  const nav = [f.n ? ["#clienti", "Cui vinde"] : null, f.da_n ? ["#directe", "Achiziții directe"] : null, sem.length ? ["#semnale", `Semnale (${f.semnale})`] : null, pr.length ? ["#preturi", "Prețuri pe bucată"] : null, part.length ? ["#parteneri", "Parteneri"] : null, f.n ? ["#contracte", "Contracte"] : null].filter(Boolean) as string[][];
  const canon = "/firma/" + encodeURIComponent(f.cui);
  return page(`${f.nume}: contracte cu statul`, `${crumb([["Acasă", "/"], f.judet ? [f.judet === "București" ? "București" : `Județul ${f.judet}`, `/judet/${slugJ(f.judet)}`] : ["Firme"], ...(f.localitate ? [[f.localitate] as [string]] : [])])}
<h1>${esc(f.nume)}</h1><div class="idrow"><button class="chipid mono" data-v="${esc(f.cui)}" title="Copiază CUI">CUI ${esc(f.cui)}</button>${radiata ? `<span class="st bad">radiată</span>` : f.inactiv ? `<span class="st bad">inactivă fiscal</span>` : f.stare ? `<span class="st ok">activă</span>` : ""}${noua ? `<span class="st sig">contract la ${luni} luni de la înființare</span>` : ""}${f.semnale ? `<span class="st sig">${plural(f.semnale, "semnal", "semnale")} de verificat</span>` : ""}</div>
<p class="story">${story}</p>
${tiles([[n0(f.n), "contracte publice"], [mil(f.valoare), "partea firmei"], [n0(f.autoritati), "autorități cliente"], ...(HAS_DA ? [[n0(f.da_n), "achiziții directe"], [mil(f.da_valoare), "vândut direct"]] as [any, string][] : [[pAs + "%", "în asociere"] as [any, string]]), [n0(f.semnale), "semnale de verificat", f.semnale > 0]])}
<div class="secnav">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div>
<div class="cols">${box("Informații firmă", `<dl class="kv"><dt>CUI</dt><dd class="mono">${esc(f.cui)}</dd>${f.data_inregistrare ? `<dt>Înființată</dt><dd class="mono">${esc(f.data_inregistrare)}</dd>` : ""}${f.stare ? `<dt>Stare</dt><dd>${esc(f.stare.toLowerCase())}</dd>` : ""}${f.caen ? `<dt>CAEN</dt><dd class="mono">${esc(f.caen)}</dd>` : ""}${f.judet ? `<dt>Sediu</dt><dd>${esc(f.judet)}${f.localitate ? ", " + esc(f.localitate) : ""}</dd>` : ""}<dt>Plătitor TVA</dt><dd>${f.tva ? "da" : "nu"}</dd><dt>Primul contract</dt><dd class="mono">${f.d1}</dd></dl>
<p class="note">Identificare din ANAF.${ro ? ` Asociații, bilanțurile și dosarele sunt pe <a href="https://harta-firmelor.ro/firma/${esc(f.cui)}" target="_blank" rel="noopener">harta-firmelor.ro</a>.` : ""}</p>`)}
${!f.n ? "" : box("Bani publici pe ani", yearBars(ani), "", mil(f.valoare))}</div>
${!f.n ? "" : box("Cui vinde", `<div class="tw"><table><thead><tr><th>Autoritate</th><th class="n">Contracte</th><th class="n">Valoare</th><th>Pondere</th></tr></thead><tbody>${top.map((t) => `<tr><td><a href="/autoritate/${esc(t.k)}">${esc(t.nume ?? t.k)}</a><span class="sub">${esc(t.judet ?? "")}</span></td><td class="n">${n0(t.n)}</td><td class="n">${mil(t.v)}</td><td class="nw"><span class="bar" style="width:${Math.round(140 * t.v / Math.max(f.valoare, 1))}px"></span>${f.valoare ? Math.round(100 * t.v / f.valoare) : 0}%</td></tr>`).join("")}</tbody></table></div>`, "clienti", top.length < f.autoritati ? `primele ${top.length} din ${n0(f.autoritati)}` : plural(f.autoritati, "autoritate", "autorități"))}
${f.da_n ? daBox(f.cui, "f", f.da_n, f.da_valoare) : ""}
${sem.length ? box("Semnale de verificat", sigCards(sem), "semnale", plural(f.semnale, "semnal", "semnale")) : ""}
${pr.length ? box("Prețuri pe bucată", priceRows(pr, "a"), "preturi", "pe produs și variantă") : ""}
${part.length ? box("Parteneri de asociere", `<div class="tw"><table><tbody>${part.map((p) => `<tr><td><a href="/firma/${esc(p.k)}">${esc(p.nume ?? p.k)}</a></td><td class="n">${plural(p.n, "contract împreună", "contracte împreună")}</td></tr>`).join("")}</tbody></table></div>`, "parteneri") : ""}
${!f.n ? "" : box("Ultimele contracte", ctrTable(ctr, "a"), "contracte", `${Math.min(60, f.n)} din ${n0(f.n)}`)}`, "", { canon: canon, desc: plain(story),
    ld: [{ "@context": "https://schema.org", "@type": "Organization", name: f.nume, url: ORIGIN + canon, ...(ro ? { taxID: f.cui } : {}), identifier: { "@type": "PropertyValue", propertyID: "CUI", value: f.cui }, ...(f.data_inregistrare ? { foundingDate: f.data_inregistrare } : {}), address: adr(f) }, bcLd([["Acasă", "/"], ...(f.judet ? [[f.judet, `/judet/${slugJ(f.judet)}`] as [string, string]] : []), [f.nume, canon]])] });
}
function pProdus(id: string, u: URL) {
  const c = q("SELECT * FROM clustere WHERE id=?").get(id) as any; if (!c) return null;
  const ac = u.searchParams.get("ac") === "1";
  const toate = q(`SELECT * FROM linii_pret WHERE cluster=? ${ac ? "" : "AND ac=0"} ORDER BY p`).all(id) as any[];
  // Variantele categoriei, cu numărul de contracte. Cu ?v= pagina arată o singură variantă: doar atunci produsele sunt de același fel.
  const vars = HAS_VAR ? [...new Set(toate.map((r) => r.varianta as string).filter(Boolean))].map((v) => ({ v, n: toate.filter((r) => r.varianta === v).length })).sort((a, b) => +nespec(a.v) - +nespec(b.v) || b.n - a.n) : [];
  const vsel = vars.find((x) => x.v === u.searchParams.get("v"))?.v ?? "";
  if (u.searchParams.get("v") && !vsel) return null;
  const rows = vsel ? toate.filter((r) => r.varianta === vsel) : toate;
  const compar = !!c.omogen || (!!vsel && !nespec(vsel));  // se pot pune pe aceeași axă: produs omogen sau o singură variantă cunoscută
  const medVar = (v: string) => { const ps = toate.filter((r) => r.varianta === v).map((r) => r.p); return ps.length >= VAR_MIN && !nespec(v) ? (ps.length % 2 ? ps[ps.length >> 1] : (ps[(ps.length >> 1) - 1] + ps[ps.length >> 1]) / 2) : null; };
  const ref = (r: any): number | null => (vsel ? (compar ? m : null) : r.varianta ? medVar(r.varianta) ?? (c.omogen && !vars.some((x) => !nespec(x.v) && x.n >= VAR_MIN) ? m : null) : c.omogen ? m : null);
  const lkv = (v: string) => `/produs/${c.id}` + (v || ac ? "?" + new URLSearchParams({ ...(v ? { v } : {}), ...(ac ? { ac: "1" } : {}) }).toString() : "");
  const ps = rows.map((r) => r.p), m = ps.length ? (ps.length % 2 ? ps[ps.length >> 1] : (ps[(ps.length >> 1) - 1] + ps[ps.length >> 1]) / 2) : 0;
  const W = Math.max(1060, rows.length * 8 + 80), H = 260, L = 64, B = 22, T = 14, mx = Math.max(...ps, 1) * 1.05, y = (v: number) => T + (H - T - B) * (1 - v / mx), bw = Math.max(3, Math.min(20, (W - L - 10) / Math.max(rows.length, 1) - 2));
  let g = ""; for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11.5" fill="var(--mut)"${CURS ? ` class="bani" data-lei="${Math.round(v)}" data-f="k"` : ""}>${n0(v / 1000)} mii</text>`; }
  rows.forEach((r, i) => { const yy = y(r.p); g += `<a href="${seap(r.nid)}" target="_blank" class="cell"><rect x="${L + 4 + i * (bw + 2)}" y="${yy}" width="${bw}" height="${Math.max(1, H - B - yy)}" rx="${Math.min(4, bw / 2)}" fill="${compar && r.p >= m * 1.4 ? "var(--sig)" : "var(--series)"}"><title>${n0(r.p)} lei pe bucată${compar ? ` (${r.p >= m ? "+" : ""}${Math.round((r.p / m - 1) * 100)}% față de mediană)` : ""}${r.varianta ? "\n" + esc(r.varianta) : ""}${r.include ? "\ncu " + esc(r.include) : ""}\n${esc(r.autoritate)}\n${esc(r.castigatori)}\n${n0(r.q)} buc, ${r.data}</title></rect></a>`; });
  g += `<line x1="${L}" x2="${W}" y1="${y(m)}" y2="${y(m)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${L + 8}" y="${y(m) - 6}" font-size="12" fill="var(--ink)"${CURS ? ` class="bani" data-lei="${Math.round(m)}" data-f="med"` : ""}>mediana ${n0(m)} lei</text>`;
  const peste = rows.filter((r) => r.p > m).reduce((s, r) => s + (r.p - m) * r.q, 0);
  const tab = [...rows].reverse(); const areMarci = rows.some((r) => r.marca);
  return page(`${c.nume}: prețuri pe bucată`, `${crumb([["Acasă", "/"], ["Prețuri", "/preturi"], [c.nume]])}<h1>${esc(c.nume)}${vsel ? `, ${esc(vsel)}` : ""}</h1><div class="idrow"><span class="st ${c.omogen ? "ok" : "neu"}">${c.omogen ? "produs comparabil" : "categorie eterogenă"}</span>${vsel ? `<span class="st ${nespec(vsel) ? "neu" : "ok"}">${nespec(vsel) ? "variantă necunoscută, nu se compară" : "o singură variantă"}</span>` : ""}</div>
<p class="story">Prețul pe bucată din fiecare contract: valoarea contractului împărțită la cantitatea din anunțul de atribuire. ${compar ? `Cel mai scump contract e de <b>${(ps[ps.length - 1] / ps[0]).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ori</b> mai mare pe bucată decât cel mai ieftin.` : "Modelele și dotările diferă mult în această categorie, deci o diferență de preț nu e, singură, un semnal."}${vars.length > 1 && !vsel ? " Alege o variantă ca să pui pe aceeași axă doar produse de același fel." : ""}${rows.some((r) => r.include) ? " Unele contracte cuprind și altceva pe lângă produs (stații de încărcare, sisteme ITS, service); asta urcă prețul pe bucată și e notat la fiecare contract." : ""}</p>
${vars.length > 1 ? `<div class="chips" aria-label="Variante" style="margin-top:18px"><a class="chip ${vsel ? "" : "on"}" href="${esc(lkv(""))}">Toate variantele<i>${toate.length}</i></a>${vars.map((x) => `<a class="chip ${x.v === vsel ? "on" : ""}" href="${esc(lkv(x.v))}">${esc(x.v)}<i>${x.n}</i></a>`).join("")}</div>` : ""}
${tiles([[n0(rows.length), "contracte comparate"], [leiU(m), "mediana pe bucată"], [leiU(ps[0]), "cel mai ieftin"], [leiU(ps[ps.length - 1]), "cel mai scump", compar], compar ? [mil(peste), "plătit peste mediană"] : [n0(vars.filter((x) => !nespec(x.v)).length), "variante cunoscute"]])}<div style="height:16px"></div>
${box("Fiecare contract, de la cel mai ieftin la cel mai scump", `<div style="overflow-x:auto"><svg width="${W}" height="${H}" role="img" aria-label="Preț pe bucată pe contract, ordonat crescător">${g}</svg></div><p class="note">O bară este un contract. ${compar ? "Barele portocalii sunt cu peste 40% deasupra medianei." : "Aici sunt amestecate variante diferite, deci barele nu sunt colorate după preț."} Apasă pe o bară pentru anunțul din SEAP. <a href="${esc(`/produs/${c.id}?` + new URLSearchParams({ ...(vsel ? { v: vsel } : {}), ac: ac ? "0" : "1" }).toString())}">${ac ? "Ascunde" : "Arată și"} acordurile-cadru</a></p>`)}
${box("Contractele", `<div class="tw"><table><thead><tr><th>Data</th><th>Autoritate</th><th>Furnizor</th>${vars.length ? "<th>Variantă și conținut</th>" : ""}${areMarci ? "<th>Marcă</th>" : ""}<th class="n">Bucăți</th><th class="n">${MON("Lei", "Euro")} pe bucată</th><th class="n">${vsel || !vars.length ? "Față de mediană" : "Față de mediana variantei"}</th><th>Anunț</th></tr></thead><tbody>${tab.map((r) => { return `<tr><td class="nw mono">${r.data}</td><td><a href="/autoritate/${esc(r.ca)}">${esc(r.autoritate)}</a></td><td>${esc(r.castigatori)}</td>${vars.length ? `<td>${r.varianta ? (vsel ? esc(r.varianta) : `<a href="${esc(lkv(r.varianta))}">${esc(r.varianta)}</a>`) : ""}${r.include ? `<span class="sub">cu ${esc(r.include)}</span>` : ""}</td>` : ""}${areMarci ? `<td>${r.marca ? `<a href="${esc(r.marca_sursa)}" target="_blank" rel="noopener">${esc(r.marca)}</a><span class="sub">${r.marca_stare === "confirmat din SEAP" ? "din contract" : "din presă sau comunicat"}</span>` : `<span class="sub">necunoscută</span>`}</td>` : ""}<td class="n">${n0(r.q)}</td><td class="n">${lei(r.p)}</td>${abatere(r.p, ref(r))}<td class="nw"><a class="mono" href="${seap(r.nid)}" target="_blank" rel="noopener" title="${esc(r.text)}">${esc(r.anunt)}</a>${r.inc < 0.8 ? `<span class="sub">cantitate dedusă</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`, "", "de la cel mai scump")}`, "/preturi", { canon: "/produs/" + c.id, noindex: ac || !!vsel,
    desc: `${c.nume}: prețul pe bucată în ${n0(rows.length)} contracte publice. Mediana este ${n0(m)} lei, cel mai ieftin ${n0(ps[0])} lei, cel mai scump ${n0(ps[ps.length - 1])} lei, fără TVA.`,
    ld: [{ "@context": "https://schema.org", "@type": "Dataset", name: `${c.nume}: prețuri pe bucată în achiziții publice`, description: `Prețul pe bucată din ${rows.length} contracte de achiziție publică din România.`, url: ORIGIN + "/produs/" + c.id, inLanguage: "ro", isAccessibleForFree: true, variableMeasured: "preț pe bucată, lei fără TVA" }, bcLd([["Acasă", "/"], ["Prețuri", "/preturi"], [c.nume, "/produs/" + c.id]])] });
}
function pPreturi() {
  const cl = q("SELECT * FROM clustere ORDER BY omogen DESC, n DESC").all() as any[];
  return page("Prețuri comparate", `<div class="pagehead"><h1>Prețuri comparate pe produs</h1><p>Produse cumpărate de multe autorități, aduse la preț pe bucată. Produsele comparabile se pot pune direct pe aceeași axă; la categoriile eterogene contează modelul și dotările.</p></div>
<div class="tw bare"><table><thead><tr><th>Produs</th><th class="n">Contracte</th><th class="n">Cel mai ieftin</th><th class="n">Mediana</th><th class="n">Cel mai scump</th><th class="n">Raport</th></tr></thead><tbody>${cl.map((c) => `<tr><td><a href="/produs/${c.id}">${esc(c.nume)}</a><span class="sub">${c.omogen ? "produs comparabil" : "categorie eterogenă"}</span></td><td class="n">${c.n}</td><td class="n">${lei(c.pmin)}</td><td class="n">${lei(c.mediana)}</td><td class="n">${lei(c.pmax)}</td><td class="n ${c.omogen ? "up" : ""}">${(c.pmax / c.pmin).toFixed(1)}×</td></tr>`).join("")}</tbody></table></div>
<p class="note">${MON("Lei", "Euro")} pe bucată, fără TVA. Acoperirea e parțială: prețul pe bucată există doar pentru cele ${n0(M.detalii)} anunțuri ale căror detalii au fost citite din SEAP.</p>`, "/preturi", { canon: "/preturi", desc: `Prețuri pe bucată comparate între autorități pentru ${cl.length} produse cumpărate din bani publici: cel mai ieftin, mediana și cel mai scump contract.` });
}
// Paginare: `pagina` numărată de la 1, mărime fixă, adâncime maximă. Dincolo de PAG_MAX cititorul restrânge filtrele;
// așa lista nu poate fi parcursă cap-coadă de un program. O pagină în afara intervalului răspunde 404.
const PAG = 30, PAG_MAX = 40;
function nrPagina(u: URL): number | null { const v = u.searchParams.get("pagina"); if (v == null || v === "") return 1; return /^[1-9]\d{0,3}$/.test(v) ? +v : null; }
function pager(pg: number, pagini: number, lk: (p: number) => string) {
  if (pagini <= 1) return "";
  const nr = [...new Set([1, pg - 1, pg, pg + 1, pagini].filter((x) => x >= 1 && x <= pagini))].sort((a, b) => a - b);
  let h = "", ant = 0;
  for (const x of nr) { if (x - ant > 1) h += `<span class="gap">…</span>`; h += x === pg ? `<span class="cur" aria-current="page">${x}</span>` : `<a href="${lk(x)}" aria-label="Pagina ${x}">${x}</a>`; ant = x; }
  return `<nav class="pager" aria-label="Paginare">${pg > 1 ? `<a href="${lk(pg - 1)}" rel="prev">Înapoi</a>` : ""}${h}${pg < pagini ? `<a href="${lk(pg + 1)}" rel="next">Înainte</a>` : ""}</nav>`;
}
function pSemnale(u: URL) {
  const tip = u.searchParams.get("tip") || "", jud = u.searchParams.get("judet") || "", niv = +(u.searchParams.get("nivel") || 1), pg = nrPagina(u), s = (u.searchParams.get("q") || "").trim().slice(0, 80);
  if (pg === null) return null;
  const wh: string[] = ["s.scor>=?"], pr: any[] = [niv];
  if (tip && M.tipuri[tip]) { wh.push("s.tip=?"); pr.push(tip); }
  if (jud) { wh.push("s.id IN (SELECT e.sid FROM sem_ent e JOIN autoritati a ON a.cui=e.cui AND e.fel='a' WHERE a.judet=? UNION SELECT e.sid FROM sem_ent e JOIN firme f ON f.cui=e.cui AND e.fel='f' WHERE f.judet=?)"); pr.push(jud, jud); }
  if (s) { wh.push("(s.entitate LIKE ? OR s.titlu LIKE ? OR s.detalii LIKE ?)"); pr.push(`%${s}%`, `%${s}%`, `%${s}%`); }
  const tot = (q(`SELECT count(*) n FROM semnale s WHERE ${wh.join(" AND ")}`).get(...pr) as any).n;
  const rows = q(`SELECT s.* FROM semnale s WHERE ${wh.join(" AND ")} ORDER BY s.scor DESC, s.valoare DESC LIMIT ? OFFSET ?`).all(...pr, PAG, (pg - 1) * PAG);
  const pagini = Math.min(PAG_MAX, Math.max(1, Math.ceil(tot / PAG))), taiat = tot > PAG_MAX * PAG;
  if (pg > pagini) return null;
  const lk = (o: Record<string, any>) => { const e = Object.entries({ tip, judet: jud, nivel: niv > 1 ? String(niv) : "", q: s, ...o }).filter(([, v]) => v); return "/semnale" + (e.length ? "?" + new URLSearchParams(e as any).toString() : ""); };
  const T = M.tipuri[tip];
  return page(T ? T.nume : "Semnale de verificat", `<div class="pagehead"><h1>${T ? esc(T.nume) : "Semnale de verificat"}</h1><p>${T ? esc(T.sens) + "." : "Tipare calculate automat din contracte. Arată unde merită cerute documente, nu că s-a comis o faptă."}</p></div>
<div class="chips"><a class="chip ${tip ? "" : "on"}" href="${lk({ tip: "", pagina: "" })}">Toate<i>${n0(M.semnale)}</i></a>${Object.entries(M.tipuri as Record<string, any>).filter(([, v]) => v.n).map(([k, v]) => `<a class="chip ${k === tip ? "on" : ""}" href="${lk({ tip: k, pagina: "" })}">${esc(v.nume)}<i>${v.n}</i></a>`).join("")}</div>
<form style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" action="/semnale"><input type="hidden" name="tip" value="${esc(tip)}"><input type="search" name="q" value="${esc(s)}" placeholder="Caută în semnale" aria-label="Caută în semnale" style="flex:1 1 220px;max-width:340px">
<select name="judet" aria-label="Județ"><option value="">Toate județele</option>${M.judete.map((j: string) => `<option ${j === jud ? "selected" : ""}>${j}</option>`).join("")}</select>
<select name="nivel" aria-label="Nivel">${[1, 2, 3].map((k) => `<option value="${k}" ${k === niv ? "selected" : ""}>${k === 1 ? "Orice nivel" : k === 2 ? "Nivel 2 și 3" : "Doar nivel 3"}</option>`).join("")}</select><button class="btn" style="padding:8px 18px">Filtrează</button></form>
${box(`${plural(tot, "semnal", "semnale")}${jud ? " în " + esc(jud) : ""}`, sigCards(rows), "", `pagina ${pg} din ${pagini}`)}
${pager(pg, pagini, (x) => lk({ pagina: x > 1 ? String(x) : "" }))}${taiat && pg === pagini ? `<p class="note">Lista se oprește la primele ${n0(PAG_MAX * PAG)} de semnale. Alege un tip, un județ sau un nivel ca să le vezi pe celelalte.</p>` : ""}`, "/semnale", { canon: T ? `/semnale?tip=${tip}` : "/semnale", noindex: !!(jud || s || pg > 1 || niv > 1),
    prev: pg > 1 ? lk({ pagina: pg > 2 ? String(pg - 1) : "" }) : undefined, next: pg < pagini ? lk({ pagina: String(pg + 1) }) : undefined,
    desc: T ? `${T.nume}: ${T.n} semnale calculate din contractele publice. ${T.sens}. Un semnal arată unde merită cerute documente, nu este o acuzație.` : `${n0(M.semnale)} semnale de verificat, calculate automat din contractele publice, pe tipuri și județe. Un semnal arată unde merită cerute documente, nu este o acuzație.` });
}
function pJudet(sl: string) {
  const j = JBY[sl]; if (!j) return null; const r = q("SELECT * FROM judete WHERE judet=?").get(j) as any; if (!r) return null;
  const top = q("SELECT * FROM autoritati WHERE judet=? ORDER BY valoare DESC LIMIT 25").all(j) as any[];
  const frm = q("SELECT f.cui, f.nume, f.judet, sum(c.v) v, count(*) n FROM contracte c JOIN autoritati a ON a.cui=c.ca JOIN firme f ON f.cui=c.cf WHERE a.judet=? GROUP BY f.cui ORDER BY v DESC LIMIT 15").all(j) as any[];
  const sem = q("SELECT DISTINCT s.* FROM sem_ent e JOIN autoritati a ON a.cui=e.cui AND e.fel='a' JOIN semnale s ON s.id=e.sid WHERE a.judet=? ORDER BY s.scor DESC, s.valoare DESC LIMIT 12").all(j);
  return page(j === "București" ? "București: achiziții publice" : `Județul ${j}: achiziții publice`, `${crumb([["Acasă", "/"], ["Harta", "/harta"], [`Județul ${j}`]])}<h1>${j === "București" ? "București" : "Județul " + esc(j)}</h1>
<p class="story">${plural(r.autoritati, "autoritate", "autorități")} cu sediul aici au semnat <b>${plural(r.contracte, "contract", "contracte")}</b> în valoare de <b>${mil(r.valoare)}</b> din ${M.din.slice(0, 4)} încoace.${r.semnale ? ` La ele am găsit <b>${plural(r.semnale, "semnal", "semnale")}</b> de verificat.` : ""}</p>
${tiles([[n0(r.autoritati), "autorități"], [n0(r.contracte), "contracte"], [mil(r.valoare), "valoare contractată"], [n0(r.semnale), "semnale de verificat", r.semnale > 0]])}<div style="height:16px"></div>
<div class="cols even">${box("Autoritățile, după bani contractați", `<div class="tw"><table><thead><tr><th>Autoritate</th><th class="n">Contracte</th><th class="n">Valoare</th></tr></thead><tbody>${top.map((a) => `<tr><td><a href="/autoritate/${esc(a.cui)}">${esc(a.nume)}</a>${a.semnale ? ` <span class="st sig">${a.semnale}</span>` : ""}</td><td class="n">${n0(a.n)}</td><td class="n">${mil(a.valoare)}</td></tr>`).join("")}</tbody></table></div>`)}
${box("Firmele care câștigă aici", `<div class="tw"><table><tbody>${frm.map((f) => `<tr><td><a href="/firma/${esc(f.cui)}">${esc(f.nume)}</a><span class="sub">${esc(f.judet ?? "")}</span></td><td class="n">${mil(f.v)}</td></tr>`).join("")}</tbody></table></div>`)}</div>
${box("Semnale la autoritățile din județ", sigCards(sem) + `<p class="note"><a href="/semnale?judet=${encodeURIComponent(j)}">Toate semnalele din ${esc(j)}</a></p>`)}`, "/harta", { canon: "/judet/" + sl,
    desc: `${j}: ${plural(r.autoritati, "autoritate", "autorități")} au semnat ${plural(r.contracte, "contract", "contracte")} în valoare de ${milT(r.valoare)} din ${M.din.slice(0, 4)} încoace. Cine cumpără și cine câștigă.`,
    ld: [bcLd([["Acasă", "/"], ["Harta", "/harta"], [j, "/judet/" + sl]])] });
}
function pHarta(u: URL) {
  const m = (["semnale", "valoare", "contracte"].includes(u.searchParams.get("m") || "") ? u.searchParams.get("m") : "semnale") as any;
  const rows = q("SELECT * FROM judete ORDER BY " + m + " DESC").all() as any[];
  return page("Harta achizițiilor pe județe", `<div class="pagehead"><h1>Harta pe județe</h1><p>Un pătrat pentru fiecare județ, așezat aproximativ ca pe hartă. Județul este cel al sediului autorității, deci instituțiile centrale apar la București.</p></div>
<div class="chips">${[["semnale", "Semnale de verificat"], ["valoare", "Valoare contractată"], ["contracte", "Număr de contracte"]].map(([k, t]) => `<a class="chip ${k === m ? "on" : ""}" href="/harta?m=${k}">${t}</a>`).join("")}</div>
<div class="cols even"><section class="box">${harta(m)}</section>
${box("Județele, în ordine", `<div class="tw"><table><thead><tr><th>Județ</th><th class="n">Autorități</th><th class="n">Contracte</th><th class="n">Valoare</th><th class="n">Semnale</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a href="/judet/${slugJ(r.judet)}">${esc(r.judet)}</a></td><td class="n">${n0(r.autoritati)}</td><td class="n">${n0(r.contracte)}</td><td class="n">${mil(r.valoare)}</td><td class="n">${n0(r.semnale)}</td></tr>`).join("")}</tbody></table></div>`)}</div>`, "/harta", { canon: "/harta", desc: "Achizițiile publice pe județe: semnale de verificat, valoare contractată și număr de contracte, după sediul autorității." });
}
function pMetoda() {
  return page("Cum citim datele", `<div class="pagehead"><h1>Cum citim datele</h1><p>Tot ce apare aici vine din surse publice oficiale și se poate verifica la sursă cu un clic.</p></div>
${box("De unde vin datele", `<dl class="kv"><dt>SEAP</dt><dd>${n0(M.anunturi)} anunțuri de atribuire de pe e-licitatie.ro, până la ${M.anunturi_pana}. Loturile și cantitățile sunt citite pentru ${n0(M.detalii)} dintre ele.</dd><dt>data.gov.ro</dt><dd>${n0(M.contracte)} contracte cu câștigător și CUI, de la ${M.din} la ${M.contracte_pana}.</dd>${HAS_DA ? `<dt>data.gov.ro</dt><dd>${n0(M.da)} achiziții directe în valoare de ${mil(M.da_valoare)}, de la ${M.din} la ${M.da_pana}.</dd>` : ""}<dt>ANAF</dt><dd>Data înființării, starea fiscală și sediul firmelor și al autorităților.</dd></dl>`)}
${box("Ce înseamnă fiecare semnal", `<div class="tw"><table><thead><tr><th>Semnal</th><th>Ce arată</th><th class="n">Câte sunt</th></tr></thead><tbody>${Object.entries(M.tipuri as Record<string, any>).map(([k, v]) => `<tr><td><a href="/semnale?tip=${k}">${esc(v.nume)}</a></td><td>${esc(v.sens)}</td><td class="n">${v.n}</td></tr>`).join("")}</tbody></table></div>`)}
${box("Ce nu pot spune datele", `<ul style="margin:0;padding-left:20px;color:var(--ink2);line-height:1.7"><li>Un semnal arată unde merită cerute documente. Nu dovedește o faptă și nu este o acuzație.</li><li>Prețul pe bucată este valoarea contractului împărțită la cantitatea din anunț. Contractele pot include accesorii, garanții sau dotări diferite.</li>
<li>Valorile acordurilor-cadru sunt plafoane, nu plăți. Contractele de peste 500 de milioane de lei pe parte nu intră în totaluri.</li><li>Numărul de oferte primite, asociații și administratorii firmelor nu sunt în datele deschise.</li>
<li>${HAS_DA ? `Achizițiile directe apar ca totaluri pe autoritate și pe furnizor. Fiecare cumpărare în parte se caută în SEAP după numărul ei (DA urmat de cifre). Cele făcute în afara catalogului SEAP nu sunt incluse.` : "Achizițiile directe, cele sub pragul de procedură, nu sunt încă incluse."}</li><li>Datele oficiale conțin erori de introducere. Pe cele găsite le-am scos, dar pot rămâne altele.</li></ul>`)}`, "/metoda", { canon: "/metoda", desc: "De unde vin datele (SEAP, data.gov.ro, ANAF), ce înseamnă fiecare semnal și ce nu pot spune datele despre un contract public." });
}
function pMcp() {
  const u = ORIGIN + "/mcp/server", code = (t: string) => `<pre class="mono" style="margin:0;padding:12px 14px;background:var(--raised);border-radius:8px;overflow-x:auto;font-size:13px">${esc(t)}</pre>`;
  return page("Acces pentru asistenți AI (MCP)", `<div class="pagehead"><h1>Acces pentru asistenți AI</h1><p>Aceleași date ca pe site, citite direct de un asistent prin Model Context Protocol. Serverul e public, doar pentru citire, fără cont. Fiecare răspuns poartă adresa paginii și a anunțului din SEAP, ca cifrele să poată fi verificate.</p></div>
${box("Adresa serverului", code(u) + `<p class="note">Transport: Streamable HTTP, fără sesiuni. Limită: ${RATE} de cereri pe minut de la aceeași adresă IP.</p>`)}
${box("Conectare", `<dl class="kv"><dt>Claude Code</dt><dd>${code(`claude mcp add --transport http banul-public ${u}`)}</dd><dt>claude.ai</dt><dd>Setări, Conectori, Adaugă conector personalizat, apoi adresa de mai sus.</dd><dt>Cursor și alți clienți</dt><dd>${code(JSON.stringify({ mcpServers: { "banul-public": { url: u } } }, null, 2))}</dd></dl>`)}
${box("Unelte", `<div class="tw"><table><thead><tr><th>Unealtă</th><th>Ce întoarce</th></tr></thead><tbody>${MCP_TOOLS_DOC.map(([n, d]) => `<tr><td class="mono nw">${n}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div><p class="note">Un asistent începe cu <span class="mono">describe_data</span>, găsește CUI-ul cu <span class="mono">search</span>, apoi cere fișe și liste.</p>`)}
${box("Cum se citesc răspunsurile", `<ul style="margin:0;padding-left:20px;color:var(--ink2);line-height:1.7"><li>Un semnal arată unde merită cerute documente. Nu dovedește o faptă și nu este o acuzație.</li><li>Valorile sunt în lei, fără TVA. Valorile acordurilor-cadru sunt plafoane, nu plăți.</li><li>Limitele datelor sunt aceleași ca pe pagina <a href="/metoda">Cum citim datele</a>.</li></ul>`)}`, "", { canon: "/mcp",
    desc: "Server MCP public, doar pentru citire, peste contractele de achiziție publică din România: căutare, fișe de autoritate și firmă, prețuri pe bucată și semnale de verificat.",
    ld: [{ "@context": "https://schema.org", "@type": "WebAPI", name: "Banul public MCP", description: "Server Model Context Protocol peste contractele de achiziție publică din România.", url: ORIGIN + "/mcp", documentation: ORIGIN + "/mcp", inLanguage: "ro", isAccessibleForFree: true }] });
}

// robots.txt și sitemap. Sitemap-ul e împărțit pe felul paginii, câte cel mult SM_MAX adrese pe fișier (limita protocolului e 50.000).
const SM_MAX = 40000, xml = (s: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${s}`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
const smParts = (t: "autoritati" | "firme") => Math.max(1, Math.ceil((q(`SELECT count(*) n FROM ${t}`).get() as any).n / SM_MAX));
const smIds = () => ["pagini", ...Array.from({ length: smParts("autoritati") }, (_, i) => `autoritati-${i + 1}`), ...Array.from({ length: smParts("firme") }, (_, i) => `firme-${i + 1}`)];
const urlset = (xs: [string, string?][]) => xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xs.map(([p, d]) => `<url><loc>${esc(ORIGIN + p)}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("")}</urlset>`);
function robots() {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /mcp/server\n\nSitemap: ${ORIGIN}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
function sitemap(id: string | null) {
  const zi = M.generat.slice(0, 10);
  if (id === null) return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${smIds().map((i) => `<sitemap><loc>${esc(`${ORIGIN}/sitemap/${i}.xml`)}</loc><lastmod>${zi}</lastmod></sitemap>`).join("")}</sitemapindex>`);
  if (id === "pagini") return urlset([...["/", "/preturi", "/semnale", "/harta", "/metoda", "/mcp"].map((p) => [p, zi] as [string, string]),
    ...Object.entries(M.tipuri as Record<string, any>).filter(([, v]) => v.n).map(([k]) => [`/semnale?tip=${k}`, zi] as [string, string]),
    ...(q("SELECT judet FROM judete").all() as any[]).map((r) => [`/judet/${slugJ(r.judet)}`, zi] as [string, string]),
    ...(q("SELECT id FROM clustere").all() as any[]).map((r) => [`/produs/${r.id}`, zi] as [string, string])]);
  const m = /^(autoritati|firme)-(\d+)$/.exec(id); if (!m || +m[2] < 1 || +m[2] > smParts(m[1] as any)) return null;
  // lastmod = data ultimului contract: atunci s-a schimbat ultima oară conținutul fișei
  return urlset((q(`SELECT cui, d2 FROM ${m[1]} ORDER BY cui LIMIT ? OFFSET ?`).all(SM_MAX, (+m[2] - 1) * SM_MAX) as any[]).map((r) => [`/${m[1] === "firme" ? "firma" : "autoritate"}/${encodeURIComponent(r.cui)}`, r.d2]));
}
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><rect x="1" y="1" width="9" height="9" rx="2" fill="#fde68a"/><rect x="12" y="1" width="9" height="9" rx="2" fill="#92400e"/><rect x="1" y="12" width="9" height="9" rx="2" fill="#d97706"/><rect x="12" y="12" width="9" height="9" rx="2" fill="#fef3c7"/></svg>`;
// Limite pe adresă IP. Paginile: PAGE_RATE_PER_MIN pe minut și PAGE_RATE_PER_HOUR pe oră; căutările costă mai mult decât o pagină simplă.
// MCP are contorul lui. Sitemap-ul, robots.txt, iconița și /healthz nu se numără.
const RATE = +(process.env.MCP_RATE_PER_MIN || 90), RATE_H = +(process.env.MCP_RATE_PER_HOUR || 1200);
const limitaPagini = makeLimiter(+(process.env.PAGE_RATE_PER_MIN || 120), +(process.env.PAGE_RATE_PER_HOUR || 1500));
const mcp = makeMcp({ db, M, origin: ORIGIN, limita: makeLimiter(RATE, RATE_H), cauta, slugJ, roNum, seap });
const preaMulte = (sec: number) => { const r = page("Prea multe cereri", `<div class="pagehead"><h1>Prea multe cereri</h1><p>De la adresa ta au venit prea multe cereri într-un timp scurt. Încearcă din nou peste ${sec < 90 ? `${sec} secunde` : `${Math.ceil(sec / 60)} minute`}. Pentru acces programatic folosește <a href="/mcp">serverul MCP</a>.</p></div>`, "", { noindex: true, status: 429 }); r.headers.set("retry-after", String(sec)); return r; };
// În spatele unui proxy (Cloudflare, Caddy, nginx) adresa clientului vine în antet. Fără TRUST_PROXY=1 antetele sunt ignorate, fiindcă oricine le poate scrie.
const clientIp = (req: Request, srv: any) => (process.env.TRUST_PROXY === "1" && (req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",").pop()?.trim())) || srv.requestIP(req)?.address || "necunoscut";
const nf = () => page("Pagina nu există", `<div class="pagehead"><h1>Pagina nu există</h1><p>Adresa nu duce nicăieri. Caută o autoritate, o firmă sau un produs în caseta de sus, sau mergi la <a href="/">prima pagină</a>.</p></div>`, "", { noindex: true, status: 404 });
const server = Bun.serve({ port: PORT, async fetch(req, srv) {
  const u = new URL(req.url), t0 = performance.now(); let p: string, r: Response | null;
  try { p = decodeURIComponent(u.pathname); } catch { return new Response("Adresă invalidă.", { status: 400 }); }
  if (p === "/mcp/server") return mcp(req, clientIp(req, srv));
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Metodă nepermisă.", { status: 405, headers: { allow: "GET, HEAD" } });
  if (!/^\/(robots\.txt|sitemap|icon\.svg|favicon\.ico|healthz)/.test(p)) {  // acestea nu se numără: le citesc motoarele de căutare și monitorizarea
    const sec = limitaPagini(clientIp(req, srv), p === "/cauta" || (p === "/semnale" && u.searchParams.get("q")) ? 3 : 1);
    if (sec) return p === "/api/cauta" ? Response.json([], { status: 429, headers: { "retry-after": String(sec) } }) : preaMulte(sec);
  }
  try {
    if (p === "/robots.txt") return robots(); else if (p === "/sitemap.xml") r = sitemap(null); else if (p.startsWith("/sitemap/") && p.endsWith(".xml")) r = sitemap(p.slice(9, -4));
    else if (p === "/icon.svg" || p === "/favicon.ico") return new Response(ICON, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    else if (p === "/healthz") return Response.json({ ok: true, date: M.generat }, { headers: { "cache-control": "no-store" } });
    else if (p === "/mcp") r = pMcp();
    else if (p === "/") { r = home(); r.headers.set("cache-control", "no-cache"); } else if (p === "/cauta") r = pCauta(u); else if (p === "/api/cauta") r = Response.json(cauta(u.searchParams.get("q") || "", 8));
    else if (p.startsWith("/autoritate/")) r = pAutoritate(p.slice(12)); else if (p.startsWith("/firma/")) r = pFirma(p.slice(7)); else if (p.startsWith("/produs/")) r = pProdus(p.slice(8), u);
    else if (p === "/preturi") r = pPreturi(); else if (p === "/semnale") r = pSemnale(u); else if (p.startsWith("/judet/")) r = pJudet(p.slice(7)); else if (p === "/harta") r = pHarta(u); else if (p === "/metoda") r = pMetoda(); else r = null;
  } catch (e) { console.error(p, e); return new Response("Eroare internă.", { status: 500 }); }
  r = r ?? nf(); r.headers.set("server-timing", `app;dur=${(performance.now() - t0).toFixed(1)}`);
  // Datele se schimbă o dată pe zi, la repornirea serverului: paginile pot sta 5 minute în browser și o oră într-un CDN.
  if (r.status === 200 && !r.headers.has("cache-control")) r.headers.set("cache-control", "public, max-age=300, s-maxage=3600");
  r.headers.set("x-content-type-options", "nosniff"); r.headers.set("referrer-policy", "strict-origin-when-cross-origin"); r.headers.set("x-frame-options", "DENY");
  // Pagina nu încarcă nimic din afară și nu poate fi pusă într-un cadru. Stilul și scriptul sunt în pagină, de aceea „unsafe-inline”.
  if ((r.headers.get("content-type") || "").startsWith("text/html")) r.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return r;
} });
console.log(`Banul public: http://localhost:${server.port} (adresă publică: ${ORIGIN}, MCP: ${ORIGIN}/mcp/server)`);
