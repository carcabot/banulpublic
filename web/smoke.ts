// Test de fum, doar citire, pe un server pornit sau publicat:  bun web/smoke.ts [adresa]   (implicit http://localhost:3210)
// Verifică paginile, etichetele SEO, robots.txt, sitemap-ul și serverul MCP. Cod de ieșire: 0 totul trece, 1 cel puțin o verificare pică.
const BASE = (process.argv[2] || "http://localhost:3210").replace(/\/$/, "");
let ok = 0, bad = 0;
const check = (name: string, cond: any, info = "") => { if (cond) ok++; else { bad++; console.error(`PICĂ  ${name}${info ? "  " + info : ""}`); } };
const get = async (p: string) => { const r = await fetch(BASE + p, { redirect: "manual" }); return { r, t: await r.text() }; };
const meta = (t: string, re: RegExp) => re.exec(t)?.[1] ?? "";
let rid = 0;
const rpc = async (method: string, params?: any, notif = false) => {
  const r = await fetch(BASE + "/mcp/server", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", ...(notif ? {} : { id: ++rid }), method, params }) });
  return { status: r.status, j: r.status === 202 ? null : await r.json() };
};
const call = async (name: string, args: any = {}) => { const { j } = await rpc("tools/call", { name, arguments: args }); const res = j?.result; return { err: !!res?.isError || !!j?.error, text: res?.content?.[0]?.text ?? j?.error?.message ?? "", data: res && !res.isError ? JSON.parse(res.content[0].text) : null }; };

// origine publică declarată de server (din canonical-ul primei pagini)
const home = await get("/");
const ORIGIN = meta(home.t, /<link rel="canonical" href="([^"]+)\/"/);
check("/ răspunde 200", home.r.status === 200, String(home.r.status));
check("/ are canonical", !!ORIGIN);
check("/ are JSON-LD WebSite", home.t.includes('"@type":"WebSite"') && home.t.includes('"@type":"Dataset"'));

const d = await call("describe_data");
check("mcp describe_data", !d.err && d.data?.totaluri?.contracte > 0, d.text.slice(0, 120));
const autoritate = (await call("search", { q: "primaria", kind: "autoritate", limit: 1 })).data?.rezultate?.[0];
const firma = (await call("search", { q: "srl", kind: "firma", limit: 1 })).data?.rezultate?.[0];
const produs = (await call("list_products")).data?.produse?.[0];
check("mcp search găsește o autoritate, o firmă și un produs", autoritate?.cheie && firma?.cheie && produs?.id);
const jud = d.data.judete[0];

