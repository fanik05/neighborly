const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'neighborly_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Single fetch wrapper for the whole app. Attaches the JWT, parses JSON,
 * and surfaces the server's `{ error }` message as a thrown Error.
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isForm = options.body instanceof FormData;

  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Build a query string from a params object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '' && v !== null
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}
