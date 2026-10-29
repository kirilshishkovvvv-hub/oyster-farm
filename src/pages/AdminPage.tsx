import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AppBar } from '../components/bits';
import { useUi } from '../components/UiProvider';
import { SIZE_INFO, STATUS_LABEL } from '../config/categories';
import { DEFAULT_GAPS_M, SECTION_COUNT } from '../config/farm';
import { demoMode } from '../data/demo';
import { useLines, useSettings, useSyncStatus } from '../data/hooks';
import { db } from '../data/localDb';
import { profileFromRow } from '../data/mappers';
import { callRpc, resetCursors, syncNow } from '../data/sync';
import { supabase } from '../data/supabase';
import type { Line, Profile, Role } from '../data/types';
import { lineLength } from '../domain/geometry';
import { todayISO } from '../domain/dates';
import { errorText } from '../i18n/bg';

type Tab = 'users' | 'farm' | 'backup';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const { online } = useSyncStatus();
  return (
    <>
      <AppBar title="Админ" />
      <div className="page">
        <div className="tabs" role="tablist">
          {([['users', '👥 Потребители'], ['farm', '🧭 Ферма и линии'], ['backup', '💾 Резервно копие']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {!online && <div className="banner warn">Админ промените изискват интернет връзка.</div>}
        {tab === 'users' && <UsersTab />}
        {tab === 'farm' && <FarmTab />}
        {tab === 'backup' && <BackupTab />}
        <Link to="/labels" className="btn">🖨️ QR етикети за печат</Link>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function UsersTab() {
  const [users, setUsers] = useState<Profile[] | null>(null);
  const { toast } = useUi();
  const { profile: me } = useAuth();

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) return toast('Няма връзка със сървъра.', 'error');
    setUsers(data.map(profileFromRow));
  };
  useEffect(() => {
    if (!demoMode) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (u: Profile, patch: Partial<Profile>) => {
    const next = { ...u, ...patch };
    try {
      await callRpc('set_user', { p_user_id: u.id, p_name: next.name, p_role: next.role, p_active: next.active });
      toast('Запазено.');
      void load();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  if (demoMode) return <div className="banner info">В демо режим няма сървър и потребители. Админ промените изискват истинска връзка със Supabase.</div>;
  if (!users) return <p className="muted">Зареждане…</p>;
  const waiting = users.filter((u) => !u.active);
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Нови работници създават профил от екрана за вход („Създайте нов“). След това го одобрявате тук.
      </p>
      {waiting.length > 0 && <div className="banner info">{waiting.length} профил(а) чакат одобрение.</div>}
      {users.map((u) => <UserCard key={u.id} user={u} isMe={u.id === me?.id} onSave={save} />)}
    </div>
  );
}

function UserCard({ user, isMe, onSave }: { user: Profile; isMe: boolean; onSave(u: Profile, p: Partial<Profile>): void }) {
  const [name, setName] = useState(user.name);
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{user.email}{isMe ? ' (вие)' : ''}</b>
        <span className={`status-badge ${user.active ? 'status-newly_sorted' : 'status-on_land'}`}>{user.active ? 'Активен' : 'Чака одобрение'}</span>
      </div>
      <label className="field">Име
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button className="btn compact" disabled={name === user.name} onClick={() => onSave(user, { name })}>Запази</button>
        </div>
      </label>
      <div className="grid2">
        {(['worker', 'admin'] as Role[]).map((r) => (
          <button key={r} className={`btn ${user.role === r ? 'primary' : ''}`} onClick={() => user.role !== r && onSave(user, { role: r })}>
            {r === 'admin' ? 'Администратор' : 'Работник'}
          </button>
        ))}
      </div>
      {user.active
        ? <button className="btn danger-outline" onClick={() => onSave(user, { active: false })}>Спри достъпа</button>
        : <button className="btn primary" onClick={() => onSave(user, { active: true })}>✓ Одобри</button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function FarmTab() {
  const settings = useSettings();
  const lines = useLines() ?? [];
  const { toast } = useUi();
  const [heading, setHeading] = useState(String(settings.headingDeg));
  const [gaps, setGaps] = useState(settings.gapsM.map(String));
  const [center, setCenter] = useState({ lat: String(settings.centerLat), lng: String(settings.centerLng) });

  useEffect(() => {
    setHeading(String(settings.headingDeg));
    setGaps(settings.gapsM.map(String));
    setCenter({ lat: String(settings.centerLat), lng: String(settings.centerLng) });
  }, [settings]);

  const gapNums = gaps.map((g) => num(g) ?? NaN);
  const gapsValid = gapNums.length === SECTION_COUNT && gapNums.every((g) => g > 0 && g < 100);

  const saveSettings = async () => {
    const h = num(heading);
    const lat = num(center.lat);
    const lng = num(center.lng);
    if (h === null || Number.isNaN(h) || h < 0 || h >= 360) return toast('Посоката трябва да е между 0 и 359°.', 'error');
    if (!gapsValid) return toast('Всяко разстояние трябва да е между 0 и 100 м.', 'error');
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) return toast('Невалиден център.', 'error');
    try {
      await callRpc('update_settings', { p_heading_deg: h, p_gaps_m: gapNums, p_center_lat: lat, p_center_lng: lng });
      toast('Запазено.');
      void syncNow();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Ориентация и разстояния</h2>
        <label className="field">Посока на линиите (от шамандура 1 към 26), градуси
          <input type="number" min={0} max={359} value={heading} onChange={(e) => setHeading(e.target.value)} />
          <span className="muted small">180 = шамандура 1 е на север, линиите вървят на юг. 0 = обратното.</span>
        </label>
        <details>
          <summary className="link-btn" style={{ display: 'list-item' }}>Разстояния между шамандурите (м) — общо {gapsValid ? lineLength(gapNums) : '?'} м</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, marginTop: 8 }}>
            {gaps.map((g, i) => (
              <label key={i} className="small" style={{ fontWeight: 700 }}>Ш{i + 1}–Ш{i + 2}
                <input type="text" inputMode="decimal" value={g} onChange={(e) => setGaps(gaps.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
          </div>
          <button className="link-btn" onClick={() => setGaps(DEFAULT_GAPS_M.map(String))}>Върни стандартните (4 м в краищата, 6 м между останалите)</button>
        </details>
        <div className="grid2">
          <label className="field">Център (ширина)<input type="text" inputMode="decimal" value={center.lat} onChange={(e) => setCenter({ ...center, lat: e.target.value })} /></label>
          <label className="field">Център (дължина)<input type="text" inputMode="decimal" value={center.lng} onChange={(e) => setCenter({ ...center, lng: e.target.value })} /></label>
        </div>
        <button className="btn primary" onClick={() => void saveSettings()}>Запази</button>
      </div>
      <h2 style={{ fontSize: '1.05rem' }}>Линии — GPS на първата и последната шамандура</h2>
      {lines.map((l) => <LineCard key={l.no} line={l} />)}
    </div>
  );
}

function LineCard({ line }: { line: Line }) {
  const { toast } = useUi();
  const [f, setF] = useState({
    label: line.label, startLat: String(line.startLat ?? ''), startLng: String(line.startLng ?? ''),
    endLat: String(line.endLat ?? ''), endLng: String(line.endLng ?? ''),
  });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const vals = [num(f.startLat), num(f.startLng), num(f.endLat), num(f.endLng)];
    const allEmpty = vals.every((v) => v === null);
    const allSet = vals.every((v) => v !== null && !Number.isNaN(v));
    if (!allEmpty && !allSet) return toast('Попълнете и четирите координати или оставете всички празни.', 'error');
    if (allSet && (Math.abs(vals[0]!) > 90 || Math.abs(vals[2]!) > 90 || Math.abs(vals[1]!) > 180 || Math.abs(vals[3]!) > 180))
      return toast('Невалидни координати.', 'error');
    if (!f.label.trim()) return toast('Въведете име на линията.', 'error');
    try {
      await callRpc('update_line', {
        p_no: line.no, p_label: f.label.trim(), p_start_lat: vals[0], p_start_lng: vals[1], p_end_lat: vals[2], p_end_lng: vals[3],
      });
      toast('Запазено.');
      void syncNow();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <div className="card stack">
      <label className="field">Име на линия {line.no}<input type="text" value={f.label} maxLength={40} onChange={set('label')} /></label>
      <div className="grid2">
        <label className="field small">Ш1 ширина<input type="text" inputMode="decimal" placeholder="43.32…" value={f.startLat} onChange={set('startLat')} /></label>
        <label className="field small">Ш1 дължина<input type="text" inputMode="decimal" placeholder="28.07…" value={f.startLng} onChange={set('startLng')} /></label>
        <label className="field small">Ш26 ширина<input type="text" inputMode="decimal" value={f.endLat} onChange={set('endLat')} /></label>
        <label className="field small">Ш26 дължина<input type="text" inputMode="decimal" value={f.endLng} onChange={set('endLng')} /></label>
      </div>
      <button className="btn primary" onClick={() => void save()}>Запази линия {line.no}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchTable(table: string, order: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function BackupTab() {
  const { toast, confirm } = useUi();
  const [busy, setBusy] = useState(false);

  const exportAll = async () => {
    setBusy(true);
    try {
      const [satki, events, lines, settings, profiles] = await Promise.all([
        fetchTable('satki', 'code'), fetchTable('satka_events', 'recorded_at'), fetchTable('lines', 'no'),
        fetchTable('farm_settings', 'id'), fetchTable('profiles', 'created_at'),
      ]);
      const stamp = todayISO();
      download(`oyster-farm-backup-${stamp}.json`,
        JSON.stringify({ exportedAt: new Date().toISOString(), satki, satka_events: events, lines, farm_settings: settings, profiles }, null, 1),
        'application/json');
      const header = ['Номер', 'Размер', 'Състояние', 'Линия', 'Секция', 'Позиция', 'Последна обработка', 'Архивирана', 'Причина'];
      const rows = satki.map((s) => [
        s.code, SIZE_INFO[s.size as keyof typeof SIZE_INFO]?.label ?? s.size, STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status,
        s.line_no, s.section, s.slot, s.last_processed_on, s.archived_at ?? '', s.archive_reason ?? '',
      ]);
      // BOM so Excel opens Cyrillic correctly.
      download(`oyster-farm-satki-${stamp}.csv`, '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
      toast(`Изтеглени: ${satki.length} сатки, ${events.length} записа в историята.`);
    } catch {
      toast('Експортът изисква интернет връзка.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const fullResync = async () => {
    if (!navigator.onLine) return toast('Изисква интернет връзка.', 'error');
    const pending = await db.outbox.count();
    const ok = await confirm({
      title: 'Пълно презареждане',
      text: `Всички данни ще бъдат изтеглени наново от сървъра. ${pending ? `${pending} неизпратени промени ще бъдат запазени.` : ''}`,
    });
    if (!ok) return;
    await resetCursors();
    await db.remote.clear();
    await syncNow();
    toast('Готово.');
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Резервно копие</h2>
        <p className="muted" style={{ margin: 0 }}>
          Изтегля всички данни (JSON за възстановяване) и таблица на сатките (CSV за Excel). Правете го поне веднъж седмично и пазете файла извън телефона.
        </p>
        <button className="btn primary" disabled={busy} onClick={() => void exportAll()}>💾 {busy ? 'Изтегляне…' : 'Изтегли резервно копие'}</button>
      </div>
      <div className="card stack">
        <h2>Синхронизация на това устройство</h2>
        <button className="btn" onClick={() => void fullResync()}>🔄 Пълно презареждане от сървъра</button>
      </div>
    </div>
  );
}
