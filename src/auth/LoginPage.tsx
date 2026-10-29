import { useState, type FormEvent } from 'react';
import { InstallButton } from '../components/InstallButton';
import { t } from '../i18n/bg';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { state, profile, signIn, signUp, signOut, refreshProfile } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (state === 'pending') {
    return (
      <div className="page">
        <h1>{t.appName}</h1>
        <div className="banner info">
          Профилът {profile?.email ? <b>{profile.email}</b> : null} чака одобрение от администратор.
          След одобрение натиснете „Провери отново“.
        </div>
        <button className="btn primary" onClick={() => void refreshProfile()}>Провери отново</button>
        <button className="btn" onClick={() => void signOut()}>Изход</button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === 'in') {
      const err = await signIn(email, password);
      if (err) setMessage({ text: err, error: true });
    } else {
      if (password.length < 8) {
        setMessage({ text: 'Паролата трябва да е поне 8 знака.', error: true });
      } else {
        const err = await signUp(email, password, name);
        setMessage(err ? { text: err, error: true } : {
          text: 'Профилът е създаден. Ако получите имейл, потвърдете го. След това администратор трябва да ви одобри.',
          error: false,
        });
      }
    }
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="home-hero" style={{ margin: '-16px -16px 0' }}>
        <h1>🦪 {t.appName}</h1>
        <span>{mode === 'in' ? 'Вход' : 'Нов профил'}</span>
      </div>
      <form className="stack" onSubmit={submit}>
        {mode === 'up' && (
          <label className="field">Име
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label className="field">Имейл
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">Парола
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required />
        </label>
        {message && <div className={`banner ${message.error ? 'danger' : 'info'}`} role="alert">{message.text}</div>}
        <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Вход' : 'Създай профил'}</button>
      </form>
      <button className="link-btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }}>
        {mode === 'in' ? 'Нямате профил? Създайте нов' : 'Имате профил? Вход'}
      </button>
      <InstallButton />
    </div>
  );
}
