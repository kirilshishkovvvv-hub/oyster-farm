// Conversions between database rows (snake_case) and app objects.
import { isSize, isStatus } from '../config/categories';
import type { Position } from '../domain/position';
import type { EventKind, Satka, SatkaEvent, SatkaSnapshot } from '../domain/satka';
import type { FarmSettings, Line, Profile } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function rowPosition(r: Row): Position | null {
  return r.line_no == null ? null : { line: Number(r.line_no), section: Number(r.section), slot: Number(r.slot) };
}

export function satkaFromRow(r: Row): Satka {
  return {
    id: r.id,
    code: r.code,
    size: r.size,
    status: r.status,
    position: rowPosition(r),
    lastProcessedOn: r.last_processed_on,
    archivedAt: r.archived_at ?? null,
    archiveReason: r.archive_reason ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function snapshotFromJson(j: Row | null): Partial<SatkaSnapshot> | null {
  if (!j) return null;
  const out: Partial<SatkaSnapshot> = {};
  if (isSize(j.size)) out.size = j.size;
  if (isStatus(j.status)) out.status = j.status;
  if ('line_no' in j) out.position = rowPosition(j);
  if (j.last_processed_on) out.lastProcessedOn = j.last_processed_on;
  if (j.archive_reason) out.archiveReason = j.archive_reason;
  return out;
}

export function eventFromRow(r: Row): SatkaEvent {
  return {
    id: r.id,
    satkaId: r.satka_id,
    kind: r.kind as EventKind,
    before: snapshotFromJson(r.before),
    after: snapshotFromJson(r.after),
    note: r.note ?? '',
    performedAt: r.performed_at,
    userName: r.user_name ?? '',
  };
}

export function lineFromRow(r: Row): Line {
  return { no: r.no, label: r.label, startLat: r.start_lat, startLng: r.start_lng, endLat: r.end_lat, endLng: r.end_lng };
}

export function settingsFromRow(r: Row): FarmSettings {
  return { id: 1, headingDeg: Number(r.heading_deg), gapsM: (r.gaps_m as unknown[]).map(Number), centerLat: r.center_lat, centerLng: r.center_lng };
}

export function profileFromRow(r: Row): Profile {
  return { id: r.id, email: r.email, name: r.name, role: r.role, active: r.active };
}
