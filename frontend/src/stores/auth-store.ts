import { create } from 'zustand';
import { User } from '@/types';
import { api } from '@/lib/api';
import { initAuth, login, logout as auth0Logout } from '@/lib/auth';

// Admin email — set via NEXT_PUBLIC_ADMIN_EMAIL (matches backend admin_config.php ADMIN_EMAIL)
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  init: () => Promise<void>;
  logout: () => Promise<void>;
}

let initRan = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    if (initRan) return;
    initRan = true;

    try {
      const { authed, user: auth0User } = await initAuth();

      if (authed && auth0User) {
        // Admin is a client-side determination by design (email match).
        const isAdminEmail = !!ADMIN_EMAIL && auth0User.email === ADMIN_EMAIL;

        // Build fallback user from Auth0 profile — this is the guaranteed baseline
        const fallbackUser: User = {
          id: 0,
          email: auth0User.email || '',
          name: auth0User.name || auth0User.email || 'User',
          plan_tier: 'free',
          role: isAdminEmail ? 'admin' : 'owner',
        } as User;

        // Set authenticated immediately so UI updates with fallback user
        set({ isAuthenticated: true, user: fallbackUser, isLoading: false });

        // Try to sync with backend — ONLY update user if we get a valid response.
        // FIX (deploy lane): preserve the client-side admin role. The backend
        // /auth/sync returns role:'owner', which was overwriting admin and making
        // the admin nav vanish after login. Never let the sync downgrade admin.
        try {
          const response = await api.post<{ user: User }>('/auth/sync', {
            email: auth0User.email,
            name: auth0User.name,
            auth0_sub: auth0User.sub,
          });
          if (response?.user?.name) {
            const role = isAdminEmail ? 'admin' : (response.user.role || 'owner');
            set({ user: { ...response.user, role } });
          }
        } catch {
          // Backend unreachable — fallback user already set, nothing to do
        }

        return; // Skip the finally block's isLoading set — we already set it
      }
    } catch (err) {
      console.error('Auth init error:', err);
    }

    set({ isLoading: false });
  },

  logout: async () => {
    initRan = false;
    set({ user: null, isAuthenticated: false, isLoading: false });
    await auth0Logout();
  },
}));

// Re-export login for components
export { login };
