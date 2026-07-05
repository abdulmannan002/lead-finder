export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  tenant: { id: string; name: string; slug: string };
  role: string;
}

const KEY = 'signx.session';

export function saveSession(session: StoredSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