// pagini: stare, titlu, descriere, canonical, robots
const pages: [string, { noindex?: boolean; canon?: string; ld?: string }][] = [
  ["/preturi", {}], ["/semnale", {}], ["/semnale?tip=S2", { canon: "/semnale?tip=S2" }], [`/semnale?judet=${encodeURIComponent(jud)}`, { noindex: true, canon: "/semnale" }],
  ["/harta", {}], ["/harta?m=valoare", { canon: "/harta" }], ["/metoda", {}], ["/mcp", { ld: "WebAPI" }], ["/cauta?q=primaria", { noindex: true, canon: "/cauta" }],
  [new URL(autoritate.url).pathname, { ld: "GovernmentOrganization" }], [new URL(firma.url).pathname, { ld: "Organization" }],
  [`/produs/${produs.id}`, { ld: "Dataset" }], [`/produs/${produs.id}?ac=1`, { noindex: true, canon: `/produs/${produs.id}` }], [new URL((await call("get_county", { county: jud })).data.url).pathname, { ld: "BreadcrumbList" }],
];
for (const [p, w] of pages) {
  const { r, t } = await get(p);
  check(`${p} răspunde 200`, r.status === 200, String(r.status));
  check(`${p} are titlu și descriere`, /<title>[^<]{10,}<\/title>/.test(t) && meta(t, /<meta name="description" content="([^"]*)"/).length > 40);
  check(`${p} canonical`, meta(t, /<link rel="canonical" href="([^"]+)"/).replace(/&amp;/g, "&") === ORIGIN + (w.canon ?? p), meta(t, /<link rel="canonical" href="([^"]+)"/));
  check(`${p} robots`, meta(t, /<meta name="robots" content="([^"]+)"/) === (w.noindex ? "noindex,follow" : "index,follow"));
  if (w.ld) check(`${p} JSON-LD ${w.ld}`, t.includes(`"@type":"${w.ld}"`));
  for (const m of t.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) { try { JSON.parse(m[1]); } catch { check(`${p} JSON-LD valid`, false); } }
}
// paginare: pagina 2 există și nu se indexează, o pagină în afara intervalului sau stricată e 404, adâncimea e plafonată
const p2s = await get("/semnale?pagina=2");
check("/semnale?pagina=2: 200, noindex, canonical pe prima pagină, rel prev și next", p2s.r.status === 200 && p2s.t.includes("noindex,follow") && p2s.t.includes(`<link rel="canonical" href="${ORIGIN}/semnale">`) && p2s.t.includes('rel="prev"') && p2s.t.includes('rel="next"') && p2s.t.includes('aria-current="page">2<'));
check("/semnale?pagina=41 e 404 (peste adâncimea maximă)", (await get("/semnale?pagina=41")).r.status === 404);
check("/semnale?pagina=0 și pagina=abc sunt 404", (await get("/semnale?pagina=0")).r.status === 404 && (await get("/semnale?pagina=abc")).r.status === 404);
const nf = await get("/nu-exista");
check("404 pentru pagini inexistente, cu noindex", nf.r.status === 404 && nf.t.includes("noindex"));
check("404 pentru CUI inexistent", (await get("/firma/0000000000")).r.status === 404);
check("400 pentru adresă stricată", (await get("/firma/%E0%A4%A")).r.status === 400);
check("/healthz", (await get("/healthz")).t.includes('"ok":true'));
check("POST pe o pagină e refuzat", (await fetch(BASE + "/preturi", { method: "POST" })).status === 405);

