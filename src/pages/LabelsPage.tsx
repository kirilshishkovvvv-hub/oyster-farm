import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppBar } from '../components/bits';
import { useQrDataUrl } from '../components/QrImage';
import { SIZE_INFO } from '../config/categories';
import { LINE_COUNT } from '../config/farm';
import { useSatki } from '../data/hooks';
import { formatPositionShort } from '../domain/position';
import type { Satka } from '../domain/satka';

function Label({ s }: { s: Satka & { code: string } }) {
  const url = useQrDataUrl(s.code, 300);
  return (
    <div className="label">
      {url && <img src={url} alt="" />}
      <span className="code">{s.code}</span>
      <span style={{ fontSize: '9pt' }}>{formatPositionShort(s.position)} · {SIZE_INFO[s.size].label}</span>
    </div>
  );
}

/** Printable A4 sheet of QR labels: one satka (?ids=…) or a whole line. */
export default function LabelsPage() {
  const [params] = useSearchParams();
  const ids = params.get('ids')?.split(',').filter(Boolean) ?? [];
  const satki = useSatki() ?? [];
  const [line, setLine] = useState<number>(ids.length ? 0 : 1);

  const chosen = useMemo(() => satki
    .filter((s): s is Satka & { code: string } => !!s.code && !s.archivedAt)
    .filter((s) => (ids.length ? ids.includes(s.id) : s.position?.line === line))
    .sort((a, b) => (a.position!.section - b.position!.section) || (a.position!.slot - b.position!.slot)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [satki, line, params]);

  return (
    <>
      <AppBar title="QR етикети" />
      <div className="page">
        <div className="no-print stack">
          {!ids.length && (
            <label className="field">Етикети за линия
              <select value={line} onChange={(e) => setLine(Number(e.target.value))}>
                {Array.from({ length: LINE_COUNT }, (_, i) => <option key={i} value={i + 1}>Линия {i + 1}</option>)}
              </select>
            </label>
          )}
          <p className="muted" style={{ margin: 0 }}>
            {chosen.length} етикета. Сатки без постоянен номер (несинхронизирани) не се показват. Препоръчително: водоустойчиви етикети или ламиниране.
          </p>
          <button className="btn primary" onClick={() => window.print()} disabled={!chosen.length}>🖨️ Печат</button>
        </div>
        <div className="label-sheet">{chosen.map((s) => <Label key={s.id} s={s} />)}</div>
      </div>
    </>
  );
}
