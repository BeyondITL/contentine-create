'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Video,
  Clapperboard,
  Users,
  Mic2,
  Lightbulb,
  CalendarDays,
  Sparkles,
  PenLine,
  BarChart3,
  Users2,
  Settings,
  Search,
  Plus,
  Command,
  ChevronDown,
  Menu,
  X,
  Image,
  Store,
  Shield,
  Coins,
  Key,
  Building,
  Activity,
  ImagePlus,
  ArrowLeftRight,
  Languages,
  Music,
  FileSpreadsheet,
  Cpu,
  LogOut,
  User as UserIcon,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ContentineLogo from '@/components/shared/ContentineLogo';
import AppFooter from '@/components/shared/AppFooter';
import BottomNav from '@/components/shell/BottomNav';
import NotificationDropdown from '@/components/shell/NotificationDropdown';
import ThemeToggle from '@/components/shell/ThemeToggle';
import { useAuthStore, login } from '@/stores/auth-store';
import { useCreditStore } from '@/stores/credit-store';
import { useModelStore } from '@/stores/model-store';
import { useAdmin } from '@/hooks/use-admin';

const WORKSPACE_NAV: { Icon: LucideIcon; label: string; href: string }[] = [
  { Icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { Icon: Video, label: 'My Videos', href: '/videos' },
  { Icon: Clapperboard, label: 'Cartoon', href: '/cartoon' },
  { Icon: Users, label: 'Avatars', href: '/create/avatar' },
  { Icon: Mic2, label: 'Voices', href: '/voices' },
  { Icon: CalendarDays, label: 'Schedule', href: '/calendar' },
];

const TOOLS_NAV: { Icon: LucideIcon; label: string; href: string; accent?: boolean }[] = [
  { Icon: Sparkles, label: 'Remix Hub', href: '/remix', accent: true },
  { Icon: Lightbulb, label: 'Discover', href: '/discover' },
  { Icon: PenLine, label: 'AI Writer', href: '/writer' },
  { Icon: Languages, label: 'Translate', href: '/translate' },
  { Icon: Music, label: 'Audio to Video', href: '/video/from-audio' },
  { Icon: Image, label: 'Stock Media', href: '/stock-media' },
  { Icon: ImagePlus, label: 'Thumbnails', href: '/thumbnails' },
  { Icon: ArrowLeftRight, label: 'Converter', href: '/converter' },
  { Icon: Cpu, label: 'AI Models', href: '/models' },
  { Icon: Store, label: 'Marketplace', href: '/marketplace' },
  { Icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { Icon: Users2, label: 'Team', href: '/team' },
  // CF-03/F-21: Bulk Scheduler (CSV upload) was orphaned — /calendar lacks it. Restore reachability.
  { Icon: FileSpreadsheet, label: 'Bulk Scheduler', href: '/scheduler' },
];

/** Routes that bypass AppShell entirely (full-screen experiences). */
const BYPASS_ROUTES = ['/onboarding'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated: authed, isLoading: authLoading, logout } = useAuthStore();
  const { balance, fetchBalance } = useCreditStore();
  const { isAdmin } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isBypass = BYPASS_ROUTES.some((route) => pathname.startsWith(route));

  // Fetch credit balance on auth
  useEffect(() => {
    if (authed) fetchBalance();
  }, [authed, fetchBalance]);

  // Reconcile model-store status with actual on-device storage (IndexedDB +
  // WebLLM cache + localStorage) once at app load, so EVERY page reads true
  // model readiness — not just /models, which was the only caller before. This
  // is the model-store propagation fix (C-M2 P0, item 3).
  useEffect(() => {
    useModelStore.getState().checkAllStatuses();
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Close user menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // Close sidebar on escape key and lock body scroll when open
  useEffect(() => {
    if (isBypass) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    if (sidebarOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [sidebarOpen, isBypass]);

  // Bypass AppShell for full-screen pages like onboarding
  if (isBypass) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen h-[100dvh] bg-[#F7F8FA] dark:bg-dark">
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Mobile backdrop for sidebar slide-over */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — hidden on mobile, icon-rail on md, full on lg */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white dark:bg-dark-secondary flex flex-col
          border-r border-black/[0.06] dark:border-white/[0.06]
          transition-transform duration-300 ease-in-out
          w-[280px] lg:w-[240px]
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:w-[60px] lg:w-[240px]
        `}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo + close on mobile */}
        <div className="h-[56px] flex items-center gap-2.5 px-4 lg:px-5 shrink-0">
          <a href="/" className="flex items-center gap-2.5 cursor-pointer md:justify-center lg:justify-start md:w-full lg:w-auto">
            <ContentineLogo size={26} />
            <span className="text-[13.5px] font-bold tracking-[-0.01em] text-text dark:text-white md:hidden lg:inline">
              Contentine Create
            </span>
          </a>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text dark:text-white/50 dark:hover:text-white rounded-lg md:hidden"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick create */}
        <div className="px-3 mb-1 md:px-2 lg:px-3">
          <a
            href="/video/create"
            className="group flex items-center justify-center gap-2 w-full py-[9px] rounded-[10px] bg-[#0A0A0A] dark:bg-white/[0.1] text-white text-[12.5px] font-semibold hover:bg-[#1A1A1A] dark:hover:bg-white/[0.15] active:scale-[0.98] transition-all duration-200 cursor-pointer min-h-[44px] md:min-h-0 md:py-2 lg:py-[9px]"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.1)' }}
          >
            <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90 md:w-4 md:h-4 lg:w-3.5 lg:h-3.5" strokeWidth={2.5} />
            <span className="md:hidden lg:inline">New Project</span>
          </a>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2.5 overflow-y-auto md:px-1.5 lg:px-2.5">
          <SectionLabel>Workspace</SectionLabel>
          {WORKSPACE_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={pathname === item.href} />
          ))}

          <SectionLabel className="mt-6">AI Tools</SectionLabel>
          {TOOLS_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={pathname === item.href} />
          ))}

          {isAdmin && (
            <>
              <SectionLabel className="mt-6">Admin</SectionLabel>
              <NavItem Icon={Shield} label="Dashboard" href="/admin" active={pathname === '/admin'} />
              <NavItem Icon={Coins} label="Credit Config" href="/admin/credits" active={pathname === '/admin/credits'} />
              <NavItem Icon={Key} label="System Keys" href="/admin/keys" active={pathname === '/admin/keys'} />
              <NavItem Icon={Users} label="Users" href="/admin/users" active={pathname === '/admin/users'} />
              <NavItem Icon={Building} label="Enterprise Leads" href="/admin/enterprise" active={pathname === '/admin/enterprise'} />
              <NavItem Icon={Activity} label="Provider Health" href="/admin/providers" active={pathname === '/admin/providers'} />
            </>
          )}
        </nav>

        {/* Settings */}
        <div className="px-2.5 py-2 border-t border-black/[0.04] dark:border-white/[0.04] md:px-1.5 lg:px-2.5">
          <NavItem Icon={Settings} label="Settings" href="/settings" active={pathname === '/settings'} />
        </div>

        {/* User card */}
        <div className="px-3 py-3 border-t border-black/[0.04] dark:border-white/[0.04] md:px-1.5 lg:px-3 relative" ref={userMenuRef}>
          {authed && user ? (
            <>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer min-h-[44px] md:justify-center lg:justify-start"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary via-accent to-secondary flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0 text-left md:hidden lg:block">
                  <p className="text-[12px] font-medium text-text dark:text-white truncate">{user.name || 'User'}</p>
                  <p className="text-[10px] text-text-muted truncate capitalize">{user.plan_tier || 'free'} plan</p>
                </div>
                <ChevronDown className={`w-3 h-3 text-text-muted/50 shrink-0 md:hidden lg:block transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-white dark:bg-dark-secondary rounded-xl border border-black/[0.08] dark:border-white/[0.08] shadow-lg overflow-hidden z-50 md:left-1.5 md:right-1.5 lg:left-3 lg:right-3">
                  {/* User info header */}
                  <div className="px-3.5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
                    <p className="text-[12.5px] font-semibold text-text dark:text-white truncate">{user.name}</p>
                    <p className="text-[10.5px] text-text-muted truncate">{user.email}</p>
                    {isAdmin && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-accent/10 text-accent rounded">Admin</span>
                    )}
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <a href="/settings" className="flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-text-secondary dark:text-white/70 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors">
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>Profile & Settings</span>
                    </a>
                    <a href="/billing" className="flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-text-secondary dark:text-white/70 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Plan & Billing</span>
                      <span className="ml-auto text-[10px] font-medium text-accent capitalize">{user.plan_tier || 'free'}</span>
                    </a>
                  </div>

                  {/* Logout */}
                  <div className="border-t border-black/[0.04] dark:border-white/[0.04] py-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/[0.08] transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : authLoading ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5 md:justify-center lg:justify-start">
              <div className="w-7 h-7 rounded-full bg-black/[0.04] dark:bg-white/[0.08] animate-pulse shrink-0" />
              <div className="flex-1 md:hidden lg:block">
                <div className="w-16 h-3 bg-black/[0.04] dark:bg-white/[0.08] rounded animate-pulse mb-1" />
                <div className="w-12 h-2.5 bg-black/[0.04] dark:bg-white/[0.08] rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <button
              onClick={() => login()}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-primary/[0.06] text-primary text-[12px] font-semibold hover:bg-primary/[0.1] transition-colors duration-150 cursor-pointer min-h-[44px]"
            >
              <span className="md:hidden lg:inline">Sign in</span>
              <span className="hidden md:inline lg:hidden text-primary text-[10px]">Sign in</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — compact on mobile */}
        <header className="h-[52px] bg-white/80 dark:bg-dark/80 backdrop-blur-xl border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between px-3 md:px-5 shrink-0 sticky top-0 z-30">
          {/* Left: hamburger (mobile) + logo (mobile center) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text dark:text-white/50 dark:hover:text-white rounded-lg md:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            {/* Logo on mobile — centered in left section */}
            <a href="/" className="md:hidden">
              <ContentineLogo size={22} />
            </a>
          </div>

          {/* Search — hidden on mobile, visible md+ */}
          <div className="relative max-w-[400px] flex-1 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-text-muted/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects, tools..."
              className="w-full pl-9 pr-14 py-[6px] rounded-lg bg-[#F4F5F7] dark:bg-white/[0.06] text-[12.5px] text-text dark:text-white placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:bg-white dark:focus:bg-white/[0.1] focus:border-black/[0.08] dark:focus:border-white/[0.08] border border-transparent transition-all duration-200"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
              <kbd className="text-[10px] text-text-muted/40 bg-white dark:bg-white/[0.08] rounded-[4px] px-1.5 py-0.5 font-mono border border-black/[0.06] dark:border-white/[0.06]">
                <Command className="w-2.5 h-2.5 inline -mt-px" />K
              </kbd>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {authed && (
              <a
                href="/credits"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/[0.06] dark:bg-accent/[0.12] hover:bg-accent/[0.1] dark:hover:bg-accent/[0.18] transition-colors duration-150 mr-1"
                title="Credit Balance"
              >
                <Coins className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-semibold text-accent">{(balance ?? 0).toLocaleString()}</span>
              </a>
            )}
            <ThemeToggle />
            <NotificationDropdown />
          </div>
        </header>

        {/* Page content — mobile padding bottom for bottom nav */}
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <div className="px-4 py-4 md:px-6 md:py-5 lg:px-9 lg:py-6 pb-20 md:pb-5">
            {children}
            {/* R-80/R-81: app-wide "Built with Llama" attribution + Notices link */}
            <AppFooter />
          </div>
        </main>
      </div>

      {/* Bottom navigation — mobile only */}
      <BottomNav pathname={pathname} />
    </div>
  );
}

/** Section label — visible on mobile sidebar and desktop, hidden on md icon-rail. */
function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`px-3 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted/50 dark:text-white/30 select-none md:hidden lg:block ${className}`}>
      {children}
    </p>
  );
}

