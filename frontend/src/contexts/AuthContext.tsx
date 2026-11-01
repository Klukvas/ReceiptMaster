import { postLoginPath } from '../lib/session-expiry';
import { isAxiosError } from 'axios';
import React, { useState, useEffect, type ReactNode } from 'react';
import { authApi, type User } from '../lib/api';
import { AuthContext, type AuthContextType } from './AuthContext.types';

const isSessionRejected = (error: unknown): boolean => {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 403;
};

interface AuthProviderProps {
 children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
 const [user, setUser] = useState<User | null>(null);
 const [token, setToken] = useState<string | null>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [hasProfileLoadError, setHasProfileLoadError] = useState(false);

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
 setHasProfileLoadError(false);
 try {
 const response = await authApi.getProfile();
 setUser(response.data);
 } catch (error) {
 // Only a rejected session ends it. A dead network or a 5xx must not log the user out.
 if (isSessionRejected(error)) {
 localStorage.removeItem('auth_token');
 localStorage.removeItem('refresh_token');
 setToken(null);
 } else {
 setHasProfileLoadError(true);
 }
 } finally {
 setIsLoading(false);
 }
 };

 const refreshProfile = async () => {
 const response = await authApi.getProfile();
 setUser(response.data);
 };

 const retryLoadProfile = async () => {
 setIsLoading(true);
 await fetchUserProfile();
 };

 const login = async (email: string, password: string) => {
 const response = await authApi.login({ email, password });
 const { access_token, refresh_token, user: userData } = response.data;

 localStorage.setItem('auth_token', access_token);
 localStorage.setItem('refresh_token', refresh_token);
 setToken(access_token);
 setUser(userData);

 window.location.href = postLoginPath(window.location);
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
 hasProfileLoadError,
 retryLoadProfile,
 refreshProfile,
 };

 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
