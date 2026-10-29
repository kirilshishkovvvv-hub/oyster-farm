import { describe, expect, it } from 'vitest';
import { DEFAULT_GAPS_M, POSITION_COUNT, SECTION_COUNT } from '../src/config/farm';
import { bearing, buoyLatLngs, buoyOffsets, distance, lineLength, slotLatLng, slotOffset } from '../src/domain/geometry';
import { DEFAULT_LINES } from '../src/config/gps';
import { allPositions, formatPosition, isValidPosition } from '../src/domain/position';
import { applyOp, DomainError, displayCode, type Op, type Satka } from '../src/domain/satka';
import { searchSatki } from '../src/domain/search';
import { normaliseCode, parseScannedText, satkaLink } from '../src/domain/qr';
import { daysBetween, formatDate, isISODate, todayISO } from '../src/domain/dates';

const TODAY = todayISO();

function satka(id: string, code: string | null, line: number, section: number, slot: number, extra: Partial<Satka> = {}): Satka {
  return {
    id, code, size: 'small', status: 'sorted', position: { line, section, slot }, lastProcessedOn: '2026-01-10',
    archivedAt: null, archiveReason: null, createdAt: '', updatedAt: '', ...extra,
  };
}
const mapOf = (...s: Satka[]) => new Map(s.map((x) => [x.id, x]));
const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('farm layout', () => {
  it('has 25 gaps: 4 m at both ends, 6 m elsewhere, 146 m total', () => {
    expect(DEFAULT_GAPS_M).toHaveLength(SECTION_COUNT);
    expect(DEFAULT_GAPS_M[0]).toBe(4);
    expect(DEFAULT_GAPS_M[24]).toBe(4);
    expect(DEFAULT_GAPS_M.slice(1, 24).every((g) => g === 6)).toBe(true);
    expect(lineLength(DEFAULT_GAPS_M)).toBe(146);
  });

  it('places 26 buoys', () => {
    const o = buoyOffsets(DEFAULT_GAPS_M);
    expect(o).toHaveLength(26);
    expect(o.slice(0, 3)).toEqual([0, 4, 10]);
    expect(o[25]).toBe(146);
  });

  it('has 600 unique positions', () => {
    const all = allPositions();
    expect(all).toHaveLength(POSITION_COUNT);
    expect(new Set(all.map((p) => `${p.line}-${p.section}-${p.slot}`)).size).toBe(600);
    expect(all.every(isValidPosition)).toBe(true);
  });

  it('hangs 2 satki near each buoy of a section, on both sides of the rope', () => {
    // Section 1 is 4 m long, from 0 to 4 m: upper satki at 1 m, lower at 3 m.
    expect(slotOffset(DEFAULT_GAPS_M, 1, 1)).toBeCloseTo(1);
    expect(slotOffset(DEFAULT_GAPS_M, 1, 2)).toBeCloseTo(3);
    // Section 2 is 6 m long, from 4 to 10 m: upper at 5.5 m.
    expect(slotOffset(DEFAULT_GAPS_M, 2, 3)).toBeCloseTo(5.5);
    const gps = { start: { lat: 43.33, lng: 28.07 }, end: { lat: 43.3287, lng: 28.07 } };
    const west = slotLatLng(gps, DEFAULT_GAPS_M, { line: 1, section: 1, slot: 1 });
    const east = slotLatLng(gps, DEFAULT_GAPS_M, { line: 1, section: 1, slot: 3 });
    expect(west.lng).toBeLessThan(gps.start.lng); // west of the rope
    expect(east.lng).toBeGreaterThan(gps.start.lng); // east of the rope
    expect(distance(west, east)).toBeCloseTo(2.6, 1);
  });

  it('computes real buoy coordinates along the line', () => {
    const start = { lat: 43.33, lng: 28.07 };
    const end = { lat: 43.3287, lng: 28.07 }; // ~145 m south
    const b = buoyLatLngs({ start, end }, DEFAULT_GAPS_M);
    expect(b).toHaveLength(26);
    expect(distance(b[0], b[1])).toBeCloseTo(4, 1);
    expect(distance(b[0], b[25])).toBeCloseTo(146, 0);
    expect(b[25].lat).toBeLessThan(start.lat);
  });

  it('validates and formats positions', () => {
    expect(isValidPosition({ line: 7, section: 1, slot: 1 })).toBe(false);
    expect(isValidPosition({ line: 1, section: 26, slot: 1 })).toBe(false);
    expect(isValidPosition({ line: 1, section: 1, slot: 5 })).toBe(false);
    expect(formatPosition({ line: 3, section: 12, slot: 2 })).toBe('Линия 3 · Секция 12 · Долна лява');
  });
});

describe('default line positions', () => {
  it('has six lines, each 146 m long, running north to south', () => {
    expect(DEFAULT_LINES).toHaveLength(6);
    for (const l of DEFAULT_LINES) {
      const start = { lat: l.startLat!, lng: l.startLng! };
      const end = { lat: l.endLat!, lng: l.endLng! };
      expect(distance(start, end)).toBeCloseTo(146, 0);
      expect(Math.abs(bearing(start, end) - 180)).toBeLessThan(0.5);
    }
  });

  it('keeps the two measured points exactly', () => {
    const l2 = DEFAULT_LINES[1];
    expect([l2.endLat, l2.endLng]).toEqual([43.325737, 28.075487]); // Л2 buoy 26
    const l5 = DEFAULT_LINES[4];
    expect([l5.startLat, l5.startLng]).toEqual([43.330025, 28.079225]); // Л5 buoy 1
  });
});

