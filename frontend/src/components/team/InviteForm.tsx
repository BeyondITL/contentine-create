'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { UserRole } from '@/types';

interface InviteFormProps {
  isInviting: boolean;
  onInvite: (email: string, role: UserRole) => Promise<void>;
}

/** Email + role invite form. */
export default function InviteForm({ isInviting, onInvite }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('editor');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      await onInvite(trimmed, role);
      setEmail('');
      setRole('editor');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send invitation.';
      setError(message);
    }
  }

  return (
    <div className="bento-card p-4 md:p-5">
      <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
        Invite a team member
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        {/* Email input */}
        <div className="flex-1 min-w-0">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            disabled={isInviting}
            className="input-field w-full"
            aria-label="Email address"
          />
        </div>

        {/* Role selector */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isInviting}
          className="input-field w-full sm:w-36 cursor-pointer"
          aria-label="Select role"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>

        {/* Submit */}
        <button
          type="submit"
          disabled={isInviting}
          className="
            btn-primary flex items-center justify-center gap-2
            whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isInviting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {isInviting ? 'Sending...' : 'Send Invite'}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-[12px] text-danger">{error}</p>
      )}
    </div>
  );
}
