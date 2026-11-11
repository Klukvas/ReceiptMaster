import { isProtectedPath, postLoginPath } from '../lib/session-expiry';
import { navigateOutOfDialogs } from '../hooks/useBackClosesDialog';
import { clearTablePreferences } from '../lib/table-preferences';
import { isAxiosError } from 'axios';
import React, { useState, useEffect, type ReactNode } from 'react';
import { authApi, type ChangePasswordRequest, type User } from '../lib/api';
import {
 ACCESS_TOKEN_KEY,
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

 // Signing out in another tab removes the shared tokens. Follow it quietly, as that tab did,
 // instead of waiting for this tab's next request to fail and report an expired session.
 useEffect(() => {
 const onStorage = (event: StorageEvent) => {
 if (event.storageArea !== localStorage) return;
 // `key` is null when the other tab cleared all of storage.
 if (event.key !== null && event.key !== ACCESS_TOKEN_KEY) return;
 const { accessToken } = readStoredSession();
 // Replaced, not removed (a refresh, or a password change that kept that tab signed in):
 // stay signed in with the new token; the API client reads storage on every request.
 if (accessToken) {
 setToken(accessToken);
 return;
 }
 setToken(null);
 setUser(null);
 // A full load also drops this tab's cached data of the signed-out account.
 if (isProtectedPath(window.location.pathname)) window.location.replace('/');
 };
 window.addEventListener('storage', onStorage);
 return () => window.removeEventListener('storage', onStorage);
 }, []);

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

 // Signing in from the landing page's dialog: closing the dialog would step Back over its
 // history marker and cancel this navigation, leaving the user on "/".
 navigateOutOfDialogs(postLoginPath(window.location));
 };

 const register = async (email: string, password: string) => {
 const response = await authApi.register({ email, password });
 const { access_token, refresh_token, user: userData } = response.data;

 storeSession({ accessToken: access_token, refreshToken: refresh_token });
 setToken(access_token);
 setUser(userData);

 navigateOutOfDialogs('/dashboard');
 };

 // The server signs out every session, this one included, and answers with a new pair
 // for this one: store it like a login does, so this tab (and the others of this
 // browser, which share storage) stay signed in.
 const changePassword = async (passwords: ChangePasswordRequest) => {
 const response = await authApi.changePassword(passwords);
 const { access_token, refresh_token } = response.data;
 storeSession({ accessToken: access_token, refreshToken: refresh_token });
 setToken(access_token);
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
 changePassword,
 logout,
 isLoading,
 isAuthenticated: !!user && !!token,
 hasProfileLoadError,
 retryLoadProfile,
 refreshProfile,
 };

 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
