import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AppBar } from '../components/bits';
import { firstFree, LinePicker, PositionPicker, SizePicker, StatusPicker } from '../components/pickers';
import { useUi } from '../components/UiProvider';
import { SIZE_INFO, type Size, type Status } from '../config/categories';
import { SECTION_COUNT, SLOTS_PER_SECTION, SLOT_NAMES } from '../config/farm';
import { newId, nowISO, perform, performMany } from '../data/actions';
import { useOccupancy, useSatki } from '../data/hooks';
import { isOnline } from '../data/sync';
import { todayISO } from '../domain/dates';
import { formatPosition, isValidPosition, positionKey, type Position } from '../domain/position';
import type { Op } from '../domain/satka';
import { errorText, t } from '../i18n/bg';

/** Add new or replacement satki: one at a time, or many at once. */
export function AddPage() {
  const [params] = useSearchParams();
  const fromMap = params.has('line');
  const [mode, setMode] = useState<'one' | 'many'>('one');

  return (
    <>
      <AppBar title={t.nav.add} />
      <div className="page">
        {!fromMap && (
          <div className="grid2">
            <button className={`btn ${mode === 'one' ? 'primary' : ''}`} aria-pressed={mode === 'one'} onClick={() => setMode('one')}>Една сатка</button>
            <button className={`btn ${mode === 'many' ? 'primary' : ''}`} aria-pressed={mode === 'many'} onClick={() => setMode('many')}>Много наведнъж</button>
          </div>
        )}
        {mode === 'one' ? <AddOne /> : <AddMany />}
      </div>
    </>
  );
}

function AddOne() {
  const [params] = useSearchParams();
  const occupancy = useOccupancy(useSatki());
  const { userName } = useAuth();
  const { toast, confirm } = useUi();
  const navigate = useNavigate();

  const fromUrl = { line: Number(params.get('line')), section: Number(params.get('section')), slot: Number(params.get('slot')) };
  const [pos, setPos] = useState<Position | null>(isValidPosition(fromUrl) ? fromUrl : null);
  const [size, setSize] = useState<Size | null>(null);
  const [status, setStatus] = useState<Status>('newly_sorted');
  const [date, setDate] = useState(todayISO());

  const value = pos ?? firstFree(occupancy, 1) ?? { line: 1, section: 1, slot: 1 };
  const taken = occupancy.has(positionKey(value));

  const save = async () => {
    if (!size) return toast('Изберете размер.', 'error');
    const ok = await confirm({ title: t.nav.add, text: `${SIZE_INFO[size].label} · ${formatPosition(value)}` });
    if (!ok) return;
    const satkaId = newId();
    try {
      toast(await perform({
        kind: 'create', opId: newId(), satkaId, size, status, position: value, processedOn: date, performedAt: nowISO(), note: '',
      }, userName));
      navigate(`/satka/${satkaId}`, { replace: true });
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <>
      <h2 style={{ fontSize: '1.05rem' }}>1. Къде?</h2>
      <PositionPicker value={value} onChange={setPos} occupancy={occupancy} />
      {taken && <div className="banner danger">{t.errors.POSITION_TAKEN}</div>}
      <h2 style={{ fontSize: '1.05rem' }}>2. Какво?</h2>
      <SizePicker value={size} onChange={setSize} />
      <StatusPicker value={status} onChange={setStatus} />
      <label className="field">{t.fields.lastProcessed}
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button className="btn primary" disabled={taken || !size} onClick={() => void save()}>
        ➕ {t.nav.add}
      </button>
    </>
  );
}

function AddMany() {
  const occupancy = useOccupancy(useSatki());
  const { userName } = useAuth();
  const { toast, confirm } = useUi();
  const navigate = useNavigate();

  const [line, setLine] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(SECTION_COUNT);
  const [slots, setSlots] = useState<number[]>([1, 2, 3, 4]);
  const [size, setSize] = useState<Size | null>(null);
  const [status, setStatus] = useState<Status>('newly_sorted');
  const [date, setDate] = useState(todayISO());

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const { free, skipped } = useMemo(() => {
    const free: Position[] = [];
    let skipped = 0;
    for (let section = lo; section <= hi; section++)
      for (const slot of slots) {
        const p = { line, section, slot };
        if (occupancy.has(positionKey(p))) skipped++;
        else free.push(p);
      }
    return { free, skipped };
  }, [line, lo, hi, slots, occupancy]);

  const toggleSlot = (s: number) => setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s].sort());

  const save = async () => {
    if (!size) return toast('Изберете размер.', 'error');
    if (!free.length) return toast('Няма свободни позиции в избрания участък.', 'error');
    const ok = await confirm({
      title: `Създаване на ${free.length} сатки`,
      text: `${SIZE_INFO[size].label} · Линия ${line}, секции ${lo}–${hi}, позиции ${slots.join(', ')}.` +
        (skipped ? ` ${skipped} заети позиции се пропускат.` : '') + ' Всяка сатка получава собствен номер.',
    });
    if (!ok) return;
    const performedAt = nowISO();
    const ops: Op[] = free.map((position) => ({
      kind: 'create', opId: newId(), satkaId: newId(), size, status, position, processedOn: date, performedAt, note: '',
    }));
    const saved = await performMany(ops, userName);
    toast(`Създадени ${saved} сатки.${isOnline() ? '' : ' Номерата ще дойдат при синхронизация.'}`);
    navigate(`/map`, { replace: true });
  };

  const sectionOptions = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);
  return (
    <>
      <LinePicker value={line} onChange={setLine} />
      <div className="grid2">
        <label className="field">От секция
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">До секция
          <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Позиции във всяка секция</legend>
        <div className="slot-grid">
          {Array.from({ length: SLOTS_PER_SECTION }, (_, i) => i + 1).map((s) => (
            <button key={s} type="button" className={`btn ${slots.includes(s) ? 'primary' : ''}`} aria-pressed={slots.includes(s)} onClick={() => toggleSlot(s)}>
              {slots.includes(s) ? '✓ ' : ''}{SLOT_NAMES[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <SizePicker value={size} onChange={setSize} />
      <StatusPicker value={status} onChange={setStatus} />
      <label className="field">{t.fields.lastProcessed}
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="banner info">
        Ще бъдат създадени <b>{free.length}</b> сатки{skipped ? ` (${skipped} заети позиции се пропускат)` : ''}.
      </div>
      <button className="btn primary" disabled={!size || !free.length} onClick={() => void save()}>
        ➕ Създай {free.length} сатки
      </button>
    </>
  );
}
