import { createContext } from 'react';
import type React from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '../types/chat';

export type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