/** Nav item — full label on mobile & lg, icon-only with tooltip on md. */
function NavItem({ Icon, label, href, active, accent }: {
  Icon: LucideIcon; label: string; href: string; active?: boolean; accent?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={`group relative flex items-center gap-2.5 px-3 py-[7px] rounded-[8px] transition-all duration-150 cursor-pointer min-h-[44px] md:min-h-0 md:justify-center md:px-0 md:py-2 lg:justify-start lg:px-3 lg:py-[7px] lg:min-h-0 ${
        active
          ? 'bg-black/[0.05] dark:bg-white/[0.08] text-text dark:text-white font-medium'
          : accent
            ? 'text-accent font-medium hover:bg-accent/[0.04] dark:hover:bg-accent/[0.08]'
            : 'text-text-muted hover:text-text-secondary dark:hover:text-white/80 hover:bg-black/[0.025] dark:hover:bg-white/[0.04]'
      }`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 transition-colors duration-150 md:w-[18px] md:h-[18px] lg:w-4 lg:h-4 ${
          active
            ? 'text-text dark:text-white'
            : accent
              ? 'text-accent/70 group-hover:text-accent'
              : 'text-text-muted/50 group-hover:text-text-muted dark:text-white/40 dark:group-hover:text-white/60'
        }`}
        strokeWidth={active ? 1.75 : 1.5}
      />
      {/* Label — visible on mobile sidebar and lg desktop, hidden on md icon-rail */}
      <span className="text-[12.5px] md:hidden lg:inline">{label}</span>
      {accent && !active && (
        <span className="ml-auto text-[9px] font-semibold text-accent/60 bg-accent/[0.06] dark:bg-accent/[0.12] px-1.5 py-0.5 rounded-[4px] md:hidden lg:inline">
          AI
        </span>
      )}
      {/* Tooltip — md icon-rail only */}
      <span className="hidden md:block lg:hidden absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-[11px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
        {label}
      </span>
    </Link>
  );
}
