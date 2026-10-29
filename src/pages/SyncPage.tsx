import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar } from '../components/bits';
import { PositionPicker } from '../components/pickers';
import { useUi } from '../components/UiProvider';
import { useOccupancy, useOutbox, useSatki, useSyncStatus } from '../data/hooks';
import { discard, retry } from '../data/outbox';
import { demoMode } from '../data/demo';
import { setDemoOnline, syncNow } from '../data/sync';
import type { OutboxEntry } from '../data/types';
import { formatDateTime } from '../domain/dates';
import { formatPosition, type Position } from '../domain/position';
import { displayCode } from '../domain/satka';
import { t } from '../i18n/bg';

const OP_LABEL: Record<OutboxEntry['op']['kind'], string> = {
  create: 'Нова сатка', process: 'Обработка', move: 'Преместване', archive: 'Архивиране', correct: 'Корекция',
};

export function SyncPage() {
  const status = useSyncStatus();
  const outbox = useOutbox() ?? [];
  const satki = useSatki() ?? [];
  const byId = new Map(satki.map((s) => [s.id, s]));
  const failed = outbox.filter((e) => e.state === 'failed');
  const pending = outbox.filter((e) => e.state === 'pending');
  const label = (e: OutboxEntry) => {
    const s = byId.get(e.op.satkaId);
    return displayCode(s ?? { id: e.op.satkaId, code: null });
  };

  return (
    <>
      <AppBar title={t.nav.sync} />
      <div className="page">
        <div className="card">
          <dl className="info">
            <dt>Връзка</dt><dd>{status.online ? t.sync.online : t.sync.offline}</dd>
            <dt>Последна синхронизация</dt><dd>{formatDateTime(status.lastSyncAt)}</dd>
            <dt>Чакат изпращане</dt><dd>{pending.length}</dd>
            <dt>Проблеми</dt><dd>{failed.length}</dd>
          </dl>
        </div>
        {demoMode && (
          <div className="grid2">
            <button className={`btn ${status.online ? 'primary' : ''}`} onClick={() => setDemoOnline(true)}>Демо: има връзка</button>
            <button className={`btn ${!status.online ? 'primary' : ''}`} onClick={() => setDemoOnline(false)}>Демо: без връзка</button>
          </div>
        )}
        {!status.online && <div className="banner warn">Няма връзка. Промените са запазени на телефона и ще се изпратят автоматично, когато има интернет.</div>}
        {status.error && status.online && <div className="banner warn">Последен опит: {status.error}</div>}
        <button className="btn primary" disabled={status.syncing || !status.online} onClick={() => void syncNow()}>
          🔄 {status.syncing ? t.sync.syncing : 'Синхронизирай сега'}
        </button>

        {failed.length > 0 && <h2 style={{ fontSize: '1.1rem' }}>Проблеми — изискват решение</h2>}
        {failed.map((e) => <FailedOp key={e.seq} entry={e} label={label(e)} />)}

        {pending.length > 0 && <h2 style={{ fontSize: '1.1rem' }}>Чакат изпращане</h2>}
        {pending.map((e) => (
          <div key={e.seq} className="history-item pending">
            <div className="hd"><span>{OP_LABEL[e.op.kind]}</span><span className="code">{label(e)}</span></div>
            <div className="muted small">{formatDateTime(e.createdAt)}</div>
          </div>
        ))}
        {outbox.length === 0 && <div className="banner info">✓ {t.sync.allSaved}</div>}
      </div>
    </>
  );
}

function FailedOp({ entry, label }: { entry: OutboxEntry; label: string }) {
  const { confirm, toast } = useUi();
  const occupancy = useOccupancy(useSatki());
  const op = entry.op;
  const canRepick = entry.error === 'POSITION_TAKEN' && (op.kind === 'create' || op.kind === 'move');
  const [picking, setPicking] = useState(false);
  const [pos, setPos] = useState<Position>(op.kind === 'create' || op.kind === 'move' ? op.position : { line: 1, section: 1, slot: 1 });

  const doRetry = async (edited?: typeof op) => {
    await retry(entry.seq!, edited);
    void syncNow();
    toast('Изпраща се отново.');
  };
  const doDiscard = async () => {
    const ok = await confirm({
      title: 'Отказ от промяната',
      text: op.kind === 'create'
        ? 'Новата сатка и всички промени по нея от този телефон ще бъдат премахнати.'
        : 'Тази промяна няма да бъде записана.',
      okLabel: 'Откажи промяната',
      danger: true,
    });
    if (ok) await discard(entry.seq!);
  };

  return (
    <div className="card stack">
      <div className="hd row" style={{ justifyContent: 'space-between' }}>
        <b>{OP_LABEL[op.kind]} · <span className="code">{label}</span></b>
        <span className="muted small">{formatDateTime(entry.createdAt)}</span>
      </div>
      <div className="banner danger">{entry.error ? t.errors[entry.error] : 'Неизвестна грешка'}</div>
      {(op.kind === 'create' || op.kind === 'move') && <p className="muted" style={{ margin: 0 }}>Желана позиция: {formatPosition(op.position)}</p>}
      {canRepick && !picking && <button className="btn primary" onClick={() => setPicking(true)}>Избери друга позиция</button>}
      {picking && (op.kind === 'create' || op.kind === 'move') && (
        <>
          <PositionPicker value={pos} onChange={setPos} occupancy={occupancy} selfId={op.satkaId} />
          <button className="btn primary" onClick={() => void doRetry({ ...op, position: pos })}>Запази с {formatPosition(pos)}</button>
        </>
      )}
      {op.kind !== 'create' && <Link className="btn" to={`/satka/${op.satkaId}`}>Отвори сатката</Link>}
      <div className="grid2">
        <button className="btn" onClick={() => void doRetry()}>Опитай пак</button>
        <button className="btn danger-outline" onClick={() => void doDiscard()}>Откажи</button>
      </div>
    </div>
  );
}
