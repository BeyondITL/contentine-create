'use client';

import { Code2 } from 'lucide-react';
import ApiKeysSection from '@/components/settings/ApiKeysSection';
import WebhooksSection from '@/components/settings/WebhooksSection';

/** Developer settings tab — API keys and webhook configuration. */
export default function DeveloperTab() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Code2 size={16} className="text-primary" />
          <h2 className="text-base font-semibold text-text dark:text-white">Developer</h2>
        </div>
        <p className="text-sm text-muted">
          Manage API keys and webhooks for programmatic access to Contentine Create.
        </p>
      </div>

      {/* API Keys */}
      <ApiKeysSection />

      {/* Webhooks */}
      <WebhooksSection />
    </div>
  );
}
