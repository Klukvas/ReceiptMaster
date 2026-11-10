import { createContext } from 'react';
import type { ChangePasswordRequest, User } from '../lib/api';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  /** Changes the password and stores the new session the server returns for this tab. */
  changePassword: (passwords: ChangePasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** A stored session could not be verified because the server was unreachable; the tokens are kept. */
  hasProfileLoadError: boolean;
  retryLoadProfile: () => Promise<void>;
  /** Re-reads the profile (e.g. after an email change) without the loading screen. */
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
