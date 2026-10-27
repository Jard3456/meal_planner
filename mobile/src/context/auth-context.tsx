import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ApiError, apiRequest, setAccessToken } from '@/services/api';
import { deleteToken, readToken, writeToken } from '@/services/session-store';
import type { UserProfile } from '@/types/meal-planner';

export type ProfileUpdate = Pick<UserProfile, 'nombre' | 'apellido' | 'objetivo' | 'peso_actual' | 'estatura'>;
type Session = { token: string; user: UserProfile };
type Credentials = { correo: string; password: string };
type AuthState = {
  user: UserProfile | null;
  loading: boolean;
  signIn: (data: Credentials) => Promise<void>;
  signUp: (data: Credentials & { nombre: string; apellido: string }) => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const token = await readToken();
        if (!active) return;
        if (token) {
          setAccessToken(token);
          const profile = await apiRequest<UserProfile>('/me');
          if (active) setUser(profile);
        }
      } catch (error) {
        if (!active) return;
        setAccessToken(undefined);
        if (error instanceof ApiError && error.status === 401) await deleteToken().catch(() => {});
      } finally { if (active) setLoading(false); }
    }
    void restore();
    return () => { active = false; };
  }, []);

  async function accept(session: Session) {
    await writeToken(session.token);
    setAccessToken(session.token);
    setUser(session.user);
  }
  async function signIn(data: Credentials) {
    await accept(await apiRequest<Session>('/auth/login', { method: 'POST', body: JSON.stringify(data) }));
  }
  async function signUp(data: Credentials & { nombre: string; apellido: string }) {
    await accept(await apiRequest<Session>('/auth/register', { method: 'POST', body: JSON.stringify(data) }));
  }
  async function signOut() {
    await deleteToken();
    setAccessToken(undefined);
    setUser(null);
  }
  async function updateProfile(data: ProfileUpdate) {
    try {
      setUser(await apiRequest<UserProfile>('/me', { method: 'PATCH', body: JSON.stringify(data) }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await signOut();
      throw error;
    }
  }

  return <AuthContext value={{ user, loading, signIn, signUp, signOut, updateProfile }}>{children}</AuthContext>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider no disponible.');
  return value;
}
