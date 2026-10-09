import { useAuthStore } from '@/stores/auth-store';

/** Hook to detect admin role. Checks user.role from auth store. */
export function useAdmin() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  
  // Admin if authenticated and role is admin (set by auth-store based on email match)
  const isAdmin = isAuthenticated && user?.role === 'admin';

  return { isAdmin, loading: isLoading };
}
