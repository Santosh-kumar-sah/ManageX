/**
 * ManageX Authentication Context and Hook
 * Provides verified current user identity, session state, and auth helpers.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient, ApiError } from './client';

export interface User {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  platformRole?: string | null;
  status: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<User | null>;
  logout: (redirectTo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiClient<{ user: User }>('/auth/me');
      if (res.data?.user) {
        setUser(res.data.user);
        return res.data.user;
      } else {
        setUser(null);
        return null;
      }
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        setUser(null);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Bootstrap CSRF token and fetch current session
    apiClient('/auth/csrf')
      .catch(() => {})
      .finally(() => {
        refreshUser();
      });
  }, [refreshUser]);

  const logout = useCallback(async (redirectTo?: string) => {
    const destination = typeof redirectTo === 'string' ? redirectTo : '/auth/login';
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } finally {
      // Clear all active org storage keys to prevent cross-account / persona leakage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('managex_active_org_id')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        sessionStorage.clear();
      } catch {
        // Safe fallback in restricted environments
      }
      setUser(null);
      window.location.href = destination;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
