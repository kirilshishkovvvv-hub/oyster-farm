import { LINE_COUNT, SECTION_COUNT, SLOTS_PER_SECTION, SLOT_NAMES } from '../config/farm';

/**
 * A place for one satka: line 1–6 (west → east), section 1–25 (the gap
 * between buoy N and buoy N+1), slot 1–4 within the section (counted from
 * the lower-numbered buoy).
 */
export interface Position {
  line: number;
  section: number;
  slot: number;
}

export function isValidPosition(p: Partial<Position> | null | undefined): p is Position {
  return (
    !!p &&
    Number.isInteger(p.line) && p.line! >= 1 && p.line! <= LINE_COUNT &&
    Number.isInteger(p.section) && p.section! >= 1 && p.section! <= SECTION_COUNT &&
    Number.isInteger(p.slot) && p.slot! >= 1 && p.slot! <= SLOTS_PER_SECTION
  );
}

export function positionKey(p: Position): string {
  return `${p.line}-${p.section}-${p.slot}`;
}

export function samePosition(a: Position | null | undefined, b: Position | null | undefined): boolean {
  return !!a && !!b && a.line === b.line && a.section === b.section && a.slot === b.slot;
}

/** "Линия 3 · Секция 12 · Позиция 2" */
export function formatPosition(p: Position | null | undefined): string {
  if (!p) return '—';
  return `Линия ${p.line} · Секция ${p.section} · ${SLOT_NAMES[p.slot]}`;
}

/** Compact form for tight spaces: "Л3 · С12 · П2" */
export function formatPositionShort(p: Position | null | undefined): string {
  if (!p) return '—';
  return `Л${p.line} · С${p.section} · П${p.slot}`;
}

/** Section N lies between buoy N and buoy N+1. */
export function sectionBuoys(section: number): [number, number] {
  return [section, section + 1];
}

export function allPositions(): Position[] {
  const out: Position[] = [];
  for (let line = 1; line <= LINE_COUNT; line++)
    for (let section = 1; section <= SECTION_COUNT; section++)
      for (let slot = 1; slot <= SLOTS_PER_SECTION; slot++) out.push({ line, section, slot });
  return out;
}
