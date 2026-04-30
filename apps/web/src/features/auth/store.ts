import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@finwise/shared-types';

interface AuthState {
  user: User | null;
  token: string | null;
  onboardingCompleted: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setOnboardingCompleted: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      onboardingCompleted: false,
      setUser: (user) => set({ user, onboardingCompleted: user.onboardingCompleted }),
      setToken: (token) => set({ token }),
      setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),
      logout: () => set({ user: null, token: null, onboardingCompleted: false }),
    }),
    { name: 'finwise-auth' }
  )
);
