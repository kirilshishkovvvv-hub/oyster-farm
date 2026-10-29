import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AppBar, Loading, SizeChip, StatusBadge } from '../components/bits';
import { SizePicker, StatusPicker } from '../components/pickers';
import { QrImage } from '../components/QrImage';
import { useUi } from '../components/UiProvider';
import { ARCHIVE_REASONS, SIZE_INFO, STATUS_LABEL, type Size, type Status } from '../config/categories';
import { newId, nowISO, perform } from '../data/actions';
import { useEvents, useOutbox, useSatka, useSatkaByCode } from '../data/hooks';
import { fetchFullHistory } from '../data/sync';
import { formatDate, formatDateTime, todayISO } from '../domain/dates';
import { formatPosition, formatPositionShort } from '../domain/position';
import { displayCode, type Satka, type SatkaEvent } from '../domain/satka';
import { errorText, t } from '../i18n/bg';

/** /s/SAT-00012 — the address inside QR labels. */
export function SatkaByCode() {
  const { code } = useParams();
  const satka = useSatkaByCode(code?.toUpperCase());
  if (satka === undefined) return <Loading />;
  if (satka) return <Navigate to={`/satka/${satka.id}`} replace />;
  return (
    <>
      <AppBar title={code} />
      <div className="page">
        <div className="banner warn">Сатка {code} не е намерена на това устройство. Ако е добавена току-що от друг телефон, изчакайте синхронизация.</div>
        <Link to="/search" className="btn primary">{t.nav.search}</Link>
      </div>
    </>
  );
}

type Panel = 'none' | 'process' | 'archive' | 'correct' | 'qr';

export function SatkaPage() {
  const { id } = useParams();
  const satka = useSatka(id);
  const events = useEvents(id) ?? [];
  const { isAdmin } = useAuth();
  const [panel, setPanel] = useState<Panel>('none');
  const navigate = useNavigate();

  if (satka === undefined) return <Loading />;
  if (satka === null) return <Navigate to="/search" replace />;

  const archived = !!satka.archivedAt;
  const toggle = (p: Panel) => setPanel(panel === p ? 'none' : p);
  const done = () => setPanel('none');

  return (
    <>
      <AppBar title={<span className="code">{displayCode(satka)}</span>} />
      <div className="page">
        {!satka.code && <div className="banner warn">Новата сатка ще получи постоянен номер при синхронизация.</div>}
        {archived && <div className="banner danger">Архивирана на {formatDate(satka.archivedAt)} · {satka.archiveReason}</div>}

        <div className="card">
          <dl className="info">
            <dt>{t.fields.size}</dt><dd><SizeChip size={satka.size} /></dd>
            <dt>{t.fields.status}</dt><dd><StatusBadge status={satka.status} archived={archived} /></dd>
            <dt>{archived ? 'Последна позиция' : t.fields.position}</dt><dd>{formatPosition(satka.position)}</dd>
            <dt>{t.fields.lastProcessed}</dt><dd>{formatDate(satka.lastProcessedOn)}</dd>
          </dl>
        </div>

        {!archived && (
          <>
            <button className={`btn big primary ${panel === 'process' ? 'selected' : ''}`} onClick={() => toggle('process')}>
              <span className="ico">🧺</span>{t.actions.process}
            </button>
            {panel === 'process' && <ProcessPanel satka={satka} onDone={done} />}
            <button className="btn big" onClick={() => navigate(`/satka/${satka.id}/move`)}>
              <span className="ico">↔️</span>{t.actions.move}
            </button>
          </>
        )}
        <div className="grid2">
          <Link className="btn" to={`/map?focus=${satka.id}`}>🗺️ {t.actions.showOnMap}</Link>
          <button className="btn" onClick={() => toggle('qr')}>🔳 {t.actions.showQr}</button>
        </div>
        {panel === 'qr' && (
          <div className="card stack" style={{ alignItems: 'center' }}>
            {satka.code ? (
              <>
                <QrImage code={satka.code} />
                <span className="code big-code">{satka.code}</span>
                <Link className="btn" to={`/labels?ids=${satka.id}`}>🖨️ {t.actions.printLabel}</Link>
              </>
            ) : (
              <p className="muted">QR кодът ще е готов след синхронизация.</p>
            )}
          </div>
        )}
        {isAdmin && (
          <>
            <button className="btn" onClick={() => toggle('correct')}>✏️ {t.actions.correct}</button>
            {panel === 'correct' && <CorrectPanel satka={satka} onDone={done} />}
          </>
        )}
        {!archived && (
          <>
            <button className="btn danger-outline" onClick={() => toggle('archive')}>🗄️ {t.actions.archive}</button>
            {panel === 'archive' && <ArchivePanel satka={satka} onDone={done} />}
          </>
        )}

        <History satkaId={satka.id} events={events} />
      </div>
    </>
  );
}

