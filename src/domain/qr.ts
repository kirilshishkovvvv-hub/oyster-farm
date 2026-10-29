// QR labels encode a link to the record, e.g.
//   https://user.github.io/oyster-farm/#/s/SAT-00012
// so a phone's built-in camera app also opens it. The in-app scanner accepts
// that link or a bare code.

const CODE_RE = /^SAT-\d{5,}$/;

export function normaliseCode(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (CODE_RE.test(t)) return t;
  const m = /^(?:SAT[-\s]?)?0*(\d{1,9})$/.exec(t);
  if (m) return `SAT-${m[1].padStart(5, '0')}`;
  return null;
}

export function parseScannedText(text: string): string | null {
  const t = text.trim();
  const fromLink = /#\/s\/([^/?#\s]+)/.exec(t);
  if (fromLink) return normaliseCode(decodeURIComponent(fromLink[1]));
  return normaliseCode(t);
}

export function satkaLink(appUrl: string, code: string): string {
  const base = appUrl.split('#')[0];
  return `${base}#/s/${encodeURIComponent(code)}`;
}
