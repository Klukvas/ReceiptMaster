import { createContext } from 'react';
import type { User } from '../lib/api';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** A stored session could not be verified because the server was unreachable; the tokens are kept. */
  hasProfileLoadError: boolean;
  retryLoadProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
