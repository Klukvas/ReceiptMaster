import { postLoginPath } from '../lib/session-expiry';
import { clearTablePreferences } from '../lib/table-preferences';
import { isAxiosError } from 'axios';
import React, { useState, useEffect, type ReactNode } from 'react';
import { authApi, type User } from '../lib/api';
import {
 clearStoredSession,
 readStoredSession,
 storeSession,
} from '../lib/auth-session';
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
 const storedToken = readStoredSession().accessToken;
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
 // A rejected session ends it for this render. Storage is the API client's to clear: it
 // ends the session after a genuine rejection, but keeps it on network errors and when
 // another tab already rotated the tokens. A dead network or a 5xx shows a retry screen
 // instead of pretending the user signed out.
 if (isSessionRejected(error)) {
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

 // Access token first, then refresh token (other tabs wait for the latter).
 storeSession({ accessToken: access_token, refreshToken: refresh_token });
 setToken(access_token);
 setUser(userData);

 window.location.href = postLoginPath(window.location);
 };

 const register = async (email: string, password: string) => {
 const response = await authApi.register({ email, password });
 const { access_token, refresh_token, user: userData } = response.data;

 storeSession({ accessToken: access_token, refreshToken: refresh_token });
 setToken(access_token);
 setUser(userData);

 window.location.href = '/dashboard';
 };

 const logout = async () => {
 const { refreshToken } = readStoredSession();
 if (refreshToken) {
 try {
 await authApi.logout(refreshToken);
 } catch {
 // Ignore errors during logout
 }
 }
 clearStoredSession();
 clearTablePreferences();
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
