import { useSyncExternalStore } from 'react';
import { installStore, isIos, promptInstall } from '../pwa/install';
import { useUi } from './UiProvider';

/**
 * "Install the app" button. Shown only when installing is possible and the
 * app is not already installed: Chrome/Edge (desktop shortcut, Android home
 * screen) open the browser's install dialog; on iPhone it explains the two taps.
 */
export function InstallButton() {
  const s = useSyncExternalStore(installStore.subscribe, installStore.get);
  const { toast, confirm } = useUi();
  if (s.installed) return null;

  if (s.canPrompt) {
    return (
      <button className="btn big" onClick={async () => {
        if (await promptInstall()) toast('Приложението е инсталирано. Отваряйте го от иконата.');
      }}>
        <span className="ico">📲</span>Инсталирай приложението
      </button>
    );
  }

  if (isIos()) {
    return (
      <button className="btn big" onClick={() => void confirm({
        title: 'Инсталиране на iPhone',
        text: 'В Safari натиснете бутона „Сподели“ (квадрат със стрелка нагоре), после „Добави към началния екран“ и „Добави“.',
        okLabel: 'Разбрах',
      })}>
        <span className="ico">📲</span>Инсталирай приложението
      </button>
    );
  }

  return null;
}