function ProcessPanel({ satka, onDone }: { satka: Satka; onDone(): void }) {
  const { userName } = useAuth();
  const { toast } = useUi();
  const [status, setStatus] = useState<Status>(satka.status);
  const [size, setSize] = useState<Size>(satka.size);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');

  const save = async () => {
    try {
      const msg = await perform({
        kind: 'process', opId: newId(), satkaId: satka.id, status, size: size === satka.size ? null : size,
        processedOn: date, performedAt: nowISO(), note: note.trim(),
      }, userName);
      toast(msg);
      onDone();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <div className="card stack">
      <StatusPicker value={status} onChange={setStatus} />
      <SizePicker value={size} onChange={setSize} />
      <label className="field">{t.fields.date}
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">{t.fields.note}
        <input type="text" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn primary" onClick={() => void save()}>{t.save}</button>
    </div>
  );
}

function ArchivePanel({ satka, onDone }: { satka: Satka; onDone(): void }) {
  const { userName } = useAuth();
  const { toast, confirm } = useUi();
  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');
  const finalReason = reason === 'other' ? other.trim() : reason;

  const save = async () => {
    if (!finalReason) return toast(t.errors.REASON_REQUIRED, 'error');
    const ok = await confirm({
      title: `Архивиране на ${displayCode(satka)}`,
      text: `Причина: ${finalReason}. Сатката ще бъде премахната от позицията си. Номерът ѝ никога няма да се използва отново. Това не може да се отмени.`,
      okLabel: t.actions.archive,
      danger: true,
    });
    if (!ok) return;
    try {
      toast(await perform({ kind: 'archive', opId: newId(), satkaId: satka.id, reason: finalReason, performedAt: nowISO(), note: '' }, userName));
      onDone();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <div className="card stack">
      <fieldset>
        <legend>{t.fields.reason}</legend>
        <div className="stack">
          {[...ARCHIVE_REASONS, 'other'].map((r) => (
            <button key={r} type="button" className={`btn ${reason === r ? 'primary selected' : ''}`} onClick={() => setReason(r)}>
              {r === 'other' ? 'Друга причина' : r}
            </button>
          ))}
        </div>
      </fieldset>
      {reason === 'other' && (
        <input type="text" placeholder="Опишете причината" value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} />
      )}
      <button className="btn danger" onClick={() => void save()}>{t.actions.archive}</button>
    </div>
  );
}

function CorrectPanel({ satka, onDone }: { satka: Satka; onDone(): void }) {
  const { userName } = useAuth();
  const { toast } = useUi();
  const [size, setSize] = useState<Size>(satka.size);
  const [status, setStatus] = useState<Status>(satka.status);
  const [date, setDate] = useState(satka.lastProcessedOn);
  const [reason, setReason] = useState('');

  const save = async () => {
    if (!reason.trim()) return toast(t.errors.REASON_REQUIRED, 'error');
    try {
      toast(await perform({ kind: 'correct', opId: newId(), satkaId: satka.id, size, status, processedOn: date, reason: reason.trim() }, userName));
      onDone();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <div className="card stack">
      <p className="muted small" style={{ margin: 0 }}>Корекцията поправя грешно въведени данни и се записва в историята с причина.</p>
      <SizePicker value={size} onChange={setSize} />
      <StatusPicker value={status} onChange={setStatus} />
      <label className="field">{t.fields.lastProcessed}
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">{t.fields.reason}
        <input type="text" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="напр. грешно избран размер" />
      </label>
      <button className="btn primary" onClick={() => void save()}>{t.save}</button>
    </div>
  );
}

function History({ satkaId, events }: { satkaId: string; events: SatkaEvent[] }) {
  const outbox = useOutbox() ?? [];
  const failed = new Set(outbox.filter((e) => e.state === 'failed').map((e) => e.opId));
  const [loaded, setLoaded] = useState(false);
  const { toast } = useUi();
  useEffect(() => setLoaded(false), [satkaId]);

  const loadAll = async () => {
    try {
      await fetchFullHistory(satkaId);
      setLoaded(true);
    } catch {
      toast('Няма връзка — пълната история изисква интернет.', 'error');
    }
  };

  return (
    <section className="stack" aria-label={t.actions.history}>
      <h2 style={{ fontSize: '1.1rem', marginTop: 8 }}>{t.actions.history}</h2>
      {events.length === 0 && <p className="muted">Няма записи.</p>}
      {events.map((e) => (
        <div key={e.id} className={`history-item ${e.pending ? 'pending' : ''}`}>
          <EventLine event={e} />
          <div className="muted small">
            {formatDateTime(e.performedAt)}{e.userName ? ` · ${e.userName}` : ''}
            {e.pending && (failed.has(e.id) ? ' · ⚠ проблем при синхронизация' : ' · ⏳ чака изпращане')}
          </div>
        </div>
      ))}
      {!loaded && <button className="link-btn" onClick={() => void loadAll()}>Покажи цялата история</button>}
    </section>
  );
}

/** One-line human description of a history event. */
export function EventLine({ event: e, code }: { event: SatkaEvent; code?: string }) {
  const parts: string[] = [];
  const a = e.after ?? {};
  const b = e.before ?? {};
  switch (e.kind) {
    case 'created':
      if (a.size) parts.push(SIZE_INFO[a.size].label);
      if (a.position) parts.push(formatPositionShort(a.position));
      break;
    case 'processed':
      if (a.status) parts.push(STATUS_LABEL[a.status]);
      if (a.size && b.size && a.size !== b.size) parts.push(`${SIZE_INFO[b.size].label} → ${SIZE_INFO[a.size].label}`);
      if (a.lastProcessedOn) parts.push(formatDate(a.lastProcessedOn));
      break;
    case 'moved':
      parts.push(`${formatPositionShort(b.position)} → ${formatPositionShort(a.position)}`);
      break;
    case 'archived':
      if (a.archiveReason) parts.push(a.archiveReason);
      break;
    case 'corrected':
      if (a.size && b.size !== a.size) parts.push(`размер ${b.size ? SIZE_INFO[b.size].label : '?'} → ${SIZE_INFO[a.size].label}`);
      if (a.status && b.status !== a.status) parts.push(`състояние ${b.status ? STATUS_LABEL[b.status] : '?'} → ${STATUS_LABEL[a.status]}`);
      if (a.lastProcessedOn && b.lastProcessedOn !== a.lastProcessedOn) parts.push(`дата ${formatDate(b.lastProcessedOn)} → ${formatDate(a.lastProcessedOn)}`);
      break;
  }
  if (e.note) parts.push(`„${e.note}“`);
  return (
    <div className="hd">
      <span>{code ? <span className="code">{code} </span> : null}{t.events[e.kind]}</span>
      <span className="muted" style={{ fontWeight: 600, textAlign: 'right' }}>{parts.join(' · ')}</span>
    </div>
  );
}
