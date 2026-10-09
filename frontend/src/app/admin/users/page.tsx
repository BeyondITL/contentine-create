'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Search, Coins, Video, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

interface UserRow {
  id: number;
  name: string | null;
  email: string;
  plan_tier: string;
  role: string;
  trial_ends_at: string | null;
  onboarding_completed_at: string | null;
  video_count: number;
  created_at: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/** /admin/users — Real paginated user directory backed by GET /api/admin/users (SA-06). */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 25, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // `searchInput` is the live text field; `search` is the committed query (submitted).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [grantingUserId, setGrantingUserId] = useState<number | null>(null);
  const [grantAmount, setGrantAmount] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: '25' });
      if (search.trim()) qs.set('search', search.trim());
      const data = await api.get<{ users: UserRow[]; pagination: Pagination }>(`/admin/users?${qs.toString()}`);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      if (data?.pagination) setPagination(data.pagination);
    } catch {
      // Honest failure — no fabricated fallback row (Law L1).
      setUsers([]);
      setError('Could not load users. Check that you are signed in as an admin and the backend is reachable.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleGrant = async (userId: number) => {
    const amount = parseInt(grantAmount, 10);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await api.post('/admin/credits/grant', {
        user_id: userId,
        amount,
        reason: 'Admin grant via dashboard',
      });
      setGrantingUserId(null);
      setGrantAmount('');
      fetchUsers();
    } catch (e) {
      console.error('Grant failed:', e);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-40 mb-6" />
        <Skeleton className="h-10 w-full mb-4 rounded-lg" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-7 h-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">User Management</h1>
          <p className="text-sm text-dark/60 dark:text-white/60">{pagination.total.toLocaleString()} total users</p>
        </div>
      </div>

      {/* Search (server-side, submit to run) */}
      <form onSubmit={submitSearch} className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark/30 dark:text-white/30" aria-hidden />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search users by name or email, then press Enter..."
          aria-label="Search users by name or email"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-dark/60 text-dark dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 transition"
        />
      </form>

      {error ? (
        <EmptyState icon={Users} title="Unable to load users" description={error} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description={search ? 'Try a different search term.' : 'Users will appear here as they sign up.'}
        />
      ) : (
        <>
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-white/10 text-left">
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">User</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Plan</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 hidden sm:table-cell">Role</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Videos</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 hidden md:table-cell">Joined</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/10">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-dark dark:text-white">{u.name || 'Unnamed'}</p>
                        <p className="text-xs text-dark/50 dark:text-white/50">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            u.plan_tier === 'enterprise' ? 'accent' :
                            u.plan_tier === 'business' ? 'primary' :
                            u.plan_tier === 'professional' ? 'success' :
                            u.plan_tier === 'starter' ? 'warning' : 'default'
                          }
                          size="sm"
                        >
                          {u.plan_tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-dark/70 dark:text-white/70">{u.role}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 font-mono text-dark dark:text-white">
                          <Video className="w-3.5 h-3.5 text-dark/40 dark:text-white/40" aria-hidden />
                          {u.video_count.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-dark/50 dark:text-white/50 text-xs hidden md:table-cell">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {grantingUserId === u.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={grantAmount}
                              onChange={(e) => setGrantAmount(e.target.value)}
                              placeholder="Amount"
                              aria-label={`Credit amount to grant to ${u.email}`}
                              className="w-20 px-2 py-1 text-xs rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white"
                              autoFocus
                            />
                            <button
                              onClick={() => handleGrant(u.id)}
                              className="px-2 py-1 text-xs bg-secondary text-white rounded hover:bg-secondary-hover transition-colors"
                            >
                              Grant
                            </button>
                            <button
                              onClick={() => setGrantingUserId(null)}
                              className="px-2 py-1 text-xs text-dark/50 dark:text-white/50 hover:text-dark dark:hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setGrantingUserId(u.id); setGrantAmount(''); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors"
                          >
                            <Coins className="w-3 h-3" aria-hidden />
                            Grant Credits
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-dark/50 dark:text-white/50">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border dark:border-white/10 text-dark dark:text-white disabled:opacity-40 hover:bg-surface dark:hover:bg-white/[0.04] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={pagination.page >= pagination.total_pages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border dark:border-white/10 text-dark dark:text-white disabled:opacity-40 hover:bg-surface dark:hover:bg-white/[0.04] transition-colors"
                >
                  Next <ChevronRight className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
