'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { user, token } = await api<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(token);
    setUser(user);
  }

  async function register(name: string, email: string, password: string) {
    const { user, token } = await api<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setToken(token);
    setUser(user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
