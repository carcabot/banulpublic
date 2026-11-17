// Banul public – server MCP (Streamable HTTP, fără stare, doar citire) peste site.db.
// Montat de web/server.ts la POST /mcp/server. Fără dependențe: JSON-RPC 2.0 scris de mână.
// Contractul uneltelor este descris în docs/mcp.md; păstrează cele două în pas.
import type { Database } from "bun:sqlite";

export const MCP_VERSION = "0.2.0"; // x-release-please-version
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 64 * 1024;
const PAGE = 50, PAGE_SEMNALE = 30;
const PAG_MAX = 40; // adâncimea maximă a oricărei liste: dincolo de ea clientul restrânge filtrele (an, tip, județ), nu parcurge tot
const NOTA = "Un semnal este un indicator de verificat la sursă, nu o dovadă și nu o acuzație. Valorile sunt în lei, fără TVA.";

export interface McpCtx {
  db: Database;
  M: any;
  origin: string;
  limita: (ip: string, cost?: number) => number;
  cauta: (s: string, lim?: number) => any[];
  slugJ: (j: string) => string;
  roNum: (t: string) => string;
  seap: (nid: any) => string;
}
interface Tool { name: string; title: string; description: string; inputSchema: Record<string, any>; run: (a: Record<string, any>) => any }
class ToolError extends Error {}

const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const P_PAGE = { type: "integer", minimum: 1, maximum: PAG_MAX, default: 1, description: `Pagina, de la 1 la ${PAG_MAX}. Pentru mai mult, restrânge filtrele.` };

