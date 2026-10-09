'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Mail,
  Globe,
  Calendar,
  AlertTriangle,
  Check,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';

/** Common timezone options. */
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
] as const;

/** Account settings tab — profile info, timezone, danger zone. */
export default function AccountTab() {
  const { profile, isSaving, error, updateProfile, fetchProfile, deleteAccount } =
    useSettingsStore();

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Populate fields from profile
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setTimezone(profile.preferences?.timezone || 'America/New_York');
    }
  }, [profile]);

  // Detect unsaved changes
  useEffect(() => {
    if (!profile) return;
    const nameChanged = name !== (profile.name || '');
    const tzChanged = timezone !== (profile.preferences?.timezone || 'America/New_York');
    setHasChanges(nameChanged || tzChanged);
  }, [name, timezone, profile]);

  /** Save profile changes. */
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError('');
      setSaveSuccess(false);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setLocalError('Name is required.');
        return;
      }

      try {
        await updateProfile({
          name: trimmedName,
          preferences: {
            ...(profile?.preferences || {
              default_aspect_ratio: '16:9',
              email_notifications: true,
              push_notifications: true,
            }),
            timezone,
          },
        });
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch {
        setLocalError('Failed to save changes. Please try again.');
      }
    },
    [name, timezone, profile, updateProfile]
  );

  /** Handle account deletion with confirmation. */
  async function handleDelete() {
    if (deleteText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      // After deletion, auth store will clear and redirect
      window.location.href = '/';
    } catch {
      setLocalError('Failed to delete account. Please contact support.');
      setIsDeleting(false);
    }
  }

  // Format created date
  const createdDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Profile Form */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-primary" />
          <h2 className="text-[14px] font-semibold text-text dark:text-white">
            Profile Information
          </h2>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="settings-name"
              className="block text-[12px] font-medium text-text-muted mb-1.5"
            >
              Display Name
            </label>
            <div className="relative">
              <User
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isSaving}
                className="input-field pl-9 text-[16px] md:text-sm"
                autoComplete="name"
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label
              htmlFor="settings-email"
              className="block text-[12px] font-medium text-text-muted mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                id="settings-email"
                type="email"
                value={profile?.email || ''}
                readOnly
                disabled
                className="input-field pl-9 text-[16px] md:text-sm opacity-60 cursor-not-allowed"
                aria-describedby="email-hint"
              />
            </div>
            <p id="email-hint" className="mt-1 text-[11px] text-text-muted">
              Managed by your authentication provider. Cannot be changed here.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label
              htmlFor="settings-timezone"
              className="block text-[12px] font-medium text-text-muted mb-1.5"
            >
              Timezone
            </label>
            <div className="relative">
              <Globe
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none z-10"
              />
              <select
                id="settings-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={isSaving}
                className="input-field pl-9 text-[16px] md:text-sm appearance-none cursor-pointer"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account created */}
          <div className="flex items-center gap-2 text-[12px] text-text-muted pt-1">
            <Calendar size={13} />
            <span>Account created {createdDate}</span>
          </div>

          {/* Error / Success */}
          {(localError || error) && (
            <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5">
              <AlertTriangle size={13} className="shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 text-[12px] text-secondary bg-secondary/[0.06] rounded-lg px-3 py-2.5">
              <Check size={13} className="shrink-0" />
              <span>Changes saved successfully.</span>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSaving || !hasChanges}
              className="btn-primary flex items-center gap-2 min-h-[44px] md:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Save Changes
                </>
              )}
            </button>
            {hasChanges && (
              <span className="text-[11px] text-text-muted">Unsaved changes</span>
            )}
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="bento-card p-4 md:p-5 border-danger/20 dark:border-danger/30">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-danger" />
          <h2 className="text-[14px] font-semibold text-danger">Danger Zone</h2>
        </div>
        <p className="text-[12px] text-text-muted mb-4 leading-relaxed">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger flex items-center gap-2 min-h-[44px] md:min-h-0 cursor-pointer"
          >
            <Trash2 size={14} />
            Delete Account
          </button>
        ) : (
          <div className="space-y-3 bg-danger/[0.04] dark:bg-danger/[0.08] rounded-xl p-4">
            <p className="text-[12px] text-danger font-medium">
              Type <span className="font-bold">DELETE</span> to confirm account deletion:
            </p>
            <input
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              disabled={isDeleting}
              className="input-field text-[16px] md:text-sm border-danger/30 focus:border-danger"
              aria-label="Confirmation text"
              autoComplete="off"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || isDeleting}
                className="btn-danger flex items-center gap-2 min-h-[44px] md:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Confirm Deletion
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteText('');
                }}
                disabled={isDeleting}
                className="btn-ghost min-h-[44px] md:min-h-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
