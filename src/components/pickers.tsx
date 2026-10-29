import { SECTION_COUNT, LINE_COUNT, SLOTS_PER_SECTION, SLOT_NAMES, lineGridPosition } from '../config/farm';
import { SIZE_INFO, SIZES, STATUSES, STATUS_LABEL, type Size, type Status } from '../config/categories';
import { positionKey, type Position } from '../domain/position';
import { displayCode, type Satka } from '../domain/satka';
import { t } from '../i18n/bg';

export function SizePicker({ value, onChange }: { value: Size | null; onChange(s: Size): void }) {
  return (
    <fieldset>
      <legend>{t.fields.size}</legend>
      <div className="grid2">
        {SIZES.map((s) => {
          const info = SIZE_INFO[s];
          return (
            <button
              key={s}
              type="button"
              className={`btn ${value === s ? 'selected' : ''}`}
              style={{ background: info.color, color: info.textColor, borderColor: 'rgba(0,0,0,.35)' }}
              aria-pressed={value === s}
              onClick={() => onChange(s)}
            >
              {value === s ? '✓ ' : ''}{info.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StatusPicker({ value, onChange }: { value: Status | null; onChange(s: Status): void }) {
  return (
    <fieldset>
      <legend>{t.fields.status}</legend>
      <div className="stack">
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`btn ${value === s ? 'primary selected' : ''}`} aria-pressed={value === s} onClick={() => onChange(s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Line buttons in grid order: north row first, then south row. */
const LINE_ORDER = Array.from({ length: LINE_COUNT }, (_, i) => i + 1)
  .sort((a, b) => lineGridPosition(a).row - lineGridPosition(b).row || lineGridPosition(a).col - lineGridPosition(b).col);

/** Line buttons laid out like the farm: north row 1·3·5, south row 2·4·6, west → east. */
export function LinePicker({ value, onChange }: { value: number; onChange(line: number): void }) {
  return (
    <fieldset>
      <legend>{t.fields.line}</legend>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>← запад</span><span>изток →</span></div>
      <div className="grid3">
        {LINE_ORDER.map((line) => (
          <button key={line} type="button" className={`btn ${value === line ? 'primary selected' : ''}`}
            aria-pressed={value === line} onClick={() => onChange(line)}>
            {t.fields.line} {line}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function firstFree(occupancy: Map<string, Satka>, line: number): Position | null {
  for (let section = 1; section <= SECTION_COUNT; section++)
    for (let slot = 1; slot <= SLOTS_PER_SECTION; slot++)
      if (!occupancy.has(positionKey({ line, section, slot }))) return { line, section, slot };
  return null;
}

/**
 * Choose line → section → slot. Shows who occupies each slot so the user can
 * see the farm while choosing. `selfId` is the satka being moved (its own
 * slot is shown but not selectable).
 */
export function PositionPicker({
  value, onChange, occupancy, selfId, allowOccupied = false,
}: {
  value: Position;
  onChange(p: Position): void;
  occupancy: Map<string, Satka>;
  selfId?: string;
  allowOccupied?: boolean;
}) {
  const setSection = (section: number) => onChange({ ...value, section: Math.min(SECTION_COUNT, Math.max(1, section)) });
  const suggestion = firstFree(occupancy, value.line);

  return (
    <div className="stack">
      <LinePicker value={value.line} onChange={(line) => onChange({ ...value, line })} />

      <fieldset>
        <legend>{t.fields.section} (между шамандура {value.section} и {value.section + 1})</legend>
        <div className="stepper">
          <button type="button" className="btn" aria-label="Предишна секция" onClick={() => setSection(value.section - 1)}>−</button>
          <select aria-label={t.fields.section} value={value.section} onChange={(e) => setSection(Number(e.target.value))} className="value">
            {Array.from({ length: SECTION_COUNT }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="btn" aria-label="Следваща секция" onClick={() => setSection(value.section + 1)}>+</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t.fields.slot} в секцията</legend>
        <div className="slot-grid">
          {Array.from({ length: SLOTS_PER_SECTION }, (_, i) => i + 1).map((slot) => {
            const p = { line: value.line, section: value.section, slot };
            const occ = occupancy.get(positionKey(p));
            const isSelf = !!occ && occ.id === selfId;
            const disabled = isSelf || (!!occ && !allowOccupied);
            const info = occ ? SIZE_INFO[occ.size] : null;
            return (
              <button key={slot} type="button" disabled={disabled}
                className={`slot-btn ${occ ? 'taken' : ''} ${value.slot === slot ? 'chosen' : ''}`}
                style={info ? { background: info.color, color: info.textColor, opacity: disabled ? 0.55 : 1 } : undefined}
                aria-pressed={value.slot === slot}
                aria-label={`${t.fields.slot} ${slot}: ${occ ? (isSelf ? 'тази сатка' : `заета от ${displayCode(occ)}`) : 'свободна'}`}
                onClick={() => onChange(p)}>
                <span>{SLOT_NAMES[slot]}</span>
                <span className="small">{occ ? (isSelf ? 'тази' : displayCode(occ)) : 'свободна'}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {suggestion && (
        <button type="button" className="link-btn" onClick={() => onChange(suggestion)}>
          Първа свободна позиция на линия {value.line}: секция {suggestion.section}, позиция {suggestion.slot}
        </button>
      )}
    </div>
  );
}
