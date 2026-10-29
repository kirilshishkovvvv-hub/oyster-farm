import type { Satka } from './satka';
import { displayCode } from './satka';

/** Normalises what a user types: "sat 12", "12", "SAT-00012" → comparable parts. */
function normalise(q: string): { text: string; digits: string } {
  const text = q.toUpperCase().replace(/[^A-ZА-Я0-9]/g, '');
  const digits = text.replace(/\D/g, '').replace(/^0+/, '');
  return { text, digits };
}

/**
 * Finds satki by (partial) code. An exact number match comes first
 * ("12" → SAT-00012), then codes containing the digits, then other text
 * matches. Archived satki are included but sorted after active ones.
 */
export function searchSatki(satki: Iterable<Satka>, query: string, limit = 30): Satka[] {
  const q = normalise(query);
  if (!q.text) return [];
  const scored: { s: Satka; score: number }[] = [];
  for (const s of satki) {
    const c = normalise(displayCode(s));
    let score = 0;
    if (q.digits && c.digits === q.digits) score = 100;
    else if (c.text === q.text) score = 100;
    else if (q.digits && c.digits.includes(q.digits)) score = 50 - (c.digits.length - q.digits.length);
    else if (c.text.includes(q.text)) score = 10;
    if (score > 0) scored.push({ s, score: score - (s.archivedAt ? 1000 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || displayCode(a.s).localeCompare(displayCode(b.s)));
  return scored.slice(0, limit).map((x) => x.s);
}
