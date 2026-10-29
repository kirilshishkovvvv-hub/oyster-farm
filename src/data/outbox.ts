import { applyOp, localEvent, type ErrorCode, type Op, type Satka } from '../domain/satka';
import { satkaFromRow } from './mappers';
import { db as defaultDb, type FarmDb } from './localDb';
import type { OutboxEntry } from './types';

/** Sends one op to the server and returns the updated satka row. */
export interface Transport {
  send(op: Op): Promise<Record<string, unknown>>;
}

/** The server refused the op for a business reason (e.g. POSITION_TAKEN). */
export class RejectedError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

/** Temporary problem (no signal, server down, not signed in) — retry later. */
export class TransientError extends Error {}

/**
 * Rebuilds what the UI shows: last known server state with every pending
 * op re-applied on top, in order. Failed ops are left out, so their
 * optimistic effects disappear until the user fixes them.
 */
export async function recompute(database: FarmDb = defaultDb): Promise<void> {
  await database.transaction('rw', [database.remote, database.satki, database.outbox], async () => {
    const map = new Map<string, Satka>((await database.remote.toArray()).map((s) => [s.id, s]));
    const pending = await database.outbox.where('state').equals('pending').sortBy('seq');
    for (const e of pending) {
      try {
        for (const s of applyOp(map, e.op, e.createdAt)) map.set(s.id, s);
      } catch {
        // The server will reject it too; it surfaces as a failed op on flush.
      }
    }
    await database.satki.clear();
    await database.satki.bulkPut([...map.values()]);
  });
}

/**
 * Records a user change: validates and applies it locally right away, adds
 * a history entry, and queues it for the server. Throws DomainError if the
 * change is not allowed (nothing is saved in that case).
 */
export async function enqueue(op: Op, userName: string, database: FarmDb = defaultDb): Promise<void> {
  await database.transaction('rw', [database.satki, database.events, database.outbox], async () => {
    const map = new Map<string, Satka>((await database.satki.toArray()).map((s) => [s.id, s]));
    const before = map.get(op.satkaId);
    const createdAt = new Date().toISOString();
    const changed = applyOp(map, op, createdAt);
    await database.satki.bulkPut(changed);
    const after = changed.find((s) => s.id === op.satkaId) ?? before;
    await database.events.put(localEvent(op, before, after, userName));
    await database.outbox.add({ opId: op.opId, op, state: 'pending', error: null, attempts: 0, createdAt });
  });
}

export interface FlushResult {
  sent: number;
  failed: number;
  transientError: string | null;
}

let inFlight: Promise<FlushResult> | null = null;

/** Sends pending ops in order. Only one flush runs at a time. */
export function flush(transport: Transport, database: FarmDb = defaultDb): Promise<FlushResult> {
  inFlight ??= doFlush(transport, database).finally(() => (inFlight = null));
  return inFlight;
}

async function doFlush(transport: Transport, database: FarmDb): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, transientError: null };
  for (;;) {
    const entry = await database.outbox.where('state').equals('pending').first();
    if (!entry) break;
    try {
      const row = await transport.send(entry.op);
      await database.transaction('rw', [database.remote, database.outbox, database.events], async () => {
        await database.remote.put(satkaFromRow(row));
        await database.outbox.delete(entry.seq!);
        const ev = await database.events.get(entry.opId);
        if (ev) await database.events.put({ ...ev, pending: false });
      });
      result.sent++;
    } catch (e) {
      if (e instanceof RejectedError) {
        await database.outbox.update(entry.seq!, { state: 'failed', error: e.code, attempts: entry.attempts + 1 });
        result.failed++;
      } else {
        await database.outbox.update(entry.seq!, { attempts: entry.attempts + 1 });
        result.transientError = e instanceof Error ? e.message : String(e);
        break;
      }
    }
  }
  if (result.sent || result.failed) await recompute(database);
  return result;
}

/** Ops on the same satka that were queued after `entry` (they depend on it). */
async function dependents(entry: OutboxEntry, database: FarmDb): Promise<OutboxEntry[]> {
  return (await database.outbox.toArray()).filter((e) => e.seq! > entry.seq! && e.op.satkaId === entry.op.satkaId);
}

/** Puts a failed op (optionally edited) and its failed followers back in the queue. */
export async function retry(seq: number, edited?: Op, database: FarmDb = defaultDb): Promise<void> {
  const entry = await database.outbox.get(seq);
  if (!entry) return;
  const followers = (await dependents(entry, database)).filter((e) => e.state === 'failed');
  await database.transaction('rw', [database.outbox, database.events], async () => {
    await database.outbox.update(seq, { state: 'pending', error: null, ...(edited ? { op: edited } : {}) });
    for (const f of followers) await database.outbox.update(f.seq!, { state: 'pending', error: null });
    // Keep the local history entry in line with the edited position.
    if (edited && (edited.kind === 'create' || edited.kind === 'move')) {
      const ev = await database.events.get(entry.opId);
      if (ev?.pending) await database.events.put({ ...ev, after: { ...ev.after, position: edited.position } });
    }
  });
  await recompute(database);
}

/** Drops a failed op. Dropping a failed "create" also drops later ops on that satka. */
export async function discard(seq: number, database: FarmDb = defaultDb): Promise<void> {
  const entry = await database.outbox.get(seq);
  if (!entry) return;
  const drop = [entry, ...(entry.op.kind === 'create' ? await dependents(entry, database) : [])];
  await database.transaction('rw', [database.outbox, database.events], async () => {
    for (const e of drop) {
      await database.outbox.delete(e.seq!);
      const ev = await database.events.get(e.opId);
      if (ev?.pending) await database.events.delete(e.opId);
    }
  });
  await recompute(database);
}
