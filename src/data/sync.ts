import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ErrorCode, Op } from '../domain/satka';
import { db, getMeta, setMeta } from './localDb';
import { eventFromRow, lineFromRow, satkaFromRow, settingsFromRow } from './mappers';
import { flush, recompute, RejectedError, TransientError, type Transport } from './outbox';
import { supabase } from './supabase';
import { demoMode, demoNetwork, demoTransport, seedDemo } from './demo';

/** Demo mode only: simulate losing / regaining signal. */
export function setDemoOnline(online: boolean): void {
  demoNetwork.online = online;
  setStatus({ online });
  if (online) void syncNow();
}

const BUSINESS_ERRORS: ReadonlySet<string> = new Set<ErrorCode>([
  'NOT_ADMIN', 'NOT_FOUND', 'ARCHIVED', 'POSITION_TAKEN', 'SAME_POSITION',
  'INVALID_POSITION', 'INVALID_DATE', 'REASON_REQUIRED', 'LAST_ADMIN',
]);

function rpcCall(op: Op): [string, Record<string, unknown>] {
  switch (op.kind) {
    case 'create':
      return ['create_satka', {
        p_op_id: op.opId, p_satka_id: op.satkaId, p_size: op.size, p_status: op.status,
        p_line: op.position.line, p_section: op.position.section, p_slot: op.position.slot,
        p_processed_on: op.processedOn, p_performed_at: op.performedAt, p_note: op.note,
      }];
    case 'process':
      return ['process_satka', {
        p_op_id: op.opId, p_satka_id: op.satkaId, p_status: op.status, p_size: op.size,
        p_processed_on: op.processedOn, p_performed_at: op.performedAt, p_note: op.note,
      }];
    case 'move':
      return ['move_satka', {
        p_op_id: op.opId, p_satka_id: op.satkaId, p_line: op.position.line, p_section: op.position.section,
        p_slot: op.position.slot, p_performed_at: op.performedAt, p_note: op.note, p_swap: op.swap,
      }];
    case 'archive':
      return ['archive_satka', { p_op_id: op.opId, p_satka_id: op.satkaId, p_reason: op.reason, p_performed_at: op.performedAt, p_note: op.note }];
    case 'correct':
      return ['correct_satka', { p_op_id: op.opId, p_satka_id: op.satkaId, p_size: op.size, p_status: op.status, p_processed_on: op.processedOn, p_reason: op.reason }];
  }
}

/** Calls an RPC; business errors become RejectedError, everything else TransientError. */
export async function callRpc<T = Record<string, unknown>>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    if (BUSINESS_ERRORS.has(error.message)) throw new RejectedError(error.message as ErrorCode);
    // NOT_AUTHORIZED (signed out / not yet approved) is treated as temporary so
    // nothing is lost: the ops stay queued until the user can sync again.
    throw new TransientError(error.message || 'network');
  }
  return data as T;
}

export const rpcTransport: Transport = {
  send: (op) => {
    const [name, params] = rpcCall(op);
    return callRpc(name, params);
  },
};

// ---------------------------------------------------------------------------
// Pulling server changes
// ---------------------------------------------------------------------------
const PAGE = 1000;
const OVERLAP_MS = 2 * 60 * 1000; // re-read the last 2 min to cover commits that finished late
const INITIAL_EVENT_DAYS = 180;

function minus(iso: string, ms: number) {
  return new Date(new Date(iso).getTime() - ms).toISOString();
}

async function fetchAll(table: string, column: string, since: string | undefined) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*').order(column).range(from, from + PAGE - 1);
    if (since) q = q.gte(column, since);
    const { data, error } = await q;
    if (error) throw new TransientError(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function pull(): Promise<void> {
  const satkiCursor = await getMeta<string>('satkiCursor');
  const eventsCursor = await getMeta<string>('eventsCursor');
  const eventsSince = eventsCursor
    ? minus(eventsCursor, OVERLAP_MS)
    : new Date(Date.now() - INITIAL_EVENT_DAYS * 86400000).toISOString();

  const [satkiRows, eventRows, lineRes, settingsRes] = await Promise.all([
    fetchAll('satki', 'updated_at', satkiCursor ? minus(satkiCursor, OVERLAP_MS) : undefined),
    fetchAll('satka_events', 'recorded_at', eventsSince),
    supabase.from('lines').select('*').order('no'),
    supabase.from('farm_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (lineRes.error) throw new TransientError(lineRes.error.message);
  if (settingsRes.error) throw new TransientError(settingsRes.error.message);

  await db.transaction('rw', [db.remote, db.events, db.lines, db.settings, db.meta], async () => {
    await db.remote.bulkPut(satkiRows.map(satkaFromRow));
    await db.events.bulkPut(eventRows.map(eventFromRow));
    await db.lines.bulkPut(lineRes.data.map(lineFromRow));
    if (settingsRes.data) await db.settings.put(settingsFromRow(settingsRes.data));
    const lastSatka = satkiRows.at(-1)?.updated_at as string | undefined;
    const lastEvent = eventRows.at(-1)?.recorded_at as string | undefined;
    if (lastSatka) await setMeta('satkiCursor', lastSatka);
    if (lastEvent) await setMeta('eventsCursor', lastEvent);
  });
  await recompute();
}

/** Full history of one satka (older entries are not kept on the device). */
export async function fetchFullHistory(satkaId: string): Promise<void> {
  const { data, error } = await supabase.from('satka_events').select('*').eq('satka_id', satkaId).order('performed_at');
  if (error) throw new TransientError(error.message);
  await db.events.bulkPut(data.map(eventFromRow));
}

// ---------------------------------------------------------------------------
// Sync engine + observable status
// ---------------------------------------------------------------------------
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
}

let status: SyncStatus = { online: navigator.onLine, syncing: false, lastSyncAt: null, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export const syncStatusStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => status,
};

let running: Promise<void> | null = null;

export const isOnline = (): boolean => (demoMode ? demoNetwork.online : navigator.onLine);

/** Sends queued changes, then fetches everything new. Safe to call any time. */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    if (!isOnline()) {
      setStatus({ online: false });
      return;
    }
    setStatus({ syncing: true, online: true });
    try {
      const res = await flush(demoMode ? demoTransport : rpcTransport);
      if (!demoMode) await pull();
      setStatus({ lastSyncAt: new Date().toISOString(), error: res.transientError });
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setStatus({ syncing: false });
    }
  })().finally(() => (running = null));
  return running;
}

let timer: number | undefined;
let channel: RealtimeChannel | null = null;
let debounce: number | undefined;

const onOnline = () => {
  setStatus({ online: true });
  void syncNow();
};
const onOffline = () => setStatus({ online: false });
const onVisible = () => {
  if (document.visibilityState === 'visible') void syncNow();
};

export function startSync(): void {
  stopSync();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  timer = window.setInterval(() => void syncNow(), 60_000);
  if (demoMode) {
    void seedDemo().then(() => recompute()).then(() => syncNow());
    return;
  }
  const later = () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(), 700);
  };
  channel = supabase
    .channel('farm-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'satki' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'satka_events' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lines' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_settings' }, later)
    .subscribe();
  void recompute().then(syncNow);
}

export function stopSync(): void {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  clearInterval(timer);
  clearTimeout(debounce);
  if (channel) void supabase.removeChannel(channel);
  channel = null;
}

/** Forgets sync cursors so the next sync re-downloads everything. */
export async function resetCursors(): Promise<void> {
  await setMeta('satkiCursor', undefined);
  await setMeta('eventsCursor', undefined);
}
