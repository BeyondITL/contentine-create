'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  AlertTriangle,
  RefreshCw,
  Building2,
  Crown,
  ArrowUpRight,
} from 'lucide-react';
import { useTeamStore } from '@/stores/team-store';
import { useAuthStore } from '@/stores/auth-store';
import MembersList from '@/components/team/MembersList';
import InviteForm from '@/components/team/InviteForm';
import ActivityFeed from '@/components/team/ActivityFeed';
import TeamSkeleton from '@/components/team/TeamSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import type { UserRole } from '@/types';

/** Team management page. */
export default function TeamPage() {
  const {
    team,
    members,
    activities,
    isLoading,
    isInviting,
    error,
    fetchTeam,
    createTeam,
    inviteMember,
    updateMemberRole,
    removeMember,
    fetchActivity,
  } = useTeamStore();

  const [teamName, setTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const user = useAuthStore((s) => s.user);
  const userPlan = user?.plan_tier || 'free';
  const currentUserId = user?.id || 0;

  // Set page title
  useEffect(() => {
    document.title = 'Team \u2014 Contentine Create';
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchTeam();
    fetchActivity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create team handler
  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const trimmed = teamName.trim();
    if (!trimmed) {
      setCreateError('Team name is required.');
      return;
    }

    setIsCreating(true);
    try {
      await createTeam(trimmed);
      setTeamName('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create team.';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  // Invite handler
  async function handleInvite(email: string, role: UserRole) {
    await inviteMember(email, role);
  }

  // Role change handler
  function handleChangeRole(memberId: number, role: UserRole) {
    updateMemberRole(memberId, role).catch(() => {});
  }

  // Remove handler
  function handleRemove(memberId: number) {
    removeMember(memberId).catch(() => {});
  }

  // Is the current user the team owner?
  const isOwner = team ? team.owner_id === currentUserId : false;

  // Can the user create a team (business or enterprise)?
  const canCreateTeam = userPlan === 'business' || userPlan === 'enterprise';

  // Loading state
  if (isLoading && !team && (members ?? []).length === 0) {
    return <TeamSkeleton />;
  }

  // Error state
  if (error && !team) {
    return (
      <div>
        <div className="max-w-md mx-auto flex flex-col items-center text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-danger/[0.06] flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>
          <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
            Failed to load team
          </h2>
          <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
            {error}
          </p>
          <button
            type="button"
            onClick={() => fetchTeam()}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <Users size={20} className="text-primary" />
        <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
          Team
        </h1>
      </div>

      {/* No team yet */}
      {!team && (
        <>
          {canCreateTeam ? (
            <div className="max-w-lg mx-auto">
              <EmptyState
                icon={<Users size={28} className="text-primary" />}
                headline="Just you for now"
                description="Create a team to collaborate with editors and reviewers on your content. Invite members and manage roles from one place."
                ctaLabel="Create Team"
                onCTA={() => {}}
              />

              {/* Create team form — appears below empty state */}
              <div className="bento-card p-5 mt-4">
                <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
                  Name your team
                </h3>
                <form onSubmit={handleCreateTeam} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g., Marketing Team"
                    disabled={isCreating}
                    className="input-field flex-1"
                    aria-label="Team name"
                  />
                  <button
                    type="submit"
                    disabled={isCreating || !teamName.trim()}
                    className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Building2 size={14} />
                    {isCreating ? 'Creating...' : 'Create Team'}
                  </button>
                </form>
                {createError && (
                  <p className="mt-2 text-[12px] text-danger">{createError}</p>
                )}
              </div>
            </div>
          ) : (
            /* Not on a team-eligible plan */
            <EmptyState
              icon={<Users size={28} className="text-primary" />}
              headline="Team collaboration"
              description="Team features are available on Business and Enterprise plans. Upgrade to invite editors and collaborators."
              ctaLabel="View Plans"
              ctaHref="/settings?tab=billing"
            />
          )}
        </>
      )}

      {/* Has team */}
      {team && (
        <div className="space-y-5">
          {/* Team info card */}
          <div className="bento-card p-4 md:p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                <Building2 size={22} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-[15px] font-semibold text-text dark:text-white truncate">
                    {team.name}
                  </h2>
                  <span className="badge-accent shrink-0">
                    {team.plan_tier.charAt(0).toUpperCase() + team.plan_tier.slice(1)}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted">
                  {(members ?? []).length} member{(members ?? []).length !== 1 ? 's' : ''} &middot; Created{' '}
                  {new Date(team.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              {isOwner && (
                <div className="shrink-0 hidden sm:flex items-center gap-1 text-[11px] text-accent font-medium">
                  <Crown size={12} />
                  Owner
                </div>
              )}
            </div>
          </div>

          {/* Invite form — owner only */}
          {isOwner && (
            <InviteForm isInviting={isInviting} onInvite={handleInvite} />
          )}

          {/* Members list */}
          <MembersList
            members={members ?? []}
            isOwner={isOwner}
            onChangeRole={handleChangeRole}
            onRemove={handleRemove}
          />

          {/* Activity feed */}
          <ActivityFeed activities={activities ?? []} />
        </div>
      )}
    </div>
  );
}
