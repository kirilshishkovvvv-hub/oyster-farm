import { beforeEach, describe, expect, it } from 'vitest';
import { FarmDb } from '../src/data/localDb';
import { discard, enqueue, flush, RejectedError, retry, TransientError, type Transport } from '../src/data/outbox';
import type { Op } from '../src/domain/satka';
import { todayISO } from '../src/domain/dates';

let n = 0;
let db: FarmDb;
beforeEach(() => {
  db = new FarmDb(`test-${++n}`);
});

const today = todayISO();
const create = (satkaId: string, opId: string, slot = 1): Op => ({
  kind: 'create', opId, satkaId, size: 'small', status: 'newly_sorted', position: { line: 1, section: 1, slot },
  processedOn: today, performedAt: new Date().toISOString(), note: '',
});

/** Fake server: issues codes and remembers which ops it has applied. */
function fakeServer(opts: { reject?: (op: Op) => string | null; offline?: () => boolean } = {}) {
  const seen: string[] = [];
  let seq = 0;
  const codes = new Map<string, string>();
  const transport: Transport = {
    async send(op) {
      if (opts.offline?.()) throw new TransientError('Failed to fetch');
      const r = opts.reject?.(op);
      if (r) throw new RejectedError(r as never);
      seen.push(op.opId);
      if (!codes.has(op.satkaId)) codes.set(op.satkaId, `SAT-${String(++seq).padStart(5, '0')}`);
      const pos = op.kind === 'create' || op.kind === 'move' ? op.position : { line: 1, section: 1, slot: 1 };
      return {
        id: op.satkaId, code: codes.get(op.satkaId), size: 'small', status: op.kind === 'process' ? op.status : 'newly_sorted',
        line_no: pos.line, section: pos.section, slot: pos.slot, last_processed_on: today,
        archived_at: null, archive_reason: null, created_at: '', updated_at: '',
      };
    },
  };
  return { transport, seen };
}

describe('outbox', () => {
  it('applies changes locally at once and records pending history', async () => {
    await enqueue(create('s1', 'o1'), 'Иван', db);
    const s = await db.satki.get('s1');
    expect(s?.code).toBeNull();
    expect((await db.events.get('o1'))?.pending).toBe(true);
    expect(await db.outbox.count()).toBe(1);
  });

  it('refuses invalid changes without queueing them', async () => {
    await enqueue(create('s1', 'o1'), '', db);
    await expect(enqueue(create('s2', 'o2'), '', db)).rejects.toMatchObject({ code: 'POSITION_TAKEN' });
    expect(await db.outbox.count()).toBe(1);
    expect(await db.satki.get('s2')).toBeUndefined();
  });

  it('sends in order and stores the server-issued code', async () => {
    const { transport, seen } = fakeServer();
    await enqueue(create('s1', 'o1'), '', db);
    await enqueue({ kind: 'process', opId: 'o2', satkaId: 's1', status: 'sorted', size: null, processedOn: today, performedAt: '', note: '' }, '', db);
    const res = await flush(transport, db);
    expect(res).toEqual({ sent: 2, failed: 0, transientError: null });
    expect(seen).toEqual(['o1', 'o2']);
    expect((await db.satki.get('s1'))?.code).toBe('SAT-00001');
    expect(await db.outbox.count()).toBe(0);
    expect((await db.events.get('o1'))?.pending).toBe(false);
  });

  it('keeps everything queued while offline', async () => {
    let offline = true;
    const { transport, seen } = fakeServer({ offline: () => offline });
    await enqueue(create('s1', 'o1'), '', db);
    const res = await flush(transport, db);
    expect(res.transientError).toBe('Failed to fetch');
    expect(await db.outbox.count()).toBe(1);
    expect(await db.satki.get('s1')).toBeDefined(); // still visible locally
    offline = false;
    await flush(transport, db);
    expect(seen).toEqual(['o1']);
  });

  it('marks rejected ops as failed, hides their effect, and allows a fixed retry', async () => {
    let taken = true;
    const { transport } = fakeServer({ reject: (op) => (taken && op.kind === 'create' ? 'POSITION_TAKEN' : null) });
    await enqueue(create('s1', 'o1'), '', db);
    const res = await flush(transport, db);
    expect(res.failed).toBe(1);
    const [entry] = await db.outbox.toArray();
    expect(entry).toMatchObject({ state: 'failed', error: 'POSITION_TAKEN' });
    expect(await db.satki.get('s1')).toBeUndefined();

    taken = false;
    await retry(entry.seq!, create('s1', 'o1', 3), db);
    expect((await db.satki.get('s1'))?.position?.slot).toBe(3);
    await flush(transport, db);
    expect((await db.satki.get('s1'))?.code).toMatch(/^SAT-/);
  });

  it('discarding a failed create also drops later ops on that satka', async () => {
    const { transport } = fakeServer({ reject: () => 'POSITION_TAKEN' });
    await enqueue(create('s1', 'o1'), '', db);
    await enqueue({ kind: 'archive', opId: 'o2', satkaId: 's1', reason: 'Изгубена', performedAt: '', note: '' }, '', db);
    await flush(transport, db);
    const [first] = await db.outbox.orderBy('seq').toArray();
    await discard(first.seq!, db);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
  });
});
