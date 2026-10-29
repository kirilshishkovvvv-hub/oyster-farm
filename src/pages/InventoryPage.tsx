import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, SizeChip, StatusBadge } from '../components/bits';
import { SIZES, STATUSES, STATUS_LABEL, SIZE_INFO, type Size, type Status } from '../config/categories';
import { LINE_COUNT, POSITION_COUNT } from '../config/farm';
import { useSatki } from '../data/hooks';
import { daysBetween, formatDate, todayISO } from '../domain/dates';
import { formatPositionShort } from '../domain/position';
import { displayCode, type Satka } from '../domain/satka';
import { t } from '../i18n/bg';

type Archived = 'active' | 'archived';

function byPosition(a: Satka, b: Satka) {
  const pa = a.position, pb = b.position;
  if (!pa || !pb) return displayCode(a).localeCompare(displayCode(b));
  return pa.line - pb.line || pa.section - pb.section || pa.slot - pb.slot;
}

export function InventoryPage() {
  const loaded = useSatki();
  const satki = useMemo(() => loaded ?? [], [loaded]);
  const [line, setLine] = useState<number | 0>(0);
  const [size, setSize] = useState<Size | ''>('');
  const [status, setStatus] = useState<Status | ''>('');
  const [olderThan, setOlderThan] = useState<number>(0);
  const [archived, setArchived] = useState<Archived>('active');

  const today = todayISO();
  const filtered = useMemo(() => satki
    .filter((s) => (archived === 'active' ? !s.archivedAt : !!s.archivedAt))
    .filter((s) => !line || s.position?.line === line)
    .filter((s) => !size || s.size === size)
    .filter((s) => !status || s.status === status)
    .filter((s) => !olderThan || daysBetween(s.lastProcessedOn, today) >= olderThan)
    .sort(byPosition), [satki, archived, line, size, status, olderThan, today]);

  const active = satki.filter((s) => !s.archivedAt);
  const counts = SIZES.map((sz) => [sz, filtered.filter((s) => s.size === sz).length] as const);

  return (
    <>
      <AppBar title={t.nav.inventory} />
      <div className="page">
        <div className="card">
          <dl className="info">
            <dt>Активни сатки</dt><dd>{active.length} / {POSITION_COUNT}</dd>
            <dt>Свободни позиции</dt><dd>{POSITION_COUNT - active.length}</dd>
            <dt>Архивирани</dt><dd>{satki.length - active.length}</dd>
          </dl>
        </div>

        <div className="grid2">
          <label className="field">{t.fields.line}
            <select value={line} onChange={(e) => setLine(Number(e.target.value))}>
              <option value={0}>Всички</option>
              {Array.from({ length: LINE_COUNT }, (_, i) => <option key={i} value={i + 1}>{t.fields.line} {i + 1}</option>)}
            </select>
          </label>
          <label className="field">{t.fields.size}
            <select value={size} onChange={(e) => setSize(e.target.value as Size | '')}>
              <option value="">Всички</option>
              {SIZES.map((s) => <option key={s} value={s}>{SIZE_INFO[s].label}</option>)}
            </select>
          </label>
          <label className="field">{t.fields.status}
            <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
              <option value="">Всички</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">Необработвани от
            <select value={olderThan} onChange={(e) => setOlderThan(Number(e.target.value))}>
              <option value={0}>без значение</option>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d}+ дни</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <button className={`btn ${archived === 'active' ? 'primary' : ''}`} onClick={() => setArchived('active')}>Активни</button>
          <button className={`btn ${archived === 'archived' ? 'primary' : ''}`} onClick={() => setArchived('archived')}>Архивирани</button>
        </div>

        <div className="counts" aria-label="Брой по размер">
          {counts.map(([sz, n]) => <span key={sz} className="row" style={{ gap: 4 }}><SizeChip size={sz} /> <b>{n}</b></span>)}
        </div>

        <p className="muted" style={{ margin: 0 }}>Показани: {filtered.length}</p>
        <div className="list">
          {filtered.map((s) => (
            <Link key={s.id} to={`/satka/${s.id}`} className={`list-item ${s.archivedAt ? 'archived' : ''}`}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="code">{displayCode(s)}</span>
                <span className="muted small">{formatPositionShort(s.position)} · {formatDate(s.lastProcessedOn)}</span>
              </span>
              <span className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <SizeChip size={s.size} />
                <StatusBadge status={s.status} archived={!!s.archivedAt} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
