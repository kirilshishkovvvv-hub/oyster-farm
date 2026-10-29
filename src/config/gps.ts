import type { Line } from '../data/types';

/**
 * Default GPS position of every line. Each line runs north → south:
 * start = buoy 1 (north end), end = buoy 26 (south end), 146 m apart.
 *
 * Lines 2 and 5 were measured (Л2 end, Л5 start). The other four are derived
 * from a regular 3 × 2 grid: columns 151 m apart (west–middle–east), north row
 * 331 m north of the south row. Check them on site before relying on them.
 * Admins can correct them under Админ → Ферма и линии.
 */
export const DEFAULT_LINES: Line[] = [
  { no: 1, label: 'Линия 1', startLat: 43.330025, startLng: 28.075487, endLat: 43.328713, endLng: 28.075487 },
  { no: 2, label: 'Линия 2', startLat: 43.327049, startLng: 28.075487, endLat: 43.325737, endLng: 28.075487 },
  { no: 3, label: 'Линия 3', startLat: 43.330025, startLng: 28.077356, endLat: 43.328713, endLng: 28.077356 },
  { no: 4, label: 'Линия 4', startLat: 43.327049, startLng: 28.077356, endLat: 43.325737, endLng: 28.077356 },
  { no: 5, label: 'Линия 5', startLat: 43.330025, startLng: 28.079225, endLat: 43.328713, endLng: 28.079225 },
  { no: 6, label: 'Линия 6', startLat: 43.327049, startLng: 28.079225, endLat: 43.325737, endLng: 28.079225 },
];