// robots + sitemap
const rb = await get("/robots.txt");
check("robots.txt", rb.r.status === 200 && rb.t.includes(`Sitemap: ${ORIGIN}/sitemap.xml`) && rb.t.includes("Disallow: /mcp/server") && !rb.t.includes("Disallow: /cauta"));
const idx = await get("/sitemap.xml");
const shards = [...idx.t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("sitemap.xml e un index cu cel puțin 3 fișiere", idx.r.status === 200 && idx.t.includes("<sitemapindex") && shards.length >= 3, String(shards.length));
let urls = 0;
for (const s of shards) {
  const { r, t } = await get(new URL(s).pathname);
  const locs = [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  urls += locs.length;
  check(`${new URL(s).pathname} valid`, r.status === 200 && locs.length > 0 && locs.length <= 50000 && locs.every((l) => l.startsWith(ORIGIN + "/")), `${r.status} ${locs.length}`);
  const pick = locs[Math.floor(locs.length / 2)].replace(/&amp;/g, "&");
  check(`adresa din sitemap răspunde 200: ${new URL(pick).pathname}`, (await get(new URL(pick).pathname + new URL(pick).search)).r.status === 200);
}
check("sitemap acoperă autoritățile și firmele", urls >= d.data.totaluri.autoritati + d.data.totaluri.firme, `${urls}`);
check("sitemap inexistent dă 404", (await get("/sitemap/firme-999.xml")).r.status === 404);

// MCP: protocol
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
check("mcp initialize", init.j?.result?.protocolVersion === "2025-06-18" && init.j.result.capabilities?.tools && init.j.result.serverInfo?.name === "banul-public");
check("mcp initialize cu versiune necunoscută propune una știută", /^\d{4}-\d{2}-\d{2}$/.test((await rpc("initialize", { protocolVersion: "1999-01-01" })).j?.result?.protocolVersion));
check("mcp notificarea primește 202", (await rpc("notifications/initialized", undefined, true)).status === 202);
check("mcp ping", !!(await rpc("ping")).j?.result);
const tl = (await rpc("tools/list")).j?.result?.tools ?? [];
check("mcp tools/list: 9 unelte, toate doar-citire, cu schemă", tl.length === 9 && tl.every((t: any) => t.annotations?.readOnlyHint === true && t.inputSchema?.type === "object" && t.description.length > 40), String(tl.length));
check("mcp metodă necunoscută", (await rpc("resources/list")).j?.error?.code === -32601);
check("mcp unealtă necunoscută", (await rpc("tools/call", { name: "drop_table", arguments: {} })).j?.error?.code === -32602);
check("mcp GET e refuzat cu 405", (await fetch(BASE + "/mcp/server")).status === 405);
check("mcp JSON stricat dă 400", (await fetch(BASE + "/mcp/server", { method: "POST", body: "{" })).status === 400);
check("mcp OPTIONS cu CORS", (await fetch(BASE + "/mcp/server", { method: "OPTIONS" })).headers.get("access-control-allow-origin") === "*");

// MCP: unelte
const a = await call("get_authority", { cui: autoritate.cheie });
check("get_authority", !a.err && a.data.contracte > 0 && a.data.top_furnizori.length > 0 && a.data.url.startsWith(ORIGIN), a.text.slice(0, 120));
const f = await call("get_company", { cui: firma.cheie });
check("get_company", !f.err && f.data.contracte > 0 && f.data.top_autoritati.length > 0, f.text.slice(0, 120));
const lc = await call("list_contracts", { authority_cui: autoritate.cheie });
check("list_contracts pe autoritate: totalul bate cu fișa", !lc.err && lc.data.total === a.data.contracte && lc.data.contracte.length === Math.min(50, lc.data.total), `${lc.data?.total} vs ${a.data?.contracte}`);
const an = a.data.pe_ani[0];
check("list_contracts pe an: totalul bate cu pe_ani", (await call("list_contracts", { authority_cui: autoritate.cheie, year: an.an })).data?.total === an.contracte);
const p2 = await call("list_contracts", { company_cui: firma.cheie, page: 2 });
check("list_contracts pagina 2", !p2.err && p2.data.pagina === 2);
check("list_contracts fără CUI e eroare", (await call("list_contracts", {})).err);
const ls = await call("list_signals", { min_level: 3 });
check("list_signals nivel 3", !ls.err && ls.data.semnale.length > 0 && ls.data.semnale.every((s: any) => s.nivel === 3) && ls.data.nota.includes("nu o acuzație"));
check("list_signals total fără filtre bate cu describe_data", (await call("list_signals")).data?.total === d.data.totaluri.semnale);
const tip = d.data.tipuri_semnale.find((t: any) => t.numar > 0);
check("list_signals pe tip: totalul bate cu describe_data", (await call("list_signals", { type: tip.tip })).data?.total === tip.numar);
check("list_signals pe județ", !(await call("list_signals", { county: jud })).err);
check("list_signals tip greșit e eroare", (await call("list_signals", { type: "S99" })).err);
check("list_signals județ greșit e eroare", (await call("list_signals", { county: "Narnia" })).err);
const pp = await call("get_product_prices", { id: produs.id });
check("get_product_prices: ordonat descrescător, total cât în list_products", !pp.err && pp.data.total === produs.contracte && pp.data.contracte.every((c: any, i: number, xs: any[]) => !i || xs[i - 1].pret_pe_bucata_lei >= c.pret_pe_bucata_lei), `${pp.data?.total} vs ${produs.contracte}`);
check("get_product_prices produs greșit e eroare", (await call("get_product_prices", { id: "nu_exista" })).err);
check("get_authority CUI greșit e eroare", (await call("get_authority", { cui: "0000000000" })).err);
check("parametru necunoscut e eroare", (await call("search", { q: "x", sql: "1" })).err);
check("injecție SQL în parametri nu trece", !(await call("search", { q: "'; DROP TABLE firme; --" })).err && (await call("get_company", { cui: "1' OR '1'='1" })).err && !(await call("describe_data")).err);
check("pagină negativă e eroare", (await call("list_signals", { page: -1 })).err);
check("pagină peste adâncimea maximă e eroare", (await call("list_signals", { page: 41 })).err && (await call("list_contracts", { authority_cui: autoritate.cheie, page: 41 })).err);
check("listele spun câte pagini se pot citi", (await call("list_signals")).data?.pagini <= 40);

console.log(`${BASE}: ${ok} verificări trecute, ${bad} picate`);
process.exit(bad ? 1 : 0);
