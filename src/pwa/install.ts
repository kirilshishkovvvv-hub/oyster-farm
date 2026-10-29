// "Install the app" support: a desktop shortcut on Windows/Mac (Chrome, Edge)
// and a home-screen icon on Android. The browser offers this through the
// beforeinstallprompt event, which can fire before React has rendered, so we
// listen from start-up (see main.tsx) and keep it for the install button.
// iPhone/iPad Safari has no such event: users add it via Share → Add to Home Screen.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  canPrompt: boolean; // the browser will show its install dialog
  installed: boolean; // already running as an installed app
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: isStandalone() };
const listeners = new Set<() => void>();

function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Call once at start-up, before the first render. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the browser's banner
    deferred = e as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    update({ canPrompt: false, installed: true });
  });
}

/** Opens the browser's install dialog. Returns true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  update({ canPrompt: false });
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export const installStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
};
