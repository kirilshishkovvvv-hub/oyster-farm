import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { SIZE_INFO } from '../config/categories';
import { SECTION_COUNT, SLOTS_PER_SECTION, SLOT_NAMES } from '../config/farm';
import type { FarmSettings, Line } from '../data/types';
import { buoyLatLngs, slotLatLng, type LineGps } from '../domain/geometry';
import { positionKey, type Position } from '../domain/position';
import { displayCode, type Satka } from '../domain/satka';

export function lineGps(l: Line): LineGps | null {
  if (l.startLat == null || l.startLng == null || l.endLat == null || l.endLng == null) return null;
  return { start: { lat: l.startLat, lng: l.startLng }, end: { lat: l.endLat, lng: l.endLng } };
}

const SLOT_MIN_ZOOM = 19;

// A buoy: a round orange-and-black striped marker.
const BUOY_ICON = L.divIcon({
  className: '',
  html: '<svg width="14" height="14" viewBox="0 0 14 14">'
    + '<defs><clipPath id="buoy-clip"><circle cx="7" cy="7" r="6.5"/></clipPath></defs>'
    + '<g clip-path="url(#buoy-clip)">'
    + '<rect width="14" height="14" fill="#f97316"/>'
    + '<path d="M-2 4 L16 -4 L16 1 L-2 9Z M-2 13 L16 5 L16 9 L-2 17Z" fill="#111827"/>'
    + '</g>'
    + '<circle cx="7" cy="7" r="6.5" fill="none" stroke="#111827" stroke-width="1"/>'
    + '</svg>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/** The farm on the real map (OpenStreetMap). */
export function GeoMap({
  lines, settings, satki, focusId, onSlotTap,
}: {
  lines: Line[];
  settings: FarmSettings;
  satki: Satka[];
  focusId?: string | null;
  onSlotTap(pos: Position, satka: Satka | undefined): void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const farmLayer = useRef<L.LayerGroup | null>(null);
  const slotLayer = useRef<L.LayerGroup | null>(null);
  const placed = useRef<string | null>(null);
  const tapRef = useRef(onSlotTap);
  useEffect(() => {
    tapRef.current = onSlotTap;
  }, [onSlotTap]);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, maxZoom: 22, attributionControl: true })
      .setView([settings.centerLat, settings.centerLng], 16);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    // Leaflet's default attribution prefix shows a Ukrainian flag; the farm app shows no flag.
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    farmLayer.current = L.layerGroup().addTo(m);
    slotLayer.current = L.layerGroup();
    const toggleSlots = () => {
      if (m.getZoom() >= SLOT_MIN_ZOOM) slotLayer.current!.addTo(m);
      else slotLayer.current!.remove();
    };
    m.on('zoomend', toggleSlots);
    map.current = m;
    // Leaflet sizes its drawing layer when the map is created. If the container
    // gets its real size later, the lines would collapse, so re-measure on resize.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // The map is created once; later prop changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const farm = farmLayer.current;
    const slots = slotLayer.current;
    if (!m || !farm || !slots) return;
    farm.clearLayers();
    slots.clearLayers();

    const occ = new Map<string, Satka>();
    for (const s of satki) if (!s.archivedAt && s.position) occ.set(positionKey(s.position), s);

    const bounds: L.LatLngExpression[] = [];
    let focusAt: L.LatLng | null = null;
    for (const line of lines) {
      const gps = lineGps(line);
      if (!gps) continue;
      const buoys = buoyLatLngs(gps, settings.gapsM);
      bounds.push(buoys[0], buoys[buoys.length - 1]);
      L.polyline(buoys, { color: '#0b4f6c', weight: 3, smoothFactor: 0 }).addTo(farm);
      buoys.forEach((b, i) =>
        L.marker(b, { icon: BUOY_ICON })
          .bindTooltip(`${line.label} · Ш${i + 1}`)
          .addTo(farm),
      );
      L.marker(buoys[0], {
        icon: L.divIcon({ className: '', html: `<div class="size-chip" style="background:#fff;color:#0b1620">Л${line.no}</div>`, iconAnchor: [14, 14] }),
        interactive: false,
      }).addTo(farm);

      for (let section = 1; section <= SECTION_COUNT; section++)
        for (let slot = 1; slot <= SLOTS_PER_SECTION; slot++) {
          const pos = { line: line.no, section, slot };
          const s = occ.get(positionKey(pos));
          const ll = slotLatLng(gps, settings.gapsM, pos);
          const info = s ? SIZE_INFO[s.size] : null;
          const mk = L.circleMarker(ll, {
            radius: 7, weight: s?.status === 'on_land' ? 3 : 1.5, color: '#0b1620',
            dashArray: s ? undefined : '3 3', fillColor: info?.color ?? '#ffffff', fillOpacity: s ? 1 : 0.6,
          });
          mk.bindTooltip(s ? `${displayCode(s)} · ${info!.label}` : `Свободна · С${section} · ${SLOT_NAMES[slot]}`);
          mk.on('click', () => tapRef.current(pos, s));
          mk.addTo(slots);
          if (s && s.id === focusId) focusAt = L.latLng(ll.lat, ll.lng);
        }
    }

    // Position the view once (or when the focus changes), not on every data sync.
    const viewKey = `${focusId ?? ''}|${bounds.length}`;
    if (placed.current !== viewKey) {
      placed.current = viewKey;
      if (focusAt) m.setView(focusAt, 21);
      else if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [lines, settings, satki, focusId]);

  // Fills the map page (the parent is position: relative).
  // zIndex 0 keeps Leaflet's panes (z-index 400) below the app bar.
  return <div ref={el} className="map-area" style={{ position: 'absolute', inset: 0, minHeight: 0, zIndex: 0 }} />;
}
