// Limită de cereri pe adresă IP, în memorie (un singur proces). Două ferestre fixe: pe minut și pe oră.
// Un om care citește nu le atinge; un program care parcurge site-ul pagină cu pagină primește 429 cu Retry-After.
export function makeLimiter(perMin: number, perHour: number) {
  const m = new Map<string, { a: number; n: number; b: number; k: number }>(); // a, n: fereastra de un minut; b, k: fereastra de o oră
  setInterval(() => { const t = Date.now(); for (const [ip, v] of m) if (t - v.b > 3_600_000) m.delete(ip); }, 600_000);
  /** Întoarce 0 dacă cererea e permisă, altfel câte secunde are de așteptat clientul. `cost` face cererile scumpe să conteze mai mult. */
  return (ip: string, cost = 1): number => {
    const t = Date.now(); let v = m.get(ip);
    if (!v) m.set(ip, (v = { a: t, n: 0, b: t, k: 0 }));
    if (t - v.a >= 60_000) { v.a = t; v.n = 0; }
    if (t - v.b >= 3_600_000) { v.b = t; v.k = 0; }
    if (v.n + cost > perMin) return Math.max(1, Math.ceil((v.a + 60_000 - t) / 1000));
    if (v.k + cost > perHour) return Math.max(1, Math.ceil((v.b + 3_600_000 - t) / 1000));
    v.n += cost; v.k += cost; return 0;
  };
}
