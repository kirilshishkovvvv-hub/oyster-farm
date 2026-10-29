import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, SizeChip, StatusBadge } from '../components/bits';
import { useSatki } from '../data/hooks';
import { formatPositionShort } from '../domain/position';
import { displayCode } from '../domain/satka';
import { searchSatki } from '../domain/search';
import { t } from '../i18n/bg';

export function SearchPage() {
  const [q, setQ] = useState('');
  const satki = useSatki();
  const results = useMemo(() => searchSatki(satki ?? [], q), [satki, q]);

  return (
    <>
      <AppBar title={t.nav.search} />
      <div className="page">
        <label className="field">Номер на сатка
          <input type="search" inputMode="numeric" className="big-input" placeholder="напр. 12 или SAT-00012"
            value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
        <Link to="/scan" className="btn"><span className="ico">📷</span>{t.nav.scan}</Link>
        <div className="list" aria-live="polite">
          {q && results.length === 0 && <p className="muted">Няма сатка с такъв номер.</p>}
          {results.map((s) => (
            <Link key={s.id} to={`/satka/${s.id}`} className={`list-item ${s.archivedAt ? 'archived' : ''}`}>
              <span className="stack" style={{ gap: 4 }}>
                <span className="code">{displayCode(s)}</span>
                <span className="muted small">{s.archivedAt ? `Архивирана · последно ${formatPositionShort(s.position)}` : formatPositionShort(s.position)}</span>
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
