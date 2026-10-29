import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n/bg';

interface ConfirmOptions {
  title: string;
  text?: string;
  okLabel?: string;
  danger?: boolean;
}

interface UiValue {
  toast(message: string, kind?: 'info' | 'error'): void;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}

const UiContext = createContext<UiValue | null>(null);

export function useUi(): UiValue {
  const v = useContext(UiContext);
  if (!v) throw new Error('useUi outside UiProvider');
  return v;
}

/** Toast messages and a bottom confirmation sheet, shared by all pages. */
export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [sheet, setSheet] = useState<(ConfirmOptions & { resolve(ok: boolean): void }) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setToastMsg({ text, kind });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), kind === 'error' ? 5000 : 3000);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setSheet({ ...opts, resolve })), []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const close = (ok: boolean) => {
    sheet?.resolve(ok);
    setSheet(null);
  };

  return (
    <UiContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div className={`toast ${toastMsg.kind === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
          {toastMsg.text}
        </div>
      )}
      {sheet && (
        <div className="sheet-backdrop" onClick={() => close(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="sheet-title">{sheet.title}</h2>
            {sheet.text && <p className="muted" style={{ margin: 0 }}>{sheet.text}</p>}
            <div className="grid2">
              <button className="btn" onClick={() => close(false)}>{t.cancel}</button>
              <button className={`btn ${sheet.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>
                {sheet.okLabel ?? t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  );
}
