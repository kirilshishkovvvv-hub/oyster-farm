import { CAGE_OFFSET_M, SLOT_LAYOUT } from '../config/farm';
import type { Position } from './position';

export interface LatLng {
  lat: number;
  lng: number;
}

const R_EARTH = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distance of each buoy from buoy 1, in metres (length = gaps + 1). */
export function buoyOffsets(gaps: readonly number[]): number[] {
  const out = [0];
  for (const g of gaps) out.push(out[out.length - 1] + g);
  return out;
}

export function lineLength(gaps: readonly number[]): number {
  return gaps.reduce((a, b) => a + b, 0);
}

/** Distance from buoy 1 to where a slot's satka hangs on the rope, in metres. */
export function slotOffset(gaps: readonly number[], section: number, slot: number): number {
  const offsets = buoyOffsets(gaps);
  return offsets[section - 1] + gaps[section - 1] * SLOT_LAYOUT[slot].alongFrac;
}

export function destPoint(from: LatLng, bearingDeg: number, distM: number): LatLng {
  const delta = distM / R_EARTH;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(from.lat);
  const lam1 = toRad(from.lng);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lam2 =
    lam1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return { lat: toDeg(phi2), lng: toDeg(lam2) };
}

export function bearing(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLam = toRad(b.lng - a.lng);
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distance(a: LatLng, b: LatLng): number {
  const dPhi = toRad(b.lat - a.lat);
  const dLam = toRad(b.lng - a.lng);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLam / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

export interface LineGps {
  start: LatLng; // buoy 1
  end: LatLng; // buoy 26
}

/** Real-world buoy positions, laid out from buoy 1 along the start→end bearing. */
export function buoyLatLngs(gps: LineGps, gaps: readonly number[]): LatLng[] {
  const hdg = bearing(gps.start, gps.end);
  return buoyOffsets(gaps).map((d) => destPoint(gps.start, hdg, d));
}

/**
 * Where a satka is on the water: on the rope at its slot's distance, moved
 * CAGE_OFFSET_M to its side. "West" is the left side of the line as drawn on
 * a north-up chart (heading + 90° when the line runs north → south).
 */
export function slotLatLng(gps: LineGps, gaps: readonly number[], pos: Position): LatLng {
  const hdg = bearing(gps.start, gps.end);
  const onRope = destPoint(gps.start, hdg, slotOffset(gaps, pos.section, pos.slot));
  const side = SLOT_LAYOUT[pos.slot].side === 'west' ? 1 : -1;
  return destPoint(onRope, hdg + 90 * side, CAGE_OFFSET_M);
}