export function makeMcp(ctx: McpCtx) {
  const { db, M, origin } = ctx;
  const q = (sql: string) => db.query(sql);
  const abs = (path: string) => origin + path;
  const uA = (cui: string) => abs("/autoritate/" + encodeURIComponent(cui));
  const uF = (cui: string) => abs("/firma/" + encodeURIComponent(cui));
  const r0 = (x: any) => (x == null ? null : Math.round(x));
  const pct = (part: number, tot: number) => (tot ? Math.round((1000 * part) / tot) / 10 : 0);

  const str = (a: Record<string, any>, k: string, req = false, max = 120): string => {
    const v = a[k];
    if (v == null || v === "") { if (req) throw new ToolError(`Lipsește parametrul „${k}”.`); return ""; }
    if (typeof v !== "string" && typeof v !== "number") throw new ToolError(`Parametrul „${k}” trebuie să fie text.`);
    const s = String(v).trim();
    if (s.length > max) throw new ToolError(`Parametrul „${k}” depășește ${max} caractere.`);
    return s;
  };
  const int = (a: Record<string, any>, k: string, def: number, min: number, max: number): number => {
    if (a[k] == null || a[k] === "") return def;
    const n = Number(a[k]);
    if (!Number.isInteger(n) || n < min || n > max) throw new ToolError(`Parametrul „${k}” trebuie să fie un număr întreg între ${min} și ${max}.`);
    return n;
  };
  const judet = (s: string): string => {
    const j = (M.judete as string[]).find((x) => x === s || ctx.slugJ(x) === ctx.slugJ(s));
    if (!j) throw new ToolError(`Județ necunoscut: „${s}”. Valori acceptate: ${(M.judete as string[]).join(", ")}.`);
    return j;
  };
  const paginat = (total: number, pagina: number, pe: number) => ({ total, pagina, pe_pagina: pe, pagini: Math.min(PAG_MAX, Math.max(1, Math.ceil(total / pe))), ...(total > PAG_MAX * pe ? { trunchiat: `Se pot citi doar primele ${PAG_MAX * pe} rânduri. Restrânge filtrele pentru rest.` } : {}) });
  // Textele lungi din detaliile semnalelor (extrase din anunț) se scurtează ca să nu umple contextul modelului.
  const scurt = (o: any): any => (typeof o === "string" ? (o.length > 300 ? o.slice(0, 300) + "…" : o) : Array.isArray(o) ? o.slice(0, 25).map(scurt) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, scurt(v)])) : o);

  const tools: Tool[] = [
    {
      name: "describe_data", title: "Descrie datele",
      description: "Punctul de pornire. Întoarce sursele, perioada acoperită, totalurile, tipurile de semnale cu înțelesul lor, lista județelor, șabloanele de URL și limitele datelor. Apelează-l o dată, înaintea celorlalte unelte.",
      inputSchema: obj({}),
      run: () => ({
        nume: "Banul public", descriere: "Contracte de achiziție publică din România, prețuri pe bucată comparate pe produs și semnale de risc calculate din surse publice.",
        surse: [
          { nume: "SEAP (e-licitatie.ro)", ce: "anunțuri de atribuire; loturi și cantități pentru o parte dintre ele", pana_la: M.anunturi_pana, anunturi: M.anunturi, anunturi_cu_detalii: M.detalii },
          { nume: "data.gov.ro", ce: "contracte cu câștigător și CUI", de_la: M.din, pana_la: M.contracte_pana },
          ...(M.da ? [{ nume: "data.gov.ro", ce: "achiziții directe (cumpărări fără procedură, sub prag), ca totaluri pe autoritate și furnizor", de_la: M.din, pana_la: M.da_pana, achizitii_directe: M.da, valoare_lei: r0(M.da_valoare) }] : []),
          { nume: "ANAF", ce: "data înființării, starea fiscală și sediul firmelor și autorităților" },
        ],
        actualizat: M.generat,
        totaluri: { contracte: M.contracte, valoare_lei: r0(M.valoare), autoritati: M.autoritati, firme: M.firme, semnale: M.semnale },
        tipuri_semnale: Object.entries(M.tipuri as Record<string, any>).map(([tip, v]) => ({ tip, nume: v.nume, sens: v.sens, numar: v.n })),
        niveluri_semnal: "1, 2 sau 3; 3 este cel mai puternic.",
        judete: M.judete,
        url: { autoritate: abs("/autoritate/{cui}"), firma: abs("/firma/{cui}"), produs: abs("/produs/{id}"), judet: abs("/judet/{slug}"), semnale: abs("/semnale?tip={tip}&judet={judet}"), metoda: abs("/metoda") },
        limite: [
          "Prețul pe bucată este valoarea contractului împărțită la cantitatea din anunț și există doar pentru anunțurile cu detalii citite din SEAP.",
          "Valorile acordurilor-cadru sunt plafoane, nu plăți. Contractele de peste 500 de milioane de lei pe parte nu intră în totaluri.",
          M.da ? "Achizițiile directe apar doar ca totaluri și ca primii 12 parteneri; cele făcute în afara catalogului SEAP lipsesc. Pragurile lor: 270.120 lei produse și servicii, 900.400 lei lucrări." : "Achizițiile directe nu sunt incluse.",
          "Numărul de oferte, asociații și administratorii firmelor nu sunt în datele deschise.",
          "Județul este cel al sediului autorității, deci instituțiile centrale apar la București.",
        ],
        nota: NOTA,
      }),
    },
    {
      name: "search", title: "Caută autorități, firme și produse",
      description: "Căutare după nume, CUI sau produs, fără diacritice obligatorii, cu potrivire pe prefix. Întoarce cheia (CUI sau id de produs) de folosit în celelalte unelte.",
      inputSchema: obj({ q: { type: "string", description: "Nume, CUI sau produs. Exemple: numele unei primării, CUI-ul unei firme, „microbuz”." }, kind: { type: "string", enum: ["autoritate", "firma", "produs"], description: "Opțional: doar un fel de rezultat." }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } }, ["q"]),
      run: (a) => {
        const s = str(a, "q", true), kind = str(a, "kind"), lim = int(a, "limit", 10, 1, 50);
        if (kind && !["autoritate", "firma", "produs"].includes(kind)) throw new ToolError("„kind” poate fi autoritate, firma sau produs.");
        const fel = (f: string) => (f === "firmă" ? "firma" : f);
        const rez = ctx.cauta(s, 60).filter((r) => !kind || fel(r.fel) === kind).slice(0, lim);
        return { rezultate: rez.map((r) => ({ fel: fel(r.fel), nume: r.nume, cheie: r.cheie, judet: fel(r.fel) === "produs" ? undefined : r.info || null, valoare_lei: fel(r.fel) === "produs" ? undefined : r0(+r.valoare), url: abs(r.url) })) };
      },
    },
    {
      name: "get_authority", title: "Fișa unei autorități contractante",
      description: "Totaluri, contracte pe ani și pe tipuri de procedură, primii furnizori și achizițiile directe ale unei autorități, după CUI. Pentru lista contractelor folosește list_contracts, pentru semnale list_signals.",
      inputSchema: obj({ cui: { type: "string", description: "CUI-ul autorității, din search." } }, ["cui"]),
      run: (a) => {
        const cui = str(a, "cui", true, 40);
        const x = q("SELECT * FROM autoritati WHERE cui=?").get(cui) as any;
        if (!x) throw new ToolError(`Nicio autoritate cu CUI ${cui} nu are contracte sau achiziții directe din ${M.din.slice(0, 4)} încoace. Caută cu „search”.`);
        const top = q("SELECT c.cf k, f.nume, count(*) n, sum(c.v) v, f.semnale, f.data_inregistrare di, f.judet FROM contracte c LEFT JOIN firme f ON f.cui=c.cf WHERE c.ca=? GROUP BY c.cf ORDER BY v DESC LIMIT 15").all(cui) as any[];
        return {
          cui: x.cui, nume: x.nume, judet: x.judet, localitate: x.localitate, contracte: x.n, valoare_lei: r0(x.valoare), furnizori: x.furnizori, primul_contract: x.d1, ultimul_contract: x.d2,
          anunturi_anulate: (q("SELECT n FROM anulari WHERE ca=?").get(cui) as any)?.n ?? 0, semnale: x.semnale,
          pe_ani: (q("SELECT substr(data,1,4) y, sum(v) v, count(*) n FROM contracte WHERE ca=? GROUP BY 1 ORDER BY 1").all(cui) as any[]).map((r) => ({ an: +r.y, contracte: r.n, valoare_lei: r0(r.v) })),
          pe_proceduri: (q("SELECT tp, count(*) n, sum(v) v FROM contracte WHERE ca=? GROUP BY 1 ORDER BY v DESC").all(cui) as any[]).map((r) => ({ procedura: r.tp, contracte: r.n, valoare_lei: r0(r.v) })),
          top_furnizori: top.map((t) => ({ cui: t.k, nume: t.nume, judet: t.judet, infiintata: t.di, contracte: t.n, valoare_lei: r0(t.v), pondere_pct: pct(t.v, x.valoare), semnale: t.semnale ?? 0, url: uF(t.k) })),
          achizitii_directe: !M.da ? undefined : {
            numar: x.da_n, valoare_lei: r0(x.da_valoare),
            pe_ani: (q("SELECT y, n, v FROM da_ani WHERE ca=? ORDER BY y").all(cui) as any[]).map((r) => ({ an: +r.y, numar: r.n, valoare_lei: r0(r.v) })),
            top_furnizori: (q("SELECT t.cf k, coalesce(f.nume, t.nume) nume, f.cui are, t.n, t.v FROM da_top t LEFT JOIN firme f ON f.cui=t.cf WHERE t.ca=? ORDER BY t.v DESC").all(cui) as any[]).map((t) => ({ cui: t.k, nume: t.nume, numar: t.n, valoare_lei: r0(t.v), pondere_pct: pct(t.v, x.da_valoare), url: t.are ? uF(t.k) : null })),
          },
          url: uA(x.cui), nota: NOTA,
        };
      },
    },
    {
      name: "get_company", title: "Fișa unei firme",
      description: "Identificare din ANAF, totaluri, contracte pe ani, primele autorități cliente și partenerii de asociere ai unei firme câștigătoare, după CUI.",
      inputSchema: obj({ cui: { type: "string", description: "CUI-ul firmei, din search." } }, ["cui"]),
      run: (a) => {
        const cui = str(a, "cui", true, 40);
        const x = q("SELECT * FROM firme WHERE cui=?").get(cui) as any;
        if (!x) throw new ToolError(`Nicio firmă cu CUI ${cui} nu are contracte publice din ${M.din.slice(0, 4)} încoace. Caută cu „search”.`);
        const top = q("SELECT c.ca k, a.nume, a.judet, count(*) n, sum(c.v) v FROM contracte c LEFT JOIN autoritati a ON a.cui=c.ca WHERE c.cf=? GROUP BY c.ca ORDER BY v DESC LIMIT 15").all(cui) as any[];
        const part = q("SELECT b.cf k, f.nume, count(*) n FROM contracte a JOIN contracte b ON b.anunt=a.anunt AND b.ca=a.ca AND b.nr IS a.nr AND b.data=a.data AND b.cf!=a.cf LEFT JOIN firme f ON f.cui=b.cf WHERE a.cf=? AND a.na>1 GROUP BY b.cf ORDER BY n DESC LIMIT 12").all(cui) as any[];
        return {
          cui: x.cui, nume: x.nume, judet: x.judet, localitate: x.localitate, infiintata: x.data_inregistrare, stare: x.stare, inactiva_fiscal: !!x.inactiv, caen: x.caen, platitor_tva: !!x.tva,
          contracte: x.n, valoare_lei: r0(x.valoare), autoritati_cliente: x.autoritati, contracte_in_asociere: x.n_asoc, primul_contract: x.d1, ultimul_contract: x.d2, semnale: x.semnale,
          pe_ani: (q("SELECT substr(data,1,4) y, sum(v) v, count(*) n FROM contracte WHERE cf=? GROUP BY 1 ORDER BY 1").all(cui) as any[]).map((r) => ({ an: +r.y, contracte: r.n, valoare_lei: r0(r.v) })),
          top_autoritati: top.map((t) => ({ cui: t.k, nume: t.nume, judet: t.judet, contracte: t.n, valoare_lei: r0(t.v), pondere_pct: pct(t.v, x.valoare), url: uA(t.k) })),
          parteneri_asociere: part.map((p) => ({ cui: p.k, nume: p.nume, contracte_impreuna: p.n, url: uF(p.k) })),
          achizitii_directe: !M.da ? undefined : {
            numar: x.da_n, valoare_lei: r0(x.da_valoare), autoritati: x.da_autoritati,
            top_autoritati: (q("SELECT t.ca k, a.nume, a.judet, t.n, t.v FROM da_topf t LEFT JOIN autoritati a ON a.cui=t.ca WHERE t.cf=? ORDER BY t.v DESC").all(cui) as any[]).map((t) => ({ cui: t.k, nume: t.nume, judet: t.judet, numar: t.n, valoare_lei: r0(t.v), pondere_pct: pct(t.v, x.da_valoare), url: uA(t.k) })),
          },
          url: uF(x.cui), nota: "Valoarea este partea firmei din fiecare contract. " + NOTA,
        };
      },
    },
    {
      name: "list_contracts", title: "Listează contracte",
      description: `Contractele unei autorități, ale unei firme sau dintre cele două, de la cel mai recent, câte ${PAGE} pe pagină. Cere cel puțin un CUI. Fiecare rând are linkul anunțului din SEAP când există.`,
      inputSchema: obj({ authority_cui: { type: "string", description: "CUI-ul autorității." }, company_cui: { type: "string", description: "CUI-ul firmei." }, year: { type: "integer", minimum: 2023, maximum: 2100, description: "Opțional: doar contractele dintr-un an." }, page: P_PAGE }),
      run: (a) => {
        const ca = str(a, "authority_cui", false, 40), cf = str(a, "company_cui", false, 40), an = int(a, "year", 0, 2023, 2100), pg = int(a, "page", 1, 1, PAG_MAX);
        if (!ca && !cf) throw new ToolError("Dă cel puțin „authority_cui” sau „company_cui”.");
        const wh: string[] = [], pr: any[] = [];
        if (ca) { wh.push("c.ca=?"); pr.push(ca); }
        if (cf) { wh.push("c.cf=?"); pr.push(cf); }
        if (an) { wh.push("c.data>=? AND c.data<?"); pr.push(`${an}-01-01`, `${an + 1}-01-01`); }
        const total = (q(`SELECT count(*) n FROM contracte c WHERE ${wh.join(" AND ")}`).get(...pr) as any).n;
        const rows = q(`SELECT c.data, c.ca, a.nume an, c.cf, f.nume fn, c.na, c.cpv, c.cpv_nume, c.tp, c.tc, c.valoare, c.vp, c.anunt, c.nr, i.nid FROM contracte c LEFT JOIN autoritati a ON a.cui=c.ca LEFT JOIN firme f ON f.cui=c.cf LEFT JOIN anunt_id i ON i.anunt=c.anunt WHERE ${wh.join(" AND ")} ORDER BY c.data DESC LIMIT ? OFFSET ?`).all(...pr, PAGE, (pg - 1) * PAGE) as any[];
        return {
          ...paginat(total, pg, PAGE),
          contracte: rows.map((r) => ({ data: r.data, autoritate: { cui: r.ca, nume: r.an, url: uA(r.ca) }, firma: { cui: r.cf, nume: r.fn, url: uF(r.cf) }, obiect: r.cpv_nume, cpv: r.cpv, procedura: r.tp, tip_contract: r.tc, valoare_contract_lei: r0(r.valoare), partea_firmei_lei: r0(r.vp), firme_in_asociere: r.na, nr_contract: r.nr, anunt: r.anunt, url_seap: r.nid ? ctx.seap(r.nid) : null })),
        };
      },
    },
    {
      name: "list_signals", title: "Listează semnale de verificat",
      description: `Semnale de risc calculate automat, de la cel mai puternic, câte ${PAGE_SEMNALE} pe pagină. Se pot filtra după tip (S1–S13, vezi describe_data), județ, nivel minim, CUI de autoritate sau firmă și text. Un semnal arată unde merită cerute documente; nu îl prezenta ca dovadă sau acuzație.`,
      inputSchema: obj({ type: { type: "string", description: "Tipul semnalului, de exemplu S2." }, county: { type: "string", description: "Județul, de exemplu Gorj." }, min_level: { type: "integer", minimum: 1, maximum: 3, default: 1 }, cui: { type: "string", description: "CUI de autoritate sau firmă implicată." }, q: { type: "string", description: "Text căutat în titlu și detalii." }, page: P_PAGE }),
      run: (a) => {
        const tip = str(a, "type", false, 4).toUpperCase(), jud = str(a, "county"), niv = int(a, "min_level", 1, 1, 3), cui = str(a, "cui", false, 40), s = str(a, "q"), pg = int(a, "page", 1, 1, PAG_MAX);
        if (tip && !M.tipuri[tip]) throw new ToolError(`Tip necunoscut: „${tip}”. Valori acceptate: ${Object.keys(M.tipuri).join(", ")}.`);
        const wh: string[] = ["s.scor>=?"], pr: any[] = [niv];
        if (tip) { wh.push("s.tip=?"); pr.push(tip); }
        if (jud) { const j = judet(jud); wh.push("s.id IN (SELECT e.sid FROM sem_ent e JOIN autoritati a ON a.cui=e.cui AND e.fel='a' WHERE a.judet=? UNION SELECT e.sid FROM sem_ent e JOIN firme f ON f.cui=e.cui AND e.fel='f' WHERE f.judet=?)"); pr.push(j, j); }
        if (cui) { wh.push("s.id IN (SELECT sid FROM sem_ent WHERE cui=?)"); pr.push(cui); }
        if (s) { wh.push("(s.entitate LIKE ? OR s.titlu LIKE ? OR s.detalii LIKE ?)"); pr.push(`%${s}%`, `%${s}%`, `%${s}%`); }
        const total = (q(`SELECT count(*) n FROM semnale s WHERE ${wh.join(" AND ")}`).get(...pr) as any).n;
        const rows = q(`SELECT s.* FROM semnale s WHERE ${wh.join(" AND ")} ORDER BY s.scor DESC, s.valoare DESC LIMIT ? OFFSET ?`).all(...pr, PAGE_SEMNALE, (pg - 1) * PAGE_SEMNALE) as any[];
        const ents = rows.length ? (q(`SELECT e.sid, e.fel, e.cui, coalesce(a.nume, f.nume) nume FROM sem_ent e LEFT JOIN autoritati a ON e.fel='a' AND a.cui=e.cui LEFT JOIN firme f ON e.fel='f' AND f.cui=e.cui WHERE e.sid IN (${rows.map((r) => +r.id).join(",")})`).all() as any[]) : [];
        return {
          ...paginat(total, pg, PAGE_SEMNALE),
          semnale: rows.map((r) => ({
            id: r.id, tip: r.tip, nume_tip: M.tipuri[r.tip]?.nume, nivel: r.scor, titlu: ctx.roNum(r.titlu), valoare_lei: r0(r.valoare), entitate: r.entitate,
            entitati: ents.filter((e) => e.sid === r.id).slice(0, 10).map((e) => ({ fel: e.fel === "a" ? "autoritate" : "firma", cui: e.cui, nume: e.nume, url: e.fel === "a" ? uA(e.cui) : uF(e.cui) })),
            detalii: scurt(JSON.parse(r.detalii)),
          })),
          url: abs("/semnale" + (tip ? "?tip=" + tip : "")), nota: NOTA,
        };
      },
    },
    {
      name: "list_products", title: "Listează produsele comparate",
      description: "Produsele pentru care există preț pe bucată în mai multe contracte, cu mediana, minimul și maximul. „comparabil” spune dacă produsul e destul de omogen ca diferența de preț să însemne ceva de una singură.",
      inputSchema: obj({}),
      run: () => ({
        produse: (q("SELECT * FROM clustere ORDER BY omogen DESC, n DESC").all() as any[]).map((c) => ({ id: c.id, nume: c.nume, contracte: c.n, mediana_lei: r0(c.mediana), cel_mai_ieftin_lei: r0(c.pmin), cel_mai_scump_lei: r0(c.pmax), raport_max_min: Math.round((10 * c.pmax) / c.pmin) / 10, comparabil: !!c.omogen, url: abs("/produs/" + c.id) })),
        nota: "Lei pe bucată, fără TVA. Acoperirea e parțială: doar anunțurile cu detalii citite din SEAP.",
      }),
    },
    {
      name: "get_product_prices", title: "Prețuri pe bucată pentru un produs",
      description: `Fiecare contract al unui produs, cu prețul pe bucată și abaterea față de mediană, de la cel mai scump, câte ${PAGE} pe pagină. Ia id-ul din list_products sau search.`,
      inputSchema: obj({ id: { type: "string", description: "Id-ul produsului, de exemplu microbuz_electric." }, include_framework: { type: "boolean", default: false, description: "Include și acordurile-cadru, ale căror valori sunt plafoane." }, page: P_PAGE }, ["id"]),
      run: (a) => {
        const id = str(a, "id", true, 60), ac = a.include_framework === true, pg = int(a, "page", 1, 1, PAG_MAX);
        const c = q("SELECT * FROM clustere WHERE id=?").get(id) as any;
        if (!c) throw new ToolError(`Produs necunoscut: „${id}”. Vezi list_products.`);
        const f = ac ? "" : "AND ac=0";
        const ps = (q(`SELECT p FROM linii_pret WHERE cluster=? ${f} ORDER BY p`).all(id) as any[]).map((r) => r.p as number);
        const m = ps.length ? (ps.length % 2 ? ps[ps.length >> 1] : (ps[(ps.length >> 1) - 1] + ps[ps.length >> 1]) / 2) : 0;
        const rows = q(`SELECT * FROM linii_pret WHERE cluster=? ${f} ORDER BY p DESC LIMIT ? OFFSET ?`).all(id, PAGE, (pg - 1) * PAGE) as any[];
        return {
          produs: { id: c.id, nume: c.nume, comparabil: !!c.omogen, mediana_lei: r0(m), cel_mai_ieftin_lei: r0(ps[0]), cel_mai_scump_lei: r0(ps[ps.length - 1]), url: abs("/produs/" + c.id) },
          ...paginat(ps.length, pg, PAGE),
          contracte: rows.map((r) => ({ data: r.data, autoritate: { cui: r.ca, nume: r.autoritate, url: uA(r.ca) }, furnizori: r.castigatori, cui_furnizori: String(r.cf || "").split(",").filter(Boolean), bucati: r.q, pret_pe_bucata_lei: r0(r.p), fata_de_mediana_pct: m ? Math.round((r.p / m - 1) * 100) : null, valoare_contract_lei: r0(r.valoare), acord_cadru: !!r.ac, cantitate_dedusa: r.inc < 0.8, varianta: r.varianta || null, include: r.include || null, marca: r.marca || null, anunt: r.anunt, url_seap: r.nid ? ctx.seap(r.nid) : null })),
          variante: (() => { try { return (q("SELECT varianta, n, mediana, pmin, pmax FROM variante WHERE cluster=? ORDER BY n DESC").all(id) as any[]).map((v) => ({ varianta: v.varianta, contracte: v.n, mediana_lei: r0(v.mediana), cel_mai_ieftin_lei: r0(v.pmin), cel_mai_scump_lei: r0(v.pmax), comparabila: v.n >= 4 && !/nespecificat/.test(v.varianta) })); } catch { return []; } })(),
          nota_variante: "Compară prețurile doar în interiorul aceleiași variante (de exemplu autobuze de 18 m între ele) și ține cont de câmpul „include”: stațiile de încărcare, sistemele ITS sau service-ul urcă prețul pe bucată. „fata_de_mediana_pct” este față de mediana întregii categorii.",
          nota: c.omogen ? "Prețul pe bucată este valoarea contractului împărțită la cantitatea din anunț. Contractele pot include accesorii, garanții sau dotări diferite." : "Categorie eterogenă: modelele și dotările diferă mult, deci o diferență de preț nu e, singură, un semnal.",
        };
      },
    },
    {
      name: "get_county", title: "Fișa unui județ",
      description: "Totalurile unui județ, autoritățile cu cele mai mari valori contractate și firmele care câștigă cel mai mult de la ele. Județul este cel al sediului autorității.",
      inputSchema: obj({ county: { type: "string", description: "Numele județului, de exemplu Gorj sau București." } }, ["county"]),
      run: (a) => {
        const j = judet(str(a, "county", true));
        const r = q("SELECT * FROM judete WHERE judet=?").get(j) as any;
        if (!r) throw new ToolError(`Nu există contracte pentru județul ${j}.`);
        return {
          judet: j, autoritati: r.autoritati, contracte: r.contracte, valoare_lei: r0(r.valoare), semnale: r.semnale,
          top_autoritati: (q("SELECT * FROM autoritati WHERE judet=? ORDER BY valoare DESC LIMIT 15").all(j) as any[]).map((x) => ({ cui: x.cui, nume: x.nume, contracte: x.n, valoare_lei: r0(x.valoare), semnale: x.semnale, url: uA(x.cui) })),
          top_firme: (q("SELECT f.cui, f.nume, f.judet, sum(c.v) v, count(*) n FROM contracte c JOIN autoritati a ON a.cui=c.ca JOIN firme f ON f.cui=c.cf WHERE a.judet=? GROUP BY f.cui ORDER BY v DESC LIMIT 10").all(j) as any[]).map((x) => ({ cui: x.cui, nume: x.nume, judet_sediu: x.judet, contracte: x.n, valoare_lei: r0(x.v), url: uF(x.cui) })),
          url: abs("/judet/" + ctx.slugJ(j)), nota: NOTA,
        };
      },
    },
  ];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const lista = tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
  const INSTR = `Date despre achizițiile publice din România (${M.din.slice(0, 4)} încoace): contracte, autorități, firme, prețuri pe bucată și semnale de risc. Începe cu describe_data. Găsește CUI-ul cu search, apoi folosește fișele și listele. Citează adresele „url” și „url_seap” din răspunsuri. ${NOTA}`;

  // Limita pe IP vine din web/limita.ts (pe minut și pe oră), cu un contor separat de cel al paginilor.
  const limita = ctx.limita;

  const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization", "access-control-max-age": "86400" };
  const json = (body: any, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
  const err = (id: any, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  function one(m: any): any | null {
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m?.id, -32600, "Cerere JSON-RPC invalidă.");
    const notif = m.id === undefined || m.id === null, ok = (result: any) => ({ jsonrpc: "2.0", id: m.id, result });
    if (notif) return null; // notifications/initialized, notifications/cancelled etc.: fără răspuns
    switch (m.method) {
      case "initialize": {
        const v = m.params?.protocolVersion;
        return ok({ protocolVersion: PROTOCOLS.includes(v) ? v : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "banul-public", title: "Banul public", version: MCP_VERSION }, instructions: INSTR });
      }
      case "ping": return ok({});
      case "tools/list": return ok({ tools: lista });
      case "tools/call": {
        const t = byName.get(m.params?.name);
        if (!t) return err(m.id, -32602, `Unealtă necunoscută: ${m.params?.name}`);
        const args = m.params?.arguments ?? {};
        try {
          if (typeof args !== "object" || Array.isArray(args)) throw new ToolError("„arguments” trebuie să fie un obiect.");
          const extra = Object.keys(args).filter((k) => !(k in t.inputSchema.properties));
          if (extra.length) throw new ToolError(`Parametri necunoscuți: ${extra.join(", ")}. Acceptați: ${Object.keys(t.inputSchema.properties).join(", ") || "niciunul"}.`);
          return ok({ content: [{ type: "text", text: JSON.stringify(t.run(args)) }] });
        } catch (e) {
          if (!(e instanceof ToolError)) console.error("mcp", t.name, e);
          return ok({ content: [{ type: "text", text: e instanceof ToolError ? e.message : "Eroare internă la rularea uneltei." }], isError: true });
        }
      }
      default: return err(m.id, -32601, `Metodă necunoscută: ${m.method}`);
    }
  }

  return async function handle(req: Request, ip: string): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json(err(null, -32000, "Folosește POST. Serverul nu ține sesiuni și nu deschide fluxuri SSE."), 405, { allow: "POST, OPTIONS" });
    const wait = limita(ip);
    if (wait) return json(err(null, -32000, `Prea multe cereri. Reîncearcă peste ${wait} s.`), 429, { "retry-after": String(wait) });
    if (+(req.headers.get("content-length") || 0) > MAX_BODY) return json(err(null, -32600, "Cerere prea mare."), 413);
    let body: any;
    try { const txt = await req.text(); if (txt.length > MAX_BODY) return json(err(null, -32600, "Cerere prea mare."), 413); body = JSON.parse(txt); } catch { return json(err(null, -32700, "JSON invalid."), 400); }
    if (Array.isArray(body)) {
      if (!body.length || body.length > 20) return json(err(null, -32600, "Lot gol sau mai mare de 20 de mesaje."), 400);
      const out = body.map(one).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    const out = one(body);
    return out ? json(out) : new Response(null, { status: 202, headers: CORS });
  };
}

export const MCP_TOOLS_DOC: [string, string][] = [
  ["describe_data", "sursele, perioada, totalurile, tipurile de semnale, limitele"],
  ["search", "autorități, firme și produse după nume sau CUI"],
  ["get_authority", "fișa unei autorități: totaluri, ani, proceduri, primii furnizori"],
  ["get_company", "fișa unei firme: ANAF, totaluri, clienți, parteneri de asociere"],
  ["list_contracts", "contractele unei autorități, ale unei firme sau dintre ele"],
  ["list_signals", "semnalele de verificat, filtrate după tip, județ, nivel sau CUI"],
  ["list_products", "produsele cu preț pe bucată comparat"],
  ["get_product_prices", "fiecare contract al unui produs, cu abaterea față de mediană"],
  ["get_county", "totalurile unui județ, primele autorități și firme"],
];
