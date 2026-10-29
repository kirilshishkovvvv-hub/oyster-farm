import Dexie, { type Table } from 'dexie';
import type { Satka, SatkaEvent } from '../domain/satka';
import type { FarmSettings, Line, MetaEntry, OutboxEntry } from './types';

/**
 * On-device copy of the farm data so the app works at sea without signal.
 *
 * - `remote`  last known server state of every satka (never edited locally)
 * - `satki`   what the UI shows = remote + pending outbox ops (see recompute)
 * - `events`  history; locally recorded entries carry pending: true until synced
 * - `outbox`  user changes waiting to be sent, in order
 */
export class FarmDb extends Dexie {
  remote!: Table<Satka, string>;
  satki!: Table<Satka, string>;
  events!: Table<SatkaEvent, string>;
  lines!: Table<Line, number>;
  settings!: Table<FarmSettings, number>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'oyster-farm') {
    super(name);
    this.version(1).stores({
      remote: 'id',
      satki: 'id, code',
      events: 'id, satkaId, performedAt',
      lines: 'no',
      settings: 'id',
      outbox: '++seq, opId, state',
      meta: 'key',
    });
  }
}

export const db = new FarmDb();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Wipes everything on this device (used on sign-out). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.remote, db.satki, db.events, db.lines, db.settings, db.outbox, db.meta], async () => {
    await Promise.all([db.remote.clear(), db.satki.clear(), db.events.clear(), db.lines.clear(), db.settings.clear(), db.outbox.clear(), db.meta.clear()]);
  });
}
