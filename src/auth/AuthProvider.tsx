import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { demoMode } from '../data/demo';
import { clearLocalData, db, getMeta, setMeta } from '../data/localDb';
import { profileFromRow } from '../data/mappers';
import { startSync, stopSync } from '../data/sync';
import { supabase } from '../data/supabase';
import type { Profile } from '../data/types';

type AuthState = 'loading' | 'signedOut' | 'pending' | 'ready';

interface AuthValue {
  state: AuthState;
  profile: Profile | null;
  isAdmin: boolean;
  userName: string;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, name: string): Promise<string | null>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

function authErrorText(msg: string): string {
  if (/invalid login/i.test(msg)) return 'Грешен имейл или парола.';
  if (/email not confirmed/i.test(msg)) return 'Потвърдете имейла си от линка, който получихте.';
  if (/already registered/i.test(msg)) return 'Вече има профил с този имейл.';
  if (/password/i.test(msg)) return 'Паролата трябва да е поне 8 знака.';
  if (/fetch|network/i.test(msg)) return 'Няма връзка с интернет.';
  return msg;
}

/** Demo mode: a fixed local admin, no server. */
function DemoAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    startSync();
    return stopSync;
  }, []);
  const value = useMemo<AuthValue>(() => ({
    state: 'ready',
    profile: { id: 'demo', email: 'demo@local', name: 'Демо', role: 'admin', active: true },
    isAdmin: true,
    userName: 'Демо',
    signIn: async () => null,
    signUp: async () => null,
    async signOut() {
      stopSync();
      await clearLocalData();
      window.location.reload();
    },
    refreshProfile: async () => {},
  }), []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = demoMode ? DemoAuthProvider : RealAuthProvider;

function RealAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    // getSession() works offline: it reads the stored session.
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const cached = await getMeta<Profile>('profile');
    // Another person signing in on this device must not see the previous user's queue.
    if (cached && cached.id !== userId) await clearLocalData();
    else if (cached) setProfile(cached);

    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && data) {
      const p = profileFromRow(data);
      await setMeta('profile', p);
      setProfile(p);
    }
    setProfileLoaded(true);
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoaded(session === null);
      return;
    }
    setProfileLoaded(false);
    void loadProfile(userId);
  }, [userId, session, loadProfile]);

  const ready = !!profile?.active && !!userId;
  useEffect(() => {
    if (!ready) return;
    startSync();
    return stopSync;
  }, [ready]);

  const value = useMemo<AuthValue>(() => {
    let state: AuthState = 'loading';
    if (session === null) state = 'signedOut';
    else if (session && profile) state = profile.active ? 'ready' : 'pending';
    else if (session && profileLoaded) state = 'pending';
    return {
      state,
      profile,
      isAdmin: !!profile?.active && profile.role === 'admin',
      userName: profile?.name || profile?.email || '',
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? authErrorText(error.message) : null;
      },
      async signUp(email, password, name) {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
        return error ? authErrorText(error.message) : null;
      },
      async signOut() {
        stopSync();
        await supabase.auth.signOut();
        await clearLocalData();
        setProfile(null);
      },
      async refreshProfile() {
        if (userId) await loadProfile(userId);
      },
    };
  }, [session, profile, profileLoaded, userId, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Number of changes on this device that are not yet on the server. */
export async function unsyncedCount(): Promise<number> {
  return db.outbox.count();
}
