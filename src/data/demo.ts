// Demo mode (VITE_DEMO=1, `npm run demo`): runs the whole app on one device
// without Supabase, starting from an empty farm. A fake "server" inside the browser applies queued ops to
// the `remote` table, so offline queueing, conflicts and history all behave
// like the real thing. Never used in the deployed build.
import { DEFAULT_CENTER, DEFAULT_GAPS_M, DEFAULT_HEADING_DEG } from '../config/farm';
import { DEFAULT_LINES } from '../config/gps';
import { applyOp, DomainError, type Satka } from '../domain/satka';
import { db, getMeta, setMeta } from './localDb';
import { RejectedError, TransientError, recompute, type Transport } from './outbox';

export const demoMode = import.meta.env.VITE_DEMO === '1';

/** Simulated connection, toggled from the Sync screen in demo mode. */
export const demoNetwork = { online: true };

async function nextCode(): Promise<string> {
  const n = ((await getMeta<number>('demoSeq')) ?? 0) + 1;
  await setMeta('demoSeq', n);
  return `SAT-${String(n).padStart(5, '0')}`;
}

export const demoTransport: Transport = {
  async send(op) {
    if (!demoNetwork.online) throw new TransientError('Няма връзка (демо)');
    const remote = new Map((await db.remote.toArray()).map((s) => [s.id, s]));
    let changed: Satka[];
    try {
      changed = applyOp(remote, op);
    } catch (e) {
      if (e instanceof DomainError) throw new RejectedError(e.code);
      throw e;
    }
    for (const s of changed) {
      if (!s.code) s.code = await nextCode();
      await db.remote.put(s);
    }
    const s = changed.find((x) => x.id === op.satkaId) ?? remote.get(op.satkaId)!;
    return {
      id: s.id, code: s.code, size: s.size, status: s.status,
      line_no: s.position?.line ?? null, section: s.position?.section ?? null, slot: s.position?.slot ?? null,
      last_processed_on: s.lastProcessedOn, archived_at: s.archivedAt, archive_reason: s.archiveReason,
      created_at: s.createdAt, updated_at: s.updatedAt,
    };
  },
};

let seeding: Promise<void> | null = null;

/** Fills the device with a believable farm the first time demo mode starts. */
export function seedDemo(): Promise<void> {
  seeding ??= doSeed();
  return seeding;
}

const DEMO_VERSION = 2; // v2: starts with an empty farm (v1 had 460 sample satki)

async function doSeed(): Promise<void> {
  // Line positions always come from the config, so devices seeded earlier get them too.
  await db.lines.bulkPut(DEFAULT_LINES);
  if ((await getMeta<number>('demoVersion')) === DEMO_VERSION) return;
  await db.transaction('rw', [db.remote, db.satki, db.events, db.outbox], async () => {
    await Promise.all([db.remote.clear(), db.satki.clear(), db.events.clear(), db.outbox.clear()]);
  });
  await db.settings.put({ id: 1, headingDeg: DEFAULT_HEADING_DEG, gapsM: [...DEFAULT_GAPS_M], centerLat: DEFAULT_CENTER.lat, centerLng: DEFAULT_CENTER.lng });
  // Like the real farm at launch: no satki until you create them.
  await setMeta('demoSeq', 0);
  await setMeta('demoVersion', DEMO_VERSION);
  await recompute();
}
