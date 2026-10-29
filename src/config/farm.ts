// Physical layout of the farm. These are fixed by the spec; distances and
// orientation can be adjusted by an admin (stored in farm_settings).

export const LINE_COUNT = 6;
export const BUOY_COUNT = 26;
export const SECTION_COUNT = BUOY_COUNT - 1; // 25
export const SLOTS_PER_SECTION = 4;
export const POSITION_COUNT = LINE_COUNT * SECTION_COUNT * SLOTS_PER_SECTION; // 600

/** Gaps between consecutive buoys in metres: 4 m at both ends, 6 m elsewhere. */
export const DEFAULT_GAPS_M: readonly number[] = [4, ...Array<number>(SECTION_COUNT - 2).fill(6), 4];

/**
 * Layout of the lines on the water (land is to the west):
 *
 *            west   middle   east
 *   north     Л1      Л3      Л5
 *   south     Л2      Л4      Л6
 *
 * Every line runs north → south with buoy 1 at the north end.
 */
export function lineGridPosition(line: number): { col: number; row: number } {
  return { col: Math.ceil(line / 2) - 1, row: (line - 1) % 2 };
}
export const LINE_COLUMNS = 3;
export const LINE_ROWS = 2;

/**
 * The 4 satki of a section hang on the rope between two buoys: two on the west
 * side and two on the east side, each pair one near the upper (north) buoy and
 * one near the lower (south) buoy. alongFrac is the distance from the upper buoy
 * as a share of the section length.
 */
export const SLOT_LAYOUT: Record<number, { side: 'west' | 'east'; alongFrac: number }> = {
  1: { side: 'west', alongFrac: 0.25 }, // Горна лява
  2: { side: 'west', alongFrac: 0.75 }, // Долна лява
  3: { side: 'east', alongFrac: 0.25 }, // Горна дясна
  4: { side: 'east', alongFrac: 0.75 }, // Долна дясна
};
export const SLOT_NAMES: Record<number, string> = {
  1: 'Горна лява', 2: 'Долна лява', 3: 'Горна дясна', 4: 'Долна дясна',
};
/** Distance of a satka from the rope, metres (to the side). */
export const CAGE_OFFSET_M = 1.3;

/** Compass bearing from buoy 1 towards buoy 26. 180° = buoy 1 at the north end. */
export const DEFAULT_HEADING_DEG = 180;

/** Reference point used before any line GPS is entered (Black Sea, near Varna). */
export const DEFAULT_CENTER = { lat: 43.3253309, lng: 28.0747198 };
