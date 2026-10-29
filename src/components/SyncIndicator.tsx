import { useNavigate } from 'react-router-dom';
import { useOutbox, useSyncStatus } from '../data/hooks';
import { t } from '../i18n/bg';

/** Always-visible connection + pending-changes pill; tap for details. */
export function SyncIndicator() {
  const status = useSyncStatus();
  const outbox = useOutbox() ?? [];
  const navigate = useNavigate();
  const failed = outbox.filter((e) => e.state === 'failed').length;
  const pending = outbox.length - failed;

  let label = status.online ? t.sync.online : t.sync.offline;
  if (status.syncing) label = '⟳';
  if (pending) label = `${status.online ? '' : t.sync.offline + ' · '}${pending} ⏳`;
  if (failed) label = `⚠ ${failed}`;

  const cls = failed ? 'problem' : status.online ? '' : 'offline';
  const title = failed ? t.sync.failed(failed) : pending ? t.sync.pending(pending) : t.sync.allSaved;
  return (
    <button className={`sync-pill ${cls}`} onClick={() => navigate('/sync')} title={title} aria-label={`${t.nav.sync}: ${title}`}>
      <span className="dot" aria-hidden />
      {label}
    </button>
  );
}
