'use client';

import { useState } from 'react';
import { MoreHorizontal, ShieldCheck, Eye, Crown, UserX, ChevronDown } from 'lucide-react';
import type { TeamMember, UserRole } from '@/types';

/** Role badge colors. */
const ROLE_CONFIG: Record<UserRole, { label: string; className: string; icon: typeof Crown }> = {
  owner: { label: 'Owner', className: 'badge-accent', icon: Crown },
  editor: { label: 'Editor', className: 'badge-info', icon: ShieldCheck },
  viewer: { label: 'Viewer', className: 'badge-success', icon: Eye },
  admin: { label: 'Admin', className: 'badge-accent', icon: Crown },
};

/** Format date to short string. */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Generate initials from name or email. */
function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

interface MembersListProps {
  members: TeamMember[];
  isOwner: boolean;
  onChangeRole: (memberId: number, role: UserRole) => void;
  onRemove: (memberId: number) => void;
}

/** List of team members with role badges and owner-only actions. */
export default function MembersList({ members, isOwner, onChangeRole, onRemove }: MembersListProps) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  function toggleMenu(id: number) {
    setOpenMenuId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="bento-card overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
        <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
          Members ({members.length})
        </h3>
      </div>

      <ul className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
        {members.map((member) => {
          const config = ROLE_CONFIG[member.role];
          const initials = getInitials(member.name, member.email);
          const isMenuOpen = openMenuId === member.id;

          return (
            <li
              key={member.id}
              className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-surface/50 dark:hover:bg-white/[0.02] transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-semibold text-primary">{initials}</span>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] truncate">
                  {member.name || member.email}
                </p>
                <p className="text-[11px] text-text-muted truncate">{member.email}</p>
              </div>

              {/* Role badge */}
              <span className={`${config.className} hidden sm:inline-flex items-center gap-1`}>
                <config.icon size={10} />
                {config.label}
              </span>

              {/* Joined date — hidden on mobile */}
              <span className="text-[11px] text-text-muted hidden md:block whitespace-nowrap">
                {formatDate(member.created_at)}
              </span>

              {/* Actions — owner only, not for self */}
              {isOwner && member.role !== 'owner' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleMenu(member.id)}
                    aria-label={`Actions for ${member.name || member.email}`}
                    className="
                      w-8 h-8 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center rounded-lg
                      text-text-muted hover:text-text dark:hover:text-white
                      hover:bg-surface dark:hover:bg-[#333]
                      transition-colors cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    "
                  >
                    <MoreHorizontal size={16} />
                  </button>

                  {isMenuOpen && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenuId(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-dark-secondary border border-black/[0.06] dark:border-white/[0.06] rounded-xl shadow-lg z-20 py-1 animate-fade-in">
                        {/* Change role options */}
                        {(['editor', 'viewer'] as const)
                          .filter((r) => r !== member.role)
                          .map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                onChangeRole(member.id, role);
                                setOpenMenuId(null);
                              }}
                              className="
                                w-full text-left px-3 py-2 text-[12px] font-medium
                                text-text dark:text-[#E0E0E0]
                                hover:bg-surface dark:hover:bg-[#333]
                                transition-colors cursor-pointer
                                flex items-center gap-2
                              "
                            >
                              <ChevronDown size={12} className="text-text-muted" />
                              Change to {role.charAt(0).toUpperCase() + role.slice(1)}
                            </button>
                          ))}

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => {
                            onRemove(member.id);
                            setOpenMenuId(null);
                          }}
                          className="
                            w-full text-left px-3 py-2 text-[12px] font-medium
                            text-danger hover:bg-danger/[0.04]
                            transition-colors cursor-pointer
                            flex items-center gap-2
                          "
                        >
                          <UserX size={12} />
                          Remove Member
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
