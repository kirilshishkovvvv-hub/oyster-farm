import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_CENTER, DEFAULT_GAPS_M, DEFAULT_HEADING_DEG } from '../config/farm';
import { positionKey } from '../domain/position';
import type { Satka, SatkaEvent } from '../domain/satka';
import { db } from './localDb';
import { syncStatusStore } from './sync';
import type { FarmSettings, Line, OutboxEntry } from './types';

export function useSatki(): Satka[] | undefined {
  return useLiveQuery(() => db.satki.toArray(), []);
}

/** Active satki by position key ("line-section-slot"). */
export function useOccupancy(satki: Satka[] | undefined): Map<string, Satka> {
  return useMemo(() => {
    const m = new Map<string, Satka>();
    for (const s of satki ?? []) if (!s.archivedAt && s.position) m.set(positionKey(s.position), s);
    return m;
  }, [satki]);
}

export function useSatka(id: string | undefined): Satka | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.satki.get(id)) ?? null) : null), [id]);
}

export function useSatkaByCode(code: string | undefined): Satka | null | undefined {
  return useLiveQuery(async () => (code ? ((await db.satki.where('code').equals(code).first()) ?? null) : null), [code]);
}

export function useEvents(satkaId: string | undefined): SatkaEvent[] | undefined {
  return useLiveQuery(
    async () => (satkaId ? (await db.events.where('satkaId').equals(satkaId).sortBy('performedAt')).reverse() : []),
    [satkaId],
  );
}

export function useRecentEvents(limit = 50): SatkaEvent[] | undefined {
  return useLiveQuery(() => db.events.orderBy('performedAt').reverse().limit(limit).toArray(), [limit]);
}

export function useLines(): Line[] | undefined {
  return useLiveQuery(() => db.lines.orderBy('no').toArray(), []);
}

export const FALLBACK_SETTINGS: FarmSettings = {
  id: 1, headingDeg: DEFAULT_HEADING_DEG, gapsM: [...DEFAULT_GAPS_M], centerLat: DEFAULT_CENTER.lat, centerLng: DEFAULT_CENTER.lng,
};

export function useSettings(): FarmSettings {
  return useLiveQuery(() => db.settings.get(1), []) ?? FALLBACK_SETTINGS;
}

export function useOutbox(): OutboxEntry[] | undefined {
  return useLiveQuery(() => db.outbox.orderBy('seq').toArray(), []);
}

export function useSyncStatus() {
  return useSyncExternalStore(syncStatusStore.subscribe, syncStatusStore.get);
}