describe('applyOp', () => {
  const base = { opId: 'op', performedAt: '2026-10-01T10:00:00Z', note: '' };

  it('creates in a free slot and rejects an occupied one', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1);
    const op: Op = { ...base, kind: 'create', satkaId: 'b', size: 'spat', status: 'newly_sorted', position: { line: 1, section: 1, slot: 2 }, processedOn: TODAY };
    const [b] = applyOp(mapOf(a), op);
    expect(b.code).toBeNull();
    expect(displayCode(b)).toMatch(/^НОВА-/);
    expectCode(() => applyOp(mapOf(a), { ...op, position: { line: 1, section: 1, slot: 1 } }), 'POSITION_TAKEN');
  });

  it('lets a replacement use the slot of an archived satka', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1, { archivedAt: '2026-10-01', archiveReason: 'Изгубена' });
    const op: Op = { ...base, kind: 'create', satkaId: 'b', size: 'spat', status: 'sorted', position: { line: 1, section: 1, slot: 1 }, processedOn: TODAY };
    expect(applyOp(mapOf(a), op)).toHaveLength(1);
  });

  it('processes, but never rolls back to an older processing date', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1);
    const [p] = applyOp(mapOf(a), { ...base, kind: 'process', satkaId: 'a', status: 'on_land', size: 'large', processedOn: '2026-02-01' });
    expect(p).toMatchObject({ status: 'on_land', size: 'large', lastProcessedOn: '2026-02-01' });
    expect(applyOp(mapOf(p), { ...base, kind: 'process', satkaId: 'a', status: 'sorted', size: null, processedOn: '2026-01-20' })).toEqual([]);
  });

  it('rejects a future processing date', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1);
    expectCode(() => applyOp(mapOf(a), { ...base, kind: 'process', satkaId: 'a', status: 'sorted', size: null, processedOn: '2099-01-01' }), 'INVALID_DATE');
  });

  it('moves, swaps, and refuses occupied targets without swap', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1);
    const b = satka('b', 'SAT-00002', 2, 5, 3);
    const to = { line: 2, section: 5, slot: 3 };
    expectCode(() => applyOp(mapOf(a, b), { ...base, kind: 'move', satkaId: 'a', position: to, swap: false }), 'POSITION_TAKEN');
    const res = applyOp(mapOf(a, b), { ...base, kind: 'move', satkaId: 'a', position: to, swap: true });
    expect(res.find((s) => s.id === 'a')!.position).toEqual(to);
    expect(res.find((s) => s.id === 'b')!.position).toEqual({ line: 1, section: 1, slot: 1 });
    expectCode(() => applyOp(mapOf(a), { ...base, kind: 'move', satkaId: 'a', position: a.position!, swap: false }), 'SAME_POSITION');
  });

  it('archives with a reason and blocks later processing', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1);
    expectCode(() => applyOp(mapOf(a), { ...base, kind: 'archive', satkaId: 'a', reason: '  ' }), 'REASON_REQUIRED');
    const [x] = applyOp(mapOf(a), { ...base, kind: 'archive', satkaId: 'a', reason: 'Изгубена' });
    expect(x.archivedAt).not.toBeNull();
    expectCode(() => applyOp(mapOf(x), { ...base, kind: 'process', satkaId: 'a', status: 'sorted', size: null, processedOn: TODAY }), 'ARCHIVED');
  });

  it('corrects regardless of dates (admin)', () => {
    const a = satka('a', 'SAT-00001', 1, 1, 1, { lastProcessedOn: '2026-05-01' });
    const [x] = applyOp(mapOf(a), { kind: 'correct', opId: 'c', satkaId: 'a', size: 'xl', status: 'sorted', processedOn: '2026-04-01', reason: 'грешка' });
    expect(x).toMatchObject({ size: 'xl', lastProcessedOn: '2026-04-01' });
  });
});

describe('search', () => {
  const list = [satka('1', 'SAT-00012', 1, 1, 1), satka('2', 'SAT-00120', 1, 1, 2), satka('3', 'SAT-00001', 1, 1, 3),
    satka('4', 'SAT-00112', 1, 1, 4, { archivedAt: 'x', archiveReason: 'y' })];
  it('ranks the exact number first', () => {
    expect(searchSatki(list, '12').map((s) => s.code)).toEqual(['SAT-00012', 'SAT-00120', 'SAT-00112']);
    expect(searchSatki(list, 'sat-00001')[0].code).toBe('SAT-00001');
    expect(searchSatki(list, '')).toEqual([]);
  });
});

describe('qr', () => {
  it('reads links and bare codes', () => {
    expect(parseScannedText('https://x.github.io/oyster-farm/#/s/SAT-00012')).toBe('SAT-00012');
    expect(parseScannedText(' sat-00012 ')).toBe('SAT-00012');
    expect(parseScannedText('12')).toBe('SAT-00012');
    expect(parseScannedText('hello')).toBeNull();
    expect(normaliseCode('SAT 7')).toBe('SAT-00007');
  });
  it('builds links', () => {
    expect(satkaLink('https://x.github.io/app/#/map', 'SAT-00012')).toBe('https://x.github.io/app/#/s/SAT-00012');
  });
});

describe('dates', () => {
  it('formats and compares local dates', () => {
    expect(formatDate('2026-10-28')).toBe('28.10.2026');
    expect(isISODate('2026-02-30')).toBe(false);
    expect(daysBetween('2026-10-01', '2026-10-28')).toBe(27);
    expect(todayISO(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  });
});
