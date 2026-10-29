import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar } from '../components/bits';
import { db } from '../data/localDb';
import { parseScannedText } from '../domain/qr';
import { t } from '../i18n/bg';

type CamError = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'busy' | 'failed';

const CAM_ERROR_TEXT: Record<CamError, { title: string; help: string }> = {
  insecure: {
    title: 'Камерата работи само през защитена връзка (https).',
    help: 'Отворете приложението от официалния му адрес, започващ с https://.',
  },
  unsupported: {
    title: 'Този браузър не поддържа камера.',
    help: 'Използвайте Chrome (Android) или Safari (iPhone), или въведете номера ръчно.',
  },
  denied: {
    title: 'Достъпът до камерата е отказан.',
    help: 'Android/Chrome: натиснете катинарчето до адреса → Разрешения → Камера → Разреши. iPhone: Настройки → Safari → Камера → Разреши. След това натиснете „Опитай отново“.',
  },
  notfound: {
    title: 'Не е открита камера на устройството.',
    help: 'Въведете номера на сатката ръчно.',
  },
  busy: {
    title: 'Камерата се използва от друго приложение.',
    help: 'Затворете другите приложения с камера (или видеоразговор) и натиснете „Опитай отново“.',
  },
  failed: {
    title: 'Камерата не можа да се стартира.',
    help: 'Натиснете „Опитай отново“ или въведете номера ръчно.',
  },
};

function classify(e: unknown): CamError {
  const name = (e as { name?: string })?.name ?? String(e);
  if (/NotAllowed|Permission|Security/i.test(name)) return 'denied';
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) return 'notfound';
  if (/NotReadable|TrackStart|AbortError/i.test(name)) return 'busy';
  return 'failed';
}

const looksRear = (label: string) => /back|rear|environment|задн|основн|wide|ultra/i.test(label);
const looksFront = (label: string) => /front|user|face|предн/i.test(label);

/**
 * Asks for camera permission and finds the rear camera: tries the exact
 * "environment" camera, then a preferred one, then any camera.
 */
async function findCamera(): Promise<{ deviceId: string; cameras: MediaDeviceInfo[] }> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { exact: 'environment' } } },
    { video: { facingMode: 'environment' } },
    { video: true },
  ];
  let stream: MediaStream | null = null;
  let lastError: unknown = null;
  for (const c of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(c);
      break;
    } catch (e) {
      lastError = e;
      if (classify(e) === 'denied' || classify(e) === 'busy') throw e;
    }
  }
  if (!stream) throw lastError;
  const track = stream.getVideoTracks()[0];
  let deviceId = track.getSettings().deviceId ?? '';
  const facing = track.getSettings().facingMode;
  stream.getTracks().forEach((tr) => tr.stop());

  // Labels are only available after permission was granted.
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const current = cameras.find((c) => c.deviceId === deviceId);
  if (facing !== 'environment' && (!current || looksFront(current.label))) {
    const rear = cameras.find((c) => looksRear(c.label));
    if (rear) deviceId = rear.deviceId;
  }
  return { deviceId: deviceId || cameras[0]?.deviceId || '', cameras };
}

export default function ScanPage() {
  const navigate = useNavigate();
  const scanner = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState<CamError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState('');

  const openCode = useCallback(async (code: string) => {
    const s = await db.satki.where('code').equals(code).first();
    if (s) navigate(`/satka/${s.id}`, { replace: true });
    else setNotice(`Сатка ${code} не е намерена на това устройство. Ако е нова от друг телефон, изчакайте синхронизация.`);
  }, [navigate]);

  const stop = useCallback(async () => {
    const sc = scanner.current;
    scanner.current = null;
    setRunning(false);
    if (!sc) return;
    try {
      if (sc.isScanning) await sc.stop();
      sc.clear();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(async (preferredId?: string) => {
    const myGen = ++generation.current;
    await stop();
    setError(null);
    setNotice(null);
    handled.current = false;
    if (!window.isSecureContext) return setError('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return setError('unsupported');
    try {
      let id = preferredId;
      if (!id) {
        const found = await findCamera();
        id = found.deviceId;
        setCameras(found.cameras);
      }
      // A newer start (or leaving the screen) happened while we waited.
      if (myGen !== generation.current) return;
      setCameraId(id);
      const sc = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      scanner.current = sc;
      await sc.start(
        id || { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } },
        (text) => {
          if (handled.current) return;
          const code = parseScannedText(text);
          if (!code) {
            setNotice('Този QR код не е от сатка.');
            return;
          }
          handled.current = true;
          navigator.vibrate?.(80);
          void stop().then(() => openCode(code));
        },
        () => { /* no code in this frame */ },
      );
      if (myGen !== generation.current) {
        try {
          await sc.stop();
          sc.clear();
        } catch {
          /* already stopped */
        }
        if (scanner.current === sc) scanner.current = null;
        return;
      }
      setRunning(true);
    } catch (e) {
      if (myGen !== generation.current) return;
      await stop();
      setError(classify(e));
    }
  }, [stop, openCode]);

  useEffect(() => {
    const gen = generation;
    void start();
    return () => {
      gen.current++;
      void stop();
    };
    // Start once on open; release the camera when leaving the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = parseScannedText(manual);
    if (!code) return setNotice('Въведете номер, напр. 12 или SAT-00012.');
    void stop().then(() => openCode(code));
  };

  return (
    <>
      <AppBar title={t.nav.scan} />
      <div className="page">
        <div id="qr-reader" style={{ width: '100%', minHeight: running ? 280 : 0, background: '#000', borderRadius: 14, overflow: 'hidden' }} />
        {running && <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Насочете камерата към QR етикета на сатката.</p>}
        {error && (
          <div className="banner danger" role="alert">
            <div>{CAM_ERROR_TEXT[error].title}</div>
            <div style={{ fontWeight: 500, marginTop: 6 }}>{CAM_ERROR_TEXT[error].help}</div>
          </div>
        )}
        {notice && <div className="banner warn" role="status">{notice}</div>}
        {(error || !running) && error !== 'insecure' && error !== 'unsupported' && (
          <button className="btn primary" onClick={() => void start()}>📷 Опитай отново</button>
        )}
        {notice && !running && !error && <button className="btn primary" onClick={() => void start(cameraId)}>📷 Сканирай пак</button>}
        {cameras.length > 1 && running && (
          <label className="field">Камера
            <select value={cameraId} onChange={(e) => void start(e.target.value)}>
              {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Камера ${i + 1}`}</option>)}
            </select>
          </label>
        )}

        <form className="card stack" onSubmit={submitManual}>
          <label className="field">Или въведете номера ръчно
            <input type="text" inputMode="numeric" className="big-input" placeholder="напр. 12" value={manual} onChange={(e) => setManual(e.target.value)} />
          </label>
          <button className="btn">Отвори сатката</button>
        </form>
      </div>
    </>
  );
}
