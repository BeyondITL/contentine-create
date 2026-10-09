'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  BellOff,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';

/** Aspect ratio options with visual dimensions. */
const ASPECT_RATIOS = [
  { value: '16:9' as const, label: '16:9', sublabel: 'Landscape', width: 48, height: 27 },
  { value: '9:16' as const, label: '9:16', sublabel: 'Portrait', width: 27, height: 48 },
  { value: '1:1' as const, label: '1:1', sublabel: 'Square', width: 36, height: 36 },
] as const;

/** Preferences tab — dark mode, aspect ratio, notifications. */
export default function PreferencesTab() {
  const { profile, isSaving, error, updateProfile } = useSettingsStore();

  const [darkMode, setDarkMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localError, setLocalError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Populate from profile
  useEffect(() => {
    if (profile?.preferences) {
      setAspectRatio(profile.preferences.default_aspect_ratio || '16:9');
      setEmailNotifs(profile.preferences.email_notifications ?? true);
      setPushNotifs(profile.preferences.push_notifications ?? true);
    }
    // Read dark mode from DOM
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, [profile]);

  // Detect unsaved changes
  useEffect(() => {
    if (!profile?.preferences) {
      setHasChanges(false);
      return;
    }
    const p = profile.preferences;
    const changed =
      aspectRatio !== (p.default_aspect_ratio || '16:9') ||
      emailNotifs !== (p.email_notifications ?? true) ||
      pushNotifs !== (p.push_notifications ?? true);
    setHasChanges(changed);
  }, [aspectRatio, emailNotifs, pushNotifs, profile]);

  /** Toggle dark mode immediately (visual) — stored in localStorage. */
  function handleDarkModeToggle() {
    const newVal = !darkMode;
    setDarkMode(newVal);

    if (newVal) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  /** Save preferences to backend. */
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError('');
      setSaveSuccess(false);

      try {
        await updateProfile({
          preferences: {
            timezone: profile?.preferences?.timezone || 'America/New_York',
            default_aspect_ratio: aspectRatio,
            email_notifications: emailNotifs,
            push_notifications: pushNotifs,
          },
        });
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch {
        setLocalError('Failed to save preferences. Please try again.');
      }
    },
    [aspectRatio, emailNotifs, pushNotifs, profile, updateProfile]
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Appearance */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Monitor size={16} className="text-primary" />
          <h2 className="text-[14px] font-semibold text-text dark:text-white">
            Appearance
          </h2>
        </div>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            {darkMode ? (
              <Moon size={18} className="text-accent" />
            ) : (
              <Sun size={18} className="text-warning" />
            )}
            <div>
              <p className="text-[13px] font-medium text-text dark:text-white">
                Dark Mode
              </p>
              <p className="text-[11px] text-text-muted">
                {darkMode ? 'Dark theme is active' : 'Light theme is active'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            aria-label="Toggle dark mode"
            onClick={handleDarkModeToggle}
            className={`
              relative inline-flex h-7 w-12 min-h-[44px] md:min-h-0 min-w-[48px]
              items-center rounded-full transition-colors duration-200
              cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              ${darkMode ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.12]'}
            `}
          >
            <span
              className={`
                inline-block h-5 w-5 rounded-full bg-white shadow-sm
                transform transition-transform duration-200
                ${darkMode ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Default Aspect Ratio + Notifications — saved together */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* Default Aspect Ratio */}
        <div className="bento-card p-4 md:p-5">
          <h2 className="text-[14px] font-semibold text-text dark:text-white mb-1">
            Default Video Format
          </h2>
          <p className="text-[12px] text-text-muted mb-4">
            New video projects will use this aspect ratio by default.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {ASPECT_RATIOS.map((ar) => {
              const isSelected = aspectRatio === ar.value;
              return (
                <button
                  key={ar.value}
                  type="button"
                  onClick={() => setAspectRatio(ar.value)}
                  disabled={isSaving}
                  className={`
                    flex flex-col items-center gap-2.5 p-3 md:p-4 rounded-xl border-2
                    transition-all duration-200 cursor-pointer min-h-[44px] md:min-h-0
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    ${
                      isSelected
                        ? 'border-primary bg-primary/[0.04] dark:bg-primary/[0.08]'
                        : 'border-transparent bg-surface dark:bg-[#2a2a2a] hover:border-border-light dark:hover:border-[#444]'
                    }
                  `}
                  aria-pressed={isSelected}
                >
                  {/* Visual aspect ratio preview */}
                  <div
                    className={`
                      rounded-md border-2 transition-colors
                      ${
                        isSelected
                          ? 'border-primary bg-primary/[0.08]'
                          : 'border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.03]'
                      }
                    `}
                    style={{ width: ar.width, height: ar.height }}
                  />
                  <div className="text-center">
                    <p
                      className={`text-[13px] font-semibold ${
                        isSelected
                          ? 'text-primary'
                          : 'text-text dark:text-white'
                      }`}
                    >
                      {ar.label}
                    </p>
                    <p className="text-[10px] text-text-muted">{ar.sublabel}</p>
                  </div>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        <div className="bento-card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} className="text-primary" />
            <h2 className="text-[14px] font-semibold text-text dark:text-white">
              Notifications
            </h2>
          </div>

          {/* Email notifications toggle */}
          <div className="flex items-center justify-between py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
            <div className="flex items-center gap-3">
              {emailNotifs ? (
                <Bell size={16} className="text-secondary" />
              ) : (
                <BellOff size={16} className="text-text-muted" />
              )}
              <div>
                <p className="text-[13px] font-medium text-text dark:text-white">
                  Email Notifications
                </p>
                <p className="text-[11px] text-text-muted">
                  Receive updates about renders, publishing, and team activity
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailNotifs}
              aria-label="Toggle email notifications"
              onClick={() => setEmailNotifs(!emailNotifs)}
              disabled={isSaving}
              className={`
                relative inline-flex h-7 w-12 min-h-[44px] md:min-h-0 min-w-[48px]
                items-center rounded-full transition-colors duration-200
                cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${emailNotifs ? 'bg-secondary' : 'bg-black/[0.08] dark:bg-white/[0.12]'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 rounded-full bg-white shadow-sm
                  transform transition-transform duration-200
                  ${emailNotifs ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Push notifications toggle */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              {pushNotifs ? (
                <Bell size={16} className="text-secondary" />
              ) : (
                <BellOff size={16} className="text-text-muted" />
              )}
              <div>
                <p className="text-[13px] font-medium text-text dark:text-white">
                  Push Notifications
                </p>
                <p className="text-[11px] text-text-muted">
                  Get browser notifications for completed renders and alerts
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pushNotifs}
              aria-label="Toggle push notifications"
              onClick={() => setPushNotifs(!pushNotifs)}
              disabled={isSaving}
              className={`
                relative inline-flex h-7 w-12 min-h-[44px] md:min-h-0 min-w-[48px]
                items-center rounded-full transition-colors duration-200
                cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${pushNotifs ? 'bg-secondary' : 'bg-black/[0.08] dark:bg-white/[0.12]'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 rounded-full bg-white shadow-sm
                  transform transition-transform duration-200
                  ${pushNotifs ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
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
            <span>Preferences saved successfully.</span>
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-3">
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
                Save Preferences
              </>
            )}
          </button>
          {hasChanges && (
            <span className="text-[11px] text-text-muted">Unsaved changes</span>
          )}
        </div>
      </form>
    </div>
  );
}
