import type { Op, ErrorCode } from '../domain/satka';

export type Role = 'worker' | 'admin';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface Line {
  no: number;
  label: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}

export interface FarmSettings {
  id: 1;
  headingDeg: number;
  gapsM: number[];
  centerLat: number;
  centerLng: number;
}

export interface OutboxEntry {
  seq?: number;
  opId: string;
  op: Op;
  state: 'pending' | 'failed';
  error: ErrorCode | null;
  attempts: number;
  createdAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}
