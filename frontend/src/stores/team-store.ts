import { create } from 'zustand';
import type { Team, TeamMember, ActivityLogEntry, UserRole } from '@/types';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';

// ── Default workspace created when no team exists locally or remotely ──

const DEFAULT_TEAM: Team = {
  id: 1,
  name: 'My Workspace',
  owner_id: 1,
  plan_tier: 'business',
  created_at: new Date().toISOString(),
};

const DEFAULT_MEMBER: TeamMember = {
  id: 1,
  name: 'You',
  email: 'owner@contentine.ai',
  role: 'owner',
  created_at: new Date().toISOString(),
};

// ── State Interface ──────────────────────────────────────────

interface TeamState {
  // Data
  team: Team | null;
  members: TeamMember[];
  activities: ActivityLogEntry[];

  // UI
  isLoading: boolean;
  isInviting: boolean;
  error: string | null;

  // Actions
  fetchTeam: () => Promise<void>;
  createTeam: (name: string) => Promise<Team>;
  updateTeam: (data: Partial<Pick<Team, 'name'>>) => Promise<void>;
  inviteMember: (email: string, role: UserRole) => Promise<void>;
  updateMemberRole: (memberId: number, role: UserRole) => Promise<void>;
  removeMember: (memberId: number) => Promise<void>;
  fetchActivity: () => Promise<void>;
}

// ── Store ────────────────────────────────────────────────────

export const useTeamStore = create<TeamState>((set, get) => ({
  team: null,
  members: [],
  activities: [],
  isLoading: false,
  isInviting: false,
  error: null,

  fetchTeam: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<{
        team: Team | null;
        members: TeamMember[];
      }>('/team');

      const team = data?.team ?? null;
      const members = Array.isArray(data?.members) ? data.members : [];

      // Cache to IndexedDB
      if (team) {
        try {
          await localDB.put<Team>('team', team);
          for (const m of members) {
            await localDB.put<TeamMember>('team_members', m);
          }
        } catch {
          // Cache write failure is non-critical
        }
      }

      set({ team, members, error: null });
    } catch {
      // Fallback: try IndexedDB
      try {
        const localTeams = await localDB.getAll<Team>('team');
        const localMembers = await localDB.getAll<TeamMember>('team_members');

        if (localTeams.length > 0) {
          set({
            team: localTeams[0],
            members: localMembers,
            error: null,
          });
        } else {
          // Auto-create personal workspace
          await localDB.put<Team>('team', DEFAULT_TEAM);
          await localDB.put<TeamMember>('team_members', DEFAULT_MEMBER);
          set({
            team: DEFAULT_TEAM,
            members: [DEFAULT_MEMBER],
            error: null,
          });
        }
      } catch {
        // Even IndexedDB failed — use in-memory defaults
        set({
          team: DEFAULT_TEAM,
          members: [DEFAULT_MEMBER],
          error: null,
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createTeam: async (name) => {
    set({ isLoading: true, error: null });

    const localTeam: Team = {
      id: Date.now(),
      name,
      owner_id: 1,
      plan_tier: 'business',
      created_at: new Date().toISOString(),
    };

    try {
      // Save local first
      await localDB.put<Team>('team', localTeam);
      set({ team: localTeam, error: null });

      // API in background
      try {
        const res = await api.post<{ team: Team }>('/team', { name });
        const serverTeam = res?.team;
        if (serverTeam) {
          await localDB.put<Team>('team', serverTeam);
          set({ team: serverTeam });
          return serverTeam;
        }
      } catch {
        // Keep local version
      }

      return localTeam;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create team.';
      set({ error: message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateTeam: async (data) => {
    const { team } = get();
    if (!team) return;

    const updated = { ...team, ...data };

    // Local first
    set({ team: updated });
    try {
      await localDB.put<Team>('team', updated);
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.put(`/team/${team.id}`, data);
    } catch {
      // Keep local state
    }
  },

  inviteMember: async (email, role) => {
    set({ isInviting: true, error: null });

    const localMember: TeamMember = {
      id: Date.now(),
      name: email.split('@')[0],
      email,
      role,
      created_at: new Date().toISOString(),
    };

    try {
      // Local first
      await localDB.put<TeamMember>('team_members', localMember);
      set((s) => ({ members: [...(s.members ?? []), localMember], error: null }));

      // API in background
      try {
        const res = await api.post<{ member: TeamMember }>('/team/invite', { email, role });
        const serverMember = res?.member;
        if (serverMember) {
          // Replace local with server version
          await localDB.put<TeamMember>('team_members', serverMember);
          set((s) => ({
            members: s.members.map((m) => (m.id === localMember.id ? serverMember : m)),
          }));
        }
      } catch {
        // Keep local version
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send invitation.';
      set({ error: message });
      throw err;
    } finally {
      set({ isInviting: false });
    }
  },

  updateMemberRole: async (memberId, role) => {
    // Local first
    set((s) => ({
      members: s.members.map((m) =>
        m.id === memberId ? { ...m, role } : m
      ),
    }));

    const updated = get().members.find((m) => m.id === memberId);
    if (updated) {
      try {
        await localDB.put<TeamMember>('team_members', updated);
      } catch {
        // non-critical
      }
    }

    // API in background
    try {
      await api.put(`/team/members/${memberId}`, { role });
    } catch {
      // Keep local state
    }
  },

  removeMember: async (memberId) => {
    // Local first
    set((s) => ({
      members: s.members.filter((m) => m.id !== memberId),
    }));

    try {
      await localDB.delete('team_members', memberId);
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.delete(`/team/members/${memberId}`);
    } catch {
      // Already removed locally
    }
  },

  fetchActivity: async () => {
    try {
      const data = await api.get<{ activities: ActivityLogEntry[] }>(
        '/team/activity'
      );
      const activities = Array.isArray(data?.activities) ? data.activities : [];

      // Cache locally
      try {
        await localDB.clear('team_activities');
        for (const a of activities) {
          await localDB.put<ActivityLogEntry>('team_activities', a);
        }
      } catch {
        // non-critical
      }

      set({ activities });
    } catch {
      // Fallback: IndexedDB
      try {
        const local = await localDB.getAll<ActivityLogEntry>('team_activities');
        set({ activities: local });
      } catch {
        set({ activities: [] });
      }
    }
  },
}));
