'use client';

import { useState, useEffect } from 'react';
import { Shield, Coins, Key, Users, Building, Activity, UserSquare2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

/** Skeleton card for the admin dashboard loading state. */
function SkeletonCard() {
  return (
    <div className="block p-6 bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl animate-pulse">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] w-12 h-12 shrink-0" />
        <div className="flex-1">
          <div className="h-5 w-40 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-2" />
          <div className="h-4 w-full bg-black/[0.04] dark:bg-white/[0.05] rounded" />
        </div>
      </div>
    </div>
  );
}

/** Admin dashboard overview page. */
export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAdmin() {
      try {
        await Promise.all([
          api.get('/admin/credits/stats').catch(() => ({})),
          api.get<{ total: number }>('/videos').catch(() => ({ total: 0 })),
        ]);
        if (!cancelled) setIsLoading(false);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadAdmin();
    return () => { cancelled = true; };
  }, []);

  const sections = [
    {
      title: 'Credit Configuration',
      description: 'Manage feature pricing, credit packs, and grant credits to users',
      icon: Coins,
      href: '/admin/credits',
      color: 'text-secondary',
    },
    {
      title: 'System API Keys',
      description: 'Manage encrypted API keys with multi-key rotation and fallback',
      icon: Key,
      href: '/admin/keys',
      color: 'text-primary',
    },
    {
      title: 'User Management',
      description: 'View users, balances, and activity',
      icon: Users,
      href: '/admin/users',
      color: 'text-accent',
    },
    {
      title: 'Enterprise Leads',
      description: 'Review and manage enterprise contact submissions',
      icon: Building,
      href: '/admin/enterprise',
      color: 'text-warning',
    },
    {
      title: 'Provider Health',
      description: 'Monitor AI provider status, resolution tiers, and service availability',
      icon: Activity,
      href: '/admin/providers',
      color: 'text-info',
    },
    {
      title: 'Real Clone Queue',
      description: 'Review, approve, and track consented Real Clone avatar requests',
      icon: UserSquare2,
      href: '/admin/real-clone',
      color: 'text-secondary',
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      {isLoading ? (
        <div className="flex items-center gap-3 mb-8 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]" />
          <div>
            <div className="h-6 w-48 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-1.5" />
            <div className="h-4 w-64 bg-black/[0.04] dark:bg-white/[0.05] rounded" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-dark dark:text-white">Admin Dashboard</h1>
            <p className="text-sm text-dark/60 dark:text-white/60">Contentine Create system administration</p>
          </div>
        </div>
      )}

      {/* Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group block p-6 bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg bg-surface dark:bg-white/5 ${section.color}`}>
                    <section.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-dark dark:text-white group-hover:text-primary transition-colors">
                      {section.title}
                    </h2>
                    <p className="text-sm text-dark/60 dark:text-white/60 mt-1">
                      {section.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}
