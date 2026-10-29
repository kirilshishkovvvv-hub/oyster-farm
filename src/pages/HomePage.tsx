import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { InstallButton } from '../components/InstallButton';
import { SyncIndicator } from '../components/SyncIndicator';
import { demoMode } from '../data/demo';
import { useRecentEvents, useSatki } from '../data/hooks';
import { formatDateTime } from '../domain/dates';
import { t } from '../i18n/bg';
import { EventLine } from './SatkaPage';

export function HomePage() {
  const { isAdmin, userName, signOut } = useAuth();
  const satki = useSatki() ?? [];
  const active = satki.filter((s) => !s.archivedAt).length;
  const recent = useRecentEvents(8) ?? [];
  const codeOf = new Map(satki.map((s) => [s.id, s]));

  return (
    <>
      <div className="home-hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>🦪 {t.appName}</h1>
          <SyncIndicator />
        </div>
        <span>{active} активни сатки · {userName}</span>
      </div>
      <div className="page">
        {demoMode && <div className="banner warn">ДЕМО режим — примерни данни само на това устройство, без сървър.</div>}
        <Link className="btn big primary" to="/scan"><span className="ico">📷</span>{t.nav.scan}</Link>
        <Link className="btn big primary" to="/search"><span className="ico">🔎</span>{t.nav.search}</Link>
        <Link className="btn big" to="/map"><span className="ico">🗺️</span>{t.nav.map}</Link>
        <Link className="btn big" to="/inventory"><span className="ico">📋</span>{t.nav.inventory}</Link>
        <Link className="btn big" to="/add"><span className="ico">➕</span>{t.nav.add}</Link>
        {isAdmin && <Link className="btn big" to="/admin"><span className="ico">⚙️</span>{t.nav.admin}</Link>}
        <InstallButton />

        <section className="stack" aria-label={t.nav.recent}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 8 }}>{t.nav.recent}</h2>
          {recent.length === 0 && <p className="muted">Все още няма записани действия.</p>}
          {recent.map((e) => {
            const s = codeOf.get(e.satkaId);
            return (
              <Link key={e.id} to={`/satka/${e.satkaId}`} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <EventLine event={e} code={s ? (s.code ?? 'НОВА') : '…'} />
                <span className="muted small">{formatDateTime(e.performedAt)}</span>
              </Link>
            );
          })}
        </section>

        <button className="btn" onClick={() => void signOut()} style={{ marginTop: 16 }}>Изход</button>
      </div>
    </>
  );
}
