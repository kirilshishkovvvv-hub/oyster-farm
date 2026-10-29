import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AppBar, Loading } from '../components/bits';
import { PositionPicker } from '../components/pickers';
import { useUi } from '../components/UiProvider';
import { newId, nowISO, perform } from '../data/actions';
import { useOccupancy, useSatka, useSatki } from '../data/hooks';
import { formatPosition, positionKey, samePosition, type Position } from '../domain/position';
import { displayCode } from '../domain/satka';
import { errorText, t } from '../i18n/bg';

export function MovePage() {
  const { id } = useParams();
  const satka = useSatka(id);
  const occupancy = useOccupancy(useSatki());
  const { userName } = useAuth();
  const { toast, confirm } = useUi();
  const navigate = useNavigate();
  const [target, setTarget] = useState<Position | null>(null);

  if (satka === undefined) return <Loading />;
  if (!satka || satka.archivedAt || !satka.position) return <Navigate to={id ? `/satka/${id}` : '/'} replace />;

  const value = target ?? satka.position;
  const occupant = occupancy.get(positionKey(value));
  const swapWith = occupant && occupant.id !== satka.id ? occupant : null;
  const unchanged = samePosition(value, satka.position);

  const save = async () => {
    const ok = await confirm({
      title: swapWith ? 'Размяна на сатки' : t.actions.move,
      text: swapWith
        ? `${displayCode(satka)} отива на ${formatPosition(value)}, а ${displayCode(swapWith)} — на ${formatPosition(satka.position)}.`
        : `${displayCode(satka)}: ${formatPosition(satka.position)} → ${formatPosition(value)}`,
    });
    if (!ok) return;
    try {
      toast(await perform({ kind: 'move', opId: newId(), satkaId: satka.id, position: value, swap: !!swapWith, performedAt: nowISO(), note: '' }, userName));
      navigate(`/satka/${satka.id}`, { replace: true });
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <>
      <AppBar title={`${t.actions.move} ${displayCode(satka)}`} />
      <div className="page">
        <div className="banner info">Сега: {formatPosition(satka.position)}</div>
        <PositionPicker value={value} onChange={setTarget} occupancy={occupancy} selfId={satka.id} allowOccupied />
        {swapWith && <div className="banner warn">Позицията е заета от {displayCode(swapWith)} — двете сатки ще си разменят местата.</div>}
        <button className="btn primary" disabled={unchanged} onClick={() => void save()}>
          {swapWith ? 'Размени' : t.actions.move} → {formatPosition(value)}
        </button>
      </div>
    </>
  );
}
