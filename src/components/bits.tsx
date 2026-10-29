import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SIZE_INFO, STATUS_LABEL, type Size, type Status } from '../config/categories';
import { t } from '../i18n/bg';
import { SyncIndicator } from './SyncIndicator';

export function SizeChip({ size }: { size: Size }) {
  const s = SIZE_INFO[size];
  return (
    <span className="size-chip" style={{ background: s.color, color: s.textColor }}>
      <span className="letter" aria-hidden>{s.letter}</span>
      {s.label}
    </span>
  );
}

export function StatusBadge({ status, archived }: { status: Status; archived?: boolean }) {
  if (archived) return <span className="status-badge status-archived">{t.fields.archived}</span>;
  return <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Top bar: back button, title, sync status. */
export function AppBar({ title, back = true, right }: { title: ReactNode; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="appbar">
      {back && (
        <button className="icon-btn" aria-label={t.back} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          ←
        </button>
      )}
      <h1>{title}</h1>
      {right}
      <SyncIndicator />
    </header>
  );
}

export function Loading() {
  return <p className="muted" style={{ padding: 16 }}>{t.loading}</p>;
}
