import type { Size, Status } from '../config/categories';
import { isValidPosition, samePosition, type Position } from './position';
import { isISODate, todayISO } from './dates';

export interface Satka {
  id: string; // uuid, generated on the device
  code: string | null; // "SAT-00012"; null until the server has issued it
  size: Size;
  status: Status;
  position: Position | null;
  lastProcessedOn: string; // YYYY-MM-DD
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventKind = 'created' | 'processed' | 'moved' | 'corrected' | 'archived';

export interface SatkaEvent {
  id: string;
  satkaId: string;
  kind: EventKind;
  before: Partial<SatkaSnapshot> | null;
  after: Partial<SatkaSnapshot> | null;
  note: string;
  performedAt: string;
  userName: string;
  pending?: boolean; // recorded locally, not yet confirmed by the server
}

export interface SatkaSnapshot {
  size: Size;
  status: Status;
  position: Position | null;
  lastProcessedOn: string;
  archiveReason: string | null;
}

/** A change made by a user; queued in the outbox and replayed on the server. */
export type Op =
  | { kind: 'create'; opId: string; satkaId: string; size: Size; status: Status; position: Position; processedOn: string; performedAt: string; note: string }
  | { kind: 'process'; opId: string; satkaId: string; status: Status; size: Size | null; processedOn: string; performedAt: string; note: string }
  | { kind: 'move'; opId: string; satkaId: string; position: Position; swap: boolean; performedAt: string; note: string }
  | { kind: 'archive'; opId: string; satkaId: string; reason: string; performedAt: string; note: string }
  | { kind: 'correct'; opId: string; satkaId: string; size: Size; status: Status; processedOn: string; reason: string };

/** Stable error codes; the same codes are raised by the database functions. */
export type ErrorCode =
  | 'NOT_AUTHORIZED' | 'NOT_ADMIN' | 'NOT_FOUND' | 'ARCHIVED' | 'POSITION_TAKEN'
  | 'SAME_POSITION' | 'INVALID_POSITION' | 'INVALID_DATE' | 'REASON_REQUIRED' | 'LAST_ADMIN';

export class DomainError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

export function displayCode(s: Pick<Satka, 'id' | 'code'>): string {
  return s.code ?? `НОВА-${s.id.slice(0, 4).toUpperCase()}`;
}

export function snapshot(s: Satka): SatkaSnapshot {
  return { size: s.size, status: s.status, position: s.position, lastProcessedOn: s.lastProcessedOn, archiveReason: s.archiveReason };
}

export function isActive(s: Satka): boolean {
  return s.archivedAt === null;
}

export function occupantAt(satki: Iterable<Satka>, pos: Position): Satka | undefined {
  for (const s of satki) if (isActive(s) && samePosition(s.position, pos)) return s;
  return undefined;
}

function checkDate(d: string) {
  if (!isISODate(d) || d < '2000-01-01' || d > todayISO(new Date(Date.now() + 86400000))) throw new DomainError('INVALID_DATE');
}

/**
 * Applies an op to local state, mirroring the database functions so the UI
 * updates instantly (also offline). Returns the satki that changed. The
 * server remains the authority: its answer replaces these local results.
 */
export function applyOp(satki: ReadonlyMap<string, Satka>, op: Op, nowISO: string = new Date().toISOString()): Satka[] {
  const touch = (s: Satka, patch: Partial<Satka>): Satka => ({ ...s, ...patch, updatedAt: nowISO });
  const get = (id: string) => {
    const s = satki.get(id);
    if (!s) throw new DomainError('NOT_FOUND');
    return s;
  };

  switch (op.kind) {
    case 'create': {
      const existing = satki.get(op.satkaId);
      if (existing) return [];
      if (!isValidPosition(op.position)) throw new DomainError('INVALID_POSITION');
      checkDate(op.processedOn);
      if (occupantAt(satki.values(), op.position)) throw new DomainError('POSITION_TAKEN');
      return [{
        id: op.satkaId, code: null, size: op.size, status: op.status, position: op.position,
        lastProcessedOn: op.processedOn, archivedAt: null, archiveReason: null, createdAt: nowISO, updatedAt: nowISO,
      }];
    }
    case 'process': {
      checkDate(op.processedOn);
      const s = get(op.satkaId);
      if (!isActive(s)) throw new DomainError('ARCHIVED');
      if (op.processedOn < s.lastProcessedOn) return []; // a newer processing already exists
      return [touch(s, { status: op.status, size: op.size ?? s.size, lastProcessedOn: op.processedOn })];
    }
    case 'move': {
      if (!isValidPosition(op.position)) throw new DomainError('INVALID_POSITION');
      const s = get(op.satkaId);
      if (!isActive(s)) throw new DomainError('ARCHIVED');
      if (samePosition(s.position, op.position)) throw new DomainError('SAME_POSITION');
      const other = occupantAt(satki.values(), op.position);
      if (other && !op.swap) throw new DomainError('POSITION_TAKEN');
      const moved = touch(s, { position: op.position });
      return other ? [moved, touch(other, { position: s.position })] : [moved];
    }
    case 'archive': {
      if (!op.reason.trim()) throw new DomainError('REASON_REQUIRED');
      const s = get(op.satkaId);
      if (!isActive(s)) return [];
      return [touch(s, { archivedAt: nowISO, archiveReason: op.reason.trim().slice(0, 200) })];
    }
    case 'correct': {
      if (!op.reason.trim()) throw new DomainError('REASON_REQUIRED');
      checkDate(op.processedOn);
      const s = get(op.satkaId);
      return [touch(s, { size: op.size, status: op.status, lastProcessedOn: op.processedOn })];
    }
  }
}

const OP_EVENT_KIND: Record<Op['kind'], EventKind> = {
  create: 'created', process: 'processed', move: 'moved', archive: 'archived', correct: 'corrected',
};

/** The history entry shown locally until the server's own event arrives. */
export function localEvent(op: Op, before: Satka | undefined, after: Satka | undefined, userName: string): SatkaEvent {
  return {
    id: op.opId,
    satkaId: op.satkaId,
    kind: OP_EVENT_KIND[op.kind],
    before: before ? snapshot(before) : null,
    after: after ? snapshot(after) : null,
    note: op.kind === 'correct' ? op.reason : op.note,
    performedAt: op.kind === 'correct' ? new Date().toISOString() : op.performedAt,
    userName,
    pending: true,
  };
}
