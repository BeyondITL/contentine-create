'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Settings, User, CreditCard, Sliders, Link2, Code2, Key, Cpu } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import AccountTab from '@/components/settings/AccountTab';
import BillingTab from '@/components/settings/BillingTab';
import PreferencesTab from '@/components/settings/PreferencesTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import DeveloperTab from '@/components/settings/DeveloperTab';
import DeviceTab from '@/components/settings/DeviceTab';
import { ApiKeysSettingsSection } from '@/components/settings/ApiKeysSection';
import SettingsSkeleton from '@/components/settings/SettingsSkeleton';

/** Tab definitions for settings navigation. */
const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'preferences', label: 'Preferences', icon: Sliders },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'developer', label: 'Developer', icon: Code2 },
  { id: 'device', label: 'Device', icon: Cpu },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Settings page — wrap inner content in Suspense for useSearchParams. */
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsPageInner />
    </Suspense>
  );
}

/** Inner settings page with tab routing and data fetching. */
function SettingsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const {
    profile,
    isLoading,
    error,
    activeTab,
    setActiveTab,
    fetchProfile,
    fetchUsage,
    fetchPlans,
  } = useSettingsStore();

  // Read ?tab= from URL on mount
  const tabParam = searchParams.get('tab') as TabId | null;
  const currentTab = TABS.some((t) => t.id === tabParam) ? tabParam! : activeTab || 'account';

  // Sync tab from URL
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam, setActiveTab]);

  // Set page title
  useEffect(() => {
    document.title = 'Settings — Contentine Create';
  }, []);

  // Fetch profile + usage + plans on mount
  useEffect(() => {
    fetchProfile();
    fetchUsage();
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Switch tab and update URL. */
  function handleTabChange(tabId: string) {
    setActiveTab(tabId);
    router.replace(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Loading state — show skeleton on initial load
  if (isLoading && !profile) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="max-w-[960px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-5 md:mb-6">
        <Settings size={20} className="text-primary" />
        <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
          Settings
        </h1>
      </div>

      {/* Layout: mobile = stacked, desktop = sidebar + content */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Tab navigation */}
        {/* Mobile: horizontal scrollable pills */}
        <nav
          className="flex md:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
          role="tablist"
          aria-label="Settings tabs"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium
                  whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  ${
                    isActive
                      ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                      : 'bg-surface dark:bg-[#2a2a2a] text-text-muted hover:text-text dark:hover:text-white hover:bg-border-light dark:hover:bg-[#333]'
                  }
                `}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Desktop: vertical sidebar tabs */}
        <nav
          className="hidden md:flex flex-col gap-0.5 w-48 shrink-0"
          role="tablist"
          aria-label="Settings tabs"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium
                  text-left transition-all duration-200 cursor-pointer w-full
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  ${
                    isActive
                      ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                      : 'text-text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a]'
                  }
                `}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          <div
            id={`settings-panel-${currentTab}`}
            role="tabpanel"
            aria-labelledby={currentTab}
          >
            {currentTab === 'account' && <AccountTab />}
            {currentTab === 'billing' && <BillingTab />}
            {currentTab === 'preferences' && <PreferencesTab />}
            {currentTab === 'integrations' && <IntegrationsTab />}
            {currentTab === 'api-keys' && <ApiKeysSettingsSection />}
            {currentTab === 'developer' && <DeveloperTab />}
            {currentTab === 'device' && <DeviceTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
