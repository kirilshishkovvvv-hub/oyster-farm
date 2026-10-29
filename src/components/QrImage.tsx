import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { satkaLink } from '../domain/qr';

/** The app's own address, used inside QR codes (works for GitHub Pages sub-paths). */
export function appUrl(): string {
  return window.location.href.split('#')[0];
}

export function useQrDataUrl(code: string | null, size = 240): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    QRCode.toDataURL(satkaLink(appUrl(), code), { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [code, size]);
  return code ? url : null;
}

export function QrImage({ code, size = 240 }: { code: string; size?: number }) {
  const url = useQrDataUrl(code, size);
  if (!url) return null;
  return <img src={url} width={size} height={size} alt={`QR код ${code}`} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />;
}
