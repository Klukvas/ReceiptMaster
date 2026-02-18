import React, { useState, useEffect, type ReactNode } from 'react';
import { authApi, type User } from '../lib/api';
import { AuthContext, type AuthContextType } from './AuthContext.types';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      // Try to get user profile
      fetchUserProfile();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await authApi.getProfile();
      setUser(response.data);
    } catch {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    const { access_token, refresh_token, user: userData } = response.data;

    localStorage.setItem('auth_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setToken(access_token);
    setUser(userData);

    window.location.href = '/dashboard';
  };

  const register = async (email: string, password: string) => {
    const response = await authApi.register({ email, password });
    const { access_token, refresh_token, user: userData } = response.data;

    localStorage.setItem('auth_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setToken(access_token);
    setUser(userData);

    window.location.href = '/dashboard';
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore errors during logout
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
    window.location.href = '/';
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    isLoading,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
