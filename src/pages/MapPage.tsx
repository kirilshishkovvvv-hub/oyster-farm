import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppBar } from '../components/bits';
import { SIZE_INFO, SIZES } from '../config/categories';
import { useLines, useSatki, useSettings } from '../data/hooks';
import type { Position } from '../domain/position';
import type { Satka } from '../domain/satka';
import { t } from '../i18n/bg';
import { Compass } from '../map/Compass';
import { GeoMap, lineGps } from '../map/GeoMap';

/** The farm on the real map (OpenStreetMap). */
export default function MapPage() {
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const satki = useSatki() ?? [];
  const lines = useLines() ?? [];
  const settings = useSettings();
  const navigate = useNavigate();
  const [legend, setLegend] = useState(false);

  const anyGps = lines.some((l) => lineGps(l));

  const onSlotTap = useCallback((pos: Position, s: Satka | undefined) => {
    if (s) navigate(`/satka/${s.id}`);
    else navigate(`/add?line=${pos.line}&section=${pos.section}&slot=${pos.slot}`);
  }, [navigate]);

  return (
    <div className="map-page" style={{ height: '100dvh' }}>
      <AppBar title={t.nav.map} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
        <GeoMap lines={lines} settings={settings} satki={satki} focusId={focusId} onSlotTap={onSlotTap} />

        {/* Top-left: compass only — nothing else may cover it. The real map is north-up. */}
        <div className="map-overlay map-compass"><Compass rotationDeg={0} /></div>

        {/* Top-right: legend. */}
        <div className="map-overlay map-legend-btn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <button className="icon-btn" aria-expanded={legend} onClick={() => setLegend(!legend)}>{legend ? '✕' : 'ℹ️'} Легенда</button>
          {legend && (
            <div className="legend">
              {SIZES.map((s) => (
                <div key={s}>
                  <span className="sw" style={{ background: SIZE_INFO[s].color, border: '1px solid rgba(0,0,0,.4)' }} />
                  {SIZE_INFO[s].letter} — {SIZE_INFO[s].label}
                </div>
              ))}
              <div><span className="sw" style={{ background: '#fff', border: '2px dashed #7b8a97' }} />Свободна позиция</div>
              <div><span className="sw" style={{ background: '#ccc', border: '2px dashed #000' }} />На суша (дебела пунктирна рамка)</div>
              <div><span className="sw" style={{ background: 'repeating-linear-gradient(45deg, #f97316 0 3px, #111827 3px 6px)', borderRadius: '50%' }} />Шамандура (Ш)</div>
              <div className="muted">Докоснете празна позиция, за да добавите сатка.</div>
            </div>
          )}
        </div>

        {!anyGps && (
          <div className="map-overlay banner warn" style={{ top: 100, left: 12, right: 12 }}>
            Линиите още нямат GPS координати. Администраторът може да ги въведе в Админ → Ферма и линии.
          </div>
        )}
      </div>
    </div>
  );
}
